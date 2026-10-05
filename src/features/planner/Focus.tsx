import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { Card, Skeleton } from "../../components/ui";
type Session = {
  id: string;
  topic: string;
  course_name: string;
  course_color: string;
  elapsed_seconds: number;
  target_seconds: number;
  break_seconds: number;
  state: string;
  ended_at: string;
};
export default function Focus({
  language,
  track,
}: {
  track?: "semester" | "personal";
  language: "ar" | "en";
}) {
  const t = (e: string, a: string) => (language === "ar" ? a : e);
  const [data, setData] = useState<{
      active: Session | null;
      history: Session[];
    } | null>(null),
    [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]),
    [course, setCourse] = useState(
      () =>
        new URLSearchParams(window.location.hash.split("?")[1]).get("course") ||
        "",
    ),
    [tasks, setTasks] = useState<{ id: string; title: string }[]>([]),
    [preset, setPreset] = useState(() =>
      new URLSearchParams(window.location.hash.split("?")[1]).has("minutes")
        ? "custom"
        : "25",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0),
    [synced, setSynced] = useState(Date.now()),
    [restUntil, setRestUntil] = useState<number | null>(null);
  const refresh = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([
        api<{ active: Session | null; history: Session[] }>("/focus"),
        api<{ id: string; name: string }[]>(
          `/workspaces${track ? `?track=${track}` : ""}`,
        ),
      ]);
      setData(d);
      setSpaces(s);
      setSynced(Date.now());
      setCourse((c) => (s.some((row) => row.id === c) ? c : s[0]?.id || ""));
    } catch (e) {
      setError(errorMessage(e, language));
    }
  }, [language, track]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!course) {
      setTasks([]);
      return;
    }
    let live = true;
    void api<{ tasks: { id: string; title: string }[] }>(`/courses/${course}`)
      .then((d) => live && setTasks(d.tasks))
      .catch(() => live && setTasks([]));
    return () => {
      live = false;
    };
  }, [course]);
  useEffect(() => {
    const i = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, []);
  const active = data?.active;
  const elapsed = active
    ? Math.min(
        active.target_seconds,
        active.elapsed_seconds +
          (active.state === "running"
            ? Math.floor((Date.now() - synced) / 1000)
            : 0),
      )
    : 0;
  const remaining = active ? active.target_seconds - elapsed : 0;
  void tick;
  const action = useCallback(
    async (a: string) => {
      if (!data?.active || busy) return;
      setBusy(true);
      setError("");
      try {
        const r = await api<{ completed: Session | null }>(
          `/focus/${data.active.id}/${a}`,
          "POST",
        );
        if (r.completed?.break_seconds)
          setRestUntil(Date.now() + r.completed.break_seconds * 1000);
        await refresh();
      } catch (e) {
        setError(errorMessage(e, language));
      } finally {
        setBusy(false);
      }
    },
    [data, busy, language, refresh],
  );
  useEffect(() => {
    if (active?.state === "running" && remaining === 0 && !busy)
      void action("finish");
  }, [remaining, active?.state, busy, action]);
  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(`/courses/${course}/focus`, "POST", {
        topic: f.get("topic"),
        task_id: f.get("task_id") || null,
        minutes:
          preset === "custom" ? Number(f.get("minutes")) : Number(preset),
        break_minutes:
          preset === "custom"
            ? Number(f.get("break_minutes"))
            : preset === "50"
              ? 10
              : 5,
      });
      setRestUntil(null);
      await refresh();
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  }
  const clock = (n: number) =>
    `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {t("ONE THING AT A TIME", "خطوة واحدة في كل مرة")}
          </div>
          <h1>{t("Focus session", "جلسة تركيز")}</h1>
          <p>
            {t(
              "Your timer survives refreshes. Only elapsed study time is recorded.",
              "يستمر المؤقت بعد تحديث الصفحة. يُسجل وقت الدراسة الفعلي فقط.",
            )}
          </p>
        </div>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <Skeleton />
      ) : (
        <div className="dashboard-plan-grid">
          <Card>
            {active ? (
              <div className="focus-active">
                <span
                  className="eyebrow"
                  style={{ color: active.course_color }}
                >
                  {active.course_name}
                </span>
                <h2>{active.topic}</h2>
                <div
                  className="focus-clock"
                  role="timer"
                  aria-label={t("Time remaining", "الوقت المتبقي")}
                >
                  {clock(remaining)}
                </div>
                <p>
                  {active.state === "paused"
                    ? t("Paused", "متوقفة مؤقتًا")
                    : t("In focus", "وقت التركيز")}
                </p>
                <div className="button-row">
                  <button
                    disabled={busy}
                    className="secondary"
                    onClick={() =>
                      void action(
                        active.state === "running" ? "pause" : "resume",
                      )
                    }
                  >
                    {active.state === "running"
                      ? t("Pause", "إيقاف مؤقت")
                      : t("Resume", "استئناف")}
                  </button>
                  <button
                    disabled={busy}
                    className="primary"
                    onClick={() => void action("finish")}
                  >
                    {t("Finish & save", "إنهاء وحفظ")}
                  </button>
                  <button
                    disabled={busy}
                    className="text-button"
                    onClick={() =>
                      confirm(
                        t("Discard this session?", "إلغاء هذه الجلسة؟"),
                      ) && void action("reset")
                    }
                  >
                    {t("Reset", "إلغاء")}
                  </button>
                </div>
              </div>
            ) : (
              <form className="editor-form" onSubmit={(e) => void start(e)}>
                <h2>{t("Start a session", "ابدأ جلسة")}</h2>
                {restUntil && restUntil > Date.now() && (
                  <p className="rest-clock">
                    {t("Break", "استراحة")} ·{" "}
                    {clock(
                      Math.max(0, Math.ceil((restUntil - Date.now()) / 1000)),
                    )}
                  </p>
                )}
                <label>
                  {t("Workspace", "مساحة التعلم")}
                  <select
                    aria-label={t("Workspace", "مساحة التعلم")}
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                  >
                    {spaces.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Study topic", "موضوع الدراسة")}
                  <input
                    name="topic"
                    defaultValue={
                      new URLSearchParams(
                        window.location.hash.split("?")[1],
                      ).get("topic") || ""
                    }
                    required
                    minLength={2}
                    maxLength={160}
                  />
                </label>
                <label>
                  {t("Task (optional)", "المهمة (اختياري)")}
                  <select name="task_id">
                    <option value="">{t("No task", "بدون مهمة")}</option>
                    {tasks.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Session length", "مدة الجلسة")}
                  <select
                    aria-label={t("Session length", "مدة الجلسة")}
                    value={preset}
                    onChange={(e) => setPreset(e.target.value)}
                  >
                    <option value="25">25 / 5</option>
                    <option value="50">50 / 10</option>
                    <option value="custom">{t("Custom", "مخصص")}</option>
                  </select>
                </label>
                {preset === "custom" && (
                  <div className="form-columns">
                    <label>
                      {t("Study minutes", "دقائق الدراسة")}
                      <input
                        name="minutes"
                        type="number"
                        min={1}
                        max={180}
                        required
                        defaultValue={
                          Number(
                            new URLSearchParams(
                              window.location.hash.split("?")[1],
                            ).get("minutes"),
                          ) || 25
                        }
                      />
                    </label>
                    <label>
                      {t("Break minutes", "دقائق الاستراحة")}
                      <input
                        name="break_minutes"
                        type="number"
                        min={0}
                        max={60}
                        required
                        defaultValue={5}
                      />
                    </label>
                  </div>
                )}
                <button className="primary" disabled={busy || !spaces.length}>
                  {t("Start focus", "بدء التركيز")}
                </button>
                {!spaces.length && (
                  <p className="empty-copy">
                    {t("Create a workspace first.", "أنشئ مساحة تعلم أولًا.")}
                  </p>
                )}
              </form>
            )}
          </Card>
          <Card>
            <h2>{t("Study history", "سجل الدراسة")}</h2>
            {data.history.length ? (
              data.history.map((s) => (
                <div
                  className="study-history"
                  key={s.id}
                  style={{ borderInlineStartColor: s.course_color }}
                >
                  <strong>{s.topic}</strong>
                  <small>
                    {s.course_name} · {(s.elapsed_seconds / 60).toFixed(1)}{" "}
                    {t("min", "دقيقة")} ·{" "}
                    {new Date(s.ended_at).toLocaleString(language)}
                  </small>
                </div>
              ))
            ) : (
              <p className="empty-copy">
                {t(
                  "Completed sessions will appear here.",
                  "ستظهر هنا الجلسات المكتملة.",
                )}
              </p>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
