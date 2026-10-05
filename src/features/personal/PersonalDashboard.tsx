import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { api, type Account } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { Card, Modal, Progress, Skeleton } from "../../components/ui";
import { TaskList } from "../semester/TaskList";
import { EditorDialog, type Editor } from "../semester/Editors";
import type { Course, Task } from "../semester/types";
const StudyActivity = lazy(() => import("../analytics/StudyActivity"));
const CourseContent = lazy(() => import("../content/CourseContent"));
const Practice = lazy(() => import("../practice/Practice"));
const Analytics = lazy(() => import("../analytics/Analytics"));
const Recommendations = lazy(
  () => import("../recommendations/Recommendations"),
);
const Tutor = lazy(() => import("../ai/Tutor"));
type Space = Course & {
  goal: string;
  level: "beginner" | "intermediate" | "advanced";
  target_date: string | null;
  kind: "personal";
};
const currentId = () =>
  window.location.hash.match(/^#\/(?:courses|spaces)\/([\w-]+)$/)?.[1] || "";
export default function PersonalDashboard({ account }: { account: Account }) {
  const language = account.preferences.language,
    t = (e: string, a: string) => (language === "ar" ? a : e);
  const [spaces, setSpaces] = useState<Space[] | null>(null),
    [id, setId] = useState(currentId),
    [detail, setDetail] = useState<{ space: Space; tasks: Task[] } | null>(
      null,
    ),
    [editor, setEditor] = useState<Space | "new" | null>(null),
    [taskEditor, setTaskEditor] = useState<Editor | null>(null),
    [busy, setBusy] = useState(false),
    [busyTask, setBusyTask] = useState<string | null>(null),
    [error, setError] = useState("");
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (currentId() !== id) return;
    const token = ++generation.current;
    try {
      const list = await api<Space[]>("/spaces");
      const d = id
        ? await api<{ space: Space; tasks: Task[] }>(`/spaces/${id}`)
        : null;
      if (token === generation.current) {
        setSpaces(list);
        setDetail(d);
        setError("");
      }
    } catch (e) {
      if (token === generation.current) setError(errorMessage(e, language));
    }
  }, [id, language]);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    setDetail(null);
    void refresh();
    return invalidate;
  }, [refresh, invalidate]);
  useEffect(() => {
    const changed = () => setId(currentId());
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const s = await api<Space>(
        editor === "new" ? "/spaces" : `/spaces/${(editor as Space).id}`,
        editor === "new" ? "POST" : "PATCH",
        {
          name: f.get("name"),
          goal: f.get("goal"),
          level: f.get("level"),
          target_date: f.get("target_date") || null,
          color: f.get("color"),
        },
      );
      setEditor(null);
      if (editor === "new") window.location.hash = `/spaces/${s.id}`;
      else await refresh();
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  }
  async function remove(s: Space) {
    if (
      !confirm(
        t(
          "Delete this learning space and all its materials, notes and study history?",
          "حذف مساحة التعلم وجميع ملفاتها وملاحظاتها وسجل الدراسة؟",
        ),
      )
    )
      return;
    setBusy(true);
    try {
      await api(`/spaces/${s.id}`, "DELETE");
      if (id === s.id) {
        window.location.hash = "/";
        setId("");
      } else await refresh();
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  }
  async function toggle(task: Task) {
    setBusyTask(task.id);
    setDetail((current) =>
      current?.space.id === task.course_id
        ? {
            ...current,
            tasks: current.tasks.map((t) =>
              t.id === task.id
                ? {
                    ...t,
                    completed_at: task.completed_at
                      ? null
                      : new Date().toISOString(),
                  }
                : t,
            ),
          }
        : current,
    );
    try {
      await api(`/tasks/${task.id}`, "PATCH", {
        title: task.title,
        due_date: task.due_date,
        completed: !task.completed_at,
      });
      await refresh();
    } catch (e) {
      setDetail((current) =>
        current?.space.id === task.course_id
          ? {
              ...current,
              tasks: current.tasks.map((t) => (t.id === task.id ? task : t)),
            }
          : current,
      );
      setError(errorMessage(e, language));
    } finally {
      setBusyTask(null);
    }
  }
  const completed =
      detail?.tasks.filter((task) => task.completed_at).length || 0,
    total = detail?.tasks.length || 0;
  const levels = {
    beginner: t("Beginner", "مبتدئ"),
    intermediate: t("Intermediate", "متوسط"),
    advanced: t("Advanced", "متقدم"),
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {t("FOLLOW YOUR CURIOSITY", "اتبع فضولك")}
          </div>
          <h1>
            {detail ? (
              detail.space.name
            ) : (
              <>
                {t("Welcome home,", "أهلًا بك،")}{" "}
                {account.user.name.split(" ")[0]}.
              </>
            )}
          </h1>
          <p>
            {t(
              "Personal learning, at your own pace.",
              "تعلم شخصي بالوتيرة التي تناسبك.",
            )}
          </p>
        </div>
        {id ? (
          <button
            className="secondary"
            onClick={() => {
              window.location.hash = "/";
              setId("");
            }}
          >
            {t("All learning spaces", "كل مساحات التعلم")}
          </button>
        ) : (
          <button className="primary" onClick={() => setEditor("new")}>
            {t("New learning space", "مساحة تعلم جديدة")}
          </button>
        )}
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
          <button className="text-button" onClick={() => void refresh()}>
            {t("Retry", "إعادة المحاولة")}
          </button>
        </p>
      )}
      {!spaces || (id && !detail && !error) ? (
        <Skeleton />
      ) : detail ? (
        <>
          <Card className="personal-goal">
            <div className="section-title">
              <h2>{t("Your learning goal", "هدفك التعليمي")}</h2>
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={() => setEditor(detail.space)}
                >
                  {t("Edit space", "تعديل المساحة")}
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void remove(detail.space)}
                >
                  {t("Delete space", "حذف المساحة")}
                </button>
              </div>
            </div>
            <p>{detail.space.goal}</p>
            <div className="goal-meta">
              <span
                className="course-dot"
                style={{ background: detail.space.color }}
              />
              {levels[detail.space.level]}
              {detail.space.target_date && (
                <>
                  {" "}
                  · {t("Target", "الهدف")}:{" "}
                  {new Date(
                    `${detail.space.target_date}T12:00:00`,
                  ).toLocaleDateString(language)}
                </>
              )}
            </div>
            <p className="field-hint">
              {t("Task progress", "تقدم المهام")}: {completed}/{total}
            </p>
            <Progress
              value={total ? (100 * completed) / total : 0}
              label={t("Task progress", "تقدم المهام")}
            />
          </Card>
          <Card className="practice-card">
            <div className="section-title">
              <h2>{t("Learning tasks", "مهام التعلم")}</h2>
              <button
                className="secondary"
                onClick={() => setTaskEditor({ kind: "task", courseId: id })}
              >
                {t("Add task", "إضافة مهمة")}
              </button>
            </div>
            <TaskList
              tasks={detail.tasks}
              courses={[detail.space]}
              language={language}
              busyId={busyTask}
              onToggle={(task) => void toggle(task)}
              onEdit={(task) =>
                setTaskEditor({ kind: "task", courseId: id, value: task })
              }
              onDelete={(task) =>
                setTaskEditor({
                  kind: "delete",
                  resource: "tasks",
                  id: task.id,
                  name: task.title,
                })
              }
            />
          </Card>
          <Suspense fallback={<Skeleton />}>
            <CourseContent
              key={`content:${id}`}
              courseId={id}
              language={language}
            />
          </Suspense>
          <Suspense fallback={<Skeleton />}>
            <Recommendations
              key={`recommend:${id}`}
              courseId={id}
              language={language}
            />
          </Suspense>
          <Suspense fallback={<Skeleton />}>
            <Practice
              key={`practice:${id}`}
              courseId={id}
              language={language}
            />
          </Suspense>
          <Suspense fallback={<Skeleton />}>
            <Analytics
              key={`analytics:${id}`}
              courseId={id}
              language={language}
            />
          </Suspense>
          <Suspense fallback={null}>
            <Tutor key={`tutor:${id}`} courseId={id} language={language} />
          </Suspense>
        </>
      ) : (
        <>
          <Suspense fallback={<Skeleton />}>
            <Recommendations language={language} track="personal" />
          </Suspense>
          <Suspense fallback={<Skeleton/>}><StudyActivity track="personal" language={language}/></Suspense>
          {spaces?.length ? (
            <div className="course-grid">
              {spaces.map((s) => (
                <Card key={s.id} className="personal-space-card">
                  <div className="course-dot" style={{ background: s.color }} />
                  <h2>
                    <a href={`#/spaces/${s.id}`}>{s.name}</a>
                  </h2>
                  <p>{s.goal}</p>
                  <p className="field-hint">
                    {levels[s.level]}
                    {s.target_date && ` · ${s.target_date}`}
                  </p>
                  <Progress
                    value={
                      s.task_count
                        ? (100 * (s.completed_count || 0)) / s.task_count
                        : 0
                    }
                    label={t("Task progress", "تقدم المهام")}
                  />
                  <p className="field-hint">
                    {s.completed_count || 0}/{s.task_count || 0}{" "}
                    {t("tasks complete", "مهمة مكتملة")}
                  </p>
                  <div className="button-row">
                    <a className="secondary" href={`#/spaces/${s.id}`}>
                      {t("Open learning space", "فتح مساحة التعلم")}
                    </a>
                    <button
                      className="text-button"
                      onClick={() => setEditor(s)}
                    >
                      {t("Edit", "تعديل")}
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void remove(s)}
                    >
                      {t("Delete", "حذف")}
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="semester-empty">
              <h2>
                {t("What would you like to learn?", "ماذا تريد أن تتعلم؟")}
              </h2>
              <p>
                {t(
                  "Create a space with a goal, level and target date.",
                  "أنشئ مساحة بهدف ومستوى وتاريخ مستهدف.",
                )}
              </p>
              <button className="primary" onClick={() => setEditor("new")}>
                {t("Create my first learning space", "أنشئ أول مساحة تعلم")}
              </button>
            </Card>
          )}
        </>
      )}
      {editor && (
        <Modal
          title={
            editor === "new"
              ? t("New learning space", "مساحة تعلم جديدة")
              : t("Edit learning space", "تعديل مساحة التعلم")
          }
          closeLabel={t("Close", "إغلاق")}
          onClose={() => !busy && setEditor(null)}
        >
          <form className="editor-form" onSubmit={(e) => void save(e)}>
            <label>
              {t("Space name", "اسم المساحة")}
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                defaultValue={editor === "new" ? "" : editor.name}
              />
            </label>
            <label>
              {t("Learning goal", "هدف التعلم")}
              <textarea
                name="goal"
                required
                minLength={2}
                maxLength={1000}
                defaultValue={editor === "new" ? "" : editor.goal}
              />
            </label>
            <label>
              {t("Current level", "المستوى الحالي")}
              <select
                name="level"
                aria-label={t("Current level", "المستوى الحالي")}
                defaultValue={editor === "new" ? "beginner" : editor.level}
              >
                {Object.entries(levels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Target date (optional)", "التاريخ المستهدف (اختياري)")}
              <input
                name="target_date"
                type="date"
                defaultValue={editor === "new" ? "" : editor.target_date || ""}
              />
            </label>
            <label>
              {t("Space color", "لون المساحة")}
              <input
                name="color"
                type="color"
                defaultValue={editor === "new" ? "#286fb0" : editor.color}
              />
            </label>
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {t("Save space", "حفظ المساحة")}
            </button>
          </form>
        </Modal>
      )}
      {taskEditor && (
        <EditorDialog
          editor={taskEditor}
          language={language}
          onClose={() => setTaskEditor(null)}
          onSaved={async () => {
            setTaskEditor(null);
            await refresh();
          }}
        />
      )}
    </>
  );
}
