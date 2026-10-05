import test from "node:test";
import assert from "node:assert/strict";
import {
  StudyRecommendationService,
  type StudyCandidate,
} from "../server/recommendations";
import { testServer } from "./helpers";
test("recommendations rank urgent work, respect time budget, and have no invented segments", () => {
  const now = Date.parse("2026-10-05T12:00:00Z"),
    base: StudyCandidate = {
      id: "1",
      name: "Course",
      color: "#216348",
      pendingTasks: [],
      nextExam: null,
      dueCards: 0,
      weakTopics: [],
      quizCount: 0,
      lastStudyAt: null,
    };
  const service = new StudyRecommendationService();
  assert.deepEqual(service.recommend([base], 30, now), []);
  const result = service.recommend(
    [
      { ...base, id: "2", name: "Cards", dueCards: 4 },
      {
        ...base,
        id: "3",
        name: "Urgent",
        pendingTasks: [{ title: "Due task", due_date: "2026-10-05" }],
        weakTopics: [{ topic: "Keys", accuracy: 20 }],
        quizCount: 1,
      },
    ],
    15,
    now,
  );
  assert.equal(result[0].name, "Urgent");
  assert.equal(
    result[0].segments.reduce((n, s) => n + s.minutes, 0),
    15,
  );
  assert.equal(result[0].segments[0].title, "Due task");
  assert.equal(result[1].segments[0].count, 4);
  assert.deepEqual(service.recommend([base], 30, now), []);
});
test("recommendation inputs are owner scoped and respond to completed tasks", async () => {
  const s = await testServer();
  try {
    const u = await s.register("recommend@example.com"),
      o = await s.register("recommend-other@example.com"),
      c = await s.course(u);
    const task = await (
      await s.request(
        `/courses/${c.id}/tasks`,
        "POST",
        { title: "Study keys", due_date: "2026-10-05" },
        u,
      )
    ).json();
    const data = await (
      await s.request("/recommendations?minutes=10", "GET", undefined, u)
    ).json();
    assert.equal(data.suggestions[0].course_id, c.id);
    assert.equal(data.suggestions[0].segments[0].minutes, 10);
    assert.equal(
      (
        await s
          .request("/recommendations", "GET", undefined, o)
          .then((r) => r.json())
      ).suggestions.length,
      0,
    );
    assert.equal(
      (await s.request("/recommendations?minutes=0", "GET", undefined, u))
        .status,
      400,
    );
    await s.request(
      `/tasks/${task.id}`,
      "PATCH",
      { title: task.title, due_date: task.due_date, completed: true },
      u,
    );
    assert.equal(
      (
        await s
          .request("/recommendations", "GET", undefined, u)
          .then((r) => r.json())
      ).suggestions.length,
      0,
    );
  } finally {
    await s.close();
  }
});
