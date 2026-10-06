import { inspectFile } from "./file-formats";
import { Router, type Request } from "express";
import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import multer from "multer";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
const title = z.string().trim().min(2).max(160);
export const cleanNote = (html: string) =>
  sanitizeHtml(html, {
    allowedTags: [
      "p",
      "h1",
      "h2",
      "h3",
      "strong",
      "em",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "hr",
      "br",
      "a",
      "table",
      "tbody",
      "thead",
      "tr",
      "th",
      "td",
      "label",
      "input",
      "div",
      "span",
      "mark",
      "img",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      ul: ["data-type"],
      li: ["data-type", "data-checked"],
      input: ["type", "checked", "disabled"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
      span: ["style", "data-type", "data-latex"],
      div: ["data-type", "data-latex"],
      mark: ["data-color", "style"],
      img: ["src", "alt", "title"],
    },
    allowedStyles: {
      span: {
        color: [
          /^#[a-f0-9]{6}$/i,
          /^rgb\(\s*\d{1,3},\s*\d{1,3},\s*\d{1,3}\s*\)$/,
        ],
      },
      mark: {
        "background-color": [
          /^#[a-f0-9]{6}$/i,
          /^rgb\(\s*\d{1,3},\s*\d{1,3},\s*\d{1,3}\s*\)$/,
        ],
      },
    },
    exclusiveFilter: (frame) =>
      (frame.tag === "img" &&
        !/^\/api\/materials\/[a-f0-9-]{36}\/file$/.test(
          frame.attribs.src || "",
        )) ||
      (frame.tag === "input" && frame.attribs.type !== "checkbox"),
    allowedSchemes: ["https", "http", "mailto"],
    transformTags: {
      input: sanitizeHtml.simpleTransform("input", {
        type: "checkbox",
        disabled: "disabled",
      }),
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank",
      }),
    },
  });
export function contentRoutes(
  db: DatabaseSync,
  userFor: (
    req: Request,
  ) => { id: string; email_verified?: number } | undefined,
  requireVerified = false,
) {
  const router = Router(),
    upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1,
        fields: 3,
        fieldSize: 1024,
      },
    });
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
  router.use("/courses/:id", (req, res, next) => {
    if (
      !db
        .prepare("SELECT id FROM courses WHERE id=? AND user_id=?")
        .get(req.params.id, res.locals.userId)
    ) {
      res.status(404).json({ error: "Course not found." });
      return;
    }
    res.locals.courseId = req.params.id;
    next();
  });
  router.get("/courses/:id/content", (_req, res) => {
    const u = res.locals.userId,
      c = res.locals.courseId;
    res.json({
      folders: db
        .prepare(
          "SELECT id,name FROM folders WHERE course_id=? AND user_id=? ORDER BY name",
        )
        .all(c, u),
      materials: db
        .prepare(
          "SELECT id,name,mime,size,folder_id,created_at FROM materials WHERE course_id=? AND user_id=? ORDER BY created_at DESC,id",
        )
        .all(c, u),
      notes: db
        .prepare(
          "SELECT id,title,version,updated_at FROM notes WHERE course_id=? AND user_id=? ORDER BY updated_at DESC,id",
        )
        .all(c, u),
    });
  });
  router.post("/courses/:id/folders", (req, res) => {
    const p = z.object({ name: title }).strict().safeParse(req.body);
    if (!p.success) {
      res.status(400).json({ error: "Enter a valid folder name." });
      return;
    }
    const id = randomUUID();
    db.prepare(
      "INSERT INTO folders(id,user_id,course_id,name) VALUES(?,?,?,?)",
    ).run(id, res.locals.userId, res.locals.courseId, p.data.name);
    res.status(201).json({ id, name: p.data.name });
  });
  router.delete("/folders/:id", (req, res) => {
    const r = db
      .prepare("DELETE FROM folders WHERE id=? AND user_id=?")
      .run(req.params.id, res.locals.userId);
    if (!r.changes) {
      res.status(404).json({ error: "Folder not found." });
      return;
    }
    res.status(204).end();
  });
  router.post(
    "/courses/:id/materials",
    upload.single("file"),
    async (req, res) => {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "Choose a supported study file." });
        return;
      }
      let inspected;
      try {
        inspected = await inspectFile(file.buffer, file.originalname);
      } catch {
        res
          .status(415)
          .json({ error: "This document could not be safely extracted." });
        return;
      }
      const mime = inspected?.mime;
      if (!mime) {
        res
          .status(415)
          .json({
            error:
              "Supported files: PDF, PNG, JPEG, DOCX, PPTX, MP3, WAV, OGG, M4A, MP4 and WebM.",
          });
        return;
      }
      const folder =
        typeof req.body.folder_id === "string" && req.body.folder_id
          ? req.body.folder_id
          : null;
      if (
        folder &&
        !db
          .prepare(
            "SELECT id FROM folders WHERE id=? AND course_id=? AND user_id=?",
          )
          .get(folder, res.locals.courseId, res.locals.userId)
      ) {
        res.status(400).json({ error: "Invalid folder." });
        return;
      }
      const name =
        Array.from(file.originalname)
          .map((char) =>
            char.charCodeAt(0) < 32 ||
            char.charCodeAt(0) === 127 ||
            char === "/" ||
            char === "\\"
              ? "_"
              : char,
          )
          .join("")
          .normalize("NFC")
          .slice(0, 160) || "Material";
      const id = randomUUID();
      db.prepare(
        "INSERT INTO materials(id,user_id,course_id,folder_id,name,mime,size,data,extracted_text) VALUES(?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        res.locals.userId,
        res.locals.courseId,
        folder,
        name,
        mime,
        file.size,
        file.buffer,
        inspected?.text || "",
      );
      res
        .status(201)
        .json({ id, name, mime, size: file.size, folder_id: folder });
    },
  );
  router.get("/materials/:id/text", (req, res) => {
    const f = db
      .prepare("SELECT extracted_text FROM materials WHERE id=? AND user_id=?")
      .get(req.params.id, res.locals.userId);
    if (!f) {
      res.status(404).json({ error: "Material not found." });
      return;
    }
    res.json({ text: f.extracted_text });
  });
  router.get("/materials/:id/file", (req, res) => {
    const file = db
      .prepare("SELECT name,mime,data FROM materials WHERE id=? AND user_id=?")
      .get(req.params.id, res.locals.userId);
    if (!file) {
      res.status(404).json({ error: "Material not found." });
      return;
    }
    res.set({
      "Content-Type": String(file.mime),
      "Content-Disposition": `inline; filename="material"; filename*=UTF-8''${encodeURIComponent(String(file.name)).replace(/'/g, "%27")}`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    });
    const data = Buffer.from(file.data as Uint8Array);
    res.set("Accept-Ranges", "bytes");
    const range = req.get("range");
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) {
        res.status(416).set("Content-Range", `bytes */${data.length}`).end();
        return;
      }
      const start = Number(match[1]),
        end = match[2]
          ? Math.min(Number(match[2]), data.length - 1)
          : data.length - 1;
      if (start >= data.length || end < start) {
        res.status(416).set("Content-Range", `bytes */${data.length}`).end();
        return;
      }
      res
        .status(206)
        .set("Content-Range", `bytes ${start}-${end}/${data.length}`)
        .send(data.subarray(start, end + 1));
      return;
    }
    res.send(data);
  });
  router.delete("/materials/:id", (req, res) => {
    const r = db
      .prepare("DELETE FROM materials WHERE id=? AND user_id=?")
      .run(req.params.id, res.locals.userId);
    if (!r.changes) {
      res.status(404).json({ error: "Material not found." });
      return;
    }
    res.status(204).end();
  });
  router.post("/courses/:id/notes", (req, res) => {
    const p = z
      .object({ title, html: z.string().max(100000).default("<p></p>") })
      .strict()
      .safeParse(req.body);
    if (!p.success) {
      res.status(400).json({ error: "Enter a valid note title and content." });
      return;
    }
    const id = randomUUID();
    db.prepare(
      "INSERT INTO notes(id,user_id,course_id,title,html) VALUES(?,?,?,?,?)",
    ).run(
      id,
      res.locals.userId,
      res.locals.courseId,
      p.data.title,
      cleanNote(p.data.html),
    );
    res
      .status(201)
      .json(
        db
          .prepare(
            "SELECT id,title,html,version,updated_at FROM notes WHERE id=?",
          )
          .get(id),
      );
  });
  router.get("/notes/:id", (req, res) => {
    const note = db
      .prepare(
        "SELECT id,title,html,version,updated_at FROM notes WHERE id=? AND user_id=?",
      )
      .get(req.params.id, res.locals.userId);
    if (!note) {
      res.status(404).json({ error: "Note not found." });
      return;
    }
    res.json(note);
  });
  router.patch("/notes/:id", (req, res) => {
    const p = z
      .object({
        title,
        html: z.string().max(100000),
        version: z.number().int().min(1),
      })
      .strict()
      .safeParse(req.body);
    if (!p.success) {
      res.status(400).json({ error: "Enter a valid note title and content." });
      return;
    }
    const note = db
      .prepare("SELECT id FROM notes WHERE id=? AND user_id=?")
      .get(req.params.id, res.locals.userId);
    if (!note) {
      res.status(404).json({ error: "Note not found." });
      return;
    }
    const r = db
      .prepare(
        "UPDATE notes SET title=?,html=?,version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=?",
      )
      .run(
        p.data.title,
        cleanNote(p.data.html),
        new Date().toISOString(),
        req.params.id,
        res.locals.userId,
        p.data.version,
      );
    if (!r.changes) {
      res.status(409).json({
        error: "This note changed in another window. Reload it before saving.",
      });
      return;
    }
    res.json(
      db
        .prepare(
          "SELECT id,title,html,version,updated_at FROM notes WHERE id=?",
        )
        .get(req.params.id),
    );
  });
  router.delete("/notes/:id", (req, res) => {
    const r = db
      .prepare("DELETE FROM notes WHERE id=? AND user_id=?")
      .run(req.params.id, res.locals.userId);
    if (!r.changes) {
      res.status(404).json({ error: "Note not found." });
      return;
    }
    res.status(204).end();
  });
  return router;
}
