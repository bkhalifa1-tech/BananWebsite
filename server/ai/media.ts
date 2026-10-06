import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { ownedRouter, type UserLookup } from "../owned";
import type { AIProvider } from "./provider";
export function mediaSchema(db: DatabaseSync) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS generated_audio(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,course_id TEXT NOT NULL,title TEXT NOT NULL,text TEXT NOT NULL,mime TEXT NOT NULL,data BLOB NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(course_id,user_id) REFERENCES courses(id,user_id) ON DELETE CASCADE);CREATE INDEX IF NOT EXISTS audio_course ON generated_audio(user_id,course_id,created_at);`,
  );
}
export function mediaRoutes(
  db: DatabaseSync,
  userFor: UserLookup,
  provider: AIProvider | null,
  verified = false,
) {
  const r = ownedRouter(db, userFor, verified),
    pending = new Set<string>(),
    limits = new Map<string, { until: number; count: number }>();
  r.get("/courses/:id/media", (_q, res) =>
    res.json({
      speech: !!provider?.speak,
      transcription: !!provider?.transcribe,
      ocr: !!provider?.readImage,
      images: db
        .prepare(
          "SELECT id,name FROM materials WHERE user_id=? AND course_id=? AND mime LIKE 'image/%'",
        )
        .all(res.locals.userId, res.locals.courseId),
      audio: db
        .prepare(
          "SELECT id,title,text,created_at FROM generated_audio WHERE user_id=? AND course_id=? ORDER BY created_at DESC LIMIT 50",
        )
        .all(res.locals.userId, res.locals.courseId),
      recordings: db
        .prepare(
          "SELECT id,name FROM materials WHERE user_id=? AND course_id=? AND (mime LIKE 'audio/%' OR mime LIKE 'video/%')",
        )
        .all(res.locals.userId, res.locals.courseId),
    }),
  );
  r.get("/generated-audio/:id/file", (q, res) => {
    const a = db
      .prepare("SELECT mime,data FROM generated_audio WHERE id=? AND user_id=?")
      .get(q.params.id, res.locals.userId);
    if (!a) {
      res.status(404).json({ error: "Audio not found." });
      return;
    }
    res
      .type(String(a.mime))
      .set("Cross-Origin-Resource-Policy", "same-origin")
      .send(Buffer.from(a.data as Uint8Array));
  });
  r.delete("/generated-audio/:id", (q, res) => {
    const a = db
      .prepare("DELETE FROM generated_audio WHERE id=? AND user_id=?")
      .run(q.params.id, res.locals.userId);
    res
      .status(a.changes ? 204 : 404)
      .send(a.changes ? undefined : { error: "Audio not found." });
  });
  r.post("/courses/:id/media", async (q, res) => {
    const p = z
      .discriminatedUnion("action", [
        z
          .object({
            action: z.literal("speech"),
            text: z.string().trim().min(2).max(4000),
            title: z.string().trim().min(2).max(100),
            language: z.enum(["ar", "en"]),
          })
          .strict(),
        z
          .object({
            action: z.literal("transcribe"),
            material_id: z.string().uuid(),
          })
          .strict(),
        z
          .object({ action: z.literal("ocr"), material_id: z.string().uuid() })
          .strict(),
      ])
      .safeParse(q.body);
    if (!p.success) {
      res.status(400).json({ error: "Enter valid media input." });
      return;
    }
    const d = p.data,
      u = res.locals.userId,
      c = res.locals.courseId;
    if (
      d.action === "speech"
        ? !provider?.speak
        : d.action === "ocr"
          ? !provider?.readImage
          : !provider?.transcribe
    ) {
      res.status(503).json({ error: "AI media is not configured." });
      return;
    }
    const f =
      d.action !== "speech"
        ? db
            .prepare(
              "SELECT id,name,mime,data FROM materials WHERE id=? AND user_id=? AND course_id=? AND (mime LIKE 'audio/%' OR mime LIKE 'video/%' OR mime LIKE 'image/%')",
            )
            .get(d.material_id, u, c)
        : null;
    if (
      d.action !== "speech" &&
      (!f ||
        (d.action === "ocr"
          ? !String(f.mime).startsWith("image/")
          : !String(f.mime).startsWith("audio/") &&
            !String(f.mime).startsWith("video/")))
    ) {
      res.status(404).json({ error: "Recording not found." });
      return;
    }
    if (pending.has(u)) {
      res.status(409).json({ error: "An AI request is already running." });
      return;
    }
    const now = Date.now();
    for (const [key, v] of limits) if (v.until <= now) limits.delete(key);
    const limit = limits.get(u) || { until: now + 900000, count: 0 };
    if (limit.count >= 10) {
      res
        .status(429)
        .json({ error: "AI request limit reached. Try again later." });
      return;
    }
    limit.count++;
    limits.set(u, limit);
    pending.add(u);
    try {
      if (d.action === "speech") {
        const audio = await provider!.speak!(d.text, d.language);
        if (!audio.length || audio.length > 8 * 1024 * 1024)
          throw new Error("Invalid audio");
        const id = randomUUID();
        db.prepare("INSERT INTO generated_audio VALUES(?,?,?,?,?,?,?,?)").run(
          id,
          u,
          c,
          d.title,
          d.text,
          "audio/mpeg",
          audio,
          new Date().toISOString(),
        );
        res.status(201).json({ id });
      } else {
        const text =
          d.action === "ocr"
            ? await provider!.readImage!(
                Buffer.from(f!.data as Uint8Array),
                String(f!.mime),
              )
            : await provider!.transcribe!(
                Buffer.from(f!.data as Uint8Array),
                String(f!.name),
                String(f!.mime),
              );
        if (!text.trim() || text.length > 100000)
          throw new Error("Invalid transcript");
        const update = db
          .prepare(
            "UPDATE materials SET extracted_text=? WHERE id=? AND user_id=? AND course_id=?",
          )
          .run(text, f!.id, u, c);
        if (!update.changes) {
          res.status(404).json({ error: "Recording not found." });
          return;
        }
        res.json({ text, material_id: f!.id });
      }
    } catch {
      res
        .status(502)
        .json({ error: "AI could not complete this request. Please retry." });
    } finally {
      pending.delete(u);
    }
  });
  return r;
}
