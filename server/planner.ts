import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ownedRouter, type UserLookup } from "./owned";
export function plannerSchema(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS calendar_events(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,course_id TEXT NOT NULL,title TEXT NOT NULL,kind TEXT NOT NULL,start_at TEXT NOT NULL,end_at TEXT NOT NULL,FOREIGN KEY(course_id,user_id) REFERENCES courses(id,user_id) ON DELETE CASCADE);CREATE INDEX IF NOT EXISTS events_user ON calendar_events(user_id,start_at);
CREATE TABLE IF NOT EXISTS study_sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,course_id TEXT NOT NULL,topic TEXT NOT NULL,task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,target_seconds INTEGER NOT NULL,break_seconds INTEGER NOT NULL,elapsed_seconds INTEGER NOT NULL DEFAULT 0,segment_at TEXT,state TEXT NOT NULL CHECK(state IN ('running','paused','completed','abandoned')),started_at TEXT NOT NULL,ended_at TEXT,FOREIGN KEY(course_id,user_id) REFERENCES courses(id,user_id) ON DELETE CASCADE);CREATE INDEX IF NOT EXISTS study_sessions_user ON study_sessions(user_id,started_at);CREATE UNIQUE INDEX IF NOT EXISTS one_active_session ON study_sessions(user_id) WHERE state IN ('running','paused');`);
}
type Session = {
  id: string;
  target_seconds: number;
  break_seconds: number;
  elapsed_seconds: number;
  segment_at: string | null;
  state: string;
  started_at: string;
  ended_at: string | null;
};
export function sessionElapsed(s: Session, now = Date.now()) {
  return Math.min(
    s.target_seconds,
    s.elapsed_seconds +
      (s.state === "running" && s.segment_at
        ? Math.max(0, Math.floor((now - Date.parse(s.segment_at)) / 1000))
        : 0),
  );
}
const event = z
  .object({
    title: z.string().trim().min(2).max(160),
    kind: z.enum(["lecture", "assignment", "deadline", "study", "goal"]),
    start_at: z.string().datetime({ offset: true }),
    end_at: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine(
    (e) =>
      Date.parse(e.end_at) > Date.parse(e.start_at) &&
      Date.parse(e.end_at) - Date.parse(e.start_at) <= 31 * 86400000,
  );
export function plannerRoutes(
  db: DatabaseSync,
  userFor: UserLookup,
  verified = false,
) {
  const r = ownedRouter(db, userFor, verified);
  const active = (u: string) =>
    db
      .prepare(
        "SELECT s.*,c.name AS course_name,c.color AS course_color FROM study_sessions s JOIN courses c ON c.id=s.course_id WHERE s.user_id=? AND s.state IN ('running','paused')",
      )
      .get(u) as Session | undefined;
  const payload = (s: Session | undefined) =>
    s
      ? {
          ...s,
          elapsed_seconds: sessionElapsed(s),
          server_time: new Date().toISOString(),
        }
      : null;
  r.get("/workspaces", (q, res) => {
    const track = q.query.track;
    if (
      track !== undefined &&
      !["semester", "personal"].includes(String(track))
    ) {
      res.status(400).json({ error: "Invalid learning track." });
      return;
    }
    const rows = db
      .prepare(
        "SELECT id,name,color,semester_id,kind FROM courses WHERE user_id=? ORDER BY name",
      )
      .all(res.locals.userId);
    res.json(
      track
        ? rows.filter(
            (c) => c.kind === (track === "personal" ? "personal" : "course"),
          )
        : rows,
    );
  });
  r.get("/planner", (q, res) => {
    const u = res.locals.userId,
      track = q.query.track;
    if (
      track !== undefined &&
      !["semester", "personal"].includes(String(track))
    ) {
      res.status(400).json({ error: "Invalid learning track." });
      return;
    }
    const ids = new Set(
      db
        .prepare("SELECT id,kind FROM courses WHERE user_id=?")
        .all(u)
        .filter(
          (c) =>
            !track || c.kind === (track === "personal" ? "personal" : "course"),
        )
        .map((c) => c.id),
    );
    res.json(
      db
        .prepare(
          `SELECT e.id,e.course_id,e.title,e.kind,e.start_at,e.end_at,c.name AS course_name,c.color AS course_color,'event' AS source FROM calendar_events e JOIN courses c ON c.id=e.course_id WHERE e.user_id=? UNION ALL SELECT e.id,e.course_id,e.name,'exam',e.start_at,e.start_at,c.name,c.color,'exam' FROM exams e JOIN courses c ON c.id=e.course_id WHERE e.user_id=? UNION ALL SELECT t.id,t.course_id,t.title,'deadline',t.due_date||'T12:00:00',t.due_date||'T12:00:00',c.name,c.color,'task' FROM tasks t JOIN courses c ON c.id=t.course_id WHERE t.user_id=? AND t.due_date IS NOT NULL AND t.completed_at IS NULL UNION ALL SELECT s.id,s.course_id,s.topic,'study',s.started_at,COALESCE(s.ended_at,s.started_at),c.name,c.color,'session' FROM study_sessions s JOIN courses c ON c.id=s.course_id WHERE s.user_id=? AND s.state='completed' ORDER BY start_at`,
        )
        .all(u, u, u, u)
        .filter((e) => ids.has(e.course_id)),
    );
  });
  r.post("/courses/:id/events", (q, res) => {
    const p = event.safeParse(q.body);
    if (!p.success) {
      res.status(400).json({ error: "Enter a title and valid event dates." });
      return;
    }
    const id = randomUUID(),
      e = p.data;
    db.prepare("INSERT INTO calendar_events VALUES(?,?,?,?,?,?,?)").run(
      id,
      res.locals.userId,
      res.locals.courseId,
      e.title,
      e.kind,
      e.start_at,
      e.end_at,
    );
    res.status(201).json({ id, ...e });
  });
  r.patch("/events/:id", (q, res) => {
    const u = res.locals.userId;
    if (
      !db
        .prepare("SELECT id FROM calendar_events WHERE id=? AND user_id=?")
        .get(q.params.id, u)
    ) {
      res.status(404).json({ error: "Event not found." });
      return;
    }
    const p = event.safeParse(q.body);
    if (!p.success) {
      res.status(400).json({ error: "Enter a title and valid event dates." });
      return;
    }
    const e = p.data;
    db.prepare(
      "UPDATE calendar_events SET title=?,kind=?,start_at=?,end_at=? WHERE id=? AND user_id=?",
    ).run(e.title, e.kind, e.start_at, e.end_at, q.params.id, u);
    res.json({ id: q.params.id, ...e });
  });
  r.delete("/events/:id", (q, res) => {
    const d = db
      .prepare("DELETE FROM calendar_events WHERE id=? AND user_id=?")
      .run(q.params.id, res.locals.userId);
    res
      .status(d.changes ? 204 : 404)
      .send(d.changes ? undefined : { error: "Event not found." });
  });
  r.get("/focus", (_q, res) =>
    res.json({
      active: payload(active(res.locals.userId)),
      history: db
        .prepare(
          "SELECT s.*,c.name AS course_name,c.color AS course_color FROM study_sessions s JOIN courses c ON c.id=s.course_id WHERE s.user_id=? AND s.state='completed' ORDER BY ended_at DESC LIMIT 50",
        )
        .all(res.locals.userId),
    }),
  );
  r.post("/courses/:id/focus", (q, res) => {
    const p = z
      .object({
        topic: z.string().trim().min(2).max(160),
        task_id: z.string().uuid().nullable().default(null),
        minutes: z.number().int().min(1).max(180),
        break_minutes: z.number().int().min(0).max(60),
      })
      .strict()
      .safeParse(q.body);
    if (!p.success) {
      res
        .status(400)
        .json({ error: "Enter a topic and valid session length." });
      return;
    }
    const u = res.locals.userId,
      c = res.locals.courseId;
    if (
      p.data.task_id &&
      !db
        .prepare(
          "SELECT id FROM tasks WHERE id=? AND course_id=? AND user_id=?",
        )
        .get(p.data.task_id, c, u)
    ) {
      res.status(400).json({ error: "Choose a task from this workspace." });
      return;
    }
    if (active(u)) {
      res.status(409).json({ error: "Finish the active session first." });
      return;
    }
    const id = randomUUID(),
      now = new Date().toISOString();
    db.prepare(
      "INSERT INTO study_sessions(id,user_id,course_id,topic,task_id,target_seconds,break_seconds,segment_at,state,started_at) VALUES(?,?,?,?,?,?,?,?,'running',?)",
    ).run(
      id,
      u,
      c,
      p.data.topic,
      p.data.task_id,
      p.data.minutes * 60,
      p.data.break_minutes * 60,
      now,
      now,
    );
    res.status(201).json(payload(active(u)));
  });
  r.post("/focus/:id/:action", (q, res) => {
    const u = res.locals.userId,
      s = active(u),
      a = q.params.action;
    if (!s || s.id !== q.params.id) {
      res.status(404).json({ error: "Active session not found." });
      return;
    }
    if (!["pause", "resume", "finish", "reset"].includes(a)) {
      res.status(400).json({ error: "Invalid session action." });
      return;
    }
    const now = new Date().toISOString(),
      elapsed = sessionElapsed(s);
    let state =
      a === "finish"
        ? "completed"
        : a === "reset"
          ? "abandoned"
          : a === "pause"
            ? "paused"
            : "running";
    if (elapsed >= s.target_seconds) state = "completed";
    db.prepare(
      "UPDATE study_sessions SET elapsed_seconds=?,segment_at=?,state=?,ended_at=? WHERE id=? AND user_id=?",
    ).run(
      elapsed,
      state === "running" ? now : null,
      state,
      ["completed", "abandoned"].includes(state) ? now : null,
      s.id,
      u,
    );
    res.json({
      active: payload(active(u)),
      completed:
        state === "completed"
          ? { ...s, elapsed_seconds: elapsed, state, ended_at: now }
          : null,
    });
  });
  return r;
}
