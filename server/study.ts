import { Router, type Request } from "express";
import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
  );
const semesterSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    start_date: date,
    end_date: date,
  })
  .strict()
  .refine(
    (x) => x.end_date >= x.start_date,
    "End date must follow start date.",
  );
const courseSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    code: z.string().trim().max(24).default(""),
    credits: z.number().min(0).max(30),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();
const taskSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    due_date: date.nullable().default(null),
  })
  .strict();
export function studyRoutes(
  db: DatabaseSync,
  userFor: (
    req: Request,
  ) => { id: string; email_verified?: number } | undefined,
  requireVerified = false,
) {
  const router = Router();
  router.use((req, res, next) => {
    const u = userFor(req);
    if (!u) {
      res.status(401).json({ error: "Sign in required." });
      return;
    }
    if (requireVerified && !u.email_verified) {
      res
        .status(403)
        .json({ error: "Verify your email before accessing study data." });
      return;
    }
    res.locals.userId = u.id;
    next();
  });
  const semester = (id: string, userId: string) =>
    db
      .prepare("SELECT * FROM semesters WHERE id=? AND user_id=?")
      .get(id, userId);
  const course = (id: string, userId: string) =>
    db
      .prepare("SELECT * FROM courses WHERE id=? AND user_id=?")
      .get(id, userId);
  router.get("/semesters", (_req, res) =>
    res.json(
      db
        .prepare(
          "SELECT * FROM semesters WHERE user_id=? ORDER BY start_date DESC,created_at DESC,id",
        )
        .all(res.locals.userId),
    ),
  );
  router.post("/semesters", (req, res) => {
    const p = semesterSchema.safeParse(req.body);
    if (!p.success) {
      res
        .status(400)
        .json({ error: "Enter a semester name and valid start/end dates." });
      return;
    }
    const id = randomUUID(),
      u = res.locals.userId;
    const { name, start_date, end_date } = p.data;
    db.prepare(
      "INSERT INTO semesters(id,user_id,name,start_date,end_date) VALUES(?,?,?,?,?)",
    ).run(id, u, name, start_date, end_date);
    res.status(201).json(semester(id, u));
  });
  router.patch("/semesters/:id", (req, res) => {
    const u = res.locals.userId;
    if (!semester(req.params.id, u)) {
      res.status(404).json({ error: "Semester not found." });
      return;
    }
    const p = semesterSchema.safeParse(req.body);
    if (!p.success) {
      res
        .status(400)
        .json({ error: "Enter a semester name and valid start/end dates." });
      return;
    }
    const { name, start_date, end_date } = p.data;
    db.prepare(
      "UPDATE semesters SET name=?,start_date=?,end_date=? WHERE id=? AND user_id=?",
    ).run(name, start_date, end_date, req.params.id, u);
    res.json(semester(req.params.id, u));
  });
  router.delete("/semesters/:id", (req, res) => {
    const result = db
      .prepare("DELETE FROM semesters WHERE id=? AND user_id=?")
      .run(req.params.id, res.locals.userId);
    if (!result.changes) {
      res.status(404).json({ error: "Semester not found." });
      return;
    }
    res.status(204).end();
  });
  router.get("/semesters/:id/dashboard", (req, res) => {
    const u = res.locals.userId,
      s = semester(req.params.id, u);
    if (!s) {
      res.status(404).json({ error: "Semester not found." });
      return;
    }
    const courses = db
      .prepare(
        `SELECT c.*,COUNT(t.id) AS task_count,COALESCE(SUM(t.completed_at IS NOT NULL),0) AS completed_count FROM courses c LEFT JOIN tasks t ON t.course_id=c.id AND t.user_id=c.user_id WHERE c.semester_id=? AND c.user_id=? GROUP BY c.id ORDER BY c.created_at,c.id`,
      )
      .all(req.params.id, u);
    const tasks = db
      .prepare(
        `SELECT t.*,c.name AS course_name,c.color AS course_color FROM tasks t JOIN courses c ON c.id=t.course_id AND c.user_id=t.user_id WHERE c.semester_id=? AND t.user_id=? ORDER BY t.completed_at IS NOT NULL,t.due_date IS NULL,t.due_date,t.created_at,t.id`,
      )
      .all(req.params.id, u);
    res.json({ semester: s, courses, tasks });
  });
  router.post("/semesters/:id/courses", (req, res) => {
    const u = res.locals.userId;
    if (!semester(req.params.id, u)) {
      res.status(404).json({ error: "Semester not found." });
      return;
    }
    const p = courseSchema.safeParse(req.body);
    if (!p.success) {
      res.status(400).json({
        error: "Enter a course name, credits (0–30), and a valid color.",
      });
      return;
    }
    const id = randomUUID(),
      { name, code, credits, color } = p.data;
    db.prepare(
      "INSERT INTO courses(id,user_id,semester_id,name,code,credits,color) VALUES(?,?,?,?,?,?,?)",
    ).run(id, u, req.params.id, name, code, credits, color);
    res.status(201).json(course(id, u));
  });
  router.get("/courses/:id", (req, res) => {
    const u = res.locals.userId,
      c = course(req.params.id, u);
    if (!c) {
      res.status(404).json({ error: "Course not found." });
      return;
    }
    res.json({
      course: c,
      tasks: db
        .prepare(
          "SELECT * FROM tasks WHERE course_id=? AND user_id=? ORDER BY completed_at IS NOT NULL,due_date IS NULL,due_date,created_at,id",
        )
        .all(req.params.id, u),
    });
  });
  router.patch("/courses/:id", (req, res) => {
    const u = res.locals.userId;
    if (
      !db
        .prepare(
          "SELECT id FROM courses WHERE id=? AND user_id=? AND kind='course'",
        )
        .get(req.params.id, u)
    ) {
      res.status(404).json({ error: "Course not found." });
      return;
    }
    const p = courseSchema.safeParse(req.body);
    if (!p.success) {
      res.status(400).json({
        error: "Enter a course name, credits (0–30), and a valid color.",
      });
      return;
    }
    const { name, code, credits, color } = p.data;
    db.prepare(
      "UPDATE courses SET name=?,code=?,credits=?,color=? WHERE id=? AND user_id=?",
    ).run(name, code, credits, color, req.params.id, u);
    res.json(course(req.params.id, u));
  });
  router.delete("/courses/:id", (req, res) => {
    const result = db
      .prepare("DELETE FROM courses WHERE id=? AND user_id=? AND kind='course'")
      .run(req.params.id, res.locals.userId);
    if (!result.changes) {
      res.status(404).json({ error: "Course not found." });
      return;
    }
    res.status(204).end();
  });
  router.post("/courses/:id/tasks", (req, res) => {
    const u = res.locals.userId;
    if (!course(req.params.id, u)) {
      res.status(404).json({ error: "Course not found." });
      return;
    }
    const p = taskSchema.safeParse(req.body);
    if (!p.success) {
      res
        .status(400)
        .json({ error: "Enter a task title and a valid due date." });
      return;
    }
    const id = randomUUID();
    db.prepare(
      "INSERT INTO tasks(id,user_id,course_id,title,due_date) VALUES(?,?,?,?,?)",
    ).run(id, u, req.params.id, p.data.title, p.data.due_date);
    res.status(201).json(db.prepare("SELECT * FROM tasks WHERE id=?").get(id));
  });
  router.patch("/tasks/:id", (req, res) => {
    const u = res.locals.userId;
    if (
      !db
        .prepare("SELECT id FROM tasks WHERE id=? AND user_id=?")
        .get(req.params.id, u)
    ) {
      res.status(404).json({ error: "Task not found." });
      return;
    }
    const p = taskSchema.extend({ completed: z.boolean() }).safeParse(req.body);
    if (!p.success) {
      res
        .status(400)
        .json({ error: "Enter a task title and a valid due date." });
      return;
    }
    db.prepare(
      "UPDATE tasks SET title=?,due_date=?,completed_at=? WHERE id=? AND user_id=?",
    ).run(
      p.data.title,
      p.data.due_date,
      p.data.completed ? new Date().toISOString() : null,
      req.params.id,
      u,
    );
    res.json(
      db
        .prepare("SELECT * FROM tasks WHERE id=? AND user_id=?")
        .get(req.params.id, u),
    );
  });
  router.delete("/tasks/:id", (req, res) => {
    const r = db
      .prepare("DELETE FROM tasks WHERE id=? AND user_id=?")
      .run(req.params.id, res.locals.userId);
    if (!r.changes) {
      res.status(404).json({ error: "Task not found." });
      return;
    }
    res.status(204).end();
  });
  return router;
}
