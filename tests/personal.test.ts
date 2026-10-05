import test from "node:test";
import assert from "node:assert/strict";
import { testServer } from "./helpers";
import { DatabaseSync } from "node:sqlite";
import { migrateWorkspaces } from "../server/workspaces";
test("personal spaces reuse study features, remain private and exclude academic logic", async () => {
  const s = await testServer();
  try {
    const u = await s.register("personal@example.com"),
      o = await s.register("personal-other@example.com"),
      c = await s.course(u);
    const fields = {
      name: "Learn Spanish",
      goal: "Hold a conversation",
      level: "beginner",
      target_date: "2027-01-01",
      color: "#286fb0",
    };
    let r = await s.request("/spaces", "POST", fields, u);
    assert.equal(r.status, 201);
    const space = await r.json();
    assert.equal(space.semester_id, null);
    assert.equal(space.credits, 0);
    assert.equal(space.kind, "personal");
    assert.equal(
      (await s.request("/spaces", "POST", { ...fields, credits: 3 }, u)).status,
      400,
    );
    assert.equal(
      (await s.request(`/spaces/${space.id}`, "GET", undefined, o)).status,
      404,
    );
    assert.equal(
      (await s.request(`/courses/${space.id}/academics`, "GET", undefined, u))
        .status,
      404,
    );
    assert.equal(
      (
        await s.request(
          `/courses/${space.id}/grades`,
          "POST",
          { name: "No grade", weight: 100, total: 100, score: 100 },
          u,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await s.request(
          `/courses/${space.id}`,
          "PATCH",
          { name: "Course?", code: "", credits: 3, color: fields.color },
          u,
        )
      ).status,
      404,
    );
    r = await s.request(
      `/courses/${space.id}/notes`,
      "POST",
      { title: "Vocabulary", html: "<p>Hola</p>" },
      u,
    );
    assert.equal(r.status, 201);
    const note = await r.json();
    const d = await s.request(
      `/courses/${space.id}/decks`,
      "POST",
      { name: "Vocabulary" },
      u,
    );
    assert.equal(d.status, 201);
    const t = await s.request(
      `/courses/${space.id}/tasks`,
      "POST",
      { title: "Learn greetings", due_date: "2026-10-05" },
      u,
    );
    assert.equal(t.status, 201);
    assert.equal(
      (
        await s
          .request("/workspaces?track=personal", "GET", undefined, u)
          .then((r) => r.json())
      ).length,
      1,
    );
    const semester = await s
      .request(`/semesters/${c.semester_id}/dashboard`, "GET", undefined, u)
      .then((r) => r.json());
    assert.equal(semester.courses.length, 1);
    assert.equal(
      (
        await s
          .request("/analytics?track=semester", "GET", undefined, u)
          .then((r) => r.json())
      ).tasks.total,
      0,
    );
    assert.equal(
      (
        await s
          .request("/analytics?track=personal", "GET", undefined, u)
          .then((r) => r.json())
      ).tasks.total,
      1,
    );
    assert.equal(
      (
        await s
          .request("/recommendations?track=personal", "GET", undefined, u)
          .then((r) => r.json())
      ).suggestions[0].course_id,
      space.id,
    );
    assert.equal(
      (
        await s
          .request("/recommendations?track=semester", "GET", undefined, u)
          .then((r) => r.json())
      ).suggestions.length,
      0,
    );
    await s.request(
      `/spaces/${space.id}`,
      "PATCH",
      { ...fields, level: "intermediate" },
      u,
    );
    assert.equal(
      (
        await s
          .request(`/spaces/${space.id}`, "GET", undefined, u)
          .then((r) => r.json())
      ).space.level,
      "intermediate",
    );
    assert.equal(
      (await s.request(`/spaces/${space.id}`, "DELETE", undefined, o)).status,
      404,
    );
    assert.equal(
      (await s.request(`/spaces/${space.id}`, "DELETE", undefined, u)).status,
      204,
    );
    assert.equal(
      (await s.request(`/notes/${note.id}`, "GET", undefined, u)).status,
      404,
    );
    assert.deepEqual(s.db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    await s.close();
  }
});
test("workspace migration preserves existing course children and can run repeatedly", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      `PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY);CREATE TABLE semesters(id TEXT PRIMARY KEY,user_id TEXT,UNIQUE(id,user_id));CREATE TABLE courses(id TEXT PRIMARY KEY,user_id TEXT,semester_id TEXT NOT NULL,name TEXT,code TEXT,credits REAL,color TEXT,created_at TEXT,UNIQUE(id,user_id));CREATE INDEX courses_semester ON courses(user_id,semester_id);CREATE TABLE tasks(id TEXT PRIMARY KEY,course_id TEXT,user_id TEXT,FOREIGN KEY(course_id,user_id) REFERENCES courses(id,user_id) ON DELETE CASCADE);INSERT INTO users VALUES('u');INSERT INTO semesters VALUES('s','u');INSERT INTO courses VALUES('c','u','s','Existing course','CS',3,'#216348','2026-01-01');INSERT INTO tasks VALUES('t','c','u');`,
    );
    migrateWorkspaces(db);
    migrateWorkspaces(db);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tasks").get()!.n, 1);
    assert.equal(db.prepare("SELECT kind FROM courses").get()!.kind, "course");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    db.prepare("DELETE FROM courses WHERE id=?").run("c");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tasks").get()!.n, 0);
  } finally {
    db.close();
  }
});
