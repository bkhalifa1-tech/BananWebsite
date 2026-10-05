import { useStudyRevision } from "../../lib/useStudyRevision";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { Card, Skeleton } from "../../components/ui";
type Activity = {
  weeklySeconds: number;
  streak: number;
  recentSession: { course_id: string; topic: string } | null;
};
export default function StudyActivity({
  language,
  track,
  semesterId,
}: {
  language: "ar" | "en";
  track: "semester" | "personal";
  semesterId?: string;
}) {
  const t = (e: string, a: string) => (language === "ar" ? a : e);
  const [data, setData] = useState<Activity | null>(null),
    [error, setError] = useState("");
  const revision = useStudyRevision(
    "/(focus|attempts|tasks|cards|decks|quizzes|questions|grades|exams)(/|$)",
  );
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    void api<Activity>(
      `/analytics?track=${track}&timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}${semesterId ? `&semester=${semesterId}` : ""}`,
    )
      .then((d) => live && setData(d))
      .catch((e) => live && setError(errorMessage(e, language)));
    return () => {
      live = false;
    };
  }, [language, track, semesterId, revision]);
  if (!data)
    return error ? (
      <p className="error-box" role="alert">
        {error}
      </p>
    ) : (
      <Skeleton />
    );
  return (
    <Card className="study-activity">
      <div>
        <span>{t("Weekly study time", "وقت الدراسة الأسبوعي")}</span>
        <strong>
          {Math.round(data.weeklySeconds / 60)} {t("min", "دقيقة")}
        </strong>
      </div>
      <div>
        <span>{t("Study streak", "أيام الدراسة المتتالية")}</span>
        <strong>
          {data.streak} {t("days", "يوم")}
        </strong>
      </div>
      <div>
        <span>{t("Continue studying", "تابع الدراسة")}</span>
        {data.recentSession ? (
          <a href={`#/courses/${data.recentSession.course_id}`}>
            {data.recentSession.topic}
          </a>
        ) : (
          <small>
            {t(
              "Your completed sessions will appear here.",
              "ستظهر جلساتك المكتملة هنا.",
            )}
          </small>
        )}
      </div>
      <a className="secondary" href="#/focus">
        {t("Focus session", "جلسة تركيز")}
      </a>
    </Card>
  );
}
