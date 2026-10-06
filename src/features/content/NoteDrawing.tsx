import { useEffect, useRef, useState } from "react";
import { uploadFile } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
export function NoteDrawing({
  courseId,
  language,
  onInsert,
}: {
  courseId: string;
  language: "ar" | "en";
  onInsert: (url: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false),
    [color, setColor] = useState("#216348"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const t = (e: string, a: string) => (language === "ar" ? a : e);
  useEffect(() => {
    const c = ref.current,
      g = c?.getContext("2d");
    if (c && g) {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, c.width, c.height);
    }
  }, []);
  function xy(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = e.currentTarget,
      b = c.getBoundingClientRect();
    return {
      x: ((e.clientX - b.left) / b.width) * c.width,
      y: ((e.clientY - b.top) / b.height) * c.height,
    };
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const blob = await new Promise<Blob>((r, j) =>
          ref.current!.toBlob(
            (b) => (b ? r(b) : j(new Error("Drawing could not be saved."))),
            "image/png",
          ),
        ),
        body = new FormData();
      body.append("file", blob, "note-drawing.png");
      const material = await uploadFile<{ id: string }>(
        `/courses/${courseId}/materials`,
        body,
      );
      onInsert(`/api/materials/${material.id}/file`);
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="note-drawing">
      <p>
        {t(
          "Draw with a mouse, touch or stylus, then insert the saved image into your note.",
          "ارسم بالفأرة أو اللمس أو القلم، ثم أدرج الصورة المحفوظة في الملاحظة.",
        )}
      </p>
      <canvas
        ref={ref}
        width={800}
        height={400}
        aria-label={t("Note drawing canvas", "لوحة رسم الملاحظة")}
        onPointerDown={(e) => {
          if (busy) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const g = e.currentTarget.getContext("2d"),
            p = xy(e);
          g?.beginPath();
          g?.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const g = e.currentTarget.getContext("2d"),
            p = xy(e);
          if (g) {
            g.strokeStyle = color;
            g.lineWidth =
              e.pointerType === "pen" ? Math.max(1, e.pressure * 7) : 3;
            g.lineCap = "round";
            g.lineTo(p.x, p.y);
            g.stroke();
          }
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
      <div className="button-row">
        <input
          type="color"
          value={color}
          aria-label={t("Pen color", "لون القلم")}
          onChange={(e) => setColor(e.target.value)}
        />
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            const c = ref.current,
              g = c?.getContext("2d");
            if (g && c) {
              g.fillStyle = "#ffffff";
              g.fillRect(0, 0, c.width, c.height);
            }
          }}
        >
          {t("Clear drawing", "مسح الرسم")}
        </button>
        <button className="primary" disabled={busy} onClick={() => void save()}>
          {t("Save drawing in note", "حفظ الرسم في الملاحظة")}
        </button>
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>
  );
}
