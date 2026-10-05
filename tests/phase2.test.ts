import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import type { MailMessage, Mailer } from "../server/mail";
import { tokenHash } from "../server/auth";
async function fixture(requireVerified = false) {
  const db = openDatabase(":memory:"),
    messages: MailMessage[] = [];
  const mailer: Mailer = {
    delivery: "email",
    async send(m) {
      messages.push(m);
    },
  };
  const server = createApp(db, false, {
    mailer,
    baseUrl: "https://study.example",
    requireVerified,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert(address && typeof address === "object");
  const request = (path: string, method = "GET", body?: unknown, cookie = "") =>
    fetch(`http://127.0.0.1:${address.port}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Study-Client": "web",
        cookie,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  async function register(email: string) {
    const r = await request("/auth/register", "POST", {
      name: "Study Student",
      email,
      password: "initial-password-123",
    });
    assert.equal(r.status, 201);
    return {
      cookie: r.headers.get("set-cookie")!.split(";")[0],
      account: await r.json(),
    };
  }
  return {
    db,
    messages,
    request,
    register,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      db.close();
    },
  };
}
function tokenOf(message: MailMessage) {
  return new URLSearchParams(new URL(message.url).hash.split("?")[1]).get(
    "token",
  )!;
}
test("Phase 2 CRUD, aggregated data, user isolation, and cascade deletion", async () => {
  const f = await fixture();
  try {
    const a = await f.register("study-a@example.com"),
      b = await f.register("study-b@example.com");
    const req = (path: string, method = "GET", body?: unknown) =>
      f.request(path, method, body, a.cookie);
    assert.equal((await f.request("/semesters")).status, 401);
    assert.equal(
      (
        await req("/semesters", "POST", {
          name: "Bad date",
          start_date: "2026-02-30",
          end_date: "2026-10-31",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await req("/semesters", "POST", {
          name: "Bad order",
          start_date: "2026-11-01",
          end_date: "2026-10-31",
        })
      ).status,
      400,
    );
    const r = await req("/semesters", "POST", {
      name: "Autumn",
      start_date: "2026-09-01",
      end_date: "2027-01-31",
    });
    assert.equal(r.status, 201);
    const semester = await r.json();
    assert.deepEqual(
      await (await f.request("/semesters", "GET", undefined, b.cookie)).json(),
      [],
    );
    assert.equal(
      (
        await f.request(
          `/semesters/${semester.id}/dashboard`,
          "GET",
          undefined,
          b.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await f.request(
          `/semesters/${semester.id}`,
          "DELETE",
          undefined,
          b.cookie,
        )
      ).status,
      404,
    );
    const coursePayload = {
      name: "Database systems",
      code: "CS301",
      credits: 3,
      color: "#7960b0",
    };
    assert.equal(
      (
        await f.request(
          `/semesters/${semester.id}/courses`,
          "POST",
          coursePayload,
          b.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await req(`/semesters/${semester.id}/courses`, "POST", {
          ...coursePayload,
          credits: -1,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await req(`/semesters/${semester.id}/courses`, "POST", {
          ...coursePayload,
          color: "red;bad",
        })
      ).status,
      400,
    );
    const cr = await req(
      `/semesters/${semester.id}/courses`,
      "POST",
      coursePayload,
    );
    assert.equal(cr.status, 201);
    const course = await cr.json();
    const cr2 = await req(`/semesters/${semester.id}/courses`, "POST", {
      ...coursePayload,
      name: "Algorithms",
      color: "#b55c32",
      credits: 4,
    });
    const other = await cr2.json();
    assert.equal(
      (await f.request(`/courses/${course.id}`, "GET", undefined, b.cookie))
        .status,
      404,
    );
    assert.equal(
      (
        await f.request(
          `/courses/${course.id}`,
          "PATCH",
          coursePayload,
          b.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await f.request(
          `/courses/${course.id}/tasks`,
          "POST",
          { title: "Intrusion" },
          b.cookie,
        )
      ).status,
      404,
    );
    const tr = await req(`/courses/${course.id}/tasks`, "POST", {
      title: "Review normalization",
      due_date: "2026-10-05",
    });
    assert.equal(tr.status, 201);
    const task = await tr.json();
    assert.equal(
      (
        await f.request(
          `/tasks/${task.id}`,
          "PATCH",
          { title: "Altered", due_date: null, completed: true },
          b.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (await f.request(`/tasks/${task.id}`, "DELETE", undefined, b.cookie))
        .status,
      404,
    );
    await req(`/courses/${other.id}/tasks`, "POST", {
      title: "Practice sorting",
      due_date: null,
    });
    let dashboard = await (
      await req(`/semesters/${semester.id}/dashboard`)
    ).json();
    assert.equal(dashboard.courses.length, 2);
    assert.equal(dashboard.tasks.length, 2);
    assert.equal(
      dashboard.courses.find((c: { id: string }) => c.id === course.id)
        .completed_count,
      0,
    );
    assert.equal(
      (
        await req(`/tasks/${task.id}`, "PATCH", {
          title: task.title,
          due_date: task.due_date,
          completed: true,
        })
      ).status,
      200,
    );
    dashboard = await (await req(`/semesters/${semester.id}/dashboard`)).json();
    assert.equal(
      dashboard.courses.find((c: { id: string }) => c.id === course.id)
        .completed_count,
      1,
    );
    await req(`/courses/${course.id}`, "PATCH", {
      ...coursePayload,
      name: "Advanced databases",
      credits: 5,
    });
    assert.equal(
      (await (await req(`/courses/${course.id}`)).json()).course.credits,
      5,
    );
    assert.equal(
      (
        await req(`/semesters/${semester.id}`, "PATCH", {
          name: "Renamed semester",
          start_date: "2026-09-01",
          end_date: "2027-01-31",
        })
      ).status,
      200,
    );
    await req(`/tasks/${task.id}`, "PATCH", {
      title: "Edited task",
      due_date: null,
      completed: false,
    });
    assert.equal(
      (await (await req(`/courses/${course.id}`)).json()).tasks[0].completed_at,
      null,
    );
    assert.equal((await req(`/courses/${course.id}`, "DELETE")).status, 204);
    assert.equal(
      f.db
        .prepare("SELECT COUNT(*) AS n FROM tasks WHERE course_id=?")
        .get(course.id)!.n,
      0,
    );
    assert.equal(
      (await req(`/semesters/${semester.id}`, "DELETE")).status,
      204,
    );
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM courses").get()!.n, 0);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM tasks").get()!.n, 0);
  } finally {
    await f.close();
  }
});
test("email verification and reset: expiry, single use, purpose separation, session invalidation", async () => {
  const f = await fixture(true);
  try {
    const a = await f.register("secure@example.com");
    assert.equal(a.account.user.emailVerified, false);
    assert.equal(a.account.verificationSent, true);
    assert.equal(f.messages.length, 1);
    const verificationToken = tokenOf(f.messages[0]);
    assert.equal(
      f.db.prepare("SELECT token_hash FROM auth_tokens").get()!.token_hash,
      tokenHash(verificationToken),
    );
    assert.equal(
      (await f.request("/semesters", "GET", undefined, a.cookie)).status,
      403,
    );
    assert.equal(
      (
        await f.request("/auth/password/reset", "POST", {
          token: verificationToken,
          password: "replacement-password-123",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await f.request(
          "/auth/verification/request",
          "POST",
          undefined,
          a.cookie,
        )
      ).status,
      429,
    );
    assert.equal(
      (await f.request("/auth/verify", "POST", { token: verificationToken }))
        .status,
      200,
    );
    assert.equal(
      (await f.request("/auth/verify", "POST", { token: verificationToken }))
        .status,
      400,
    );
    assert.equal(
      (await (await f.request("/me", "GET", undefined, a.cookie)).json()).user
        .emailVerified,
      true,
    );
    assert.equal(
      (await f.request("/semesters", "GET", undefined, a.cookie)).status,
      200,
    );
    const known = await f.request("/auth/password/request", "POST", {
        email: "secure@example.com",
      }),
      unknown = await f.request("/auth/password/request", "POST", {
        email: "absent@example.com",
      });
    assert.equal(known.status, unknown.status);
    assert.deepEqual(await known.json(), await unknown.json());
    const reset = tokenOf(f.messages[1]);
    assert.equal(
      (await f.request("/auth/verify", "POST", { token: reset })).status,
      400,
    );
    assert.equal(
      (
        await f.request("/auth/password/reset", "POST", {
          token: reset,
          password: "short",
        })
      ).status,
      400,
    );
    f.db
      .prepare("UPDATE auth_tokens SET expires_at=? WHERE purpose=?")
      .run(Date.now() - 1, "reset");
    assert.equal(
      (
        await f.request("/auth/password/reset", "POST", {
          token: reset,
          password: "replacement-password-123",
        })
      ).status,
      400,
    );
    f.db.exec("DELETE FROM mail_limits");
    await f.request("/auth/password/request", "POST", {
      email: "secure@example.com",
    });
    const valid = tokenOf(f.messages[2]);
    assert.equal(
      (
        await f.request("/auth/password/reset", "POST", {
          token: valid,
          password: "replacement-password-123",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await f.request("/auth/password/reset", "POST", {
          token: valid,
          password: "replacement-password-123",
        })
      ).status,
      400,
    );
    assert.equal(
      (await f.request("/me", "GET", undefined, a.cookie)).status,
      401,
    );
    assert.equal(
      (
        await f.request("/auth/login", "POST", {
          email: "secure@example.com",
          password: "initial-password-123",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await f.request("/auth/login", "POST", {
          email: "secure@example.com",
          password: "replacement-password-123",
        })
      ).status,
      200,
    );
  } finally {
    await f.close();
  }
});
test("existing database migration preserves users and preferences and is repeatable", () => {
  const dir = mkdtempSync(join(tmpdir(), "study-migration-")),
    path = join(dir, "db.sqlite");
  try {
    const old = new DatabaseSync(path);
    old.exec(
      "CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);INSERT INTO users(id,email,name,password_hash) VALUES('existing','existing@example.com','Existing','hash');",
    );
    old.close();
    let db = openDatabase(path);
    assert.equal(
      db
        .prepare("SELECT name,email_verified FROM users WHERE id=?")
        .get("existing")!.name,
      "Existing",
    );
    assert.equal(
      db.prepare("SELECT email_verified FROM users").get()!.email_verified,
      0,
    );
    db.prepare("INSERT INTO preferences(user_id,theme) VALUES(?,?)").run(
      "existing",
      "rose",
    );
    db.prepare(
      "INSERT INTO semesters(id,user_id,name,start_date,end_date) VALUES(?,?,?,?,?)",
    ).run(
      "semester",
      "existing",
      "Retained semester",
      "2026-09-01",
      "2027-01-01",
    );
    db.close();
    db = openDatabase(path);
    assert.equal(
      db.prepare("SELECT theme FROM preferences").get()!.theme,
      "rose",
    );
    assert.equal(
      db.prepare("SELECT name FROM semesters").get()!.name,
      "Retained semester",
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("mail failure does not leave usable tokens; missing production delivery prevents registration", async () => {
  const db = openDatabase(":memory:");
  const server = createApp(db, false, {
    mailer: {
      delivery: "unavailable",
      async send() {
        throw Error("unavailable");
      },
    },
    baseUrl: "https://study.example",
  }).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert(address && typeof address === "object");
  try {
    const r = await fetch(
      `http://127.0.0.1:${address.port}/api/auth/register`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Study-Client": "web",
        },
        body: JSON.stringify({
          name: "Student",
          email: "student@example.com",
          password: "a-long-password",
        }),
      },
    );
    assert.equal(r.status, 503);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get()!.n, 0);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
  }
});
test("failed delivery removes the issued token", async () => {
  const { recoveryService } = await import("../server/recovery");
  const db = openDatabase(":memory:");
  try {
    db.prepare(
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
    ).run("user", "user@example.com", "User", "hash");
    const service = recoveryService(
      db,
      {
        delivery: "email",
        async send() {
          throw Error("Provider unavailable");
        },
      },
      "https://study.example",
    );
    await assert.rejects(
      service.issue({ id: "user", email: "user@example.com" }, "verify"),
      /Email delivery failed/,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM auth_tokens").get()!.n,
      0,
    );
  } finally {
    db.close();
  }
});
test("authentication endpoints throttle abusive requests", async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 30; i++)
      assert.equal(
        (
          await f.request("/auth/login", "POST", {
            email: "bad",
            password: "bad",
          })
        ).status,
        400,
      );
    const limited = await f.request("/auth/login", "POST", {
      email: "bad",
      password: "bad",
    });
    assert.equal(limited.status, 429);
    assert(limited.headers.get("retry-after"));
  } finally {
    await f.close();
  }
});
