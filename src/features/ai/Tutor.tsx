import { useStudyRevision } from "../../lib/useStudyRevision";
import { useCallback, useEffect, useState, useRef } from "react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { Card } from "../../components/ui";
type Data = {
  enabled: boolean;
  conversations: { id: string; title: string }[];
  sources: {
    id: string;
    title: string;
    kind: "pdf" | "note" | "document" | "workspace";
  }[];
};
type Message = { id: string; role: string; content: string; source: string };
export default function Tutor({
  courseId,
  language,
}: {
  courseId: string;
  language: "ar" | "en";
}) {
  const t = (e: string, a: string) => (language === "ar" ? a : e);
  const [data, setData] = useState<Data | null>(null),
    [conversation, setConversation] = useState<string | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [source, setSource] = useState(""),
    [action, setAction] = useState("chat"),
    [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const revision = useStudyRevision("/(materials|notes)(/|$)");
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const token = ++generation.current;
    try {
      const result = await api<Data>(`/courses/${courseId}/ai`);
      if (token === generation.current) {
        setData(result);
        setSource((value) =>
          result.sources.some((s) => `${s.kind}:${s.id}` === value)
            ? value
            : "",
        );
      }
    } catch (e) {
      if (token === generation.current) setError(errorMessage(e, language));
    }
  }, [courseId, language]);
  useEffect(() => {
    void refresh();
  }, [refresh, revision]);
  async function open(id: string) {
    setBusy(true);
    setError("");
    try {
      const d = await api<{ messages: Message[] }>(`/conversations/${id}`);
      setConversation(id);
      setMessages(d.messages);
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const selected = data?.sources.find((s) => `${s.kind}:${s.id}` === source);
    try {
      const r = await api<{
        conversation_id: string;
        response: string;
        truncated: boolean;
      }>(`/courses/${courseId}/ai`, "POST", {
        action,
        prompt,
        language,
        conversation_id: conversation,
        source: selected ? { kind: selected.kind, id: selected.id } : null,
      });
      setPrompt("");
      await refresh();
      await open(r.conversation_id);
      if (r.truncated)
        setError(
          t(
            "Only a source excerpt or retrieved passages were used.",
            "تم استخدام مقتطف من المصدر أو المقاطع المسترجعة فقط.",
          ),
        );
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  }
  // No incomplete controls are exposed when the external provider is unavailable.
  if (!data?.enabled) return null;
  return (
    <Card className="tutor-card">
      <div className="section-title">
        <h2>{t("AI study tutor", "مساعد الدراسة الذكي")}</h2>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setConversation(null);
            setMessages([]);
            setError("");
          }}
        >
          {t("New conversation", "محادثة جديدة")}
        </button>
      </div>
      <p className="field-hint">
        {t(
          "Your question and selected source excerpt are sent to the configured AI provider. Check important answers against your material.",
          "يُرسل سؤالك ومقتطف المصدر المحدد إلى مزود الذكاء الاصطناعي. تحقق من الإجابات المهمة بالرجوع إلى مادتك.",
        )}
      </p>
      <div className="tutor-conversations">
        {data.conversations.map((c) => (
          <button
            className={conversation === c.id ? "secondary" : "text-button"}
            disabled={busy}
            key={c.id}
            onClick={() => void open(c.id)}
          >
            {c.title}
          </button>
        ))}
      </div>
      <div className="tutor-messages" aria-live="polite">
        {messages.map((m) => (
          <article className={`tutor-message ${m.role}`} key={m.id}>
            <strong>
              {m.role === "user" ? t("You", "أنت") : t("Tutor", "المساعد")}
            </strong>
            <p>{m.content}</p>
            {m.source && (
              <small>
                {t("Source", "المصدر")}: {m.source}
              </small>
            )}
          </article>
        ))}
      </div>
      <form className="editor-form" onSubmit={(e) => void send(e)}>
        <div className="form-columns">
          <label>
            {t("Study source", "مصدر الدراسة")}
            <select
              aria-label={t("Study source", "مصدر الدراسة")}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">
                {t("No source (general question)", "بدون مصدر (سؤال عام)")}
              </option>
              {data.sources.map((s) => (
                <option key={`${s.kind}:${s.id}`} value={`${s.kind}:${s.id}`}>
                  {s.kind === "workspace"
                    ? t(
                        "All indexed study sources",
                        "جميع مصادر الدراسة المفهرسة",
                      )
                    : s.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Action", "الإجراء")}
            <select
              aria-label={t("Action", "الإجراء")}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              {[
                "chat",
                "summarize",
                "explain",
                "key_concepts",
                "study_guide",
              ].map((v, i) => (
                <option value={v} key={v}>
                  {
                    [
                      t("Ask tutor", "اسأل المساعد"),
                      t("Summarize", "تلخيص"),
                      t("Explain", "شرح"),
                      t("Key concepts", "المفاهيم الرئيسية"),
                      t("Study guide", "دليل دراسة"),
                    ][i]
                  }
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {t("Your question", "سؤالك")}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={4000}
            required={action === "chat"}
            minLength={action === "chat" ? 2 : undefined}
          />
        </label>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button
            className="primary"
            disabled={busy || (action !== "chat" && !source)}
          >
            {busy ? t("Working…", "جارٍ العمل…") : t("Send", "إرسال")}
          </button>
          {conversation && (
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={async () => {
                if (
                  !confirm(t("Delete this conversation?", "حذف هذه المحادثة؟"))
                )
                  return;
                try {
                  await api(`/conversations/${conversation}`, "DELETE");
                  setConversation(null);
                  setMessages([]);
                  await refresh();
                } catch (e) {
                  setError(errorMessage(e, language));
                }
              }}
            >
              {t("Delete conversation", "حذف المحادثة")}
            </button>
          )}
        </div>
      </form>
    </Card>
  );
}
