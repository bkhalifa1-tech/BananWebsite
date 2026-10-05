import { useState, type FormEvent } from "react";
import { Modal } from "../../components/ui";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { localToday, type Semester, type Course, type Task } from "./types";
export type Editor =
  | { kind: "semester"; value?: Semester }
  | { kind: "course"; semesterId: string; value?: Course }
  | { kind: "task"; courseId: string; value?: Task }
  | {
      kind: "delete";
      resource: "semesters" | "courses" | "tasks";
      id: string;
      name: string;
    };
export function EditorDialog({
  editor,
  language,
  onClose,
  onSaved,
}: {
  editor: Editor;
  language: "ar" | "en";
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const t = (e: string, a: string) => (language === "ar" ? a : e);
  const [color, setColor] = useState(
    editor.kind === "course" ? (editor.value?.color ?? "#216348") : "#216348",
  );
  const title =
    editor.kind === "delete"
      ? t("Delete permanently?", "حذف نهائي؟")
      : editor.kind === "semester"
        ? editor.value
          ? t("Edit semester", "تعديل الفصل")
          : t("New semester", "فصل جديد")
        : editor.kind === "course"
          ? editor.value
            ? t("Edit course", "تعديل المساق")
            : t("New course", "مساق جديد")
          : editor.value
            ? t("Edit task", "تعديل المهمة")
            : t("New task", "مهمة جديدة");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      if (editor.kind === "delete")
        await api(`/${editor.resource}/${editor.id}`, "DELETE");
      else if (editor.kind === "semester")
        await api(
          editor.value ? `/semesters/${editor.value.id}` : "/semesters",
          editor.value ? "PATCH" : "POST",
          {
            name: data.get("name"),
            start_date: data.get("start_date"),
            end_date: data.get("end_date"),
          },
        );
      else if (editor.kind === "course")
        await api(
          editor.value
            ? `/courses/${editor.value.id}`
            : `/semesters/${editor.semesterId}/courses`,
          editor.value ? "PATCH" : "POST",
          {
            name: data.get("name"),
            code: data.get("code"),
            credits: Number(data.get("credits")),
            color,
          },
        );
      else
        await api(
          editor.value
            ? `/tasks/${editor.value.id}`
            : `/courses/${editor.courseId}/tasks`,
          editor.value ? "PATCH" : "POST",
          {
            title: data.get("title"),
            due_date: data.get("due_date") || null,
            ...(editor.value
              ? { completed: Boolean(editor.value.completed_at) }
              : {}),
          },
        );
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err, language));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={title}
      closeLabel={t("Close", "إغلاق")}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="editor-form" onSubmit={(e) => void submit(e)}>
        {editor.kind === "delete" ? (
          <>
            <p>
              {t("This will permanently delete", "سيتم حذف")}{" "}
              <strong>{editor.name}</strong>.
            </p>
            <p className="muted">
              {t(
                "Deleting a semester removes its courses and tasks. Deleting a course removes its tasks. This cannot be undone.",
                "حذف الفصل يحذف مساقاته ومهامه. حذف المساق يحذف مهامه. لا يمكن التراجع.",
              )}
            </p>
          </>
        ) : (
          <>
            {editor.kind === "task" ? (
              <label>
                {t("Task title", "عنوان المهمة")}
                <input
                  name="title"
                  required
                  minLength={2}
                  maxLength={160}
                  defaultValue={editor.value?.title}
                />
              </label>
            ) : (
              <label>
                {editor.kind === "semester"
                  ? t("Semester name", "اسم الفصل")
                  : t("Course name", "اسم المساق")}
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={editor.kind === "semester" ? 80 : 100}
                  defaultValue={editor.value?.name}
                />
              </label>
            )}
            {editor.kind === "semester" && (
              <div className="form-columns">
                <label>
                  {t("Start date", "تاريخ البداية")}
                  <input
                    name="start_date"
                    type="date"
                    required
                    defaultValue={editor.value?.start_date ?? localToday()}
                  />
                </label>
                <label>
                  {t("End date", "تاريخ النهاية")}
                  <input
                    name="end_date"
                    type="date"
                    required
                    defaultValue={editor.value?.end_date}
                  />
                </label>
              </div>
            )}
            {editor.kind === "course" && (
              <>
                <div className="form-columns">
                  <label>
                    {t("Course code", "رمز المساق")}
                    <input
                      name="code"
                      maxLength={24}
                      defaultValue={editor.value?.code ?? ""}
                      placeholder="CS101"
                    />
                  </label>
                  <label>
                    {t("Credit hours", "الساعات المعتمدة")}
                    <input
                      name="credits"
                      type="number"
                      min={0}
                      max={30}
                      step={0.5}
                      required
                      defaultValue={editor.value?.credits ?? 3}
                    />
                  </label>
                </div>
                <label>
                  {t("Course color", "لون المساق")}
                  <div className="course-color-picker">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      aria-label={t("Choose course color", "اختر لون المساق")}
                    />
                    <span dir="ltr">{color}</span>
                    <p className="muted">
                      {t(
                        "Independent of your workspace theme.",
                        "مستقل عن لون المساحة.",
                      )}
                    </p>
                  </div>
                </label>
              </>
            )}
            {editor.kind === "task" && (
              <label>
                {t("Due date (optional)", "موعد التسليم (اختياري)")}
                <input
                  name="due_date"
                  type="date"
                  defaultValue={editor.value?.due_date ?? ""}
                />
              </label>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t("Cancel", "إلغاء")}
          </button>
          <button
            type="submit"
            className={editor.kind === "delete" ? "danger-button" : "primary"}
            disabled={busy}
          >
            {busy
              ? t("Saving…", "جارٍ الحفظ…")
              : editor.kind === "delete"
                ? t("Delete permanently", "حذف نهائي")
                : t("Save", "حفظ")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
