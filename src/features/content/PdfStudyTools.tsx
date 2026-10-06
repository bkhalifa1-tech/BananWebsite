import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import type { Annotation, Point, Rect } from "../../lib/learning";
export function PdfStudyTools({
  materialId,
  page,
  language,
  onPage,
  children,
  onSelection,
}: {
  materialId: string;
  page: number;
  language: "ar" | "en";
  onPage: (page: number) => void;
  children: ReactNode;
  onSelection: (text: string) => void;
}) {
  const t = (e: string, a: string) => (language === "ar" ? a : e),
    ref = useRef<HTMLDivElement>(null),
    stroke = useRef<Point[]>([]);
  const [items, setItems] = useState<Annotation[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [color, setColor] = useState("#e9c846"),
    [pen, setPen] = useState(false),
    [points, setPoints] = useState<Point[]>([]),
    [selection, setSelection] = useState<{
      text: string;
      rects: Rect[];
    } | null>(null),
    [comment, setComment] = useState("");
  const refresh = useCallback(async () => {
    try {
      setItems(await api(`/materials/${materialId}/annotations`));
      setError("");
    } catch (e) {
      setError(errorMessage(e, language));
    }
  }, [materialId, language]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function save(kind: Annotation["kind"], drawing: Point[] = []) {
    setBusy(true);
    setError("");
    try {
      await api(`/materials/${materialId}/annotations`, "POST", {
        page,
        kind,
        color,
        text: selection?.text || "",
        comment,
        rects:
          kind === "highlight" || kind === "underline"
            ? selection?.rects || []
            : [],
        points: drawing,
      });
      setComment("");
      setSelection(null);
      setPoints([]);
      await refresh();
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  }
  function capture() {
    const s = window.getSelection(),
      el = ref.current?.querySelector(".react-pdf__Page");
    if (
      !s ||
      !s.rangeCount ||
      !el ||
      !el.contains(s.anchorNode) ||
      !el.contains(s.focusNode) ||
      !s.toString().trim()
    )
      return;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return;
    const rects = Array.from(s.getRangeAt(0).getClientRects())
      .map((r) => {
        const x = Math.max(0, (r.left - b.left) / b.width),
          y = Math.max(0, (r.top - b.top) / b.height);
        return {
          x,
          y,
          width: Math.max(0, Math.min(1 - x, r.width / b.width)),
          height: Math.max(0, Math.min(1 - y, r.height / b.height)),
        };
      })
      .filter((r) => r.width > 0 && r.height > 0)
      .slice(0, 200);
    const text = s.toString().slice(0, 4000);
    setSelection({ text, rects });
    onSelection(text);
  }
  function point(e: React.PointerEvent<SVGSVGElement>) {
    const b = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
      y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
    };
  }
  const current = items.filter((a) => a.page === page);
  return (
    <section className="pdf-study-tools">
      <div className="reader-controls">
        <input
          type="color"
          value={color}
          aria-label={t("Annotation color", "لون التعليق")}
          onChange={(e) => setColor(e.target.value)}
        />
        <button
          className="secondary"
          disabled={busy || !selection}
          onClick={() => void save("highlight")}
        >
          {t("Highlight selection", "تمييز المحدد")}
        </button>
        <button
          className="secondary"
          disabled={busy || !selection}
          onClick={() => void save("underline")}
        >
          {t("Underline selection", "تسطير المحدد")}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void save("bookmark")}
        >
          {t("Bookmark page", "إشارة للصفحة")}
        </button>
        <button
          className={pen ? "primary" : "secondary"}
          disabled={busy}
          aria-pressed={pen}
          onClick={() => setPen(!pen)}
        >
          {t("Pen / stylus", "قلم / رسم")}
        </button>
      </div>
      {selection && (
        <p className="field-hint">{selection.text.slice(0, 180)}</p>
      )}
      <div ref={ref} className="pdf-annotation-stage" onPointerUp={capture}>
        {children}
        <svg
          className={`pdf-overlay ${pen ? "drawing" : ""}`}
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          aria-label={t("PDF annotations", "تعليقات PDF")}
          onPointerDown={(e) => {
            if (!pen || busy) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            stroke.current = [point(e)];
            setPoints([...stroke.current]);
          }}
          onPointerMove={(e) => {
            if (
              !pen ||
              !e.currentTarget.hasPointerCapture(e.pointerId) ||
              stroke.current.length >= 1500
            )
              return;
            stroke.current.push(point(e));
            setPoints([...stroke.current]);
          }}
          onPointerCancel={() => {
            stroke.current = [];
            setPoints([]);
          }}
          onPointerUp={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            e.currentTarget.releasePointerCapture(e.pointerId);
            const p = stroke.current;
            stroke.current = [];
            if (p.length >= 2) void save("drawing", p);
            else setPoints([]);
          }}
        >
          {current.map((a) => (
            <g key={a.id}>
              {a.rects.map((r, i) =>
                a.kind === "underline" ? (
                  <line
                    key={i}
                    x1={r.x * 1000}
                    x2={(r.x + r.width) * 1000}
                    y1={(r.y + r.height) * 1000}
                    y2={(r.y + r.height) * 1000}
                    stroke={a.color}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : (
                  <rect
                    key={i}
                    x={r.x * 1000}
                    y={r.y * 1000}
                    width={r.width * 1000}
                    height={r.height * 1000}
                    fill={a.color}
                    opacity={0.32}
                  />
                ),
              )}
              {a.points.length > 0 && (
                <polyline
                  points={a.points
                    .map((p) => `${p.x * 1000},${p.y * 1000}`)
                    .join(" ")}
                  stroke={a.color}
                  fill="none"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          ))}
          {points.length > 0 && (
            <polyline
              points={points
                .map((p) => `${p.x * 1000},${p.y * 1000}`)
                .join(" ")}
              stroke={color}
              fill="none"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>
      <form
        className="link-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save("comment");
        }}
      >
        <input
          aria-label={t("Page comment", "تعليق الصفحة")}
          value={comment}
          maxLength={4000}
          placeholder={t("Add a page comment…", "أضف تعليقًا على الصفحة…")}
          onChange={(e) => setComment(e.target.value)}
          required
        />
        <button className="secondary" disabled={busy}>
          {t("Save comment", "حفظ التعليق")}
        </button>
      </form>
      {error && (
        <p role="alert" className="error-box">
          {error}
          <button className="text-button" onClick={() => void refresh()}>
            {t("Retry", "إعادة المحاولة")}
          </button>
        </p>
      )}
      {!items.length && (
        <p className="empty-copy">
          {t(
            "Select text to highlight it, draw with the pen, or bookmark this page.",
            "حدد نصًا لتمييزه، أو ارسم بالقلم، أو احفظ إشارة لهذه الصفحة.",
          )}
        </p>
      )}
      <div className="annotation-list">
        {items.map((a) => (
          <article key={a.id}>
            <button className="text-button" onClick={() => onPage(a.page)}>
              {t("Page", "صفحة")} {a.page} ·{" "}
              {
                {
                  highlight: t("Highlight", "تمييز"),
                  underline: t("Underline", "تسطير"),
                  drawing: t("Drawing", "رسم"),
                  bookmark: t("Bookmark", "إشارة"),
                  comment: t("Comment", "تعليق"),
                }[a.kind]
              }
            </button>
            <p>{a.comment || a.text}</p>
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/annotations/${a.id}`, "DELETE");
                  await refresh();
                } catch (e) {
                  setError(errorMessage(e, language));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Delete", "حذف")}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
