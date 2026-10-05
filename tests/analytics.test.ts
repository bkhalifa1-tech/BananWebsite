import test from "node:test";
import assert from "node:assert/strict";
import { testServer } from "./helpers";
import { analyticsService } from "../server/analytics";
test("analytics aggregates actual completed time, local days, quiz accuracy and owner data", async () => {
  const s = await testServer();
  try {
    const u = await s.register("analytics@example.com"),
      o = await s.register("analytics-other@example.com"),
      c = await s.course(u),
      user = String(
        s.db.prepare("SELECT user_id FROM courses WHERE id=?").get(c.id)!
          .user_id,
      );
    let empty = await (
      await s.request("/analytics", "GET", undefined, u)
    ).json();
    assert.equal(empty.totalSeconds, 0);
    assert.equal(empty.quiz.average, null);
    const add = (
      id: string,
      time: string,
      seconds: number,
      state = "completed",
    ) =>
      s.db
        .prepare(
          "INSERT INTO study_sessions(id,user_id,course_id,topic,target_seconds,break_seconds,elapsed_seconds,state,started_at,ended_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .run(id, user, c.id, "Topic", 1500, 300, seconds, state, time, time);
    add("one", "2026-10-05T00:30:00Z", 600);
    add("two", "2026-10-04T00:30:00Z", 900);
    add("paused", "2026-10-05T01:30:00Z", 800, "paused");
    const a = analyticsService(s.db)(
      user,
      c.id,
      "Asia/Riyadh",
      Date.parse("2026-10-05T08:00:00Z"),
    );
    assert.equal(a.totalSeconds, 1500);
    assert.equal(a.weeklySeconds, 1500);
    assert.equal(a.streak, 2);
    assert.equal(a.activeDays, 2);
    const dst = analyticsService(s.db)(
      user,
      c.id,
      "Europe/Paris",
      Date.parse("2026-03-30T00:30:00Z"),
    );
    assert.equal(new Set(dst.daily.map((d) => d.day)).size, 7);
    assert.equal(dst.daily[0].day, "2026-03-24");
    assert.equal(dst.daily[6].day, "2026-03-30");
    assert.equal(a.courses[0].seconds, 1500);
    empty = await (await s.request("/analytics", "GET", undefined, o)).json();
    assert.equal(empty.totalSeconds, 0);
    assert.equal(
      (await s.request(`/courses/${c.id}/analytics`, "GET", undefined, o))
        .status,
      404,
    );
    assert.equal(
      (await s.request("/analytics?timezone=invalid-zone", "GET", undefined, u))
        .status,
      400,
    );
  } finally {
    await s.close();
  }
});
