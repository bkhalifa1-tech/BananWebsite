import { displayAnswer } from "../../lib/practice";
import { useCallback, useEffect, useState, lazy, Suspense } from "react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { Card, Modal, Skeleton } from "../../components/ui";
import type { PracticeData, Quiz as QuizType } from "./types";
const Flashcards = lazy(() => import("./Flashcards"));
const Quiz = lazy(() => import("./Quiz"));
export default function Practice({
  courseId,
  language,
}: {
  courseId: string;
  language: "ar" | "en";
}) {
  const t = (e: string, a: string) => (language === "ar" ? a : e);
  const [data, setData] = useState<PracticeData | null>(null),
    [error, setError] = useState(""),
    [create, setCreate] = useState<"decks" | "quizzes" | null>(null),
    [deck, setDeck] = useState<string | null>(null),
    [quiz, setQuiz] = useState<{ id: string; attempt?: string } | null>(null),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("decks");
  const refresh = useCallback(async () => {
    try {
      setData(await api(`/courses/${courseId}/practice`));
    } catch (e) {
      setError(errorMessage(e, language));
    }
  }, [courseId, language]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const value = new FormData(e.currentTarget).get("name");
      const item = await api<{ id: string }>(
        `/courses/${courseId}/${create}`,
        "POST",
        create === "decks" ? { name: value } : { title: value },
      );
      setCreate(null);
      await refresh();
      if (create === "decks") setDeck(item.id);
      else setQuiz({ id: item.id });
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  }
  async function remove(kind: "decks" | "quizzes", id: string) {
    if (
      !confirm(
        t(
          "Delete this collection and its saved history?",
          "حذف المجموعة وسجلها المحفوظ؟",
        ),
      )
    )
      return;
    try {
      await api(`/${kind}/${id}`, "DELETE");
      await refresh();
    } catch (e) {
      setError(errorMessage(e, language));
    }
  }
  return (
    <Card className="practice-card">
      <div className="section-title">
        <h2>{t("Practice & recall", "التدريب والاسترجاع")}</h2>
        <div className="button-row">
          <button className="secondary" onClick={() => setCreate("decks")}>
            {t("New deck", "مجموعة بطاقات جديدة")}
          </button>
          <button className="secondary" onClick={() => setCreate("quizzes")}>
            {t("New quiz", "اختبار جديد")}
          </button>
        </div>
      </div>
      <div className="segmented">
        {["decks", "quizzes", "mistakes"].map((v, i) => (
          <button
            key={v}
            className={tab === v ? "active" : ""}
            onClick={() => setTab(v)}
          >
            {
              [
                t("Flashcards", "البطاقات"),
                t("Quizzes", "الاختبارات"),
                t("Mistake notebook", "دفتر الأخطاء"),
              ][i]
            }
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {!data ? (
        <Skeleton />
      ) : tab === "decks" ? (
        <>
          {data.decks.map((d) => (
            <div className="practice-row" key={d.id}>
              <button className="text-button" onClick={() => setDeck(d.id)}>
                {d.name}
              </button>
              <span>
                {d.count} {t("cards", "بطاقة")} · {d.due} {t("due", "مستحقة")}
              </span>
              <button
                className="text-button"
                aria-label={`${t("Delete deck", "حذف المجموعة")}: ${d.name}`}
                onClick={() => void remove("decks", d.id)}
              >
                {t("Delete", "حذف")}
              </button>
            </div>
          ))}
          {!data.decks.length && (
            <p className="empty-copy">
              {t(
                "Create a deck to start spaced repetition.",
                "أنشئ مجموعة لبدء المراجعة المتباعدة.",
              )}
            </p>
          )}
        </>
      ) : tab === "quizzes" ? (
        <>
          {data.quizzes.map((q: QuizType) => (
            <div className="practice-row" key={q.id}>
              <button
                className="text-button"
                onClick={() => setQuiz({ id: q.id })}
              >
                {q.title}
              </button>
              <span>
                {q.count} {t("questions", "سؤال")}
              </span>
              <button
                className="text-button"
                aria-label={`${t("Delete quiz", "حذف الاختبار")}: ${q.title}`}
                onClick={() => void remove("quizzes", q.id)}
              >
                {t("Delete", "حذف")}
              </button>
            </div>
          ))}
          {!data.quizzes.length && (
            <p className="empty-copy">
              {t(
                "Create a quiz from your own material.",
                "أنشئ اختبارًا من مادتك الدراسية.",
              )}
            </p>
          )}
          {data.attempts.length > 0 && (
            <>
              <h3>{t("Saved attempts", "المحاولات المحفوظة")}</h3>
              {data.attempts.map((a) => (
                <div className="practice-row" key={a.id}>
                  <button
                    className="text-button"
                    onClick={() =>
                      setQuiz({ id: a.quiz_id as string, attempt: a.id })
                    }
                  >
                    {a.title}
                  </button>
                  <span>
                    {a.score}/{a.total} ·{" "}
                    {new Date(a.finished_at).toLocaleDateString(language)}
                  </span>
                </div>
              ))}
            </>
          )}
        </>
      ) : (
        <>
          {data.mistakes.map((m) => (
            <div
              className={`quiz-result ${m.resolved ? "correct" : "incorrect"}`}
              key={m.id}
            >
              <strong>{m.prompt}</strong>
              <p>
                {t("Your answer", "إجابتك")}: {displayAnswer(m.student_answer)}
              </p>
              <p>
                {t("Correct answer", "الإجابة الصحيحة")}:{" "}
                {displayAnswer(m.correct_answer)}
              </p>
              <p>{m.explanation}</p>
              <small>
                {m.topic} · {m.source} ·{" "}
                {new Date(m.created_at).toLocaleDateString(language)}
              </small>
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await api(`/mistakes/${m.id}`, "PATCH", {
                      resolved: !m.resolved,
                    });
                    await refresh();
                  } catch (e) {
                    setError(errorMessage(e, language));
                  }
                }}
              >
                {m.resolved
                  ? t("Review again", "مراجعة مجددًا")
                  : t("Mark understood", "تم الفهم")}
              </button>
            </div>
          ))}
          {!data.mistakes.length && (
            <p className="empty-copy">
              {t(
                "Incorrect quiz answers will appear here with their explanation.",
                "ستظهر هنا إجابات الاختبارات الخاطئة مع شرحها.",
              )}
            </p>
          )}
        </>
      )}
      {create && (
        <Modal
          title={
            create === "decks"
              ? t("New deck", "مجموعة جديدة")
              : t("New quiz", "اختبار جديد")
          }
          closeLabel={t("Close", "إغلاق")}
          onClose={() => setCreate(null)}
        >
          <form className="editor-form" onSubmit={(e) => void save(e)}>
            <label>
              {t("Collection name", "اسم المجموعة")}
              <input name="name" required minLength={2} maxLength={100} />
            </label>
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
            <button disabled={busy} className="primary">
              {t("Create", "إنشاء")}
            </button>
          </form>
        </Modal>
      )}
      {deck && (
        <Suspense fallback={<Skeleton />}>
          <Flashcards
            deckId={deck}
            language={language}
            onClose={() => setDeck(null)}
            onChanged={refresh}
          />
        </Suspense>
      )}
      {quiz && (
        <Suspense fallback={<Skeleton />}>
          <Quiz
            quizId={quiz.id}
            attemptId={quiz.attempt}
            language={language}
            onClose={() => setQuiz(null)}
            onChanged={refresh}
          />
        </Suspense>
      )}
    </Card>
  );
}
