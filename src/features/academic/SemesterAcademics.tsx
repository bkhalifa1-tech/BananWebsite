import { useCallback, useEffect, useState } from "react";
import { GraduationCap, CalendarDays, Settings } from "lucide-react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { Card, Modal, Skeleton } from "../../components/ui";
import type { GradeScale } from "../../lib/academic";
type Data = {
  scale: GradeScale;
  semester: { value: number | null; credits: number };
  cumulative: { value: number | null; credits: number };
  upcoming: {
    id: string;
    name: string;
    start_at: string;
    course_name: string;
    course_color: string;
  }[];
};
export default function SemesterAcademics({
  semesterId,
  language,
}: {
  semesterId: string;
  language: "ar" | "en";
}) {
  const t = (e: string, a: string) => (language === "ar" ? a : e);
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [modal, setModal] = useState(false),
    [scale, setScale] = useState<GradeScale["scale"]>("4"),
    [busy, setBusy] = useState(false),
    [rules, setRules] = useState<{ id: string; min: string; points: string }[]>(
      [],
    );
  const refresh = useCallback(async () => {
    try {
      const result = await api<Data>(`/semesters/${semesterId}/academics`);
      setData(result);
      setScale(result.scale.scale);
      setError("");
    } catch (e) {
      setError(errorMessage(e, language));
    }
  }, [semesterId, language]);
  useEffect(() => {
    void refresh();
    window.addEventListener("study-academics-changed", refresh);
    return () => window.removeEventListener("study-academics-changed", refresh);
  }, [refresh]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api("/academic-preferences", "PUT", {
        scale,
        max: scale === "custom" ? Number(f.get("max")) : Number(scale),
        rules:
          scale === "custom"
            ? rules.map((r) => ({
                min: Number(r.min),
                points: Number(r.points),
              }))
            : [],
      });
      await refresh();
      setModal(false);
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return error ? (
      <p className="error-box" role="alert">
        {error}
      </p>
    ) : (
      <Skeleton />
    );
  return (
    <>
      <div className="dashboard-plan-grid academic-semester">
        <Card>
          <div className="section-title">
            <h2>{t("Current GPA", "المعدل الحالي")}</h2>
            <button
              className="icon-button"
              aria-label={t("GPA scale settings", "إعدادات سلم المعدل")}
              onClick={() => {
                setRules(
                  (data.scale.rules.length
                    ? data.scale.rules
                    : [
                        { min: 90, points: 4 },
                        { min: 80, points: 3 },
                        { min: 0, points: 0 },
                      ]
                  ).map((r) => ({
                    id: crypto.randomUUID(),
                    min: String(r.min),
                    points: String(r.points),
                  })),
                );
                setModal(true);
              }}
            >
              <Settings size={17} />
            </button>
          </div>
          <div className="gpa-values">
            <div>
              <strong>
                {data.semester.value === null
                  ? "—"
                  : data.semester.value.toFixed(2)}
              </strong>
              <span>/ {data.scale.max}</span>
              <p>
                {t("Semester", "الفصل")} · {data.semester.credits}{" "}
                {t("graded credits", "ساعة مقيمة")}
              </p>
            </div>
            <GraduationCap size={48} strokeWidth={1.2} />
          </div>
          <p className="field-hint">
            {t(
              "Provisional, based on recorded grades. Cumulative",
              "تقديري، حسب الدرجات المسجلة. التراكمي",
            )}
            :{" "}
            {data.cumulative.value === null
              ? "—"
              : data.cumulative.value.toFixed(2)}
          </p>
        </Card>
        <Card>
          <div className="section-title">
            <h2>{t("Upcoming exams", "الامتحانات القادمة")}</h2>
            <CalendarDays size={19} />
          </div>
          {data.upcoming.length ? (
            <div className="academic-list">
              {data.upcoming.slice(0, 3).map((exam) => (
                <div key={exam.id}>
                  <span
                    className="course-dot"
                    style={{ background: exam.course_color }}
                  />
                  <div>
                    <strong>{exam.name}</strong>
                    <p>
                      {exam.course_name} ·{" "}
                      {new Date(exam.start_at).toLocaleString(language)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-copy">
              {t(
                "No upcoming exams. Add one in a course workspace.",
                "لا توجد امتحانات قادمة. أضف امتحانًا من مساحة المساق.",
              )}
            </p>
          )}
        </Card>
      </div>
      {modal && (
        <Modal
          title={t("GPA scale", "سلم المعدل")}
          closeLabel={t("Close", "إغلاق")}
          onClose={() => setModal(false)}
        >
          <form className="editor-form" onSubmit={(e) => void save(e)}>
            <label>
              {t("Scale", "السلم")}
              <select
                aria-label={t("Scale", "السلم")}
                value={scale}
                onChange={(e) =>
                  setScale(e.target.value as GradeScale["scale"])
                }
              >
                <option value="4">4.0</option>
                <option value="4.3">4.3</option>
                <option value="100">100</option>
                <option value="custom">{t("Custom", "مخصص")}</option>
              </select>
            </label>
            <p className="field-hint">
              {t(
                "4.0 default: 90→4, 80→3, 70→2, 60→1. Choose custom for your institution.",
                "السلم الافتراضي 4: ‏90←4، ‏80←3، ‏70←2، ‏60←1. اختر مخصصًا لسلم مؤسستك.",
              )}
            </p>
            {scale === "custom" && (
              <>
                <label>
                  {t("Maximum points", "الحد الأعلى للنقاط")}
                  <input
                    name="max"
                    type="number"
                    min={0.01}
                    max={100}
                    step="any"
                    defaultValue={data.scale.max}
                  />
                </label>
                <div className="scale-rules">
                  {rules.map((rule, index) => (
                    <div className="form-columns" key={rule.id}>
                      <label>
                        {t("Minimum percentage", "الحد الأدنى للنسبة")}
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          required
                          value={rule.min}
                          onChange={(e) =>
                            setRules((rows) =>
                              rows.map((r) =>
                                r.id === rule.id
                                  ? { ...r, min: e.target.value }
                                  : r,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        {t("Grade points", "نقاط الدرجة")}
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          required
                          value={rule.points}
                          onChange={(e) =>
                            setRules((rows) =>
                              rows.map((r) =>
                                r.id === rule.id
                                  ? { ...r, points: e.target.value }
                                  : r,
                              ),
                            )
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="text-button"
                        aria-label={`${t("Remove rule", "حذف القاعدة")} ${index + 1}`}
                        onClick={() =>
                          setRules((rows) =>
                            rows.filter((r) => r.id !== rule.id),
                          )
                        }
                      >
                        {t("Remove", "حذف")}
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="secondary"
                  disabled={rules.length >= 30}
                  onClick={() =>
                    setRules((rows) => [
                      ...rows,
                      { id: crypto.randomUUID(), min: "0", points: "0" },
                    ])
                  }
                >
                  {t("Add rule", "إضافة قاعدة")}
                </button>
                <p className="field-hint">
                  {t(
                    "Include a rule starting at 0%. Points must increase as percentages increase.",
                    "أضف قاعدة تبدأ من 0%. يجب أن تزيد النقاط مع زيادة النسبة.",
                  )}
                </p>
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
    </>
  );
}
