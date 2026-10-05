import { lazy, Suspense } from "react";
const StudyActivity = lazy(() => import("../analytics/StudyActivity"));
const Recommendations = lazy(
  () => import("../recommendations/Recommendations"),
);
const Tutor = lazy(() => import("../ai/Tutor"));
const Analytics = lazy(() => import("../analytics/Analytics"));
const Practice = lazy(() => import("../practice/Practice"));
const CourseAcademics = lazy(() => import("../academic/CourseAcademics"));
const SemesterAcademics = lazy(() => import("../academic/SemesterAcademics"));
const CourseContent = lazy(() => import("../content/CourseContent"));
import { useCallback, useEffect, useState, useRef } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  GraduationCap,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { api, type Account } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { Card, Progress, Skeleton, Toast } from "../../components/ui";
import { BarChart } from "../../components/BarChart";
import { EditorDialog, type Editor } from "./Editors";
import { TaskList } from "./TaskList";
import {
  localToday,
  type Semester,
  type Course,
  type Task,
  type DashboardData,
} from "./types";
function route() {
  const hash = window.location.hash;
  const course = hash.match(/^#\/courses\/([\w-]+)$/);
  const semester = hash.match(/^#\/semesters\/([\w-]+)$/);
  return { courseId: course?.[1] ?? null, semesterId: semester?.[1] ?? null };
}
export default function Dashboard({
  account,
  coursesOnly = false,
}: {
  account: Account;
  coursesOnly?: boolean;
}) {
  const language = account.preferences.language,
    t = useCallback(
      (e: string, a: string) => (language === "ar" ? a : e),
      [language],
    );
  const [semesters, setSemesters] = useState<Semester[]>([]),
    [data, setData] = useState<DashboardData | null>(null),
    [courseData, setCourseData] = useState<{
      course: Course;
      tasks: Task[];
    } | null>(null);
  const [selected, setSelected] = useState(
    () =>
      route().semesterId ??
      localStorage.getItem(`study-semester:${account.user.id}`) ??
      "",
  );
  const [courseId, setCourseId] = useState(() => route().courseId),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [editor, setEditor] = useState<Editor | null>(null),
    [busyId, setBusyId] = useState<string | null>(null),
    [toast, setToast] = useState("");
  const requestGeneration = useRef(0);
  const currentScope = useRef("");
  currentScope.current = `${selected}:${courseId}`;
  const refresh = useCallback(async () => {
    if (currentScope.current !== `${selected}:${courseId}`) return;
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError("");
    try {
      const list = await api<Semester[]>("/semesters");
      if (generation !== requestGeneration.current) return;
      setSemesters(list);
      let chosen = selected;
      if (courseId) {
        const detail = await api<{ course: Course; tasks: Task[] }>(
          `/courses/${courseId}`,
        );
        if (generation !== requestGeneration.current) return;
        setCourseData(detail);
        chosen = detail.course.semester_id ?? "";
      } else setCourseData(null);
      if (!list.some((s) => s.id === chosen)) chosen = list[0]?.id ?? "";
      if (chosen !== selected) setSelected(chosen);
      if (chosen) {
        const dashboard = await api<DashboardData>(
          `/semesters/${chosen}/dashboard`,
        );
        if (generation !== requestGeneration.current) return;
        setData(dashboard);
        localStorage.setItem(`study-semester:${account.user.id}`, chosen);
      } else {
        setData(null);
        localStorage.removeItem(`study-semester:${account.user.id}`);
      }
    } catch (err) {
      if (generation === requestGeneration.current) {
        setData(null);
        setCourseData(null);
        setError(errorMessage(err, language));
      }
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [selected, courseId, account.user.id, language]);
  const invalidatePendingRequests = useCallback(() => {
    requestGeneration.current++;
  }, []);
  useEffect(() => {
    void refresh();
    return invalidatePendingRequests;
  }, [refresh, invalidatePendingRequests]);
  useEffect(() => {
    const changed = () => {
      const r = route();
      setCourseId(r.courseId);
      if (r.semesterId) setSelected(r.semesterId);
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  function openCourse(c: Course) {
    window.location.hash = `/courses/${c.id}`;
  }
  async function saved() {
    if (
      editor?.kind === "delete" &&
      (editor.resource === "courses" || editor.resource === "semesters")
    ) {
      window.location.hash = "/";
      setCourseId(null);
      if (editor.resource === "semesters") setSelected("");
      setToast(t("Changes saved", "تم حفظ التغييرات"));
      return;
    }
    await refresh();
    setToast(t("Changes saved", "تم حفظ التغييرات"));
  }
  async function toggle(task: Task) {
    setBusyId(task.id);
    try {
      await api(`/tasks/${task.id}`, "PATCH", {
        title: task.title,
        due_date: task.due_date,
        completed: !task.completed_at,
      });
      await refresh();
    } catch (err) {
      setError(errorMessage(err, language));
    } finally {
      setBusyId(null);
    }
  }
  const tasks = courseData?.tasks ?? data?.tasks ?? [],
    courses = data?.courses ?? [];
  const completed = tasks.filter((x) => x.completed_at).length,
    pending = tasks.length - completed,
    credits = courses.reduce((sum, c) => sum + c.credits, 0);
  const today = localToday(),
    todayTasks = tasks.filter(
      (task) =>
        !task.completed_at && task.due_date !== null && task.due_date <= today,
    );
  const nextTasks = tasks.filter((x) => !x.completed_at).slice(0, 5);
  const progress = tasks.length
    ? Math.round((completed / tasks.length) * 100)
    : 0;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {t("YOUR SEMESTER, IN FOCUS", "فصلك، بوضوح")}
          </div>
          <h1>
            {courseData
              ? courseData.course.name
              : t("Welcome home,", "أهلًا بك،") +
                " " +
                account.user.name.split(" ")[0] +
                "."}
          </h1>
          <p>
            {courseData
              ? t(
                  "A workspace for this course. One task at a time.",
                  "مساحة لهذا المساق. مهمة تلو الأخرى.",
                )
              : t(
                  "Real plans. Real progress. Room to grow.",
                  "خطط حقيقية. تقدم حقيقي. مساحة للنمو.",
                )}
          </p>
        </div>
        <button
          className="primary"
          onClick={() => setEditor({ kind: "semester" })}
        >
          <Plus size={17} />
          {t("New semester", "فصل جديد")}
        </button>
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
          <div className="error-actions">
            <button className="secondary" onClick={() => void refresh()}>
              {t("Retry", "إعادة المحاولة")}
            </button>
            <button
              className="secondary"
              onClick={() => {
                window.location.hash = "/";
                setCourseId(null);
              }}
            >
              {t("Back to overview", "العودة للنظرة العامة")}
            </button>
          </div>
        </div>
      )}
      {loading ? (
        <Skeleton />
      ) : !data && !error ? (
        <Card className="semester-empty">
          <span className="soft-icon">
            <GraduationCap size={45} />
          </span>
          <h2>
            {t(
              "Every semester starts with a first step.",
              "كل فصل يبدأ بخطوة أولى.",
            )}
          </h2>
          <p>
            {t(
              "Create a semester, add your courses, and turn your plans into a little daily progress.",
              "أنشئ فصلًا، أضف مساقاتك، وحوّل خططك إلى تقدم يومي صغير.",
            )}
          </p>
          <button
            className="primary"
            onClick={() => setEditor({ kind: "semester" })}
          >
            <Plus size={17} />
            {t("Create my first semester", "إنشاء فصلي الأول")}
          </button>
        </Card>
      ) : (
        data && (
          <>
            <div className="semester-toolbar">
              <div className="semester-selector">
                <CalendarDays size={19} />
                <label className="sr-only" htmlFor="semester-select">
                  {t("Select semester", "اختيار الفصل")}
                </label>
                <select
                  id="semester-select"
                  value={selected}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setCourseId(null);
                    window.location.hash = `/semesters/${e.target.value}`;
                  }}
                >
                  {semesters.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <span className="semester-range">
                  {data.semester.start_date} — {data.semester.end_date}
                </span>
              </div>
              <div className="top-actions">
                <button
                  className="icon-button"
                  aria-label={t("Edit semester", "تعديل الفصل")}
                  onClick={() =>
                    setEditor({ kind: "semester", value: data.semester })
                  }
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={t("Delete semester", "حذف الفصل")}
                  onClick={() =>
                    setEditor({
                      kind: "delete",
                      resource: "semesters",
                      id: data.semester.id,
                      name: data.semester.name,
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            {courseData ? (
              <>
                <button
                  className="text-button course-back"
                  onClick={() => {
                    window.location.hash = `/semesters/${selected}`;
                    setCourseId(null);
                  }}
                >
                  <ArrowLeft size={16} />
                  {t("All courses", "جميع المساقات")}
                </button>
                <Card className="course-detail-header">
                  <span
                    className="course-emblem"
                    style={{ background: courseData.course.color }}
                  >
                    <BookOpen size={29} />
                  </span>
                  <div>
                    <h2>{courseData.course.name}</h2>
                    <p className="muted">
                      {courseData.course.code || t("No course code", "بلا رمز")}{" "}
                      · {courseData.course.credits}{" "}
                      {t("credits", "ساعة معتمدة")}
                    </p>
                  </div>
                  <div className="top-actions">
                    <button
                      className="secondary"
                      onClick={() =>
                        setEditor({
                          kind: "course",
                          semesterId: selected,
                          value: courseData.course,
                        })
                      }
                    >
                      <Pencil size={15} />
                      {t("Edit course", "تعديل المساق")}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={t("Delete course", "حذف المساق")}
                      onClick={() =>
                        setEditor({
                          kind: "delete",
                          resource: "courses",
                          id: courseData.course.id,
                          name: courseData.course.name,
                        })
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </Card>
                <div className="course-overview-grid">
                  <Card>
                    <div className="section-title">
                      <h2>{t("Task progress", "تقدم المهام")}</h2>
                      <span className="badge">
                        {completed} / {tasks.length}
                      </span>
                    </div>
                    <p className="progress-large">
                      {tasks.length ? `${progress}%` : "—"}
                    </p>
                    <Progress
                      value={progress}
                      label={t("Task completion", "إكمال المهام")}
                    />
                    <p className="field-hint">
                      {t(
                        "Based on your completed tasks, not topic mastery.",
                        "محسوب من مهامك المنجزة، وليس إتقان المواضيع.",
                      )}
                    </p>
                  </Card>
                  <Card>
                    <div className="section-title">
                      <h2>{t("Next up", "الخطوة القادمة")}</h2>
                      <CheckCircle2 size={19} />
                    </div>
                    <h3 className="next-task-title">
                      {nextTasks[0]?.title ??
                        t("Nothing pending", "لا توجد مهام معلقة")}
                    </h3>
                    <p className="muted">
                      {nextTasks[0]?.due_date ??
                        t(
                          "Add a task whenever you are ready.",
                          "أضف مهمة عندما تكون مستعدًا.",
                        )}
                    </p>
                  </Card>
                </div>
                <Card>
                  <div className="section-title">
                    <h2>{t("Course tasks", "مهام المساق")}</h2>
                    <button
                      className="primary"
                      onClick={() =>
                        setEditor({
                          kind: "task",
                          courseId: courseData.course.id,
                        })
                      }
                    >
                      <Plus size={16} />
                      {t("Add task", "إضافة مهمة")}
                    </button>
                  </div>
                  <TaskList
                    tasks={tasks}
                    courses={courses}
                    language={language}
                    busyId={busyId}
                    onToggle={(task) => void toggle(task)}
                    onEdit={(task) =>
                      setEditor({
                        kind: "task",
                        courseId: task.course_id,
                        value: task,
                      })
                    }
                    onDelete={(task) =>
                      setEditor({
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
                    key={courseData.course.id}
                    courseId={courseData.course.id}
                    language={language}
                  />
                </Suspense>
                <Suspense fallback={<Skeleton />}>
                  <Recommendations
                    key={courseData.course.id}
                    courseId={courseData.course.id}
                    language={language}
                  />
                </Suspense>
                <Suspense fallback={<Skeleton />}>
                  <Practice
                    key={courseData.course.id}
                    courseId={courseData.course.id}
                    language={language}
                  />
                </Suspense>
                <Suspense fallback={<Skeleton />}>
                  <CourseAcademics
                    key={courseData.course.id}
                    courseId={courseData.course.id}
                    language={language}
                  />
                </Suspense>
                <Suspense fallback={<Skeleton />}>
                  <Analytics
                    key={courseData.course.id}
                    courseId={courseData.course.id}
                    language={language}
                  />
                </Suspense>
                <Suspense fallback={null}>
                  <Tutor courseId={courseData.course.id} language={language} />
                </Suspense>
              </>
            ) : (
              <>
                {!coursesOnly && (
                  <>
                    <div className="semester-stats">
                      {[
                        {
                          label: t("Courses", "المساقات"),
                          value: courses.length,
                          icon: BookOpen,
                        },
                        {
                          label: t("Credit hours", "الساعات المعتمدة"),
                          value: credits,
                          icon: GraduationCap,
                        },
                        {
                          label: t("Tasks remaining", "المهام المتبقية"),
                          value: pending,
                          icon: CalendarDays,
                        },
                        {
                          label: t("Tasks completed", "المهام المنجزة"),
                          value: completed,
                          icon: CheckCircle2,
                        },
                      ].map((x, i) => (
                        <Card
                          key={x.label}
                          className={
                            i === 0 ? "stat-card accent-stat" : "stat-card"
                          }
                        >
                          <div>
                            <span>{x.label}</span>
                            <x.icon size={19} />
                          </div>
                          <strong>{x.value}</strong>
                          <small>{data.semester.name}</small>
                        </Card>
                      ))}
                    </div>
                    <Suspense fallback={<Skeleton />}>
                      <Recommendations
                        semesterId={selected}
                        language={language}
                      />
                    </Suspense>
                    <Suspense fallback={<Skeleton />}>
                      <StudyActivity
                        semesterId={selected}
                        track="semester"
                        language={language}
                      />
                    </Suspense>
                    <Suspense fallback={<Skeleton />}>
                      <SemesterAcademics
                        key={selected}
                        semesterId={selected}
                        language={language}
                      />
                    </Suspense>
                    <div className="dashboard-plan-grid">
                      <Card className="today-card">
                        <div className="section-title">
                          <h2>{t("Today's plan", "خطة اليوم")}</h2>
                          <span className="badge">{todayTasks.length}</span>
                        </div>
                        <p className="field-hint">
                          {t(
                            "Pending tasks due today or overdue.",
                            "المهام المستحقة اليوم أو المتأخرة.",
                          )}
                        </p>
                        <TaskList
                          tasks={todayTasks.slice(0, 5)}
                          courses={courses}
                          language={language}
                          busyId={busyId}
                          onToggle={(task) => void toggle(task)}
                          onEdit={(task) =>
                            setEditor({
                              kind: "task",
                              courseId: task.course_id,
                              value: task,
                            })
                          }
                          onDelete={(task) =>
                            setEditor({
                              kind: "delete",
                              resource: "tasks",
                              id: task.id,
                              name: task.title,
                            })
                          }
                        />
                      </Card>
                      <Card className="completion-card">
                        <div className="section-title">
                          <h2>{t("One step at a time", "خطوة تلو الأخرى")}</h2>
                          <span className="soft-icon">
                            <Check size={20} />
                          </span>
                        </div>
                        <div
                          className="completion-ring"
                          style={{
                            background: `conic-gradient(var(--primary) ${progress}%, var(--border) 0)`,
                          }}
                        >
                          <div>
                            <strong>
                              {tasks.length ? `${progress}%` : "—"}
                            </strong>
                            <small>
                              {t("tasks complete", "المهام المنجزة")}
                            </small>
                          </div>
                        </div>
                        <p className="muted">
                          {tasks.length
                            ? t(
                                `${completed} of ${tasks.length} tasks completed.`,
                                `${completed} من ${tasks.length} مهمة منجزة.`,
                              )
                            : t(
                                "Your progress starts with your first task.",
                                "يبدأ تقدمك بمهمتك الأولى.",
                              )}
                        </p>
                      </Card>
                    </div>
                  </>
                )}
                <div className="section-title courses-heading">
                  <div>
                    <h2>{t("Your courses", "مساقاتك")}</h2>
                    <p className="muted">
                      {t(
                        "A little workspace for every subject.",
                        "مساحة صغيرة لكل موضوع.",
                      )}
                    </p>
                  </div>
                  <button
                    className="primary"
                    onClick={() =>
                      setEditor({ kind: "course", semesterId: selected })
                    }
                  >
                    <Plus size={17} />
                    {t("Add course", "إضافة مساق")}
                  </button>
                </div>
                {courses.length ? (
                  <div className="course-grid">
                    {courses.map((course) => (
                      <Card className="course-card" key={course.id}>
                        <div className="section-title">
                          <span
                            className="course-emblem"
                            style={{ background: course.color }}
                          >
                            <BookOpen size={22} />
                          </span>
                          <button
                            className="icon-button"
                            aria-label={`${t("Edit course", "تعديل المساق")}: ${course.name}`}
                            onClick={() =>
                              setEditor({
                                kind: "course",
                                semesterId: selected,
                                value: course,
                              })
                            }
                          >
                            <Pencil size={15} />
                          </button>
                        </div>
                        <span className="course-code">
                          {course.code || t("COURSE", "مساق")}
                        </span>
                        <h3>
                          <a
                            href={`#/courses/${course.id}`}
                            onClick={(e) => {
                              e.preventDefault();
                              openCourse(course);
                            }}
                          >
                            {course.name}
                          </a>
                        </h3>
                        <p>
                          {course.credits} {t("credit hours", "ساعة معتمدة")} ·{" "}
                          {course.task_count ?? 0} {t("tasks", "مهمة")}
                        </p>
                        <div className="course-task-progress">
                          <div>
                            <span>{t("Task progress", "تقدم المهام")}</span>
                            <strong>
                              {course.completed_count ?? 0} /{" "}
                              {course.task_count ?? 0}
                            </strong>
                          </div>
                          <div className="progress">
                            <span
                              style={{
                                background: course.color,
                                width: `${course.task_count ? (Number(course.completed_count) / course.task_count) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                        <a
                          className="text-button course-open"
                          href={`#/courses/${course.id}`}
                        >
                          {t("Open workspace", "فتح المساحة")}
                          <ArrowUpRight size={16} />
                        </a>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="empty-inline">
                    <BookOpen size={32} />
                    <h3>
                      {t(
                        "Your first course belongs here.",
                        "هنا مكان مساقك الأول.",
                      )}
                    </h3>
                    <p>
                      {t(
                        "Add a course with its own color and credit hours.",
                        "أضف مساقًا بلونه وساعاته المعتمدة.",
                      )}
                    </p>
                  </Card>
                )}
                {!coursesOnly && courses.length > 0 && (
                  <div className="dashboard-plan-grid bottom-dashboard">
                    <Card>
                      <div className="section-title">
                        <h2>{t("Your task list", "قائمة مهامك")}</h2>
                        <span className="badge">{tasks.length}</span>
                      </div>
                      <TaskList
                        tasks={tasks}
                        courses={courses}
                        language={language}
                        busyId={busyId}
                        onToggle={(task) => void toggle(task)}
                        onEdit={(task) =>
                          setEditor({
                            kind: "task",
                            courseId: task.course_id,
                            value: task,
                          })
                        }
                        onDelete={(task) =>
                          setEditor({
                            kind: "delete",
                            resource: "tasks",
                            id: task.id,
                            name: task.title,
                          })
                        }
                      />
                    </Card>
                    <Card>
                      <BarChart
                        title={t("Tasks by course", "المهام حسب المساق")}
                        items={courses.map((c) => ({
                          label: c.name,
                          value: c.task_count ?? 0,
                          color: c.color,
                        }))}
                      />
                      <p className="field-hint">
                        {t(
                          "Counts from your saved course tasks.",
                          "أعداد من مهام مساقاتك المحفوظة.",
                        )}
                      </p>
                    </Card>
                  </div>
                )}
              </>
            )}
          </>
        )
      )}
      {editor && (
        <EditorDialog
          key={
            editor.kind +
            (editor.kind === "delete" ? editor.id : (editor.value?.id ?? "new"))
          }
          editor={editor}
          language={language}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}
