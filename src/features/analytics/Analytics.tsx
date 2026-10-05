import { useStudyRevision } from "../../lib/useStudyRevision";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { Card, Skeleton } from "../../components/ui";
import { BarChart } from "../../components/BarChart";
type Data = {
  totalSeconds: number;
  weeklySeconds: number;
  streak: number;
  activeDays: number;
  timezone: string;
  daily: { day: string; seconds: number }[];
  tasks: { total: number; completed: number };
  quiz: { attempts: number; average: number | null };
  flashcards: { total: number; due: number; reviewed: number };
  topics: {
    topic: string;
    course_id: string;
    accuracy: number;
    total: number;
  }[];
  courses: {
    id: string;
    name: string;
    color: string;
    seconds: number;
    grade: number | null;
    kind: "course" | "personal";
  }[];
  upcomingExams: {
    id: string;
    name: string;
    start_at: string;
    course_name: string;
  }[];
  recentSession: { course_id: string; topic: string; ended_at: string } | null;
};
export default function Analytics({
  courseId,
  language,
  track,
}: {
  track?: "semester" | "personal";
  courseId?: string;
  language: "ar" | "en";
}) {
  const t = (e: string, a: string) => (language === "ar" ? a : e);
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState("");
  const revision = useStudyRevision(
    "/(focus|attempts|tasks|cards|decks|quizzes|questions|grades|exams)(/|$)",
  );
  useEffect(() => {
    let live = true;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void api<Data>(
      `${courseId ? `/courses/${courseId}` : ""}/analytics?timezone=${encodeURIComponent(zone)}${track ? `&track=${track}` : ""}`,
    )
      .then((d) => live && setData(d))
      .catch((e) => live && setError(errorMessage(e, language)));
    return () => {
      live = false;
    };
  }, [courseId, language, track, revision]);
  if (!data)
    return error ? (
      <p role="alert" className="error-box">
        {error}
      </p>
    ) : (
      <Skeleton />
    );
  return (
    <section className="analytics-section">
      <div className="section-title">
        <div>
          <h2>{t("Learning analytics", "تحليلات التعلم")}</h2>
          <p className="field-hint">
            {t(
              "Calculated from your saved activity",
              "محسوبة من نشاطك المحفوظ",
            )}{" "}
            · {data.timezone}
          </p>
        </div>
      </div>
      <div className="semester-stats">
        {[
          [
            t("Total study time", "إجمالي الدراسة"),
            `${(data.totalSeconds / 3600).toFixed(1)} ${t("hours", "ساعة")}`,
          ],
          [
            t("This week", "هذا الأسبوع"),
            `${Math.round(data.weeklySeconds / 60)} ${t("min", "دقيقة")}`,
          ],
          [
            t("Study streak", "أيام الدراسة المتتالية"),
            `${data.streak} ${t("days", "يوم")}`,
          ],
          [
            t("Quiz average", "متوسط الاختبارات"),
            data.quiz.average === null
              ? "—"
              : `${data.quiz.average.toFixed(1)}%`,
          ],
        ].map(([label, value]) => (
          <Card key={label}>
            <span>{label}</span>
            <strong className="analytic-number">{value}</strong>
          </Card>
        ))}
      </div>
      <div className="dashboard-plan-grid">
        <Card>
          <BarChart
            title={t(
              "Study minutes over the last 7 days",
              "دقائق الدراسة خلال آخر 7 أيام",
            )}
            items={data.daily.map((d) => ({
              label: new Date(`${d.day}T12:00:00`).toLocaleDateString(
                language,
                { weekday: "short", day: "numeric" },
              ),
              value: Number((d.seconds / 60).toFixed(1)),
            }))}
          />
          <p className="field-hint">
            {data.activeDays}/7{" "}
            {t(
              "active days. Completed sessions only.",
              "أيام نشطة. الجلسات المكتملة فقط.",
            )}
          </p>
        </Card>
        <Card>
          <BarChart
            title={t("Study minutes by workspace", "دقائق الدراسة حسب المساحة")}
            items={data.courses.map((c) => ({
              label: c.name,
              value: Number((c.seconds / 60).toFixed(1)),
              color: c.color,
            }))}
          />
        </Card>
        <Card>
          <h3>{t("Progress indicators", "مؤشرات التقدم")}</h3>
          <p>
            {t("Completed tasks", "المهام المكتملة")}: {data.tasks.completed}/
            {data.tasks.total}
          </p>
          <p>
            {t("Quiz attempts", "محاولات الاختبار")}: {data.quiz.attempts}
          </p>
          <p>
            {t("Reviewed flashcards", "البطاقات التي تمت مراجعتها")}:{" "}
            {data.flashcards.reviewed}/{data.flashcards.total}
          </p>
          <p>
            {t("Due flashcards", "البطاقات المستحقة")}: {data.flashcards.due}
          </p>
          {courseId && data.courses[0]?.kind === "course" && (
            <p>
              {t("Recorded current grade", "الدرجة الحالية المسجلة")}:{" "}
              {data.courses[0]?.grade === null
                ? "—"
                : `${data.courses[0]?.grade.toFixed(1)}%`}
            </p>
          )}
          <p className="field-hint">
            {t(
              "Task completion and quiz accuracy describe recorded activity, not a prediction of exam results.",
              "إنجاز المهام ودقة الاختبارات يصفان النشاط المسجل ولا يتنبآن بنتائج الامتحان.",
            )}
          </p>
        </Card>
        <Card>
          <h3>{t("Topics to revisit", "مواضيع تحتاج مراجعة")}</h3>
          {data.topics.length ? (
            data.topics.map((topic) => (
              <div
                className="practice-row"
                key={`${topic.course_id}:${topic.topic}`}
              >
                <strong>{topic.topic}</strong>
                <span>
                  {topic.accuracy.toFixed(0)}% · {topic.total}{" "}
                  {t("answers", "إجابة")}
                </span>
              </div>
            ))
          ) : (
            <p className="empty-copy">
              {t(
                "Add topics to quiz questions and complete an attempt to see your accuracy.",
                "أضف موضوعًا للأسئلة وأكمل محاولة لعرض دقة إجاباتك.",
              )}
            </p>
          )}
        </Card>
      </div>
      {data.recentSession && (
        <Card className="continue-study">
          <div>
            <h3>{t("Continue studying", "تابع الدراسة")}</h3>
            <p>{data.recentSession.topic}</p>
          </div>
          <a
            className="secondary"
            href={`#/courses/${data.recentSession.course_id}`}
          >
            {t("Open workspace", "فتح المساحة")}
          </a>
        </Card>
      )}
    </section>
  );
}
