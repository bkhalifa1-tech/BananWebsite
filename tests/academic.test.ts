import { test } from "node:test";
import assert from "node:assert/strict";
import { testServer } from "./helpers";
import { gradeSummary, weightedGpa, gradePoints } from "../src/lib/academic";
test("weighted grades normalize only marked components; GPA uses credit weights", () => {
  const s = gradeSummary([
    { weight: 20, total: 100, score: 80 },
    { weight: 30, total: 50, score: 45 },
    { weight: 50, total: 100, score: null },
  ]);
  assert.equal(s.current, 86);
  assert.equal(s.gradedWeight, 50);
  assert.equal(s.earnedContribution, 43);
  assert.equal(
    gradeSummary([{ weight: 100, total: 100, score: null }]).current,
    null,
  );
  assert.equal(gradePoints(97, { scale: "4.3", max: 4.3, rules: [] }), 4.3);
  assert.equal(
    weightedGpa(
      [
        { credits: 3, grade: 90 },
        { credits: 1, grade: 80 },
        { credits: 4, grade: null },
      ],
      { scale: "4", max: 4, rules: [] },
    ).value,
    3.75,
  );
});
test("academic ownership, grading weight validation, GPA scales and updated exam results", async () => {
  const f = await testServer();
  try {
    const a = await f.register("grades-a@example.com"),
      b = await f.register("grades-b@example.com"),
      course = await f.course(a);
    const req = (path: string, method = "GET", body?: unknown) =>
      f.request(path, method, body, a);
    assert.equal(
      (await f.request(`/courses/${course.id}/academics`, "GET", undefined, b))
        .status,
      404,
    );
    const grade = { name: "Assignments", weight: 20, total: 100, score: 80 };
    const gr = await req(`/courses/${course.id}/grades`, "POST", grade);
    assert.equal(gr.status, 201);
    const g = await gr.json();
    assert.equal(
      (await req(`/grades/${g.id}`, "PATCH", { ...grade, score: 101 })).status,
      400,
    );
    const exam = {
      name: "Final",
      start_at: "2027-01-10T10:00:00.000Z",
      weight: 80,
      total_mark: 100,
      target_grade: 90,
      actual_grade: null,
      included_material: "All lectures",
    };
    const ex = await req(`/courses/${course.id}/exams`, "POST", exam);
    assert.equal(ex.status, 201);
    const e = await ex.json();
    assert.equal(
      (
        await req(`/courses/${course.id}/grades`, "POST", {
          ...grade,
          name: "Overflow",
          weight: 1,
        })
      ).status,
      400,
    );
    assert.equal(
      (await (await req(`/courses/${course.id}/academics`)).json()).summary
        .current,
      80,
    );
    assert.equal(
      (
        await f.request(
          `/exams/${e.id}`,
          "PATCH",
          { ...exam, actual_grade: 90 },
          b,
        )
      ).status,
      404,
    );
    assert.equal(
      (await req(`/exams/${e.id}`, "PATCH", { ...exam, actual_grade: 90 }))
        .status,
      200,
    );
    assert.equal(
      (await (await req(`/courses/${course.id}/academics`)).json()).summary
        .current,
      88,
    );
    let overview = await (
      await req(`/semesters/${course.semester_id}/academics`)
    ).json();
    assert.equal(overview.semester.value, 3);
    assert.equal(overview.cumulative.value, 3);
    assert.equal(
      (
        await req("/academic-preferences", "PUT", {
          scale: "custom",
          max: 4,
          rules: [
            { min: 90, points: 1 },
            { min: 0, points: 4 },
          ],
        })
      ).status,
      400,
    );
    await req("/academic-preferences", "PUT", {
      scale: "100",
      max: 100,
      rules: [],
    });
    overview = await (
      await req(`/semesters/${course.semester_id}/academics`)
    ).json();
    assert.equal(overview.semester.value, 88);
    await req("/academic-preferences", "PUT", {
      scale: "custom",
      max: 5,
      rules: [
        { min: 85, points: 5 },
        { min: 0, points: 0 },
      ],
    });
    overview = await (
      await req(`/semesters/${course.semester_id}/academics`)
    ).json();
    assert.equal(overview.semester.value, 5);
    assert.equal(
      (await f.request(`/grades/${g.id}`, "DELETE", undefined, b)).status,
      404,
    );
    await req(`/grades/${g.id}`, "DELETE");
    assert.equal(
      (await (await req(`/courses/${course.id}/academics`)).json()).summary
        .current,
      90,
    );
  } finally {
    await f.close();
  }
});
