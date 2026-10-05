import { useStudyRevision } from "../../lib/useStudyRevision";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { Card, Skeleton } from "../../components/ui";
import type { StudySuggestion } from "../../../server/recommendations";
export default function Recommendations({
  language,
  semesterId,
  courseId,
  track,
}: {
  language: "ar" | "en";
  semesterId?: string;
  courseId?: string;
  track?: "semester" | "personal";
}) {
  const t = (e: string, a: string) => (language === "ar" ? a : e);
  const [minutes, setMinutes] = useState(30),
    [data, setData] = useState<{ suggestions: StudySuggestion[] } | null>(null),
    [error, setError] = useState("");
  const revision = useStudyRevision(
    "/(focus|attempts|tasks|cards|decks|quizzes|questions|grades|exams)(/|$)",
  );
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    void api<{ suggestions: StudySuggestion[] }>(
      `/recommendations?minutes=${minutes}${semesterId ? `&semester=${semesterId}` : ""}${courseId ? `&course=${courseId}` : ""}${track ? `&track=${track}` : ""}`,
    )
      .then((d) => live && setData(d))
      .catch((e) => live && setError(errorMessage(e, language)));
    return () => {
      live = false;
    };
  }, [minutes, semesterId, courseId, language, track, revision]);
  function reason(r: StudySuggestion["reasons"][number]) {
    if (r.kind === "deadline")
      return `${t("Deadline", "موعد قريب")}: ${r.detail}`;
    if (r.kind === "exam")
      return `${r.detail} · ${r.value} ${t("days away", "يوم متبقٍ")}`;
    if (r.kind === "weak_topic")
      return `${r.detail} · ${r.value}% ${t("quiz accuracy", "دقة الاختبار")}`;
    if (r.kind === "flashcards")
      return `${r.value} ${t("flashcards due", "بطاقة مستحقة")}`;
    if (r.kind === "tasks")
      return `${r.value} ${t("pending tasks", "مهمة متبقية")}`;
    return `${r.value} ${t("days since your last session", "يوم منذ آخر جلسة")}`;
  }
  return (
    <Card className="recommendations-card">
      <div className="section-title">
        <div>
          <h2>{t("What should I study now?", "ماذا أدرس الآن؟")}</h2>
          <p className="field-hint">
            {t(
              "Prioritized using your deadlines, exams, quiz results and due cards.",
              "الأولوية حسب مواعيدك وامتحاناتك ونتائج اختباراتك والبطاقات المستحقة.",
            )}
          </p>
        </div>
        <label>
          {t("Available time", "الوقت المتاح")}
          <select
            aria-label={t("Available time", "الوقت المتاح")}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          >
            {[10, 15, 30, 45, 60, 90].map((m) => (
              <option value={m} key={m}>
                {m} {t("min", "دقيقة")}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <p role="alert" className="error-box">
          {error}
        </p>
      ) : !data ? (
        <Skeleton />
      ) : data.suggestions.length ? (
        <div className="recommendation-grid">
          {data.suggestions.map((s, i) => (
            <article
              key={s.course_id}
              style={{ borderInlineStartColor: s.color }}
            >
              <span className="eyebrow">
                {i === 0
                  ? t("RECOMMENDED NOW", "مقترح الآن")
                  : t("ALSO WORTH REVIEWING", "للمراجعة أيضًا")}
              </span>
              <h3>{s.name}</h3>
              <ul className="recommendation-reasons">
                {s.reasons.slice(0, 3).map((r, j) => (
                  <li key={j}>{reason(r)}</li>
                ))}
              </ul>
              <ol>
                {s.segments.map((segment, j) => (
                  <li key={j}>
                    <span>
                      {segment.kind === "flashcards"
                        ? `${t("Review flashcards", "مراجعة البطاقات")} (${segment.count})`
                        : segment.kind === "quiz"
                          ? t("Practice quiz", "اختبار تدريبي")
                          : segment.title}
                    </span>
                    <strong>
                      {segment.minutes} {t("min", "دقيقة")}
                    </strong>
                  </li>
                ))}
              </ol>
              <div className="button-row">
                <a
                  className="primary"
                  href={`#/focus?course=${s.course_id}&topic=${encodeURIComponent(s.segments[0].title || s.name)}&minutes=${s.minutes}`}
                >
                  {t("Start recommended session", "ابدأ الجلسة المقترحة")}
                </a>
                <a className="text-button" href={`#/courses/${s.course_id}`}>
                  {t("Open workspace", "فتح المساحة")}
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-copy">
          {t(
            "Add a task, exam or flashcard to get a recommendation grounded in your work.",
            "أضف مهمة أو امتحانًا أو بطاقة للحصول على اقتراح يعتمد على عملك.",
          )}
        </p>
      )}
    </Card>
  );
}
