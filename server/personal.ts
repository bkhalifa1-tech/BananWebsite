import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ownedRouter, type UserLookup } from "./owned";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
  );
const spaceSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    goal: z.string().trim().min(2).max(1000),
    level: z.enum(["beginner", "intermediate", "advanced"]),
    target_date: date.nullable(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();
export function personalRoutes(
  db: DatabaseSync,
  userFor: UserLookup,
  verified = false,
) {
  const r = ownedRouter(db, userFor, verified);
  const space = (id: string, u: string) =>
    db
      .prepare(
        "SELECT * FROM courses WHERE id=? AND user_id=? AND kind='personal'",
      )
      .get(id, u);
  r.get("/spaces", (_q, res) =>
    res.json(
      db
        .prepare(
          "SELECT c.*,COUNT(t.id) AS task_count,COALESCE(SUM(t.completed_at IS NOT NULL),0) AS completed_count FROM courses c LEFT JOIN tasks t ON t.course_id=c.id WHERE c.user_id=? AND c.kind='personal' GROUP BY c.id ORDER BY c.created_at DESC",
        )
        .all(res.locals.userId),
    ),
  );
  r.post("/spaces", (q, res) => {
    const p = spaceSchema.safeParse(q.body);
    if (!p.success) {
      res
        .status(400)
        .json({ error: "Enter a learning goal, name and valid target date." });
      return;
    }
    const id = randomUUID(),
      u = res.locals.userId,
      d = p.data;
    db.prepare(
      "INSERT INTO courses(id,user_id,semester_id,name,credits,color,kind,goal,level,target_date) VALUES(?,?,NULL,?,0,?,'personal',?,?,?)",
    ).run(id, u, d.name, d.color, d.goal, d.level, d.target_date);
    res.status(201).json(space(id, u));
  });
  r.get("/spaces/:id", (q, res) => {
    const u = res.locals.userId,
      c = space(q.params.id, u);
    if (!c) {
      res.status(404).json({ error: "Learning space not found." });
      return;
    }
    res.json({
      space: c,
      tasks: db
        .prepare(
          "SELECT * FROM tasks WHERE course_id=? AND user_id=? ORDER BY completed_at IS NOT NULL,due_date IS NULL,due_date,created_at",
        )
        .all(q.params.id, u),
    });
  });
  r.patch("/spaces/:id", (q, res) => {
    const u = res.locals.userId;
    if (!space(q.params.id, u)) {
      res.status(404).json({ error: "Learning space not found." });
      return;
    }
    const p = spaceSchema.safeParse(q.body);
    if (!p.success) {
      res
        .status(400)
        .json({ error: "Enter a learning goal, name and valid target date." });
      return;
    }
    const d = p.data;
    db.prepare(
      "UPDATE courses SET name=?,goal=?,level=?,target_date=?,color=? WHERE id=? AND user_id=? AND kind='personal'",
    ).run(d.name, d.goal, d.level, d.target_date, d.color, q.params.id, u);
    res.json(space(q.params.id, u));
  });
  r.delete("/spaces/:id", (q, res) => {
    const d = db
      .prepare(
        "DELETE FROM courses WHERE id=? AND user_id=? AND kind='personal'",
      )
      .run(q.params.id, res.locals.userId);
    res
      .status(d.changes ? 204 : 404)
      .send(d.changes ? undefined : { error: "Learning space not found." });
  });
  return r;
}
