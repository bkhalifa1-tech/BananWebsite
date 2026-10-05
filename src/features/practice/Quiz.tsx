import { answerMap, displayAnswer } from "../../lib/practice";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { Modal, Skeleton } from "../../components/ui";
import type { Quiz as QuizType, Question, Result } from "./types";
export default function Quiz({
  quizId,
  language,
  onClose,
  onChanged,
  attemptId,
}: {
  quizId: string;
  language: "ar" | "en";
  onClose: () => void;
  onChanged: () => void;
  attemptId?: string;
}) {
  const t = (e: string, a: string) => (language === "ar" ? a : e);
  const [data, setData] = useState<{
      quiz: QuizType;
      questions: Question[];
    } | null>(null),
    [editor, setEditor] = useState(false),
    [kind, setKind] = useState<Question["kind"]>("mcq"),
    [attempt, setAttempt] = useState<{
      id: string;
      questions: Question[];
      started_at: string;
    } | null>(null),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [pairs, setPairs] = useState(() => [
    { id: crypto.randomUUID(), left: "", right: "" },
    { id: crypto.randomUUID(), left: "", right: "" },
  ]);
  const refresh = useCallback(async () => {
    try {
      setData(await api(`/quizzes/${quizId}`));
    } catch (e) {
      setError(errorMessage(e, language));
    }
  }, [quizId, language]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (attemptId)
      void api<Result>(`/attempts/${attemptId}`)
        .then(setResult)
        .catch((e) => setError(errorMessage(e, language)));
  }, [attemptId, language]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget),
      options =
        kind === "mcq"
          ? String(f.get("options"))
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
          : kind === "matching"
            ? [
                ...pairs.map((p) => p.left.trim()),
                ...pairs
                  .map((p) => p.right.trim())
                  .sort((a, b) => a.localeCompare(b)),
              ]
            : [];
    try {
      await api(`/quizzes/${quizId}/questions`, "POST", {
        kind,
        prompt: f.get("prompt"),
        options,
        correct_answer:
          kind === "matching"
            ? JSON.stringify(
                Object.fromEntries(
                  pairs.map((p) => [p.left.trim(), p.right.trim()]),
                ),
              )
            : f.get("correct_answer"),
        explanation: f.get("explanation"),
        topic: f.get("topic"),
        source: f.get("source"),
      });
      setEditor(false);
      await refresh();
      onChanged();
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    setBusy(true);
    setError("");
    try {
      setAttempt(await api(`/quizzes/${quizId}/attempts`, "POST"));
      setAnswers({});
      setResult(null);
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!attempt) return;
    setBusy(true);
    setError("");
    try {
      setResult(
        await api(`/attempts/${attempt.id}/submit`, "POST", { answers }),
      );
      setAttempt(null);
      onChanged();
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={data?.quiz.title || t("Quiz", "اختبار")}
      closeLabel={t("Close", "إغلاق")}
      onClose={() => {
        if (
          !attempt ||
          confirm(
            t(
              "Leave this attempt? You can resume the questions later; unsent answers will be lost.",
              "مغادرة المحاولة؟ يمكنك استئناف الأسئلة لاحقًا؛ ستفقد الإجابات غير المرسلة.",
            ),
          )
        )
          onClose();
      }}
    >
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {!data ? (
        <Skeleton />
      ) : result ? (
        <div className="quiz-results">
          <h3>
            {t("Result", "النتيجة")}: {result.score} / {result.total}
          </h3>
          <p>
            {result.seconds} {t("seconds", "ثانية")}
          </p>
          {result.results.map((q) => (
            <div
              className={`quiz-result ${q.correct ? "correct" : "incorrect"}`}
              key={q.id}
            >
              <strong>{q.prompt}</strong>
              <p>
                {t("Your answer", "إجابتك")}:{" "}
                {displayAnswer(q.student_answer || "")}
              </p>
              <p>
                {t("Correct answer", "الإجابة الصحيحة")}:{" "}
                {displayAnswer(q.correct_answer || "")}
              </p>
              <p>{q.explanation}</p>
              {!q.correct && (
                <small>
                  {t(
                    "Saved in your mistake notebook.",
                    "محفوظ في دفتر الأخطاء.",
                  )}
                </small>
              )}
            </div>
          ))}
          <button className="secondary" onClick={() => setResult(null)}>
            {t("Back to quiz", "العودة للاختبار")}
          </button>
        </div>
      ) : attempt ? (
        <form className="editor-form" onSubmit={(e) => void submit(e)}>
          <p className="field-hint">
            {t(
              "Text and problem answers are checked against the exact final answer, ignoring case and extra spaces; solution steps are not graded.",
              "تُقارن الإجابات النصية ونتائج المسائل بالإجابة النهائية المحددة، مع تجاهل حالة الحروف والمسافات الإضافية. لا يُقيّم شرح الحل تلقائيًا.",
            )}
          </p>
          {attempt.questions.map((q, index) => (
            <fieldset className="quiz-question" key={q.id}>
              <legend>
                {index + 1}. {q.prompt}
              </legend>
              {q.kind === "mcq" || q.kind === "true_false" ? (
                (q.kind === "mcq" ? q.options : ["true", "false"]).map(
                  (option) => (
                    <label className="quiz-option" key={option}>
                      <input
                        type="radio"
                        name={q.id}
                        required
                        checked={answers[q.id] === option}
                        onChange={() =>
                          setAnswers((a) => ({ ...a, [q.id]: option }))
                        }
                      />
                      {q.kind === "true_false"
                        ? option === "true"
                          ? t("True", "صحيح")
                          : t("False", "خطأ")
                        : option}
                    </label>
                  ),
                )
              ) : q.kind === "matching" ? (
                q.options.slice(0, q.options.length / 2).map((left) => (
                  <label key={left}>
                    {left}
                    <select
                      aria-label={left}
                      required
                      value={answerMap(answers[q.id] || "")[left] || ""}
                      onChange={(e) =>
                        setAnswers((a) => ({
                          ...a,
                          [q.id]: JSON.stringify({
                            ...answerMap(a[q.id] || ""),
                            [left]: e.target.value,
                          }),
                        }))
                      }
                    >
                      <option value="">
                        {t("Choose a match", "اختر المطابقة")}
                      </option>
                      {q.options
                        .slice(q.options.length / 2)
                        .map((right, index) => (
                          <option value={right} key={`${right}:${index}`}>
                            {right}
                          </option>
                        ))}
                    </select>
                  </label>
                ))
              ) : (
                <input
                  aria-label={q.prompt}
                  required
                  maxLength={4000}
                  value={answers[q.id] || ""}
                  onChange={(e) =>
                    setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                  }
                />
              )}
            </fieldset>
          ))}
          <button className="primary" disabled={busy}>
            {t("Submit answers", "إرسال الإجابات")}
          </button>
        </form>
      ) : editor ? (
        <form className="editor-form" onSubmit={(e) => void save(e)}>
          <label>
            {t("Question type", "نوع السؤال")}
            <select
              aria-label={t("Question type", "نوع السؤال")}
              value={kind}
              onChange={(e) => setKind(e.target.value as Question["kind"])}
            >
              <option value="mcq">
                {t("Multiple choice", "اختيار من متعدد")}
              </option>
              <option value="true_false">
                {t("True / False", "صحيح / خطأ")}
              </option>
              <option value="short_answer">
                {t("Short answer", "إجابة قصيرة")}
              </option>
              <option value="fill_blank">
                {t("Fill in the blank", "أكمل الفراغ")}
              </option>
              <option value="matching">{t("Matching", "مطابقة")}</option>
              <option value="problem_solving">
                {t(
                  "Problem solving (final answer)",
                  "حل مسألة (النتيجة النهائية)",
                )}
              </option>
            </select>
          </label>
          <label>
            {t("Question", "السؤال")}
            <textarea name="prompt" required minLength={2} maxLength={4000} />
          </label>
          {kind === "mcq" && (
            <label>
              {t("Options (one per line)", "الخيارات (واحد في كل سطر)")}
              <textarea name="options" required />
            </label>
          )}
          {kind === "matching" ? (
            <>
              <h3>{t("Matching pairs", "أزواج المطابقة")}</h3>
              {pairs.map((pair, index) => (
                <div className="form-columns" key={pair.id}>
                  <label>
                    {t("Left item", "العنصر")} {index + 1}
                    <input
                      required
                      maxLength={500}
                      value={pair.left}
                      onChange={(e) =>
                        setPairs((rows) =>
                          rows.map((p) =>
                            p.id === pair.id
                              ? { ...p, left: e.target.value }
                              : p,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    {t("Matching answer", "الإجابة المطابقة")} {index + 1}
                    <input
                      required
                      maxLength={500}
                      value={pair.right}
                      onChange={(e) =>
                        setPairs((rows) =>
                          rows.map((p) =>
                            p.id === pair.id
                              ? { ...p, right: e.target.value }
                              : p,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    className="text-button"
                    type="button"
                    disabled={pairs.length <= 2}
                    onClick={() =>
                      setPairs((rows) => rows.filter((p) => p.id !== pair.id))
                    }
                  >
                    {t("Remove pair", "حذف الزوج")}
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="secondary"
                disabled={pairs.length >= 8}
                onClick={() =>
                  setPairs((rows) => [
                    ...rows,
                    { id: crypto.randomUUID(), left: "", right: "" },
                  ])
                }
              >
                {t("Add pair", "إضافة زوج")}
              </button>
            </>
          ) : (
            <label>
              {t("Correct answer", "الإجابة الصحيحة")}
              {kind === "true_false" ? (
                <select name="correct_answer">
                  <option value="true">{t("True", "صحيح")}</option>
                  <option value="false">{t("False", "خطأ")}</option>
                </select>
              ) : (
                <input name="correct_answer" required maxLength={4000} />
              )}
            </label>
          )}
          <label>
            {t("Explanation", "الشرح")}
            <textarea name="explanation" maxLength={8000} />
          </label>
          <label>
            {t("Topic", "الموضوع")}
            <input name="topic" maxLength={100} />
          </label>
          <label>
            {t("Source", "المصدر")}
            <input name="source" maxLength={300} />
          </label>
          <div className="button-row">
            <button className="primary" disabled={busy}>
              {t("Save question", "حفظ السؤال")}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => setEditor(false)}
            >
              {t("Cancel", "إلغاء")}
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="button-row">
            <button className="primary" onClick={() => setEditor(true)}>
              {t("Add question", "إضافة سؤال")}
            </button>
            <button
              className="secondary"
              disabled={busy || !data.questions.length}
              onClick={() => void start()}
            >
              {t("Start quiz", "بدء الاختبار")}
            </button>
          </div>
          {data.questions.map((q) => (
            <div className="practice-row" key={q.id}>
              <div>
                <strong>{q.prompt}</strong>
                <p>{q.topic}</p>
              </div>
              <button
                className="text-button"
                onClick={async () => {
                  if (!confirm(t("Delete this question?", "حذف السؤال؟")))
                    return;
                  try {
                    await api(`/questions/${q.id}`, "DELETE");
                    await refresh();
                    onChanged();
                  } catch (e) {
                    setError(errorMessage(e, language));
                  }
                }}
              >
                {t("Delete", "حذف")}
              </button>
            </div>
          ))}
          {!data.questions.length && (
            <p className="empty-copy">
              {t(
                "Add questions before starting.",
                "أضف أسئلة قبل بدء الاختبار.",
              )}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
