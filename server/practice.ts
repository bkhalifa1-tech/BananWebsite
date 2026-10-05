import { answerMap } from "../src/lib/practice";
import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ownedRouter, type UserLookup } from "./owned";
export function practiceSchema(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS flashcard_decks(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,course_id TEXT NOT NULL,name TEXT NOT NULL,FOREIGN KEY(course_id,user_id) REFERENCES courses(id,user_id) ON DELETE CASCADE);CREATE INDEX IF NOT EXISTS decks_course ON flashcard_decks(user_id,course_id);
CREATE TABLE IF NOT EXISTS flashcards(id TEXT PRIMARY KEY,deck_id TEXT NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,front TEXT NOT NULL,back TEXT NOT NULL,topic TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT '',ease REAL NOT NULL DEFAULT 2.5,interval_days INTEGER NOT NULL DEFAULT 0,repetitions INTEGER NOT NULL DEFAULT 0,next_review TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,version INTEGER NOT NULL DEFAULT 1);CREATE INDEX IF NOT EXISTS cards_due ON flashcards(deck_id,next_review);
CREATE TABLE IF NOT EXISTS flashcard_reviews(id TEXT PRIMARY KEY,card_id TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,rating INTEGER NOT NULL CHECK(rating BETWEEN 0 AND 3),reviewed_at TEXT NOT NULL,next_review TEXT NOT NULL);CREATE INDEX IF NOT EXISTS reviews_card ON flashcard_reviews(card_id,reviewed_at);
CREATE TABLE IF NOT EXISTS quizzes(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,course_id TEXT NOT NULL,title TEXT NOT NULL,FOREIGN KEY(course_id,user_id) REFERENCES courses(id,user_id) ON DELETE CASCADE);CREATE INDEX IF NOT EXISTS quizzes_course ON quizzes(user_id,course_id);
CREATE TABLE IF NOT EXISTS questions(id TEXT PRIMARY KEY,quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,kind TEXT NOT NULL,prompt TEXT NOT NULL,options TEXT NOT NULL,correct_answer TEXT NOT NULL,explanation TEXT NOT NULL,topic TEXT NOT NULL,source TEXT NOT NULL,position INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS quiz_attempts(id TEXT PRIMARY KEY,quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,started_at TEXT NOT NULL,finished_at TEXT,questions TEXT NOT NULL,answers TEXT,score REAL,total INTEGER NOT NULL);CREATE INDEX IF NOT EXISTS attempts_user ON quiz_attempts(user_id,started_at);
CREATE TABLE IF NOT EXISTS mistakes(id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,question_id TEXT NOT NULL,prompt TEXT NOT NULL,student_answer TEXT NOT NULL,correct_answer TEXT NOT NULL,explanation TEXT NOT NULL,topic TEXT NOT NULL,source TEXT NOT NULL,created_at TEXT NOT NULL,resolved INTEGER NOT NULL DEFAULT 0,UNIQUE(attempt_id,question_id));`);
}
export type ReviewState = {
  ease: number;
  interval_days: number;
  repetitions: number;
};
export function scheduleReview(
  card: ReviewState,
  rating: number,
  now = Date.now(),
) {
  let ease = card.ease,
    interval = card.interval_days,
    reps = card.repetitions;
  if (rating === 0) {
    reps = 0;
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    ease = Math.max(
      1.3,
      ease + (rating === 1 ? -0.15 : rating === 3 ? 0.15 : 0),
    );
    interval =
      reps === 0
        ? 1
        : reps === 1
          ? 3
          : Math.max(
              1,
              Math.round(
                interval *
                  (rating === 1 ? 1.2 : rating === 3 ? ease * 1.3 : ease),
              ),
            );
    reps++;
  }
  return {
    ease,
    interval_days: interval,
    repetitions: reps,
    next_review: new Date(
      now + (rating === 0 ? 600000 : interval * 86400000),
    ).toISOString(),
  };
}
const cardSchema = z
  .object({
    front: z.string().trim().min(1).max(4000),
    back: z.string().trim().min(1).max(8000),
    topic: z.string().trim().max(100).default(""),
    source: z.string().trim().max(300).default(""),
  })
  .strict();
export const questionSchema = z
  .object({
    kind: z.enum([
      "mcq",
      "true_false",
      "short_answer",
      "fill_blank",
      "matching",
      "problem_solving",
    ]),
    prompt: z.string().trim().min(2).max(4000),
    options: z.array(z.string().trim().min(1).max(500)).max(16).default([]),
    correct_answer: z.string().trim().min(1).max(4000),
    explanation: z.string().trim().max(8000).default(""),
    topic: z.string().trim().max(100).default(""),
    source: z.string().trim().max(300).default(""),
  })
  .strict()
  .refine((q) =>
    q.kind === "mcq"
      ? q.options.length >= 2 &&
        q.options.length <= 8 &&
        new Set(q.options).size === q.options.length &&
        q.options.includes(q.correct_answer)
      : q.kind === "true_false"
        ? ["true", "false"].includes(q.correct_answer)
        : q.kind === "matching"
          ? q.options.length >= 4 &&
            q.options.length % 2 === 0 &&
            new Set(q.options.slice(0, q.options.length / 2)).size ===
              q.options.length / 2 &&
            Object.keys(answerMap(q.correct_answer)).length ===
              q.options.length / 2 &&
            q.options
              .slice(0, q.options.length / 2)
              .every((left) =>
                q.options
                  .slice(q.options.length / 2)
                  .includes(answerMap(q.correct_answer)[left]),
              )
          : true,
  );
type Question = z.infer<typeof questionSchema> & { id: string };
type Attempt = {
  id: string;
  quiz_id: string;
  user_id: string;
  started_at: string;
  finished_at: string | null;
  questions: string;
  answers: string | null;
  score: number | null;
  total: number;
};
const normalize = (s: string) =>
  s.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
export function practiceRoutes(
  db: DatabaseSync,
  userFor: UserLookup,
  verified = false,
) {
  const r = ownedRouter(db, userFor, verified);
  const deck = (id: string, u: string) =>
    db
      .prepare("SELECT * FROM flashcard_decks WHERE id=? AND user_id=?")
      .get(id, u);
  const quiz = (id: string, u: string) =>
    db.prepare("SELECT * FROM quizzes WHERE id=? AND user_id=?").get(id, u);
  r.get("/courses/:id/practice", (_q, res) => {
    const c = res.locals.courseId,
      u = res.locals.userId;
    res.json({
      decks: db
        .prepare(
          "SELECT d.*,COUNT(f.id) AS count,COALESCE(SUM(julianday(f.next_review)<=julianday('now')),0) AS due FROM flashcard_decks d LEFT JOIN flashcards f ON f.deck_id=d.id WHERE d.course_id=? AND d.user_id=? GROUP BY d.id ORDER BY d.name",
        )
        .all(c, u),
      quizzes: db
        .prepare(
          "SELECT q.*,COUNT(p.id) AS count FROM quizzes q LEFT JOIN questions p ON p.quiz_id=q.id WHERE q.course_id=? AND q.user_id=? GROUP BY q.id ORDER BY q.title",
        )
        .all(c, u),
      attempts: db
        .prepare(
          "SELECT a.id,a.quiz_id,a.started_at,a.finished_at,a.score,a.total,q.title FROM quiz_attempts a JOIN quizzes q ON q.id=a.quiz_id WHERE q.course_id=? AND a.user_id=? AND a.finished_at IS NOT NULL ORDER BY a.finished_at DESC LIMIT 50",
        )
        .all(c, u),
      mistakes: db
        .prepare(
          "SELECT m.* FROM mistakes m JOIN quiz_attempts a ON a.id=m.attempt_id JOIN quizzes q ON q.id=a.quiz_id WHERE q.course_id=? AND a.user_id=? ORDER BY m.resolved,m.created_at DESC LIMIT 200",
        )
        .all(c, u),
    });
  });
  r.post("/courses/:id/decks", (q, res) => {
    const p = z
      .object({ name: z.string().trim().min(2).max(100) })
      .strict()
      .safeParse(q.body);
    if (!p.success) {
      res.status(400).json({ error: "Enter a deck name." });
      return;
    }
    const id = randomUUID();
    db.prepare("INSERT INTO flashcard_decks VALUES(?,?,?,?)").run(
      id,
      res.locals.userId,
      res.locals.courseId,
      p.data.name,
    );
    res.status(201).json({ id, ...p.data });
  });
  r.get("/decks/:id", (q, res) => {
    const d = deck(q.params.id, res.locals.userId);
    if (!d) {
      res.status(404).json({ error: "Deck not found." });
      return;
    }
    res.json({
      deck: d,
      cards: db
        .prepare(
          "SELECT * FROM flashcards WHERE deck_id=? ORDER BY next_review,id",
        )
        .all(q.params.id),
    });
  });
  r.patch("/decks/:id", (q, res) => {
    const u = res.locals.userId;
    if (!deck(q.params.id, u)) {
      res.status(404).json({ error: "Deck not found." });
      return;
    }
    const p = z
      .object({ name: z.string().trim().min(2).max(100) })
      .strict()
      .safeParse(q.body);
    if (!p.success) {
      res.status(400).json({ error: "Enter a deck name." });
      return;
    }
    db.prepare(
      "UPDATE flashcard_decks SET name=? WHERE id=? AND user_id=?",
    ).run(p.data.name, q.params.id, u);
    res.json(deck(q.params.id, u));
  });
  r.delete("/decks/:id", (q, res) => {
    const d = db
      .prepare("DELETE FROM flashcard_decks WHERE id=? AND user_id=?")
      .run(q.params.id, res.locals.userId);
    res
      .status(d.changes ? 204 : 404)
      .send(d.changes ? undefined : { error: "Deck not found." });
  });
  r.post("/decks/:id/cards", (q, res) => {
    if (!deck(q.params.id, res.locals.userId)) {
      res.status(404).json({ error: "Deck not found." });
      return;
    }
    const p = cardSchema.safeParse(q.body);
    if (!p.success) {
      res.status(400).json({ error: "Enter a card front and back." });
      return;
    }
    const id = randomUUID(),
      d = p.data;
    db.prepare(
      "INSERT INTO flashcards(id,deck_id,front,back,topic,source) VALUES(?,?,?,?,?,?)",
    ).run(id, q.params.id, d.front, d.back, d.topic, d.source);
    res
      .status(201)
      .json(db.prepare("SELECT * FROM flashcards WHERE id=?").get(id));
  });
  const ownedCard = (id: string, u: string) =>
    db
      .prepare(
        "SELECT f.* FROM flashcards f JOIN flashcard_decks d ON d.id=f.deck_id WHERE f.id=? AND d.user_id=?",
      )
      .get(id, u) as
      | (ReviewState & { id: string; version: number; next_review: string })
      | undefined;
  r.patch("/cards/:id", (q, res) => {
    const c = ownedCard(q.params.id, res.locals.userId);
    if (!c) {
      res.status(404).json({ error: "Card not found." });
      return;
    }
    const p = cardSchema.safeParse(q.body);
    if (!p.success) {
      res.status(400).json({ error: "Enter a card front and back." });
      return;
    }
    const d = p.data;
    db.prepare(
      "UPDATE flashcards SET front=?,back=?,topic=?,source=?,version=version+1 WHERE id=?",
    ).run(d.front, d.back, d.topic, d.source, c.id);
    res.json(ownedCard(c.id, res.locals.userId));
  });
  r.delete("/cards/:id", (q, res) => {
    if (!ownedCard(q.params.id, res.locals.userId)) {
      res.status(404).json({ error: "Card not found." });
      return;
    }
    db.prepare("DELETE FROM flashcards WHERE id=?").run(q.params.id);
    res.status(204).end();
  });
  r.post("/cards/:id/reviews", (q, res) => {
    const c = ownedCard(q.params.id, res.locals.userId);
    if (!c) {
      res.status(404).json({ error: "Card not found." });
      return;
    }
    const p = z
      .object({
        rating: z.number().int().min(0).max(3),
        version: z.number().int().positive(),
      })
      .strict()
      .safeParse(q.body);
    if (!p.success) {
      res.status(400).json({ error: "Invalid review rating." });
      return;
    }
    if (
      c.version !== p.data.version ||
      Date.parse(c.next_review) > Date.now()
    ) {
      res
        .status(409)
        .json({ error: "This card has changed or is not due yet." });
      return;
    }
    const v = scheduleReview(c, p.data.rating);
    db.exec("BEGIN");
    try {
      db.prepare(
        "UPDATE flashcards SET ease=?,interval_days=?,repetitions=?,next_review=?,version=version+1 WHERE id=?",
      ).run(v.ease, v.interval_days, v.repetitions, v.next_review, c.id);
      db.prepare("INSERT INTO flashcard_reviews VALUES(?,?,?,?,?)").run(
        randomUUID(),
        c.id,
        p.data.rating,
        new Date().toISOString(),
        v.next_review,
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res.json(ownedCard(c.id, res.locals.userId));
  });
  r.post("/courses/:id/quizzes", (q, res) => {
    const p = z
      .object({ title: z.string().trim().min(2).max(100) })
      .strict()
      .safeParse(q.body);
    if (!p.success) {
      res.status(400).json({ error: "Enter a quiz title." });
      return;
    }
    const id = randomUUID();
    db.prepare("INSERT INTO quizzes VALUES(?,?,?,?)").run(
      id,
      res.locals.userId,
      res.locals.courseId,
      p.data.title,
    );
    res.status(201).json({ id, ...p.data });
  });
  const questions = (id: string) =>
    db
      .prepare("SELECT * FROM questions WHERE quiz_id=? ORDER BY position,id")
      .all(id)
      .map((q) => ({
        ...q,
        options: JSON.parse(q.options as string),
      })) as Question[];
  r.get("/quizzes/:id", (q, res) => {
    const v = quiz(q.params.id, res.locals.userId);
    if (!v) {
      res.status(404).json({ error: "Quiz not found." });
      return;
    }
    res.json({ quiz: v, questions: questions(q.params.id) });
  });
  r.delete("/quizzes/:id", (q, res) => {
    const d = db
      .prepare("DELETE FROM quizzes WHERE id=? AND user_id=?")
      .run(q.params.id, res.locals.userId);
    res
      .status(d.changes ? 204 : 404)
      .send(d.changes ? undefined : { error: "Quiz not found." });
  });
  r.post("/quizzes/:id/questions", (q, res) => {
    if (!quiz(q.params.id, res.locals.userId)) {
      res.status(404).json({ error: "Quiz not found." });
      return;
    }
    const p = questionSchema.safeParse(q.body);
    if (!p.success) {
      res
        .status(400)
        .json({ error: "Enter a question and a valid correct answer." });
      return;
    }
    const count = Number(
      db
        .prepare("SELECT COUNT(*) AS n FROM questions WHERE quiz_id=?")
        .get(q.params.id)!.n,
    );
    if (count >= 100) {
      res.status(400).json({ error: "Quizzes support up to 100 questions." });
      return;
    }
    const id = randomUUID(),
      d = p.data;
    db.prepare("INSERT INTO questions VALUES(?,?,?,?,?,?,?,?,?,?)").run(
      id,
      q.params.id,
      d.kind,
      d.prompt,
      JSON.stringify(d.options),
      d.correct_answer,
      d.explanation,
      d.topic,
      d.source,
      count,
    );
    res.status(201).json({ id, ...d });
  });
  r.delete("/questions/:id", (q, res) => {
    const p = db
      .prepare(
        "SELECT p.id FROM questions p JOIN quizzes v ON v.id=p.quiz_id WHERE p.id=? AND v.user_id=?",
      )
      .get(q.params.id, res.locals.userId);
    if (!p) {
      res.status(404).json({ error: "Question not found." });
      return;
    }
    db.prepare("DELETE FROM questions WHERE id=?").run(q.params.id);
    res.status(204).end();
  });
  r.post("/quizzes/:id/attempts", (q, res) => {
    if (!quiz(q.params.id, res.locals.userId)) {
      res.status(404).json({ error: "Quiz not found." });
      return;
    }
    const qs = questions(q.params.id);
    if (!qs.length) {
      res.status(400).json({ error: "Add a question before starting." });
      return;
    }
    const pending = db
      .prepare(
        "SELECT id FROM quiz_attempts WHERE quiz_id=? AND user_id=? AND finished_at IS NULL ORDER BY started_at DESC LIMIT 1",
      )
      .get(q.params.id, res.locals.userId);
    const id = (pending?.id as string) || randomUUID();
    if (!pending)
      db.prepare(
        "INSERT INTO quiz_attempts(id,quiz_id,user_id,started_at,questions,total) VALUES(?,?,?,?,?,?)",
      ).run(
        id,
        q.params.id,
        res.locals.userId,
        new Date().toISOString(),
        JSON.stringify(qs),
        qs.length,
      );
    const a = db
      .prepare("SELECT * FROM quiz_attempts WHERE id=?")
      .get(id) as Attempt;
    res.status(pending ? 200 : 201).json({
      id,
      started_at: a.started_at,
      questions: (JSON.parse(a.questions) as Question[]).map(
        ({ correct_answer, explanation, ...question }) => {
          void correct_answer;
          void explanation;
          return question;
        },
      ),
    });
  });
  r.post("/attempts/:id/submit", (q, res) => {
    const a = db
      .prepare("SELECT * FROM quiz_attempts WHERE id=? AND user_id=?")
      .get(q.params.id, res.locals.userId) as Attempt | undefined;
    if (!a) {
      res.status(404).json({ error: "Attempt not found." });
      return;
    }
    if (a.finished_at) {
      res
        .status(409)
        .json({ error: "This attempt has already been submitted." });
      return;
    }
    const p = z
      .object({ answers: z.record(z.string().max(4000)) })
      .strict()
      .safeParse(q.body);
    const qs = JSON.parse(a.questions) as Question[];
    if (
      !p.success ||
      Object.keys(p.data.answers).length !== qs.length ||
      qs.some((v) => !p.data.answers[v.id]?.trim())
    ) {
      res
        .status(400)
        .json({ error: "Answer every question before submitting." });
      return;
    }
    const now = new Date().toISOString();
    const results = qs.map((v) => ({
      ...v,
      student_answer: p.data.answers[v.id],
      correct:
        v.kind === "matching"
          ? Object.keys(answerMap(v.correct_answer)).every(
              (left) =>
                normalize(answerMap(v.correct_answer)[left]) ===
                normalize(answerMap(p.data.answers[v.id])[left] || ""),
            ) &&
            Object.keys(answerMap(p.data.answers[v.id])).length ===
              v.options.length / 2
          : normalize(v.correct_answer) === normalize(p.data.answers[v.id]),
    }));
    const score = results.filter((v) => v.correct).length;
    db.exec("BEGIN");
    try {
      db.prepare(
        "UPDATE quiz_attempts SET finished_at=?,answers=?,score=? WHERE id=?",
      ).run(now, JSON.stringify(results), score, a.id);
      for (const v of results.filter((v) => !v.correct))
        db.prepare(
          "INSERT INTO mistakes(id,attempt_id,question_id,prompt,student_answer,correct_answer,explanation,topic,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        ).run(
          randomUUID(),
          a.id,
          v.id,
          v.prompt,
          v.student_answer,
          v.correct_answer,
          v.explanation,
          v.topic,
          v.source,
          now,
        );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res.json({
      score,
      total: qs.length,
      seconds: Math.max(
        0,
        Math.floor((Date.now() - Date.parse(a.started_at)) / 1000),
      ),
      results,
    });
  });
  r.get("/attempts/:id", (q, res) => {
    const a = db
      .prepare(
        "SELECT * FROM quiz_attempts WHERE id=? AND user_id=? AND finished_at IS NOT NULL",
      )
      .get(q.params.id, res.locals.userId) as Attempt | undefined;
    if (!a) {
      res.status(404).json({ error: "Attempt not found." });
      return;
    }
    res.json({
      score: a.score,
      total: a.total,
      seconds: Math.max(
        0,
        Math.floor(
          (Date.parse(a.finished_at!) - Date.parse(a.started_at)) / 1000,
        ),
      ),
      results: JSON.parse(a.answers!),
    });
  });
  r.patch("/mistakes/:id", (q, res) => {
    const p = z.object({ resolved: z.boolean() }).strict().safeParse(q.body);
    if (!p.success) {
      res.status(400).json({ error: "Invalid mistake status." });
      return;
    }
    const d = db
      .prepare(
        "UPDATE mistakes SET resolved=? WHERE id=? AND attempt_id IN (SELECT id FROM quiz_attempts WHERE user_id=?)",
      )
      .run(Number(p.data.resolved), q.params.id, res.locals.userId);
    res
      .status(d.changes ? 200 : 404)
      .json(
        d.changes
          ? { resolved: p.data.resolved }
          : { error: "Mistake not found." },
      );
  });
  return r;
}
