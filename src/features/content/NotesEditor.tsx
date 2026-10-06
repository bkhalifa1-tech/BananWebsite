import { useEffect, useState, useMemo, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { MindMap } from "./MindMap";
import { NoteDrawing } from "./NoteDrawing";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Image from "@tiptap/extension-image";
import Mathematics from "@tiptap/extension-mathematics";
import "katex/dist/katex.min.css";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  Underline,
  List,
  Heading2,
  Quote,
  Code,
  Link,
} from "lucide-react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { NoteAutosave, type NoteRecord } from "./NoteAutosave";
export function NotesEditor({
  note,
  courseId,
  language,
  onReload,
}: {
  note: NoteRecord;
  courseId: string;
  language: "ar" | "en";
  onReload: () => void;
}) {
  const t = (e: string, a: string) => (language === "ar" ? a : e);
  const [title, setTitle] = useState(note.title),
    [status, setStatus] = useState("saved"),
    [error, setError] = useState(""),
    [link, setLink] = useState(""),
    [linkOpen, setLinkOpen] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false),
    [mapOpen, setMapOpen] = useState(false),
    [images, setImages] = useState<{ id: string; name: string }[]>([]);
  const titleRef = useRef(note.title);
  const [insertKind, setInsertKind] = useState<"math" | "image" | null>(null),
    [insertValue, setInsertValue] = useState("");
  const writer = useMemo(
    () =>
      new NoteAutosave(note, (snapshot, version) =>
        api<NoteRecord>(`/notes/${note.id}`, "PATCH", { ...snapshot, version }),
      ),
    [note],
  );
  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        TableKit,
        TaskList,
        TaskItem.configure({ nested: true }),
        Highlight.configure({ multicolor: true }),
        TextStyleKit,
        Image,
        Mathematics.configure({
          katexOptions: { throwOnError: false, trust: false },
        }),
      ],
      content: note.html,
      editorProps: {
        attributes: {
          class: "note-prose",
          role: "textbox",
          "aria-label": t("Note content", "محتوى الملاحظة"),
          "aria-multiline": "true",
        },
      },
      onUpdate: ({ editor }) =>
        writer.set({ title: titleRef.current, html: editor.getHTML() }),
    },
    [writer],
  );
  useEffect(() => {
    writer.onStatus = (s, e) => {
      setStatus(s);
      setError(e ? errorMessage(e, language) : "");
    };
    return () => {
      writer.onStatus = () => {};
      void writer.flush();
    };
  }, [writer, language]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (writer.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [writer]);
  useEffect(() => {
    if (insertKind === "image")
      void api<{ materials: { id: string; name: string; mime: string }[] }>(
        `/courses/${courseId}/content`,
      )
        .then((d) =>
          setImages(d.materials.filter((m) => m.mime.startsWith("image/"))),
        )
        .catch((e) => setError(errorMessage(e, language)));
  }, [insertKind, courseId, language]);
  function rename(value: string) {
    titleRef.current = value;
    setTitle(value);
    writer.set({ title: value, html: editor?.getHTML() ?? note.html });
  }
  return (
    <section className="notes-editor">
      <div className="note-title-row">
        <input
          aria-label={t("Note title", "عنوان الملاحظة")}
          value={title}
          maxLength={160}
          onChange={(e) => rename(e.target.value)}
          onBlur={() => void writer.flush()}
        />
        <span className={`save-state ${status}`} role="status">
          {status === "saved"
            ? t("Saved", "محفوظ")
            : status === "saving"
              ? t("Saving…", "جارٍ الحفظ…")
              : status === "error"
                ? t("Not saved", "غير محفوظ")
                : t("Unsaved changes", "تغييرات غير محفوظة")}
        </span>
      </div>
      <div
        className="editor-toolbar"
        role="toolbar"
        aria-label={t("Text formatting", "تنسيق النص")}
      >
        <button
          className="icon-button"
          aria-label={t("Bold", "عريض")}
          aria-pressed={editor?.isActive("bold") ?? false}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold size={16} />
        </button>
        <button
          className="icon-button"
          aria-label={t("Italic", "مائل")}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} />
        </button>
        <button
          className="icon-button"
          aria-label={t("Underline", "تسطير")}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <Underline size={16} />
        </button>
        <button
          className="icon-button"
          aria-label={t("Heading", "عنوان")}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <Heading2 size={17} />
        </button>
        <button
          className="icon-button"
          aria-label={t("Bullet list", "قائمة نقطية")}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List size={17} />
        </button>
        <button
          className="icon-button"
          aria-label={t("Quote", "اقتباس")}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={17} />
        </button>
        <button
          className="icon-button"
          aria-label={t("Code block", "كتلة كود")}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        >
          <Code size={17} />
        </button>
        <button
          className="icon-button"
          aria-label={t("Link", "رابط")}
          onClick={() => setLinkOpen(!linkOpen)}
        >
          <Link size={17} />
        </button>
        <button
          className="secondary"
          onClick={() => editor?.chain().focus().toggleTaskList().run()}
        >
          {t("Checklist", "قائمة مهام")}
        </button>
        <button
          className="secondary"
          onClick={() =>
            editor
              ?.chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          {t("Table", "جدول")}
        </button>
        {editor?.isActive("table") && (
          <>
            <button
              className="text-button"
              onClick={() => editor.chain().focus().addRowAfter().run()}
            >
              {t("Add row", "إضافة صف")}
            </button>
            <button
              className="text-button"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
              {t("Add column", "إضافة عمود")}
            </button>
            <button
              className="text-button"
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              {t("Delete table", "حذف الجدول")}
            </button>
          </>
        )}
        <button
          className="secondary"
          onClick={() => editor?.chain().focus().toggleHighlight().run()}
        >
          {t("Highlight", "تمييز")}
        </button>
        <label>
          {t("Text color", "لون النص")}
          <input
            type="color"
            aria-label={t("Text color", "لون النص")}
            defaultValue="#216348"
            onChange={(e) =>
              editor?.chain().focus().setColor(e.target.value).run()
            }
          />
        </label>
        <button
          className="secondary"
          aria-pressed={drawingOpen}
          onClick={() => setDrawingOpen(!drawingOpen)}
        >
          {t("Drawing / stylus", "رسم / قلم")}
        </button>
        <button
          className="secondary"
          aria-pressed={mapOpen}
          onClick={() => setMapOpen(!mapOpen)}
        >
          {t("Mind map view", "عرض الخريطة الذهنية")}
        </button>
        <button
          className="secondary"
          onClick={() => {
            setInsertKind("math");
            setInsertValue("");
          }}
        >
          {t("Math / LaTeX", "معادلة / LaTeX")}
        </button>
        <button
          className="secondary"
          onClick={() => {
            setInsertKind("image");
            setInsertValue("");
          }}
        >
          {t("Study image", "صورة دراسية")}
        </button>
      </div>
      {insertKind && (
        <form
          className="link-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (insertKind === "math")
              editor
                ?.chain()
                .focus()
                .insertInlineMath({ latex: insertValue })
                .run();
            else if (
              /^\/api\/materials\/[a-f0-9-]{36}\/file$/.test(insertValue)
            )
              editor
                ?.chain()
                .focus()
                .setImage({
                  src: insertValue,
                  alt: t("Study image", "صورة دراسية"),
                })
                .run();
            else {
              setError(
                t(
                  "Use a private study image URL: /api/materials/ID/file",
                  "استخدم رابط صورة دراسية خاصة: /api/materials/ID/file",
                ),
              );
              return;
            }
            setInsertKind(null);
          }}
        >
          <label>
            {insertKind === "math"
              ? t("LaTeX expression", "صيغة LaTeX")
              : t("Uploaded study image", "صورة دراسية مرفوعة")}
            {insertKind === "math" ? (
              <input
                required
                maxLength={2000}
                value={insertValue}
                onChange={(e) => setInsertValue(e.target.value)}
              />
            ) : (
              <select
                required
                value={insertValue}
                onChange={(e) => setInsertValue(e.target.value)}
              >
                <option value="">
                  {t("Choose an uploaded image", "اختر صورة مرفوعة")}
                </option>
                {images.map((m) => (
                  <option key={m.id} value={`/api/materials/${m.id}/file`}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          <button className="secondary">{t("Insert", "إدراج")}</button>
          <button
            type="button"
            className="text-button"
            onClick={() => setInsertKind(null)}
          >
            {t("Cancel", "إلغاء")}
          </button>
        </form>
      )}
      {linkOpen && (
        <form
          className="link-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (editor) {
              editor
                .chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href: link })
                .run();
              setLinkOpen(false);
              setLink("");
            }
          }}
        >
          <input
            aria-label={t("Link URL", "عنوان الرابط")}
            type="url"
            required
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://"
          />
          <button className="secondary">{t("Apply", "تطبيق")}</button>
        </form>
      )}
      {drawingOpen && (
        <NoteDrawing
          courseId={courseId}
          language={language}
          onInsert={(url) => {
            editor?.chain().focus().setImage({ src: url }).run();
            setDrawingOpen(false);
          }}
        />
      )}
      {mapOpen && editor && (
        <MindMap doc={editor.getJSON()} language={language} />
      )}
      <EditorContent editor={editor} onBlur={() => void writer.flush()} />
      {error && (
        <div className="error-box" role="alert">
          {error}
          <div className="error-actions">
            <button className="secondary" onClick={() => void writer.flush()}>
              {t("Retry save", "إعادة الحفظ")}
            </button>
            <button
              className="secondary"
              onClick={() => {
                if (
                  window.confirm(
                    t(
                      "Discard local changes and reload the saved note?",
                      "هل تريد تجاهل التغييرات المحلية وإعادة تحميل الملاحظة المحفوظة؟",
                    ),
                  )
                )
                  onReload();
              }}
            >
              {t("Reload saved note", "تحميل الملاحظة المحفوظة")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
