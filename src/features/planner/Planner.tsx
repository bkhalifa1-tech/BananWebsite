import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { Card, Modal, Skeleton } from "../../components/ui";
type Workspace = { id: string; name: string; color: string };
type Event = {
  id: string;
  course_id: string;
  title: string;
  kind: string;
  start_at: string;
  end_at: string;
  course_name: string;
  course_color: string;
  source: string;
};
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const localInput = (s: string) => {
  const d = new Date(s);
  return `${dayKey(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export default function Planner({
  language,
  track,
}: {
  track?: "semester" | "personal";
  language: "ar" | "en";
}) {
  const t = (e: string, a: string) => (language === "ar" ? a : e);
  const [events, setEvents] = useState<Event[] | null>(null),
    [spaces, setSpaces] = useState<Workspace[]>([]),
    [view, setView] = useState("month"),
    [date, setDate] = useState(() => dayKey(new Date())),
    [editor, setEditor] = useState<Event | "new" | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const [e, s] = await Promise.all([
        api<Event[]>(`/planner${track ? `?track=${track}` : ""}`),
        api<Workspace[]>(`/workspaces${track ? `?track=${track}` : ""}`),
      ]);
      setEvents(e);
      setSpaces(s);
    } catch (e) {
      setError(errorMessage(e, language));
    }
  }, [language, track]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api(
        editor === "new"
          ? `/courses/${f.get("course_id")}/events`
          : `/events/${(editor as Event).id}`,
        editor === "new" ? "POST" : "PATCH",
        {
          title: f.get("title"),
          kind: f.get("kind"),
          start_at: new Date(String(f.get("start_at"))).toISOString(),
          end_at: new Date(String(f.get("end_at"))).toISOString(),
        },
      );
      setEditor(null);
      await refresh();
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  }
  async function remove(ev: Event) {
    if (!confirm(t("Delete this calendar event?", "حذف هذا الحدث؟"))) return;
    try {
      await api(`/events/${ev.id}`, "DELETE");
      await refresh();
    } catch (e) {
      setError(errorMessage(e, language));
    }
  }
  const base = new Date(`${date}T12:00:00`),
    days: Date[] = [];
  let count = 1;
  if (view === "month") {
    base.setDate(1);
    base.setDate(base.getDate() - base.getDay());
    count = 42;
  }
  if (view === "week") {
    base.setDate(base.getDate() - base.getDay());
    count = 7;
  }
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    days.push(d);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {t("MAKE ROOM FOR LEARNING", "مساحة للتعلم")}
          </div>
          <h1>{t("Your planner", "مخططك الدراسي")}</h1>
          <p>
            {t(
              "Events, exams, deadlines and completed study sessions.",
              "الأحداث والامتحانات والمواعيد وجلسات الدراسة المكتملة.",
            )}
          </p>
        </div>
        <button
          className="primary"
          disabled={!spaces.length}
          onClick={() => setEditor("new")}
        >
          {t("Add event", "إضافة حدث")}
        </button>
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <Card>
        <div className="planner-toolbar">
          <input
            type="date"
            aria-label={t("Calendar date", "تاريخ التقويم")}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          <div className="segmented">
            {["day", "week", "month"].map((v, i) => (
              <button
                key={v}
                className={view === v ? "active" : ""}
                onClick={() => setView(v)}
              >
                {[t("Day", "يوم"), t("Week", "أسبوع"), t("Month", "شهر")][i]}
              </button>
            ))}
          </div>
        </div>
        {!events ? (
          <Skeleton />
        ) : (
          <div className={`calendar-grid calendar-${view}`}>
            {days.map((d) => (
              <section
                className={
                  dayKey(d) === dayKey(new Date())
                    ? "calendar-day today"
                    : "calendar-day"
                }
                key={dayKey(d)}
              >
                <strong>
                  {d.toLocaleDateString(language, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </strong>
                {events
                  .filter(
                    (e) =>
                      dayKey(new Date(e.start_at)) <= dayKey(d) &&
                      dayKey(new Date(e.end_at)) >= dayKey(d),
                  )
                  .map((ev) => (
                    <div
                      className="calendar-event"
                      style={{ borderInlineStartColor: ev.course_color }}
                      key={`${ev.source}:${ev.id}`}
                    >
                      <span>{ev.title}</span>
                      <small>
                        {ev.course_name} ·{" "}
                        {new Date(ev.start_at).toLocaleTimeString(language, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                      {ev.source === "event" ? (
                        <div>
                          <button
                            className="text-button"
                            onClick={() => setEditor(ev)}
                          >
                            {t("Edit", "تعديل")}
                          </button>
                          <button
                            className="text-button"
                            onClick={() => void remove(ev)}
                          >
                            {t("Delete", "حذف")}
                          </button>
                        </div>
                      ) : (
                        <a href={`#/courses/${ev.course_id}`}>
                          {t("Open workspace", "فتح المساحة")}
                        </a>
                      )}
                    </div>
                  ))}
              </section>
            ))}
          </div>
        )}
        {events?.length === 0 && (
          <p className="empty-copy">
            {t(
              "Your calendar is clear. Add an event or a course deadline.",
              "تقويمك فارغ. أضف حدثًا أو موعد مهمة.",
            )}
          </p>
        )}
      </Card>
      {editor && (
        <Modal
          title={t("Calendar event", "حدث في التقويم")}
          closeLabel={t("Close", "إغلاق")}
          onClose={() => !busy && setEditor(null)}
        >
          <form className="editor-form" onSubmit={(e) => void save(e)}>
            {editor === "new" && (
              <label>
                {t("Workspace", "مساحة التعلم")}
                <select
                  name="course_id"
                  aria-label={t("Workspace", "مساحة التعلم")}
                >
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {t("Event title", "عنوان الحدث")}
              <input
                name="title"
                required
                minLength={2}
                maxLength={160}
                defaultValue={editor === "new" ? "" : editor.title}
              />
            </label>
            <label>
              {t("Event type", "نوع الحدث")}
              <select
                name="kind"
                defaultValue={editor === "new" ? "study" : editor.kind}
              >
                {["lecture", "assignment", "deadline", "study", "goal"].map(
                  (kind, i) => (
                    <option key={kind} value={kind}>
                      {
                        [
                          t("Lecture", "محاضرة"),
                          t("Assignment", "واجب"),
                          t("Deadline", "موعد نهائي"),
                          t("Study session", "جلسة دراسة"),
                          t("Personal goal", "هدف شخصي"),
                        ][i]
                      }
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              {t("Starts", "البداية")}
              <input
                name="start_at"
                type="datetime-local"
                required
                defaultValue={
                  editor === "new"
                    ? `${date}T09:00`
                    : localInput(editor.start_at)
                }
              />
            </label>
            <label>
              {t("Ends", "النهاية")}
              <input
                name="end_at"
                type="datetime-local"
                required
                defaultValue={
                  editor === "new" ? `${date}T10:00` : localInput(editor.end_at)
                }
              />
            </label>
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
            <button disabled={busy} className="primary">
              {t("Save", "حفظ")}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
