import { DocumentTranslations } from "./DocumentTranslations";
import { StudyVideo } from "./StudyVideo";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { useStudyRevision } from "../../lib/useStudyRevision";
import { SplitPane } from "../content/SplitPane";
import type { Vocabulary } from "../../lib/learning";
type Source = {
  id: string;
  title: string;
  kind: "pdf" | "note" | "document" | "workspace";
};
type Generated = {
  id: string;
  action: string;
  source: string;
  imported_id: string | null;
  data:
    | {
        kind: "flashcards";
        title: string;
        cards: { front: string; back: string; topic: string }[];
      }
    | {
        kind: "quiz";
        title: string;
        questions: {
          prompt: string;
          correct_answer: string;
          explanation: string;
        }[];
      };
};
const actions = [
  ["summarize", "Summarize", "تلخيص"],
  ["explain", "Explain", "شرح"],
  ["key_concepts", "Key concepts", "المفاهيم الرئيسية"],
  ["study_guide", "Study guide", "دليل دراسة"],
  ["translate", "Translate", "ترجمة"],
  ["word_insight", "Word in context", "الكلمة في سياقها"],
  ["flashcards", "Generate flashcards", "توليد بطاقات"],
  ["quiz", "Generate quiz", "توليد اختبار"],
  ["mock_exam", "Mock exam", "امتحان تجريبي"],
  ["definitions", "Definitions", "تعريفات"],
  ["formula_sheet", "Formula sheet", "ورقة قوانين"],
  ["mind_map", "Mind map outline", "مخطط خريطة ذهنية"],
  ["practice_problems", "Practice problems", "مسائل تدريبية"],
  ["quick_review", "Quick review", "مراجعة سريعة"],
  ["audio_script", "Audio summary script", "نص ملخص صوتي"],
  ["podcast_script", "Podcast script", "نص بودكاست"],
  ["reel_script", "Study reel script", "نص مقطع دراسي"],
  ["video_script", "Explainer video script", "نص فيديو توضيحي"],
];
export default function LearningStudio({
  courseId,
  language,
  materialId,
}: {
  courseId: string;
  language: "ar" | "en";
  materialId?: string;
}) {
  const t = (e: string, a: string) => (language === "ar" ? a : e);
  const [sources, setSources] = useState<Source[]>([]),
    [enabled, setEnabled] = useState(false),
    [source, setSource] = useState(""),
    [selection, setSelection] = useState(""),
    [action, setAction] = useState("translate"),
    [target, setTarget] = useState<"ar" | "en">(language),
    [result, setResult] = useState(""),
    [items, setItems] = useState<Vocabulary[]>([]),
    [drafts, setDrafts] = useState<Generated[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [search, setSearch] = useState(""),
    [hits, setHits] = useState<{ id: string; title: string; text: string }[]>(
      [],
    );
  const [media, setMedia] = useState<{
    speech: boolean;
    transcription: boolean;
    ocr: boolean;
    images: { id: string; name: string }[];
    audio: { id: string; title: string; text: string }[];
    recordings: { id: string; name: string }[];
  }>({
    speech: false,
    transcription: false,
    ocr: false,
    images: [],
    audio: [],
    recordings: [],
  });
  const revision = useStudyRevision(
    "/(vocabulary|generated-study|generated-audio|index-material|media|ai|materials|notes)(/|$)",
  );
  const refresh = useCallback(async () => {
    try {
      const [ai, v, g, m] = await Promise.all([
        api<{ enabled: boolean; sources: Source[] }>(`/courses/${courseId}/ai`),
        api<Vocabulary[]>(`/courses/${courseId}/vocabulary`),
        api<Generated[]>(`/courses/${courseId}/generated-study`),
        api<typeof media>(`/courses/${courseId}/media`),
      ]);
      setMedia(m);
      setSources(ai.sources);
      setEnabled(ai.enabled);
      setItems(v);
      setDrafts(g);
      setSource((old) =>
        ai.sources.some((s) => `${s.kind}:${s.id}` === old)
          ? old
          : materialId && ai.sources.some((s) => s.id === materialId)
            ? `pdf:${materialId}`
            : "",
      );
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setLoading(false);
    }
  }, [courseId, language, materialId]);
  useEffect(() => {
    void refresh();
  }, [refresh, revision]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ materialId: string; text: string }>).detail;
      if (d.materialId === materialId) {
        setToolsOpen(true);
        setSelection(d.text);
        setSource(`pdf:${d.materialId}`);
        setResult("");
      }
    };
    window.addEventListener("study-selection", on);
    return () => window.removeEventListener("study-selection", on);
  }, [materialId]);
  useEffect(() => {
    setSelection("");
    setResult("");
    if (materialId) setSource(`pdf:${materialId}`);
  }, [materialId]);
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id;
      setToolsOpen(true);
      const s = sources.find((s) => s.id === id);
      if (s) setSource(`${s.kind}:${s.id}`);
      setSelection("");
      setResult("");
    };
    window.addEventListener("study-source", on);
    return () => window.removeEventListener("study-source", on);
  }, [sources]);
  async function run() {
    setBusy(true);
    setError("");
    setNotice("");
    setResult("");
    const selected = sources.find((s) => `${s.kind}:${s.id}` === source);
    try {
      const r = await api<{
        response: string;
        truncated: boolean;
        generated_id: string | null;
      }>(`/courses/${courseId}/ai`, "POST", {
        action,
        language,
        target_language: target,
        selection,
        source: selected ? { kind: selected.kind, id: selected.id } : null,
      });
      setResult(r.response);
      if (r.truncated)
        setNotice(
          t(
            "The result uses an excerpt or retrieved passages, not the complete source.",
            "تعتمد النتيجة على مقتطف أو مقاطع مسترجعة، ولا تشمل المصدر كاملًا.",
          ),
        );
      await refresh();
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  }
  async function mutate(path: string, method = "POST", body?: unknown) {
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
  return (
    <section className="learning-studio">
      <details
        open={toolsOpen}
        onToggle={(e) => setToolsOpen(e.currentTarget.open)}
      >
        <summary>
          {t(
            "Translation, vocabulary & study creation",
            "الترجمة والمفردات وإنشاء أدوات الدراسة",
          )}
        </summary>
        {loading && <p role="status">{t("Loading…", "جارٍ التحميل…")}</p>}
        {error && (
          <p className="error-box" role="alert">
            {error}
            <button className="text-button" onClick={() => void refresh()}>
              {t("Retry", "إعادة المحاولة")}
            </button>
          </p>
        )}
        {enabled && (
          <>
            <p className="field-hint">
              {t(
                "The selected text or source excerpt is sent to your AI provider. Review generated answers before importing.",
                "يُرسل النص المحدد أو مقتطف المصدر إلى مزود الذكاء الاصطناعي. راجع الإجابات المولدة قبل إضافتها.",
              )}
            </p>
            <div className="form-columns">
              <label>
                {t("Source", "المصدر")}
                <select
                  aria-label={t("Source", "المصدر")}
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value);
                    setSelection("");
                    setResult("");
                  }}
                >
                  <option value="">
                    {t("Choose a source", "اختر مصدرًا")}
                  </option>
                  {sources.map((s) => (
                    <option key={s.id} value={`${s.kind}:${s.id}`}>
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
                {t("Study action", "إجراء الدراسة")}
                <select
                  aria-label={t("Study action", "إجراء الدراسة")}
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                >
                  {actions.map(([id, en, ar]) => (
                    <option value={id} key={id}>
                      {t(en, ar)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("Target language", "لغة الترجمة")}
                <select
                  aria-label={t("Target language", "لغة الترجمة")}
                  value={target}
                  onChange={(e) => setTarget(e.target.value as "ar" | "en")}
                >
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
              </label>
            </div>
            <label>
              {t(
                "Selection or page text (leave blank for source excerpt)",
                "النص المحدد أو نص الصفحة (اتركه فارغًا لمقتطف المصدر)",
              )}
              <textarea
                maxLength={6000}
                value={selection}
                onChange={(e) => setSelection(e.target.value)}
                placeholder={t(
                  "Select text in the PDF above, or paste page text.",
                  "حدد نصًا في PDF أعلاه، أو الصق نص الصفحة.",
                )}
              />
            </label>
            <button
              className="primary"
              disabled={busy || !source}
              onClick={() => void run()}
            >
              {busy
                ? t("Working…", "جارٍ العمل…")
                : t("Create / translate", "إنشاء / ترجمة")}
            </button>
            {notice && <p role="status">{notice}</p>}
            {result && (
              <SplitPane
                direction={language === "ar" ? "rtl" : "ltr"}
                label={t("Resize translation panes", "تغيير عرض لوحتي الترجمة")}
                first={
                  <div className="study-output">
                    <h3>{t("Original", "الأصل")}</h3>
                    <p>
                      {selection ||
                        sources.find((s) => `${s.kind}:${s.id}` === source)
                          ?.title}
                    </p>
                  </div>
                }
                second={
                  <div className="study-output">
                    <h3>{t("Result", "النتيجة")}</h3>
                    <p>{result}</p>
                    <button
                      className="text-button"
                      onClick={() => {
                        const a = document.createElement("a"),
                          url = URL.createObjectURL(
                            new Blob([result], {
                              type: "text/plain;charset=utf-8",
                            }),
                          );
                        a.href = url;
                        a.download = "study-result.txt";
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      {t("Download text", "تنزيل النص")}
                    </button>
                  </div>
                }
              />
            )}
          </>
        )}
        {enabled && (
          <DocumentTranslations
            courseId={courseId}
            language={language}
            sources={sources}
            source={source}
            target={target}
          />
        )}
        {media.ocr && media.images.length > 0 && (
          <form
            className="editor-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await mutate(`/courses/${courseId}/media`, "POST", {
                action: "ocr",
                material_id: f.get("image"),
              });
            }}
          >
            <h3>
              {t("Read study image (OCR)", "قراءة الصورة الدراسية (OCR)")}
            </h3>
            <p className="field-hint">
              {t(
                "The image is sent to your AI provider. Review extracted text; unclear text can be misread.",
                "تُرسل الصورة إلى مزود الذكاء الاصطناعي. راجع النص المستخرج؛ قد تُقرأ الأجزاء غير الواضحة خطأً.",
              )}
            </p>
            <label>
              {t("Study image", "الصورة الدراسية")}
              <select name="image">
                {media.images.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary" disabled={busy}>
              {t("Extract image text", "استخراج نص الصورة")}
            </button>
          </form>
        )}
        {media.transcription && media.recordings.length > 0 && (
          <form
            className="editor-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await mutate(`/courses/${courseId}/media`, "POST", {
                action: "transcribe",
                material_id: f.get("recording"),
              });
            }}
          >
            <h3>{t("Lecture transcription", "تفريغ المحاضرة")}</h3>
            <p className="field-hint">
              {t(
                "The selected recording is sent to the AI provider. Its transcript becomes a study source.",
                "يُرسل التسجيل المحدد إلى مزود الذكاء الاصطناعي، ويصبح التفريغ مصدرًا للدراسة.",
              )}
            </p>
            <label>
              {t("Recording", "التسجيل")}
              <select name="recording">
                {media.recordings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary" disabled={busy}>
              {t("Transcribe recording", "تفريغ التسجيل")}
            </button>
          </form>
        )}
        {media.speech && result && (
          <button
            className="secondary"
            disabled={busy || result.length > 4000}
            onClick={() =>
              void mutate(`/courses/${courseId}/media`, "POST", {
                action: "speech",
                text: result,
                title:
                  sources
                    .find((s) => `${s.kind}:${s.id}` === source)
                    ?.title.slice(0, 100) || "Study audio",
                language: action === "translate" ? target : language,
              })
            }
          >
            {t(
              "Create narrated audio (up to 4,000 characters)",
              "إنشاء صوت مقروء (حتى 4,000 حرف)",
            )}
          </button>
        )}
        {!!media.audio.length && (
          <section>
            <h3>{t("Generated study audio", "الصوت الدراسي المولد")}</h3>
            <p className="field-hint">
              {t(
                "These voices are generated by AI.",
                "هذه الأصوات مولدة بالذكاء الاصطناعي.",
              )}
            </p>
            {media.audio.map((a) => (
              <article key={a.id}>
                <h4>{a.title}</h4>
                <audio controls src={`/api/generated-audio/${a.id}/file`} />
                <StudyVideo audioId={a.id} text={a.text} language={language} />
                <a
                  className="text-button"
                  href={`/api/generated-audio/${a.id}/file`}
                  download="study-summary.mp3"
                >
                  {t("Download audio", "تنزيل الصوت")}
                </a>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void mutate(`/generated-audio/${a.id}`, "DELETE")
                  }
                >
                  {t("Delete", "حذف")}
                </button>
              </article>
            ))}
          </section>
        )}
        <h3>{t("Search your study sources", "البحث في مصادر الدراسة")}</h3>
        {materialId && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void mutate(
                `/courses/${courseId}/index-material/${materialId}`,
                "POST",
                {},
              )
            }
          >
            {t(
              "Index this PDF for workspace search (up to 200 pages)",
              "فهرسة PDF للبحث في المساحة (حتى 200 صفحة)",
            )}
          </button>
        )}
        <form
          className="link-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              setHits(
                await api(
                  `/courses/${courseId}/search-study?q=${encodeURIComponent(search)}`,
                ),
              );
            } catch (e) {
              setError(errorMessage(e, language));
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            aria-label={t("Search phrase", "عبارة البحث")}
            minLength={2}
            maxLength={300}
            required
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="secondary" disabled={busy}>
            {t("Search sources", "البحث في المصادر")}
          </button>
        </form>
        {hits.map((h) => (
          <article className="study-output" key={h.id}>
            <strong>{h.title}</strong>
            <p>{h.text}</p>
          </article>
        ))}
        <h3>{t("Vocabulary notebook", "دفتر المفردات")}</h3>
        <form
          className="editor-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            await mutate(`/courses/${courseId}/vocabulary`, "POST", {
              word: f.get("word"),
              meaning: f.get("meaning"),
              example: f.get("example"),
              pronunciation: f.get("pronunciation"),
              source:
                sources.find((s) => `${s.kind}:${s.id}` === source)?.title ||
                "",
            });
          }}
        >
          <div className="form-columns">
            <label>
              {t("Word / phrase", "الكلمة / العبارة")}
              <input
                name="word"
                required
                maxLength={300}
                defaultValue={selection.length <= 300 ? selection : ""}
                key={selection}
              />
            </label>
            <label>
              {t("Meaning", "المعنى")}
              <input name="meaning" required maxLength={4000} />
            </label>
            <label>
              {t("Pronunciation", "النطق")}
              <input name="pronunciation" maxLength={300} />
            </label>
            <label>
              {t("Example", "مثال")}
              <input name="example" maxLength={4000} />
            </label>
          </div>
          <button className="secondary" disabled={busy}>
            {t("Save vocabulary", "حفظ المفردة")}
          </button>
        </form>
        {!items.length && (
          <p className="empty-copy">
            {t(
              "Save words you want to review; turn them into spaced-repetition flashcards.",
              "احفظ الكلمات التي تريد مراجعتها، وحولها إلى بطاقات بالتكرار المتباعد.",
            )}
          </p>
        )}
        <div className="vocabulary-grid">
          {items.map((v) => (
            <article key={v.id}>
              <h4>{v.word}</h4>
              <p>{v.meaning}</p>
              <small>{v.pronunciation}</small>
              <p>{v.example}</p>
              <small>{v.source}</small>
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={busy || !!v.card_id}
                  onClick={() => void mutate(`/vocabulary/${v.id}/flashcard`)}
                >
                  {v.card_id
                    ? t("Flashcard saved", "البطاقة محفوظة")
                    : t("Make flashcard", "إنشاء بطاقة")}
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void mutate(`/vocabulary/${v.id}`, "DELETE")}
                >
                  {t("Delete", "حذف")}
                </button>
              </div>
            </article>
          ))}
        </div>
        {!!drafts.length && (
          <>
            <h3>{t("Generated study drafts", "مسودات الدراسة المولدة")}</h3>
            {drafts.map((d) => (
              <article className="generated-draft" key={d.id}>
                <h4>{d.data.title}</h4>
                <small>{d.source}</small>
                {d.data.kind === "flashcards"
                  ? d.data.cards.map((c, i) => (
                      <details key={i}>
                        <summary>{c.front}</summary>
                        <p>{c.back}</p>
                      </details>
                    ))
                  : d.data.questions.map((q, i) => (
                      <details key={i}>
                        <summary>{q.prompt}</summary>
                        <p>{q.correct_answer}</p>
                        <p>{q.explanation}</p>
                      </details>
                    ))}
                <button
                  className="secondary"
                  disabled={busy || !!d.imported_id}
                  onClick={() => void mutate(`/generated-study/${d.id}/import`)}
                >
                  {d.imported_id
                    ? t("Added to practice", "أضيف للتدريب")
                    : t("Approve and add to practice", "اعتماد وإضافة للتدريب")}
                </button>
              </article>
            ))}
          </>
        )}
      </details>
    </section>
  );
}
