import { useEffect, useState, useMemo, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
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
  language,
  onReload,
}: {
  note: NoteRecord;
  language: "ar" | "en";
  onReload: () => void;
}) {
  const t = (e: string, a: string) => (language === "ar" ? a : e);
  const [title, setTitle] = useState(note.title),
    [status, setStatus] = useState("saved"),
    [error, setError] = useState(""),
    [link, setLink] = useState(""),
    [linkOpen, setLinkOpen] = useState(false);
  const titleRef = useRef(note.title);
  const writer = useMemo(
    () =>
      new NoteAutosave(note, (snapshot, version) =>
        api<NoteRecord>(`/notes/${note.id}`, "PATCH", { ...snapshot, version }),
      ),
    [note],
  );
  const editor = useEditor(
    {
      extensions: [StarterKit],
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
      </div>
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
