import test from "node:test";
import assert from "node:assert/strict";
import { testServer } from "./helpers";
test("calendar ownership and focus clock, pause, resume, persistence and recorded duration", async () => {
  const s = await testServer();
  try {
    const u = await s.register("planner@example.com"),
      other = await s.register("other-planner@example.com"),
      c = await s.course(u);
    const event = {
      title: "Lecture one",
      kind: "lecture",
      start_at: "2026-10-05T09:00:00Z",
      end_at: "2026-10-05T10:00:00Z",
    };
    let r = await s.request(`/courses/${c.id}/events`, "POST", event, u);
    assert.equal(r.status, 201);
    const e = await r.json();
    assert.equal(
      (await s.request(`/events/${e.id}`, "DELETE", undefined, other)).status,
      404,
    );
    assert.equal(
      (
        await s
          .request("/planner", "GET", undefined, other)
          .then((r) => r.json())
      ).length,
      0,
    );
    assert.equal(
      (
        await s.request(
          `/courses/${c.id}/events`,
          "POST",
          { ...event, end_at: event.start_at },
          u,
        )
      ).status,
      400,
    );
    const a = await (
      await s.request(
        `/courses/${c.id}/focus`,
        "POST",
        { topic: "Lecture review", minutes: 25, break_minutes: 5 },
        u,
      )
    ).json();
    assert.equal(a.elapsed_seconds, 0);
    assert.equal(
      (
        await s.request(
          `/courses/${c.id}/focus`,
          "POST",
          { topic: "Duplicate", minutes: 25, break_minutes: 5 },
          u,
        )
      ).status,
      409,
    );
    s.db
      .prepare("UPDATE study_sessions SET segment_at=? WHERE id=?")
      .run(new Date(Date.now() - 65000).toISOString(), a.id);
    r = await s.request(`/focus/${a.id}/pause`, "POST", {}, u);
    const paused = (await r.json()).active;
    assert.equal(paused.state, "paused");
    assert.ok(paused.elapsed_seconds >= 65 && paused.elapsed_seconds < 70);
    assert.equal(
      (await s.request(`/focus/${a.id}/finish`, "POST", {}, other)).status,
      404,
    );
    await s.request(`/focus/${a.id}/resume`, "POST", {}, u);
    r = await s.request(`/focus/${a.id}/finish`, "POST", {}, u);
    assert.equal((await r.json()).active, null);
    const f = await (await s.request("/focus", "GET", undefined, u)).json();
    assert.equal(f.history.length, 1);
    assert.ok(f.history[0].elapsed_seconds < 1500);
    assert.equal(
      (await s.request("/planner", "GET", undefined, u).then((r) => r.json()))
        .length,
      2,
    );
  } finally {
    await s.close();
  }
});
