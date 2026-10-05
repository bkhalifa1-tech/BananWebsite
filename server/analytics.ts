import type { DatabaseSync } from "node:sqlite";
import { ownedRouter, type UserLookup } from "./owned";
import { academicService } from "./academic";
import { gradeSummary } from "../src/lib/academic";
function dateKey(d: Date, zone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
export function analyticsService(db: DatabaseSync) {
  return function build(
    user: string,
    courseId: string | undefined,
    zone = "UTC",
    now = Date.now(),
    track?: "semester" | "personal",
    semesterId?: string,
  ) {
    const all = db
      .prepare(
        "SELECT id,name,color,credits,semester_id,kind FROM courses WHERE user_id=?",
      )
      .all(user) as {
      id: string;
      name: string;
      color: string;
      credits: number;
      semester_id: string | null;
      kind: string;
    }[];
    const courses = (
      courseId ? all.filter((c) => c.id === courseId) : all
    ).filter(
      (c) =>
        (!track || c.kind === (track === "semester" ? "course" : "personal")) &&
        (!semesterId || c.semester_id === semesterId),
    );
    const ids = new Set(courses.map((c) => c.id));
    const sessions = (
      db
        .prepare(
          "SELECT * FROM study_sessions WHERE user_id=? AND state='completed' AND elapsed_seconds>0 ORDER BY ended_at DESC",
        )
        .all(user) as {
        course_id: string;
        elapsed_seconds: number;
        ended_at: string;
        topic: string;
      }[]
    ).filter((s) => ids.has(s.course_id));
    const today = dateKey(new Date(now), zone),
      calendarAnchor = Date.parse(`${dateKey(new Date(now), zone)}T12:00:00Z`),
      days = Array.from({ length: 7 }, (_, i) => {
        return new Date(calendarAnchor - (6 - i) * 86400000)
          .toISOString()
          .slice(0, 10);
      });
    const daily = days.map((day) => ({
      day,
      seconds: sessions
        .filter((s) => dateKey(new Date(s.ended_at), zone) === day)
        .reduce((sum, s) => sum + s.elapsed_seconds, 0),
    }));
    const studyDays = new Set(
      sessions.map((s) => dateKey(new Date(s.ended_at), zone)),
    );
    let streak = 0;
    const start = studyDays.has(today) ? 0 : 1;
    for (let i = start; i < 3660; i++) {
      if (
        studyDays.has(
          new Date(calendarAnchor - i * 86400000).toISOString().slice(0, 10),
        )
      )
        streak++;
      else break;
    }
    const tasks = (
      db
        .prepare(
          "SELECT t.course_id,t.completed_at FROM tasks t WHERE user_id=?",
        )
        .all(user) as { course_id: string; completed_at: string | null }[]
    ).filter((s) => ids.has(s.course_id));
    const attempts = (
      db
        .prepare(
          "SELECT a.*,q.course_id FROM quiz_attempts a JOIN quizzes q ON q.id=a.quiz_id WHERE a.user_id=? AND a.finished_at IS NOT NULL",
        )
        .all(user) as {
        course_id: string;
        score: number;
        total: number;
        answers: string;
        finished_at: string;
      }[]
    ).filter((a) => ids.has(a.course_id));
    const quizAverage = attempts.length
      ? attempts.reduce((sum, a) => sum + (100 * a.score) / a.total, 0) /
        attempts.length
      : null;
    const topics = new Map<
      string,
      { topic: string; course_id: string; correct: number; total: number }
    >();
    for (const a of attempts)
      for (const answer of JSON.parse(a.answers) as {
        topic: string;
        correct: boolean;
      }[]) {
        if (!answer.topic) continue;
        const k = `${a.course_id}:${answer.topic}`,
          v = topics.get(k) || {
            topic: answer.topic,
            course_id: a.course_id,
            correct: 0,
            total: 0,
          };
        v.total++;
        if (answer.correct) v.correct++;
        topics.set(k, v);
      }
    const cards = (
      db
        .prepare(
          "SELECT f.*,d.course_id FROM flashcards f JOIN flashcard_decks d ON d.id=f.deck_id WHERE d.user_id=?",
        )
        .all(user) as {
        id: string;
        course_id: string;
        next_review: string;
        repetitions: number;
      }[]
    ).filter((c) => ids.has(c.course_id));
    const exams = (
      db
        .prepare(
          "SELECT e.*,c.name AS course_name,c.color AS course_color FROM exams e JOIN courses c ON c.id=e.course_id WHERE e.user_id=? AND e.start_at>=? ORDER BY e.start_at",
        )
        .all(user, new Date(now).toISOString()) as { course_id: string }[]
    ).filter((e) => ids.has(e.course_id));
    const academic = academicService(db);
    return {
      timezone: zone,
      totalSeconds: sessions.reduce((sum, s) => sum + s.elapsed_seconds, 0),
      weeklySeconds: daily.reduce((sum, d) => sum + d.seconds, 0),
      streak,
      activeDays: daily.filter((d) => d.seconds > 0).length,
      daily,
      tasks: {
        total: tasks.length,
        completed: tasks.filter((t) => t.completed_at).length,
      },
      quiz: { attempts: attempts.length, average: quizAverage },
      flashcards: {
        total: cards.length,
        due: cards.filter((c) => Date.parse(c.next_review) <= now).length,
        reviewed: cards.filter((c) => c.repetitions > 0).length,
      },
      topics: [...topics.values()]
        .map((v) => ({ ...v, accuracy: (100 * v.correct) / v.total }))
        .sort((a, b) => a.accuracy - b.accuracy),
      courses: courses.map((c) => ({
        ...c,
        seconds: sessions
          .filter((s) => s.course_id === c.id)
          .reduce((sum, s) => sum + s.elapsed_seconds, 0),
        grade: gradeSummary(academic.marks(c.id, user)).current,
      })),
      upcomingExams: exams.slice(0, 5),
      recentSession: sessions[0] || null,
    };
  };
}
export function analyticsRoutes(
  db: DatabaseSync,
  userFor: UserLookup,
  verified = false,
) {
  const r = ownedRouter(db, userFor, verified),
    build = analyticsService(db);
  r.get(["/analytics", "/courses/:id/analytics"], (q, res) => {
    const zone =
      typeof q.query.timezone === "string" ? q.query.timezone : "UTC";
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone });
    } catch {
      res.status(400).json({ error: "Invalid time zone." });
      return;
    }
    const track = q.query.track;
    if (
      track !== undefined &&
      !["semester", "personal"].includes(String(track))
    ) {
      res.status(400).json({ error: "Invalid learning track." });
      return;
    }
    const semester = q.query.semester;
    if (
      semester !== undefined &&
      (typeof semester !== "string" ||
        !db
          .prepare("SELECT id FROM semesters WHERE id=? AND user_id=?")
          .get(semester, res.locals.userId))
    ) {
      res.status(404).json({ error: "Semester not found." });
      return;
    }
    res.json(
      build(
        res.locals.userId,
        res.locals.courseId,
        zone,
        Date.now(),
        track as "semester" | "personal" | undefined,
        semester as string | undefined,
      ),
    );
  });
  return r;
}
