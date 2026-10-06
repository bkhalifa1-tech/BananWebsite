import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { SplitPane } from "../content/SplitPane";
type Job = {
  id: string;
  title: string;
  state: string;
  error: string;
  cursor: number;
  total: number;
};
type Detail = Job & { original: string; result: string };
export function DocumentTranslations({
  courseId,
  language,
  sources,
  source,
  target,
}: {
  courseId: string;
  language: "ar" | "en";
  sources: { id: string; title: string; kind: string }[];
  source: string;
  target: "ar" | "en";
}) {
  const t = (e: string, a: string) => (language === "ar" ? a : e),
    [jobs, setJobs] = useState<Job[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      setJobs(await api(`/courses/${courseId}/translations`));
    } catch (e) {
      setError(errorMessage(e, language));
    }
  }, [courseId, language]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const running = jobs.some((j) => j.state === "running");
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void refresh(), 1500);
    return () => clearInterval(timer);
  }, [running, refresh]);
  const detailId = detail?.id;
  useEffect(() => {
    if (!detailId || !running) return;
    const timer = setInterval(() => {
      void api<Detail>(`/translations/${detailId}`)
        .then(setDetail)
        .catch((e) => setError(errorMessage(e, language)));
    }, 1500);
    return () => clearInterval(timer);
  }, [detailId, running, language]);
  async function act(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, method, body);
      await refresh();
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  }
  const selected = sources.find((s) => `${s.kind}:${s.id}` === source);
  return (
    <section className="document-translations">
      <h3>{t("Document translation", "ترجمة المستند")}</h3>
      <p className="field-hint">
        {t(
          "Translates extracted text in saved batches, up to 120,000 characters (up to 20 provider requests). Index a PDF first. Layout and images are not translated.",
          "يترجم النص المستخرج بدفعات محفوظة، حتى 120,000 حرف (حتى 20 طلبًا للمزود). افهرس PDF أولًا. لا يترجم التنسيق والصور.",
        )}
      </p>
      <button
        className="secondary"
        disabled={busy || running || !selected || selected.kind === "workspace"}
        onClick={() =>
          void act(`/courses/${courseId}/translations`, "POST", {
            kind: selected?.kind === "note" ? "note" : "material",
            source_id: selected?.id,
            target,
          })
        }
      >
        {t("Translate selected document", "ترجمة المستند المحدد")}
      </button>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {jobs.map((j) => (
        <article className="social-item" key={j.id}>
          <strong>{j.title}</strong>
          <span>
            {Math.min(100, Math.round((j.cursor / j.total) * 100))}% ·{" "}
            {j.state === "running"
              ? t("Translating…", "جارٍ الترجمة…")
              : j.state === "completed"
                ? t("Completed", "مكتملة")
                : t("Stopped; can resume", "توقفت؛ يمكن استئنافها")}
          </span>
          <button
            className="text-button"
            onClick={async () => {
              try {
                setDetail(await api(`/translations/${j.id}`));
              } catch (e) {
                setError(errorMessage(e, language));
              }
            }}
          >
            {t("Open translation", "فتح الترجمة")}
          </button>
          {j.state === "failed" && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void act(`/translations/${j.id}/retry`, "POST", {})
              }
            >
              {t("Resume", "استئناف")}
            </button>
          )}
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              if (detail?.id === j.id) setDetail(null);
              void act(`/translations/${j.id}`, "DELETE");
            }}
          >
            {t("Delete / cancel", "حذف / إلغاء")}
          </button>
        </article>
      ))}
      {detail && (
        <>
          <SplitPane
            direction={language === "ar" ? "rtl" : "ltr"}
            label={t("Resize document translation", "تغيير عرض ترجمة المستند")}
            first={
              <div className="study-output">
                <h4>{t("Original", "الأصل")}</h4>
                <p>{detail.original}</p>
              </div>
            }
            second={
              <div className="study-output">
                <h4>{t("Translation", "الترجمة")}</h4>
                <p>{detail.result}</p>
              </div>
            }
          />
          {detail.state === "completed" && (
            <button
              className="secondary"
              onClick={() => {
                const url = URL.createObjectURL(
                    new Blob([detail.result], {
                      type: "text/plain;charset=utf-8",
                    }),
                  ),
                  a = document.createElement("a");
                a.href = url;
                a.download = "document-translation.txt";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              {t("Download translation", "تنزيل الترجمة")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
