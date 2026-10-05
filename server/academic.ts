import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ownedRouter, type UserLookup } from "./owned";
import {
  gradeSummary,
  weightedGpa,
  type GradeScale,
  type Mark,
} from "../src/lib/academic";
const name = z.string().trim().min(2).max(120),
  weight = z.number().min(0).max(100),
  total = z.number().positive().max(10000),
  score = z.number().min(0).max(10000).nullable();
const gradeSchema = z
  .object({ name, weight, total, score })
  .strict()
  .refine((x) => x.score === null || x.score <= x.total);
const examSchema = z
  .object({
    name,
    start_at: z.string().datetime({ offset: true }),
    weight,
    total_mark: total,
    target_grade: z.number().min(0).max(100),
    actual_grade: score,
    included_material: z.string().max(2000).default(""),
  })
  .strict()
  .refine((x) => x.actual_grade === null || x.actual_grade <= x.total_mark);
const scaleSchema = z
  .object({
    scale: z.enum(["4", "4.3", "100", "custom"]),
    max: z.number().positive().max(100),
    rules: z
      .array(
        z
          .object({
            min: z.number().min(0).max(100),
            points: z.number().min(0).max(100),
          })
          .strict(),
      )
      .max(30),
  })
  .strict()
  .refine(
    (s) =>
      s.scale !== "custom" ||
      (s.rules.some((r) => r.min === 0) &&
        new Set(s.rules.map((r) => r.min)).size === s.rules.length &&
        s.rules.every((r) => r.points <= s.max) &&
        [...s.rules]
          .sort((a, b) => a.min - b.min)
          .every((r, i, a) => i === 0 || r.points >= a[i - 1].points)),
  );
export function academicService(db: DatabaseSync) {
  function scale(userId: string): GradeScale {
    const row = db
      .prepare(
        "SELECT scale,max,rules FROM academic_preferences WHERE user_id=?",
      )
      .get(userId);
    return row
      ? {
          scale: row.scale as GradeScale["scale"],
          max: Number(row.max),
          rules: JSON.parse(String(row.rules)),
        }
      : { scale: "4", max: 4, rules: [] };
  }
  function marks(courseId: string, userId: string): Mark[] {
    return db
      .prepare(
        "SELECT weight,total,score FROM grade_items WHERE course_id=? AND user_id=? UNION ALL SELECT weight,total_mark AS total,actual_grade AS score FROM exams WHERE course_id=? AND user_id=?",
      )
      .all(courseId, userId, courseId, userId) as Mark[];
  }
  function overview(userId: string, semesterId?: string) {
    const grading = scale(userId);
    const all = (
      db
        .prepare(
          "SELECT id,name,credits,semester_id FROM courses WHERE user_id=? AND kind='course'",
        )
        .all(userId) as {
        id: string;
        name: string;
        credits: number;
        semester_id: string;
      }[]
    ).map((c) => ({
      ...c,
      credits: Number(c.credits),
      grade: gradeSummary(marks(String(c.id), userId)).current,
    }));
    const selected = semesterId
      ? all.filter((c) => c.semester_id === semesterId)
      : all;
    return {
      scale: grading,
      semester: weightedGpa(selected, grading),
      cumulative: weightedGpa(all, grading),
      courses: selected,
    };
  }
  return { scale, marks, overview };
}
export function academicRoutes(
  db: DatabaseSync,
  userFor: UserLookup,
  requireVerified = false,
) {
  const router = ownedRouter(db, userFor, requireVerified),
    service = academicService(db);
  router.use(
    ["/courses/:id/academics", "/courses/:id/grades", "/courses/:id/exams"],
    (req, res, next) => {
      void req;
      if (
        !db
          .prepare(
            "SELECT id FROM courses WHERE id=? AND user_id=? AND kind='course'",
          )
          .get(res.locals.courseId, res.locals.userId)
      ) {
        res.status(404).json({
          error: "Academic grading is available only for semester courses.",
        });
        return;
      }
      next();
    },
  );
  router.get("/courses/:id/academics", (_req, res) => {
    const u = res.locals.userId,
      c = res.locals.courseId;
    res.json({
      exams: db
        .prepare(
          "SELECT * FROM exams WHERE course_id=? AND user_id=? ORDER BY start_at,id",
        )
        .all(c, u),
      grades: db
        .prepare(
          "SELECT * FROM grade_items WHERE course_id=? AND user_id=? ORDER BY created_at,id",
        )
        .all(c, u),
      summary: gradeSummary(service.marks(c, u)),
    });
  });
  router.get("/semesters/:id/academics", (req, res) => {
    const u = res.locals.userId;
    if (
      !db
        .prepare("SELECT id FROM semesters WHERE id=? AND user_id=?")
        .get(req.params.id, u)
    ) {
      res.status(404).json({ error: "Semester not found." });
      return;
    }
    res.json({
      ...service.overview(u, req.params.id),
      upcoming: db
        .prepare(
          "SELECT e.id,e.name,e.start_at,c.name AS course_name,c.color AS course_color FROM exams e JOIN courses c ON c.id=e.course_id AND c.user_id=e.user_id WHERE c.semester_id=? AND e.user_id=? AND e.start_at>=? ORDER BY e.start_at LIMIT 5",
        )
        .all(req.params.id, u, new Date().toISOString()),
    });
  });
  router.put("/academic-preferences", (req, res) => {
    const p = scaleSchema.safeParse(req.body);
    if (!p.success) {
      res.status(400).json({
        error:
          "Enter a valid GPA scale with increasing grade points and a zero-percent rule.",
      });
      return;
    }
    const max =
      p.data.scale === "4"
        ? 4
        : p.data.scale === "4.3"
          ? 4.3
          : p.data.scale === "100"
            ? 100
            : p.data.max;
    db.prepare(
      "INSERT INTO academic_preferences(user_id,scale,max,rules) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET scale=excluded.scale,max=excluded.max,rules=excluded.rules",
    ).run(res.locals.userId, p.data.scale, max, JSON.stringify(p.data.rules));
    res.json(service.overview(res.locals.userId));
  });
  function allowedWeight(
    courseId: string,
    userId: string,
    proposed: number,
    kind: "exam" | "grade",
    exclude = "",
  ) {
    const current = db
      .prepare(
        "SELECT COALESCE(SUM(weight),0) AS n FROM (SELECT weight FROM exams WHERE course_id=? AND user_id=? AND (?!='exam' OR id!=?) UNION ALL SELECT weight FROM grade_items WHERE course_id=? AND user_id=? AND (?!='grade' OR id!=?))",
      )
      .get(courseId, userId, kind, exclude, courseId, userId, kind, exclude);
    return Number(current!.n) + proposed <= 100.000001;
  }
  router.post("/courses/:id/grades", (req, res) => {
    const p = gradeSchema.safeParse(req.body),
      u = res.locals.userId,
      c = res.locals.courseId;
    if (!p.success) {
      res.status(400).json({
        error: "Enter valid marks and weights. Score cannot exceed total.",
      });
      return;
    }
    if (!allowedWeight(c, u, p.data.weight, "grade")) {
      res
        .status(400)
        .json({ error: "Combined grading weights cannot exceed 100%." });
      return;
    }
    const id = randomUUID(),
      { name, weight, total, score } = p.data;
    db.prepare(
      "INSERT INTO grade_items(id,user_id,course_id,name,weight,total,score) VALUES(?,?,?,?,?,?,?)",
    ).run(id, u, c, name, weight, total, score);
    res.status(201).json({ id });
  });
  router.patch("/grades/:id", (req, res) => {
    const u = res.locals.userId,
      row = db
        .prepare("SELECT course_id FROM grade_items WHERE id=? AND user_id=?")
        .get(req.params.id, u);
    if (!row) {
      res.status(404).json({ error: "Grade not found." });
      return;
    }
    const p = gradeSchema.safeParse(req.body);
    if (!p.success) {
      res.status(400).json({
        error: "Enter valid marks and weights. Score cannot exceed total.",
      });
      return;
    }
    if (
      !allowedWeight(
        String(row.course_id),
        u,
        p.data.weight,
        "grade",
        req.params.id,
      )
    ) {
      res
        .status(400)
        .json({ error: "Combined grading weights cannot exceed 100%." });
      return;
    }
    db.prepare(
      "UPDATE grade_items SET name=?,weight=?,total=?,score=? WHERE id=? AND user_id=?",
    ).run(
      p.data.name,
      p.data.weight,
      p.data.total,
      p.data.score,
      req.params.id,
      u,
    );
    res.json({ id: req.params.id });
  });
  router.post("/courses/:id/exams", (req, res) => {
    const u = res.locals.userId,
      c = res.locals.courseId,
      p = examSchema.safeParse(req.body);
    if (!p.success) {
      res
        .status(400)
        .json({ error: "Enter a valid exam, date, marks and weights." });
      return;
    }
    if (!allowedWeight(c, u, p.data.weight, "exam")) {
      res
        .status(400)
        .json({ error: "Combined grading weights cannot exceed 100%." });
      return;
    }
    const id = randomUUID(),
      e = p.data;
    db.prepare(
      "INSERT INTO exams(id,user_id,course_id,name,start_at,weight,total_mark,target_grade,actual_grade,included_material) VALUES(?,?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      u,
      c,
      e.name,
      new Date(e.start_at).toISOString(),
      e.weight,
      e.total_mark,
      e.target_grade,
      e.actual_grade,
      e.included_material,
    );
    res.status(201).json({ id });
  });
  router.patch("/exams/:id", (req, res) => {
    const u = res.locals.userId,
      row = db
        .prepare("SELECT course_id FROM exams WHERE id=? AND user_id=?")
        .get(req.params.id, u);
    if (!row) {
      res.status(404).json({ error: "Exam not found." });
      return;
    }
    const p = examSchema.safeParse(req.body);
    if (!p.success) {
      res
        .status(400)
        .json({ error: "Enter a valid exam, date, marks and weights." });
      return;
    }
    if (
      !allowedWeight(
        String(row.course_id),
        u,
        p.data.weight,
        "exam",
        req.params.id,
      )
    ) {
      res
        .status(400)
        .json({ error: "Combined grading weights cannot exceed 100%." });
      return;
    }
    const e = p.data;
    db.prepare(
      "UPDATE exams SET name=?,start_at=?,weight=?,total_mark=?,target_grade=?,actual_grade=?,included_material=? WHERE id=? AND user_id=?",
    ).run(
      e.name,
      new Date(e.start_at).toISOString(),
      e.weight,
      e.total_mark,
      e.target_grade,
      e.actual_grade,
      e.included_material,
      req.params.id,
      u,
    );
    res.json({ id: req.params.id });
  });
  for (const [path, table, label] of [
    ["grades", "grade_items", "Grade"],
    ["exams", "exams", "Exam"],
  ] as const)
    router.delete(`/${path}/:id`, (req, res) => {
      const r = db
        .prepare(`DELETE FROM ${table} WHERE id=? AND user_id=?`)
        .run(req.params.id, res.locals.userId);
      if (!r.changes) {
        res.status(404).json({ error: `${label} not found.` });
        return;
      }
      res.status(204).end();
    });
  return router;
}
