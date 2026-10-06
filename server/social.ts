import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { ownedRouter, type UserLookup } from "./owned";
export function socialSchema(db: DatabaseSync) {
  db.exec(`
CREATE TABLE IF NOT EXISTS study_groups(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS group_members(group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN ('editor','viewer')),PRIMARY KEY(group_id,user_id));
CREATE TABLE IF NOT EXISTS group_invites(id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,email TEXT NOT NULL,role TEXT NOT NULL,expires_at INTEGER NOT NULL,UNIQUE(group_id,email));
CREATE TABLE IF NOT EXISTS group_notes(id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,author_id TEXT REFERENCES users(id) ON DELETE SET NULL,title TEXT NOT NULL,body TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS group_notes_group ON group_notes(group_id,updated_at);
CREATE TABLE IF NOT EXISTS community_posts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,body TEXT NOT NULL,topic TEXT NOT NULL,hidden INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS posts_created ON community_posts(created_at);
CREATE TABLE IF NOT EXISTS community_comments(id TEXT PRIMARY KEY,post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS community_likes(post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(post_id,user_id));
CREATE TABLE IF NOT EXISTS community_reports(post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,reason TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(post_id,user_id));
`);
}
const note = z
  .object({
    title: z.string().trim().min(2).max(160),
    body: z.string().trim().min(1).max(10000),
  })
  .strict();
export function socialRoutes(
  db: DatabaseSync,
  userFor: UserLookup,
  verified = false,
) {
  const r = ownedRouter(db, userFor, verified),
    limits = new Map<string, { count: number; until: number }>();
  r.use((q, res, next) => {
    if (q.method === "GET") {
      next();
      return;
    }
    const now = Date.now();
    for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    const l = limits.get(res.locals.userId) || { count: 0, until: now + 60000 };
    if (++l.count > 30) {
      res.status(429).json({ error: "Too many requests. Try again later." });
      return;
    }
    limits.set(res.locals.userId, l);
    next();
  });
  const member = (g: string, u: string) => {
    const owner = db
      .prepare("SELECT owner_id FROM study_groups WHERE id=?")
      .get(g);
    if (!owner) return null;
    if (owner.owner_id === u) return "owner";
    return db
      .prepare("SELECT role FROM group_members WHERE group_id=? AND user_id=?")
      .get(g, u)?.role as string | undefined;
  };
  r.get("/social", (_q, res) => {
    const u = res.locals.userId,
      email = db.prepare("SELECT email FROM users WHERE id=?").get(u)!.email;
    res.json({
      moderator: moderator(u),
      groups: db
        .prepare(
          "SELECT g.*,CASE WHEN g.owner_id=? THEN 'owner' ELSE m.role END AS role FROM study_groups g LEFT JOIN group_members m ON m.group_id=g.id AND m.user_id=? WHERE g.owner_id=? OR m.user_id=? ORDER BY g.created_at DESC",
        )
        .all(u, u, u, u),
      invites: db
        .prepare(
          "SELECT i.id,g.name,i.role FROM group_invites i JOIN study_groups g ON g.id=i.group_id WHERE i.email=? COLLATE NOCASE AND i.expires_at>?",
        )
        .all(email, Date.now()),
    });
  });
  r.post("/groups", (q, res) => {
    const p = z
      .object({ name: z.string().trim().min(2).max(100) })
      .strict()
      .safeParse(q.body);
    if (!p.success) {
      res.status(400).json({ error: "Enter a group name." });
      return;
    }
    const id = randomUUID();
    db.prepare("INSERT INTO study_groups VALUES(?,?,?,?)").run(
      id,
      res.locals.userId,
      p.data.name,
      new Date().toISOString(),
    );
    res.status(201).json({ id });
  });
  r.get("/groups/:id", (q, res) => {
    const role = member(q.params.id, res.locals.userId);
    if (!role) {
      res.status(404).json({ error: "Group not found." });
      return;
    }
    res.json({
      group: db
        .prepare("SELECT id,name FROM study_groups WHERE id=?")
        .get(q.params.id),
      role,
      members: db
        .prepare(
          "SELECT u.id,u.name,m.role FROM group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=?",
        )
        .all(q.params.id),
      notes: db
        .prepare(
          "SELECT n.*,u.name AS author FROM group_notes n LEFT JOIN users u ON u.id=n.author_id WHERE group_id=? ORDER BY updated_at DESC",
        )
        .all(q.params.id),
    });
  });
  r.delete("/groups/:id", (q, res) => {
    const d = db
      .prepare("DELETE FROM study_groups WHERE id=? AND owner_id=?")
      .run(q.params.id, res.locals.userId);
    res
      .status(d.changes ? 204 : 404)
      .send(d.changes ? undefined : { error: "Group not found." });
  });
  r.post("/groups/:id/invites", (q, res) => {
    if (member(q.params.id, res.locals.userId) !== "owner") {
      res.status(404).json({ error: "Group not found." });
      return;
    }
    const p = z
      .object({
        email: z
          .string()
          .trim()
          .email()
          .max(254)
          .transform((e) => e.toLowerCase()),
        role: z.enum(["editor", "viewer"]),
      })
      .strict()
      .safeParse(q.body);
    if (!p.success) {
      res.status(400).json({ error: "Enter a valid invitation." });
      return;
    }
    db.prepare(
      "INSERT INTO group_invites VALUES(?,?,?,?,?) ON CONFLICT(group_id,email) DO UPDATE SET role=excluded.role,expires_at=excluded.expires_at",
    ).run(
      randomUUID(),
      q.params.id,
      p.data.email,
      p.data.role,
      Date.now() + 7 * 86400000,
    );
    res.status(201).json({ sent: true });
  });
  r.post("/group-invites/:id/accept", (q, res) => {
    const u = res.locals.userId,
      email = db.prepare("SELECT email FROM users WHERE id=?").get(u)!.email,
      i = db
        .prepare(
          "SELECT * FROM group_invites WHERE id=? AND email=? COLLATE NOCASE AND expires_at>?",
        )
        .get(q.params.id, email, Date.now());
    if (!i) {
      res.status(404).json({ error: "Invitation not found." });
      return;
    }
    db.exec("BEGIN");
    try {
      db.prepare(
        "INSERT INTO group_members VALUES(?,?,?) ON CONFLICT(group_id,user_id) DO UPDATE SET role=excluded.role",
      ).run(i.group_id, u, i.role);
      db.prepare("DELETE FROM group_invites WHERE id=?").run(i.id);
      db.exec("COMMIT");
      res.json({ id: i.group_id });
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  });
  r.delete("/groups/:id/members/:user", (q, res) => {
    const role = member(q.params.id, res.locals.userId);
    if (!role || (role !== "owner" && q.params.user !== res.locals.userId)) {
      res.status(404).json({ error: "Group not found." });
      return;
    }
    db.prepare("DELETE FROM group_members WHERE group_id=? AND user_id=?").run(
      q.params.id,
      q.params.user,
    );
    res.status(204).end();
  });
  r.post("/groups/:id/notes", (q, res) => {
    const role = member(q.params.id, res.locals.userId);
    if (!role) {
      res.status(404).json({ error: "Group not found." });
      return;
    }
    if (role === "viewer") {
      res.status(403).json({ error: "This group is read-only for you." });
      return;
    }
    const p = note.safeParse(q.body);
    if (!p.success) {
      res.status(400).json({ error: "Enter a title and study content." });
      return;
    }
    const id = randomUUID();
    db.prepare("INSERT INTO group_notes VALUES(?,?,?,?,?,1,?)").run(
      id,
      q.params.id,
      res.locals.userId,
      p.data.title,
      p.data.body,
      new Date().toISOString(),
    );
    res.status(201).json({ id });
  });
  r.patch("/groups/:id/notes/:note", (q, res) => {
    const role = member(q.params.id, res.locals.userId),
      p = note.extend({ version: z.number().int().min(1) }).safeParse(q.body);
    if (!role) {
      res.status(404).json({ error: "Group not found." });
      return;
    }
    if (role === "viewer") {
      res.status(403).json({ error: "This group is read-only for you." });
      return;
    }
    if (!p.success) {
      res.status(400).json({ error: "Enter a title and study content." });
      return;
    }
    const n = db
      .prepare("SELECT * FROM group_notes WHERE id=? AND group_id=?")
      .get(q.params.note, q.params.id);
    if (!n) {
      res.status(404).json({ error: "Shared note not found." });
      return;
    }
    const d = db
      .prepare(
        "UPDATE group_notes SET title=?,body=?,version=version+1,updated_at=? WHERE id=? AND version=?",
      )
      .run(
        p.data.title,
        p.data.body,
        new Date().toISOString(),
        n.id,
        p.data.version,
      );
    if (!d.changes) {
      res
        .status(409)
        .json({ error: "This shared note changed. Reload before saving." });
      return;
    }
    res.json({ version: p.data.version + 1 });
  });
  r.delete("/groups/:id/notes/:note", (q, res) => {
    const role = member(q.params.id, res.locals.userId),
      n = db
        .prepare("SELECT author_id FROM group_notes WHERE id=? AND group_id=?")
        .get(q.params.note, q.params.id);
    if (!role || !n) {
      res.status(404).json({ error: "Shared note not found." });
      return;
    }
    if (
      role === "viewer" ||
      (role !== "owner" && n.author_id !== res.locals.userId)
    ) {
      res
        .status(403)
        .json({
          error: "Only the author or group owner can delete this note.",
        });
      return;
    }
    db.prepare("DELETE FROM group_notes WHERE id=?").run(q.params.note);
    res.status(204).end();
  });
  r.get("/community", (q, res) => {
    const p = z
      .object({
        before: z.coerce
          .number()
          .int()
          .nonnegative()
          .default(Number.MAX_SAFE_INTEGER),
      })
      .safeParse(q.query);
    if (!p.success) {
      res.status(400).json({ error: "Invalid page." });
      return;
    }
    const posts = db
      .prepare(
        `SELECT p.id,p.rowid AS cursor,p.title,p.body,p.topic,p.created_at,u.name AS author,p.user_id=? AS mine,(SELECT COUNT(*) FROM community_likes WHERE post_id=p.id) AS likes,EXISTS(SELECT 1 FROM community_likes WHERE post_id=p.id AND user_id=?) AS liked,(SELECT COUNT(*) FROM community_comments WHERE post_id=p.id) AS comments FROM community_posts p JOIN users u ON u.id=p.user_id WHERE p.hidden=0 AND p.rowid<? ORDER BY p.rowid DESC LIMIT 30`,
      )
      .all(res.locals.userId, res.locals.userId, p.data.before);
    res.json({
      posts,
      next: posts.length === 30 ? posts.at(-1)!.cursor : null,
    });
  });
  r.post("/community", (q, res) => {
    const p = note
      .extend({
        topic: z.string().trim().max(80).default(""),
        consent: z.literal(true),
      })
      .safeParse(q.body);
    if (!p.success) {
      res
        .status(400)
        .json({ error: "Enter study content and confirm sharing." });
      return;
    }
    const id = randomUUID();
    db.prepare("INSERT INTO community_posts VALUES(?,?,?,?,?,0,?)").run(
      id,
      res.locals.userId,
      p.data.title,
      p.data.body,
      p.data.topic,
      new Date().toISOString(),
    );
    res.status(201).json({ id });
  });
  r.use("/community/:id", (q, res, next) => {
    if (
      !db
        .prepare("SELECT id FROM community_posts WHERE id=? AND hidden=0")
        .get(q.params.id)
    ) {
      res.status(404).json({ error: "Post not found." });
      return;
    }
    next();
  });
  r.get("/community/:id/comments", (q, res) =>
    res.json(
      db
        .prepare(
          "SELECT c.id,c.body,c.created_at,u.name AS author,c.user_id=? AS mine FROM community_comments c JOIN users u ON u.id=c.user_id WHERE post_id=? ORDER BY c.created_at LIMIT 200",
        )
        .all(res.locals.userId, q.params.id),
    ),
  );
  r.post("/community/:id/comments", (q, res) => {
    const p = z
      .object({ body: z.string().trim().min(1).max(2000) })
      .strict()
      .safeParse(q.body);
    if (!p.success) {
      res.status(400).json({ error: "Enter a comment." });
      return;
    }
    const id = randomUUID();
    db.prepare("INSERT INTO community_comments VALUES(?,?,?,?,?)").run(
      id,
      q.params.id,
      res.locals.userId,
      p.data.body,
      new Date().toISOString(),
    );
    res.status(201).json({ id });
  });
  r.delete("/community-comments/:id", (q, res) => {
    const d = db
      .prepare("DELETE FROM community_comments WHERE id=? AND user_id=?")
      .run(q.params.id, res.locals.userId);
    res
      .status(d.changes ? 204 : 404)
      .send(d.changes ? undefined : { error: "Comment not found." });
  });
  r.post("/community/:id/like", (q, res) => {
    db.prepare("INSERT OR IGNORE INTO community_likes VALUES(?,?)").run(
      q.params.id,
      res.locals.userId,
    );
    res.status(204).end();
  });
  r.delete("/community/:id/like", (q, res) => {
    db.prepare("DELETE FROM community_likes WHERE post_id=? AND user_id=?").run(
      q.params.id,
      res.locals.userId,
    );
    res.status(204).end();
  });
  r.post("/community/:id/report", (q, res) => {
    const p = z
      .object({ reason: z.string().trim().min(2).max(1000) })
      .strict()
      .safeParse(q.body);
    if (!p.success) {
      res.status(400).json({ error: "Enter a report reason." });
      return;
    }
    db.prepare(
      "INSERT INTO community_reports VALUES(?,?,?,?) ON CONFLICT(post_id,user_id) DO UPDATE SET reason=excluded.reason",
    ).run(
      q.params.id,
      res.locals.userId,
      p.data.reason,
      new Date().toISOString(),
    );
    res.status(204).end();
  });
  r.delete("/community/:id", (q, res) => {
    const d = db
      .prepare("DELETE FROM community_posts WHERE id=? AND user_id=?")
      .run(q.params.id, res.locals.userId);
    res
      .status(d.changes ? 204 : 404)
      .send(d.changes ? undefined : { error: "Post not found." });
  });
  const moderator = (u: string) => {
    const email = String(
      db.prepare("SELECT email FROM users WHERE id=?").get(u)?.email || "",
    );
    return (process.env.COMMUNITY_MODERATOR_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .includes(email.toLowerCase());
  };
  r.get("/community-reports", (_q, res) => {
    if (!moderator(res.locals.userId)) {
      res.status(404).json({ error: "Endpoint not found." });
      return;
    }
    res.json(
      db
        .prepare(
          "SELECT r.post_id,r.reason,r.created_at,p.title FROM community_reports r JOIN community_posts p ON p.id=r.post_id WHERE p.hidden=0 ORDER BY r.created_at LIMIT 100",
        )
        .all(),
    );
  });
  r.post("/community-moderation/:id/hide", (q, res) => {
    if (!moderator(res.locals.userId)) {
      res.status(404).json({ error: "Endpoint not found." });
      return;
    }
    db.prepare("UPDATE community_posts SET hidden=1 WHERE id=?").run(
      q.params.id,
    );
    res.status(204).end();
  });
  return r;
}
