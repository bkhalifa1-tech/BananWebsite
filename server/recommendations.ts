import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { ownedRouter, type UserLookup } from "./owned";
import { analyticsService } from "./analytics";
export type StudyCandidate = {
  id: string;
  name: string;
  color: string;
  pendingTasks: { title: string; due_date: string | null }[];
  nextExam: {
    name: string;
    start_at: string;
    included_material: string;
  } | null;
  dueCards: number;
  weakTopics: { topic: string; accuracy: number }[];
  quizCount: number;
  lastStudyAt: string | null;
};
export type StudySuggestion = {
  course_id: string;
  name: string;
  color: string;
  score: number;
  reasons: {
    kind:
      | "deadline"
      | "exam"
      | "weak_topic"
      | "flashcards"
      | "tasks"
      | "history";
    detail: string;
    value: number;
  }[];
  segments: {
    kind: "task" | "topic" | "material" | "flashcards" | "quiz";
    title: string;
    minutes: number;
    count?: number;
  }[];
  minutes: number;
};
export class StudyRecommendationService {
  recommend(
    candidates: StudyCandidate[],
    availableMinutes: number,
    now = Date.now(),
  ): StudySuggestion[] {
    return candidates
      .map((c) => {
        let score = 0;
        const reasons: StudySuggestion["reasons"] = [];
        const due = c.pendingTasks
          .filter(
            (t) =>
              t.due_date &&
              Date.parse(`${t.due_date}T23:59:59Z`) < now + 3 * 86400000,
          )
          .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
        if (due.length) {
          score += 90;
          reasons.push({
            kind: "deadline",
            detail: due[0].title,
            value: due.length,
          });
        }
        if (c.nextExam) {
          const days = Math.max(
            0,
            Math.ceil((Date.parse(c.nextExam.start_at) - now) / 86400000),
          );
          score += Math.max(0, 80 - days * 3);
          reasons.push({ kind: "exam", detail: c.nextExam.name, value: days });
        }
        const weak = c.weakTopics
          .filter((t) => t.accuracy < 70)
          .sort((a, b) => a.accuracy - b.accuracy);
        if (weak.length) {
          score += 35;
          reasons.push({
            kind: "weak_topic",
            detail: weak[0].topic,
            value: Math.round(weak[0].accuracy),
          });
        }
        if (c.dueCards) {
          score += Math.min(30, 10 + c.dueCards);
          reasons.push({ kind: "flashcards", detail: "", value: c.dueCards });
        }
        if (c.pendingTasks.length) {
          score += Math.min(10, c.pendingTasks.length);
          reasons.push({
            kind: "tasks",
            detail: "",
            value: c.pendingTasks.length,
          });
        }
        const daysSince = c.lastStudyAt
          ? Math.floor((now - Date.parse(c.lastStudyAt)) / 86400000)
          : null;
        if (daysSince !== null && daysSince > 1) {
          score += Math.min(15, daysSince);
          reasons.push({ kind: "history", detail: "", value: daysSince });
        }
        const work: Omit<StudySuggestion["segments"][number], "minutes">[] = [];
        if (due.length) work.push({ kind: "task", title: due[0].title });
        if (weak.length) work.push({ kind: "topic", title: weak[0].topic });
        if (c.nextExam && !due.length)
          work.push({
            kind: "material",
            title: c.nextExam.included_material || c.nextExam.name,
          });
        if (c.dueCards)
          work.push({ kind: "flashcards", title: "", count: c.dueCards });
        if (c.quizCount && (weak.length || c.nextExam))
          work.push({ kind: "quiz", title: "" });
        if (!work.length && c.pendingTasks.length)
          work.push({ kind: "task", title: c.pendingTasks[0].title });
        const selected = work.slice(
          0,
          Math.max(1, Math.floor(availableMinutes / 5)),
        );
        const segments = selected.map((s, i) => ({
          ...s,
          minutes:
            Math.floor(availableMinutes / selected.length) +
            (i < availableMinutes % selected.length ? 1 : 0),
        }));
        return {
          course_id: c.id,
          name: c.name,
          color: c.color,
          score,
          reasons,
          segments,
          minutes: segments.length ? availableMinutes : 0,
        };
      })
      .filter((s) => s.segments.length)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.name.localeCompare(b.name) ||
          a.course_id.localeCompare(b.course_id),
      )
      .slice(0, 3);
  }
}
export function recommendationRoutes(
  db: DatabaseSync,
  userFor: UserLookup,
  verified = false,
) {
  const r = ownedRouter(db, userFor, verified),
    service = new StudyRecommendationService();
  r.get("/recommendations", (q, res) => {
    const p = z
      .object({
        minutes: z.coerce.number().int().min(5).max(180).default(30),
        semester: z.string().uuid().optional(),
        course: z.string().uuid().optional(),
        track: z.enum(["semester", "personal"]).optional(),
      })
      .safeParse(q.query);
    if (!p.success) {
      res.status(400).json({ error: "Choose 5–180 available study minutes." });
      return;
    }
    const u = res.locals.userId,
      data = analyticsService(db)(
        u,
        undefined,
        "UTC",
        Date.now(),
        p.data.track,
      );
    const candidates: StudyCandidate[] = data.courses
      .filter(
        (c) =>
          (!p.data.course || c.id === p.data.course) &&
          (!p.data.semester || c.semester_id === p.data.semester),
      )
      .map((c) => {
        const tasks = db
          .prepare(
            "SELECT title,due_date FROM tasks WHERE course_id=? AND user_id=? AND completed_at IS NULL ORDER BY due_date IS NULL,due_date,created_at",
          )
          .all(c.id, u) as StudyCandidate["pendingTasks"];
        const exam = db
          .prepare(
            "SELECT name,start_at,included_material FROM exams WHERE course_id=? AND user_id=? AND start_at>=? ORDER BY start_at LIMIT 1",
          )
          .get(c.id, u, new Date().toISOString()) as StudyCandidate["nextExam"];
        return {
          id: c.id,
          name: c.name,
          color: c.color,
          pendingTasks: tasks,
          nextExam: exam || null,
          dueCards: Number(
            db
              .prepare(
                "SELECT COUNT(*) AS n FROM flashcards f JOIN flashcard_decks d ON d.id=f.deck_id WHERE d.course_id=? AND d.user_id=? AND julianday(f.next_review)<=julianday('now')",
              )
              .get(c.id, u)!.n,
          ),
          weakTopics: data.topics.filter((t) => t.course_id === c.id),
          quizCount: Number(
            db
              .prepare(
                "SELECT COUNT(*) AS n FROM quizzes v WHERE v.course_id=? AND v.user_id=? AND EXISTS(SELECT 1 FROM questions p WHERE p.quiz_id=v.id)",
              )
              .get(c.id, u)!.n,
          ),
          lastStudyAt: db
            .prepare(
              "SELECT MAX(ended_at) AS last FROM study_sessions WHERE course_id=? AND user_id=? AND state='completed' AND elapsed_seconds>0",
            )
            .get(c.id, u)!.last as string | null,
        };
      });
    res.json({
      availableMinutes: p.data.minutes,
      suggestions: service.recommend(candidates, p.data.minutes),
    });
  });
  return r;
}
