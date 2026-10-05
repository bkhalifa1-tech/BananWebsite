import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import {
  FileText,
  FolderPlus,
  Plus,
  Trash2,
  Upload,
  Columns2,
  X,
} from "lucide-react";
import { api, uploadFile } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { Card, Modal, Skeleton } from "../../components/ui";
import type { Material } from "./MaterialReader";
const MaterialReader = lazy(() =>
  import("./MaterialReader").then((module) => ({
    default: module.MaterialReader,
  })),
);
const NotesEditor = lazy(() =>
  import("./NotesEditor").then((module) => ({ default: module.NotesEditor })),
);
import { SplitPane } from "./SplitPane";
import type { NoteRecord } from "./NoteAutosave";
type Content = {
  folders: { id: string; name: string }[];
  materials: Material[];
  notes: Pick<NoteRecord, "id" | "title" | "version" | "updated_at">[];
};
const templates = [
  {
    id: "mind_map",
    en: "Mind map outline",
    ar: "مخطط خريطة ذهنية",
    html: "<h2>Central idea / الفكرة الرئيسية</h2><ul><li><p>Branch / فرع</p><ul><li><p>Connection / علاقة</p></li></ul></li></ul>",
  },
  {
    id: "problem_solving",
    en: "Problem solving",
    ar: "حل المسائل",
    html: "<h2>Problem / المسألة</h2><p></p><h2>Known information / المعطيات</h2><p></p><h2>Steps / خطوات الحل</h2><ol><li><p></p></li></ol><h2>Result & verification / النتيجة والتحقق</h2><p></p>",
  },
  {
    id: "vocabulary",
    en: "Vocabulary",
    ar: "المفردات",
    html: "<h2>Word / الكلمة</h2><p></p><h2>Meaning / المعنى</h2><p></p><h2>Example / مثال</h2><p></p>",
  },
  {
    id: "research",
    en: "Research notes",
    ar: "ملاحظات بحث",
    html: "<h2>Research question / سؤال البحث</h2><p></p><h2>Sources / المصادر</h2><p></p><h2>Evidence / الأدلة</h2><p></p><h2>Findings / النتائج</h2><p></p>",
  },
  { id: "blank", en: "Blank", ar: "فارغ", html: "<p></p>" },
  {
    id: "lecture",
    en: "Lecture notes",
    ar: "ملاحظات المحاضرة",
    html: "<h2>Key ideas / الأفكار الرئيسية</h2><p></p><h2>Examples / أمثلة</h2><p></p><h2>Questions / أسئلة</h2><p></p>",
  },
  {
    id: "cornell",
    en: "Cornell notes",
    ar: "ملاحظات كورنيل",
    html: "<h2>Cues & questions / إشارات وأسئلة</h2><p></p><h2>Notes / الملاحظات</h2><p></p><h2>Summary / الملخص</h2><p></p>",
  },
  {
    id: "summary",
    en: "Chapter summary",
    ar: "ملخص فصل",
    html: "<h2>Main concepts / المفاهيم الرئيسية</h2><p></p><h2>Key terms / المصطلحات</h2><p></p><h2>What I learned / ما تعلمته</h2><p></p>",
  },
  {
    id: "exam",
    en: "Exam review",
    ar: "مراجعة امتحان",
    html: "<h2>Topics to review / مواضيع للمراجعة</h2><ul><li><p></p></li></ul><h2>Practice questions / أسئلة تدريب</h2><p></p>",
  },
];
export default function CourseContent({
  courseId,
  language,
}: {
  courseId: string;
  language: "ar" | "en";
}) {
  const t = useCallback(
    (e: string, a: string) => (language === "ar" ? a : e),
    [language],
  );
  const [content, setContent] = useState<Content>({
      folders: [],
      materials: [],
      notes: [],
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("materials"),
    [folder, setFolder] = useState(""),
    [material, setMaterial] = useState<Material | null>(null),
    [note, setNote] = useState<NoteRecord | null>(null),
    [split, setSplit] = useState(false),
    [dialog, setDialog] = useState<"folder" | "note" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null),
    generation = useRef(0);
  const refresh = useCallback(async () => {
    const g = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const data = await api<Content>(`/courses/${courseId}/content`);
      if (g === generation.current) setContent(data);
    } catch (err) {
      if (g === generation.current) setError(errorMessage(err, language));
    } finally {
      if (g === generation.current) setLoading(false);
    }
  }, [courseId, language]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function loadNote(id: string) {
    setBusy(true);
    setError("");
    try {
      setNote(await api<NoteRecord>(`/notes/${id}`));
    } catch (err) {
      setError(errorMessage(err, language));
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      if (folder) body.append("folder_id", folder);
      await uploadFile(`/courses/${courseId}/materials`, body);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, language));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function remove(kind: "materials" | "notes" | "folders", id: string) {
    if (
      !window.confirm(
        t(
          "Delete this item permanently? Folder deletion keeps its files.",
          "هل تريد حذف هذا العنصر نهائيًا؟ حذف المجلد لا يحذف ملفاته.",
        ),
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/${kind}/${id}`, "DELETE");
      if (kind === "materials" && material?.id === id) setMaterial(null);
      if (kind === "notes" && note?.id === id) setNote(null);
      if (kind === "folders" && folder === id) setFolder("");
      await refresh();
    } catch (err) {
      setError(errorMessage(err, language));
    } finally {
      setBusy(false);
    }
  }
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (dialog === "folder")
        await api(`/courses/${courseId}/folders`, "POST", {
          name: form.get("name"),
        });
      else {
        const created = await api<NoteRecord>(
          `/courses/${courseId}/notes`,
          "POST",
          {
            title: form.get("name"),
            html:
              templates.find((x) => x.id === form.get("template"))?.html ??
              "<p></p>",
          },
        );
        setNote(created);
        setTab("notes");
      }
      setDialog(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, language));
    } finally {
      setBusy(false);
    }
  }
  const editor = note ? (
    <Suspense fallback={<Skeleton />}>
      <NotesEditor
        key={note.id + ":" + note.version}
        note={note}
        language={language}
        onReload={() => void loadNote(note.id)}
      />
    </Suspense>
  ) : (
    <div className="empty-inline">
      <FileText size={30} />
      <h3>
        {t(
          "Pick a note, or start a new one.",
          "اختر ملاحظة أو أنشئ واحدة جديدة.",
        )}
      </h3>
    </div>
  );
  return (
    <Card className="content-workspace">
      <div className="section-title">
        <h2>{t("Your study workspace", "مساحتك الدراسية")}</h2>
        <div className="top-actions">
          <button
            className="secondary"
            onClick={() => setDialog("note")}
            disabled={busy}
          >
            <Plus size={16} />
            {t("New note", "ملاحظة جديدة")}
          </button>
          {material && (
            <button
              className="secondary"
              onClick={() => setSplit(!split)}
              aria-pressed={split}
            >
              <Columns2 size={16} />
              {t("Split view", "عرض جانبي")}
            </button>
          )}
        </div>
      </div>
      <div className="workspace-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "materials"}
          className={tab === "materials" ? "active" : ""}
          onClick={() => setTab("materials")}
        >
          {t("Materials", "الملفات")}
        </button>
        <button
          role="tab"
          aria-selected={tab === "notes"}
          className={tab === "notes" ? "active" : ""}
          onClick={() => setTab("notes")}
        >
          {t("Notes", "الملاحظات")}
        </button>
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
          <button className="text-button" onClick={() => void refresh()}>
            {t("Retry", "إعادة المحاولة")}
          </button>
        </div>
      )}
      {loading ? (
        <Skeleton />
      ) : (
        <>
          {tab === "materials" && (
            <>
              <div className="materials-toolbar">
                <select
                  aria-label={t("Folder", "المجلد")}
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                >
                  <option value="">{t("All materials", "جميع الملفات")}</option>
                  {content.folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <button
                  className="secondary"
                  onClick={() => setDialog("folder")}
                  disabled={busy}
                >
                  <FolderPlus size={16} />
                  {t("New folder", "مجلد جديد")}
                </button>
                {folder && (
                  <button
                    className="icon-button"
                    aria-label={t("Delete folder", "حذف المجلد")}
                    onClick={() => void remove("folders", folder)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={16} />
                  {busy
                    ? t("Please wait…", "يرجى الانتظار…")
                    : t("Upload file", "رفع ملف")}
                </button>
                <input
                  ref={fileRef}
                  className="sr-only"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  aria-label={t("Upload material", "رفع مادة دراسية")}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file);
                  }}
                />
              </div>
              <p className="field-hint">
                {t(
                  "PDF, PNG and JPEG · up to 10 MB · private to your account",
                  "PDF وPNG وJPEG · حتى 10 MB · خاصة بحسابك",
                )}
              </p>
              <div className="material-grid">
                {content.materials
                  .filter((m) => !folder || m.folder_id === folder)
                  .map((m) => (
                    <div className="material-tile" key={m.id}>
                      <FileText size={26} />
                      <button
                        className="material-name"
                        onClick={() => setMaterial(m)}
                      >
                        {m.name}
                      </button>
                      <small>
                        {m.mime === "application/pdf"
                          ? "PDF"
                          : t("Image", "صورة")}{" "}
                        · {(m.size / 1024).toFixed(1)} KB
                      </small>
                      <button
                        className="icon-button"
                        aria-label={`${t("Delete material", "حذف الملف")}: ${m.name}`}
                        disabled={busy}
                        onClick={() => void remove("materials", m.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
              </div>
              {!content.materials.length && (
                <div className="empty-inline">
                  <Upload size={32} />
                  <h3>
                    {t(
                      "Give your learning a home.",
                      "امنح موادك الدراسية مكانًا.",
                    )}
                  </h3>
                  <p>
                    {t(
                      "Upload a lecture PDF or a study image to get started.",
                      "ارفع محاضرة PDF أو صورة دراسية لتبدأ.",
                    )}
                  </p>
                </div>
              )}
              {material && (
                <>
                  <div className="reader-title">
                    <h3>{t("Reading space", "مساحة القراءة")}</h3>
                    <button
                      className="icon-button"
                      aria-label={t("Close reader", "إغلاق القارئ")}
                      onClick={() => setMaterial(null)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  {split ? (
                    <>
                      <select
                        className="split-note-select"
                        aria-label={t(
                          "Split view note",
                          "ملاحظة العرض الجانبي",
                        )}
                        value={note?.id ?? ""}
                        onChange={(e) => {
                          if (e.target.value) void loadNote(e.target.value);
                          else setNote(null);
                        }}
                      >
                        <option value="">
                          {t("Choose a note", "اختر ملاحظة")}
                        </option>
                        {content.notes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.title}
                          </option>
                        ))}
                      </select>
                      <SplitPane
                        first={
                          <Suspense fallback={<Skeleton />}>
                            <MaterialReader
                              key={material.id}
                              material={material}
                              language={language}
                            />
                          </Suspense>
                        }
                        second={editor}
                        direction={language === "ar" ? "rtl" : "ltr"}
                        label={t(
                          "Resize reading panes",
                          "تغيير عرض لوحتي القراءة",
                        )}
                      />
                    </>
                  ) : (
                    <Suspense fallback={<Skeleton />}>
                      <MaterialReader
                        key={material.id}
                        material={material}
                        language={language}
                      />
                    </Suspense>
                  )}
                </>
              )}
            </>
          )}
          {tab === "notes" && (
            <div className="notes-layout">
              <div className="note-list">
                {content.notes.map((n) => (
                  <div key={n.id}>
                    <button
                      className={note?.id === n.id ? "selected" : ""}
                      onClick={() => void loadNote(n.id)}
                      disabled={busy}
                    >
                      <FileText size={16} />
                      {n.title}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`${t("Delete note", "حذف الملاحظة")}: ${n.title}`}
                      onClick={() => void remove("notes", n.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              {editor}
            </div>
          )}
        </>
      )}
      {dialog && (
        <Modal
          title={
            dialog === "folder"
              ? t("New folder", "مجلد جديد")
              : t("New note", "ملاحظة جديدة")
          }
          closeLabel={t("Close", "إغلاق")}
          onClose={() => {
            if (!busy) setDialog(null);
          }}
        >
          <form className="editor-form" onSubmit={(e) => void create(e)}>
            <label>
              {t("Name", "الاسم")}
              <input name="name" required minLength={2} maxLength={160} />
            </label>
            {dialog === "note" && (
              <label>
                {t("Template", "القالب")}
                <select name="template" defaultValue="blank">
                  {templates.map((x) => (
                    <option key={x.id} value={x.id}>
                      {t(x.en, x.ar)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {t("Create", "إنشاء")}
            </button>
          </form>
        </Modal>
      )}
    </Card>
  );
}
