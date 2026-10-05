import { Pencil, Trash2 } from "lucide-react";
import type { Task, Course } from "./types";
export function TaskList({
  tasks,
  courses,
  language,
  busyId,
  onToggle,
  onEdit,
  onDelete,
}: {
  tasks: Task[];
  courses: Course[];
  language: "ar" | "en";
  busyId: string | null;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const t = (e: string, a: string) => (language === "ar" ? a : e);
  if (!tasks.length)
    return (
      <div className="empty-inline">
        <span>✧</span>
        <h3>{t("A clear canvas", "بداية هادئة")}</h3>
        <p>
          {t(
            "Add a task to give your next study session a direction.",
            "أضف مهمة لتحدد وجهة جلستك الدراسية القادمة.",
          )}
        </p>
      </div>
    );
  return (
    <ul className="task-list">
      {tasks.map((task) => {
        const course = courses.find((c) => c.id === task.course_id);
        return (
          <li key={task.id} className={task.completed_at ? "task-done" : ""}>
            <input
              type="checkbox"
              checked={Boolean(task.completed_at)}
              disabled={busyId !== null}
              onChange={() => onToggle(task)}
              aria-label={`${t("Complete", "إكمال")}: ${task.title}`}
            />
            <div className="task-copy">
              <strong>{task.title}</strong>
              <div>
                <span
                  className="course-dot"
                  style={{ background: course?.color ?? task.course_color }}
                />
                {course?.name ?? task.course_name}
                {task.due_date && (
                  <span className="task-date">
                    {new Intl.DateTimeFormat(language, {
                      month: "short",
                      day: "numeric",
                    }).format(new Date(task.due_date + "T12:00:00"))}
                  </span>
                )}
              </div>
            </div>
            <button
              className="icon-button"
              aria-label={`${t("Edit task", "تعديل المهمة")}: ${task.title}`}
              onClick={() => onEdit(task)}
              disabled={busyId !== null}
            >
              <Pencil size={15} />
            </button>
            <button
              className="icon-button"
              aria-label={`${t("Delete task", "حذف المهمة")}: ${task.title}`}
              onClick={() => onDelete(task)}
              disabled={busyId !== null}
            >
              <Trash2 size={15} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
