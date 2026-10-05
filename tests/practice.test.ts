import test from "node:test";
import assert from "node:assert/strict";
import { testServer } from "./helpers";
import { scheduleReview } from "../server/practice";
test("spaced reviews preserve history, prevent duplicate review, and isolate cards", async () => {
  const s = await testServer();
  try {
    const u = await s.register("cards@example.com"),
      o = await s.register("cards-other@example.com"),
      c = await s.course(u);
    const d = await (
      await s.request(
        `/courses/${c.id}/decks`,
        "POST",
        { name: "Lecture cards" },
        u,
      )
    ).json();
    const card = await (
      await s.request(
        `/decks/${d.id}/cards`,
        "POST",
        {
          front: "What is a key?",
          back: "A unique identifier",
          topic: "Databases",
          source: "Lecture 1",
        },
        u,
      )
    ).json();
    assert.equal(
      (await s.request(`/decks/${d.id}`, "GET", undefined, o)).status,
      404,
    );
    assert.equal(
      (
        await s.request(
          `/cards/${card.id}/reviews`,
          "POST",
          { rating: 2, version: 1 },
          o,
        )
      ).status,
      404,
    );
    const reviewed = await (
      await s.request(
        `/cards/${card.id}/reviews`,
        "POST",
        { rating: 2, version: 1 },
        u,
      )
    ).json();
    assert.equal(reviewed.interval_days, 1);
    assert.equal(reviewed.repetitions, 1);
    assert.equal(reviewed.version, 2);
    assert.equal(
      (
        await s.request(
          `/cards/${card.id}/reviews`,
          "POST",
          { rating: 2, version: 1 },
          u,
        )
      ).status,
      409,
    );
    assert.equal(
      s.db.prepare("SELECT COUNT(*) AS n FROM flashcard_reviews").get()!.n,
      1,
    );
    assert.equal(
      scheduleReview({ ease: 2.5, interval_days: 3, repetitions: 2 }, 0, 0)
        .repetitions,
      0,
    );
    assert.ok(
      scheduleReview({ ease: 2.5, interval_days: 3, repetitions: 2 }, 3, 0)
        .interval_days > 3,
    );
    assert.equal(
      (
        await s
          .request(`/courses/${c.id}/practice`, "GET", undefined, u)
          .then((r) => r.json())
      ).decks[0].due,
      0,
    );
  } finally {
    await s.close();
  }
});
test("quiz snapshots hide answers, grade on server, persist mistakes and isolate attempts", async () => {
  const s = await testServer();
  try {
    const u = await s.register("quiz@example.com"),
      o = await s.register("quiz-other@example.com"),
      c = await s.course(u);
    const q = await (
      await s.request(
        `/courses/${c.id}/quizzes`,
        "POST",
        { title: "Database quiz" },
        u,
      )
    ).json();
    const question = {
      kind: "mcq",
      prompt: "Which is a key?",
      options: ["id", "name"],
      correct_answer: "id",
      explanation: "IDs are unique",
      topic: "Keys",
      source: "Lecture 1",
    };
    const p = await (
      await s.request(`/quizzes/${q.id}/questions`, "POST", question, u)
    ).json();
    assert.equal(
      (
        await s.request(
          `/quizzes/${q.id}/questions`,
          "POST",
          { ...question, correct_answer: "invalid" },
          u,
        )
      ).status,
      400,
    );
    const a = await (
      await s.request(`/quizzes/${q.id}/attempts`, "POST", {}, u)
    ).json();
    assert.ok(!("correct_answer" in a.questions[0]));
    assert.ok(!("explanation" in a.questions[0]));
    await s.request(`/questions/${p.id}`, "DELETE", undefined, u);
    assert.equal(
      (await s.request(`/attempts/${a.id}/submit`, "POST", { answers: {} }, u))
        .status,
      400,
    );
    assert.equal(
      (
        await s.request(
          `/attempts/${a.id}/submit`,
          "POST",
          { answers: { [p.id]: "name" } },
          o,
        )
      ).status,
      404,
    );
    const result = await (
      await s.request(
        `/attempts/${a.id}/submit`,
        "POST",
        { answers: { [p.id]: "name" } },
        u,
      )
    ).json();
    assert.equal(result.score, 0);
    assert.equal(result.total, 1);
    assert.equal(result.results[0].correct_answer, "id");
    assert.equal(
      (
        await s.request(
          `/attempts/${a.id}/submit`,
          "POST",
          { answers: { [p.id]: "id" } },
          u,
        )
      ).status,
      409,
    );
    const data = await (
      await s.request(`/courses/${c.id}/practice`, "GET", undefined, u)
    ).json();
    assert.equal(data.mistakes.length, 1);
    assert.equal(data.mistakes[0].student_answer, "name");
    assert.equal(
      (
        await s.request(
          `/mistakes/${data.mistakes[0].id}`,
          "PATCH",
          { resolved: true },
          o,
        )
      ).status,
      404,
    );
    await s.request(
      `/mistakes/${data.mistakes[0].id}`,
      "PATCH",
      { resolved: true },
      u,
    );
    assert.equal(
      (
        await s
          .request(`/attempts/${a.id}`, "GET", undefined, u)
          .then((r) => r.json())
      ).score,
      0,
    );
  } finally {
    await s.close();
  }
});

test("all six quiz types grade submitted answers, including unordered matching pairs", async () => {
  const s = await testServer();
  try {
    const u = await s.register("six-types@example.com"),
      c = await s.course(u),
      q = await (
        await s.request(
          `/courses/${c.id}/quizzes`,
          "POST",
          { title: "Six question types" },
          u,
        )
      ).json();
    const samples = [
      {
        kind: "mcq",
        prompt: "Choose one",
        options: ["A", "B"],
        correct_answer: "B",
        student: "B",
      },
      {
        kind: "true_false",
        prompt: "True statement",
        options: [],
        correct_answer: "true",
        student: "true",
      },
      {
        kind: "short_answer",
        prompt: "Name the key",
        options: [],
        correct_answer: "Primary Key",
        student: " primary   KEY ",
      },
      {
        kind: "fill_blank",
        prompt: "Two plus two is ___",
        options: [],
        correct_answer: "4",
        student: "4",
      },
      {
        kind: "problem_solving",
        prompt: "Find the final result of 2×5",
        options: [],
        correct_answer: "10",
        student: "10",
      },
      {
        kind: "matching",
        prompt: "Match capitals",
        options: ["France", "Japan", "Tokyo", "Paris"],
        correct_answer: JSON.stringify({ France: "Paris", Japan: "Tokyo" }),
        student: JSON.stringify({ Japan: "Tokyo", France: "Paris" }),
      },
    ];
    const answers: Record<string, string> = {};
    for (const { student, ...question } of samples) {
      const r = await s.request(
        `/quizzes/${q.id}/questions`,
        "POST",
        question,
        u,
      );
      assert.equal(r.status, 201);
      answers[(await r.json()).id] = student;
    }
    const a = await (
      await s.request(`/quizzes/${q.id}/attempts`, "POST", {}, u)
    ).json();
    assert.equal(a.questions.length, 6);
    const result = await (
      await s.request(`/attempts/${a.id}/submit`, "POST", { answers }, u)
    ).json();
    assert.equal(result.score, 6);
    assert.equal(result.total, 6);
    assert.equal(
      (
        await s.request(
          `/quizzes/${q.id}/questions`,
          "POST",
          {
            kind: "matching",
            prompt: "Invalid pairs",
            options: ["France", "Japan", "Tokyo", "Paris"],
            correct_answer: JSON.stringify({ France: "Wrong", Japan: "Tokyo" }),
          },
          u,
        )
      ).status,
      400,
    );
  } finally {
    await s.close();
  }
});

test("matching labels do not inherit object properties while grading malformed pair maps", async () => {
  const s = await testServer();
  try {
    const u = await s.register("pair-labels@example.com"),
      c = await s.course(u),
      q = await (
        await s.request(
          `/courses/${c.id}/quizzes`,
          "POST",
          { title: "Pair labels" },
          u,
        )
      ).json();
    const question = await (
      await s.request(
        `/quizzes/${q.id}/questions`,
        "POST",
        {
          kind: "matching",
          prompt: "Match these labels",
          options: ["constructor", "term", "definition", "label"],
          correct_answer: JSON.stringify({
            constructor: "definition",
            term: "label",
          }),
        },
        u,
      )
    ).json();
    const a = await (
      await s.request(`/quizzes/${q.id}/attempts`, "POST", {}, u)
    ).json();
    const response = await s.request(
      `/attempts/${a.id}/submit`,
      "POST",
      {
        answers: {
          [question.id]: JSON.stringify({
            unknown: "definition",
            term: "label",
          }),
        },
      },
      u,
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).score, 0);
  } finally {
    await s.close();
  }
});
