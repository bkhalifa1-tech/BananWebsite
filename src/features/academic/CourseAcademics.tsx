import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Plus, Pencil, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { Card, Modal, Progress, Skeleton } from "../../components/ui";
import type { GradeSummary } from "../../lib/academic";
type Grade = {
  id: string;
  name: string;
  weight: number;
  total: number;
  score: number | null;
};
type Exam = {
  id: string;
  name: string;
  start_at: string;
  weight: number;
  total_mark: number;
  target_grade: number;
  actual_grade: number | null;
  included_material: string;
};
type AcademicData = { grades: Grade[]; exams: Exam[]; summary: GradeSummary };
function localDateTime(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export default function CourseAcademics({
  courseId,
  language,
}: {
  courseId: string;
  language: "ar" | "en";
}) {
  const t = (e: string, a: string) => (language === "ar" ? a : e);
  const [data, setData] = useState<AcademicData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<
      { kind: "grade"; value?: Grade } | { kind: "exam"; value?: Exam } | null
    >(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<AcademicData>(`/courses/${courseId}/academics`));
      setError("");
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setLoading(false);
    }
  }, [courseId, language]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal) return;
    const f = new FormData(e.currentTarget),
      score = f.get("score");
    setBusy(true);
    setError("");
    try {
      const body =
        modal.kind === "grade"
          ? {
              name: f.get("name"),
              weight: Number(f.get("weight")),
              total: Number(f.get("total")),
              score: score === "" ? null : Number(score),
            }
          : {
              name: f.get("name"),
              start_at: new Date(String(f.get("start_at"))).toISOString(),
              weight: Number(f.get("weight")),
              total_mark: Number(f.get("total")),
              target_grade: Number(f.get("target_grade")),
              actual_grade: score === "" ? null : Number(score),
              included_material: f.get("included_material"),
            };
      await api(
        modal.value
          ? `/${modal.kind === "grade" ? "grades" : "exams"}/${modal.value.id}`
          : `/courses/${courseId}/${modal.kind === "grade" ? "grades" : "exams"}`,
        modal.value ? "PATCH" : "POST",
        body,
      );
      setModal(null);
      await refresh();
      window.dispatchEvent(new Event("study-academics-changed"));
    } catch (err) {
      setError(errorMessage(err, language));
    } finally {
      setBusy(false);
    }
  }
  async function remove(kind: "grades" | "exams", id: string) {
    if (
      !window.confirm(
        t("Delete this grading item?", "هل تريد حذف بند التقييم؟"),
      )
    )
      return;
    setBusy(true);
    try {
      await api(`/${kind}/${id}`, "DELETE");
      await refresh();
      window.dispatchEvent(new Event("study-academics-changed"));
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="academic-workspace">
      <div className="section-title">
        <h2>{t("Exams & grades", "الامتحانات والدرجات")}</h2>
        <CalendarDays size={22} />
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <Skeleton />
      ) : (
        data && (
          <>
            <div className="grade-summary-grid">
              <div>
                <span>{t("Current grade", "الدرجة الحالية")}</span>
                <strong>
                  {data.summary.current === null
                    ? "—"
                    : `${data.summary.current.toFixed(1)}%`}
                </strong>
                <p>
                  {t(
                    "Normalized across recorded weighted marks.",
                    "محسوبة من البنود الموزونة التي سُجلت درجاتها.",
                  )}
                </p>
              </div>
              <div>
                <span>{t("Graded weight", "الوزن المقيم")}</span>
                <strong>{data.summary.gradedWeight}%</strong>
                <Progress
                  value={data.summary.gradedWeight}
                  label={t("Recorded grading weight", "وزن التقييم المسجل")}
                />
                <p>
                  {t("Configured weight", "الوزن المحدد")}:{" "}
                  {data.summary.totalWeight}% / 100%
                </p>
              </div>
            </div>
            <div className="section-title inner-heading">
              <h3>{t("Exams", "الامتحانات")}</h3>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setModal({ kind: "exam" })}
              >
                <Plus size={16} />
                {t("Add exam", "إضافة امتحان")}
              </button>
            </div>
            {!data.exams.length ? (
              <p className="empty-copy">
                {t(
                  "No exams yet. Add the next milestone in your semester.",
                  "لا توجد امتحانات بعد. أضف المحطة القادمة في فصلك.",
                )}
              </p>
            ) : (
              <div className="academic-list">
                {data.exams.map((exam) => (
                  <div key={exam.id}>
                    <span className="soft-icon">
                      <CalendarDays size={19} />
                    </span>
                    <div>
                      <strong>{exam.name}</strong>
                      <p>
                        {new Date(exam.start_at).toLocaleString(language)} ·{" "}
                        {exam.weight}% {t("weight", "وزن")}
                      </p>
                      <small>
                        {t("Target", "الهدف")}: {exam.target_grade}% ·{" "}
                        {t("Result", "النتيجة")}:{" "}
                        {exam.actual_grade === null
                          ? "—"
                          : `${exam.actual_grade} / ${exam.total_mark}`}
                      </small>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`${t("Edit exam", "تعديل الامتحان")}: ${exam.name}`}
                      onClick={() => setModal({ kind: "exam", value: exam })}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`${t("Delete exam", "حذف الامتحان")}: ${exam.name}`}
                      onClick={() => void remove("exams", exam.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="section-title inner-heading">
              <h3>{t("Other grading items", "بنود التقييم الأخرى")}</h3>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setModal({ kind: "grade" })}
              >
                <Plus size={16} />
                {t("Add grade item", "إضافة بند تقييم")}
              </button>
            </div>
            {!data.grades.length ? (
              <p className="empty-copy">
                {t(
                  "Assignments, projects and quizzes can be recorded here.",
                  "يمكنك تسجيل الواجبات والمشاريع والاختبارات القصيرة هنا.",
                )}
              </p>
            ) : (
              <div className="academic-list">
                {data.grades.map((grade) => (
                  <div key={grade.id}>
                    <div>
                      <strong>{grade.name}</strong>
                      <p>
                        {grade.weight}% {t("weight", "وزن")} ·{" "}
                        {grade.score === null
                          ? t("Not graded", "غير مقيم")
                          : `${grade.score} / ${grade.total}`}
                      </p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`${t("Edit grade", "تعديل الدرجة")}: ${grade.name}`}
                      onClick={() => setModal({ kind: "grade", value: grade })}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`${t("Delete grade", "حذف الدرجة")}: ${grade.name}`}
                      onClick={() => void remove("grades", grade.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )
      )}
      {modal && (
        <Modal
          title={
            modal.kind === "exam"
              ? t("Exam details", "تفاصيل الامتحان")
              : t("Grading item", "بند تقييم")
          }
          closeLabel={t("Close", "إغلاق")}
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          <form className="editor-form" onSubmit={(e) => void save(e)}>
            <label>
              {t("Name", "الاسم")}
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                defaultValue={modal.value?.name}
              />
            </label>
            {modal.kind === "exam" && (
              <label>
                {t("Exam date & time", "تاريخ ووقت الامتحان")}
                <input
                  name="start_at"
                  type="datetime-local"
                  required
                  defaultValue={
                    modal.value
                      ? localDateTime(modal.value.start_at)
                      : undefined
                  }
                />
              </label>
            )}
            <div className="form-columns">
              <label>
                {t("Weight (%)", "الوزن (%)")}
                <input
                  name="weight"
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  required
                  defaultValue={modal.value?.weight ?? 0}
                />
              </label>
              <label>
                {t("Total mark", "الدرجة الكلية")}
                <input
                  name="total"
                  type="number"
                  min={0.01}
                  max={10000}
                  step="any"
                  required
                  defaultValue={
                    modal.value
                      ? modal.kind === "exam"
                        ? modal.value.total_mark
                        : modal.value.total
                      : 100
                  }
                />
              </label>
            </div>
            <label>
              {t("Actual mark (optional)", "الدرجة الفعلية (اختياري)")}
              <input
                name="score"
                type="number"
                min={0}
                max={10000}
                step="any"
                defaultValue={
                  modal.value
                    ? modal.kind === "exam"
                      ? (modal.value.actual_grade ?? "")
                      : (modal.value.score ?? "")
                    : ""
                }
              />
            </label>
            {modal.kind === "exam" && (
              <>
                <label>
                  {t("Target grade (%)", "الدرجة المستهدفة (%)")}
                  <input
                    name="target_grade"
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    required
                    defaultValue={modal.value?.target_grade ?? 90}
                  />
                </label>
                <label>
                  {t("Included material", "المادة المشمولة")}
                  <textarea
                    name="included_material"
                    maxLength={2000}
                    defaultValue={modal.value?.included_material ?? ""}
                  />
                </label>
              </>
            )}
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {t("Save", "حفظ")}
            </button>
          </form>
        </Modal>
      )}
    </Card>
  );
}
