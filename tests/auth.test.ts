import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { hashPassword, verifyPassword } from "../server/auth";
test("passwords are salted and verified", () => {
  const a = hashPassword("a-long-password");
  assert.notEqual(a, hashPassword("a-long-password"));
  assert.equal(verifyPassword("a-long-password", a), true);
  assert.equal(verifyPassword("wrong-password", a), false);
});
test("account lifecycle, validation, isolation, and session revocation", async () => {
  const db = openDatabase(":memory:");
  const server = createApp(db, false, {
    mailer: { delivery: "local", async send() {} },
    baseUrl: "http://localhost:3000",
  }).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
  ) {
    return fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Study-Client": "web",
        cookie,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  try {
    assert.equal((await request("/api/me")).status, 401);
    assert.equal(
      (
        await request("/api/auth/register", "POST", {
          name: "A",
          email: "bad",
          password: "short",
        })
      ).status,
      400,
    );
    const a = await request("/api/auth/register", "POST", {
      name: "Alice",
      email: "alice@example.com",
      password: "secure-password-123",
    });
    assert.equal(a.status, 201);
    const cookie = a.headers.get("set-cookie")!.split(";")[0];
    assert.match(a.headers.get("set-cookie")!, /HttpOnly/);
    assert.match(a.headers.get("set-cookie")!, /SameSite=Lax/);
    const body = await a.json();
    assert.equal(body.preferences.onboarded, false);
    assert.equal(body.user.password_hash, undefined);
    assert.equal(
      (
        await request("/api/auth/register", "POST", {
          name: "Alice",
          email: "ALICE@example.com",
          password: "secure-password-123",
        })
      ).status,
      409,
    );
    assert.equal(
      (await request("/api/preferences", "PATCH", { theme: "invalid" }, cookie))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          "/api/preferences",
          "PATCH",
          { user_id: "someone-else" },
          cookie,
        )
      ).status,
      400,
    );
    const changed = await request(
      "/api/preferences",
      "PATCH",
      { theme: "ocean", language: "en", onboarded: true },
      cookie,
    );
    assert.equal((await changed.json()).preferences.theme, "ocean");
    const b = await request("/api/auth/register", "POST", {
      name: "Bob",
      email: "bob@example.com",
      password: "other-password-123",
    });
    const cookieB = b.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (await (await request("/api/me", "GET", undefined, cookieB)).json())
        .preferences.theme,
      "forest",
    );
    const csrf = await fetch(base + "/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ theme: "rose" }),
    });
    assert.equal(csrf.status, 403);
    const foreign = await fetch(base + "/api/preferences", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Study-Client": "web",
        origin: "https://foreign.example",
        cookie,
      },
      body: JSON.stringify({ theme: "rose" }),
    });
    assert.equal(foreign.status, 403);
    assert.equal(
      (
        await request("/api/auth/login", "POST", {
          email: "alice@example.com",
          password: "wrong-password",
        })
      ).status,
      401,
    );
    assert.equal(
      (await request("/api/auth/logout", "POST", undefined, cookie)).status,
      204,
    );
    assert.equal(
      (await request("/api/me", "GET", undefined, cookie)).status,
      401,
    );
    const login = await request("/api/auth/login", "POST", {
      email: "alice@example.com",
      password: "secure-password-123",
    });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).preferences.theme, "ocean");
    assert.equal((await request("/api/health")).status, 200);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    db.close();
  }
});
