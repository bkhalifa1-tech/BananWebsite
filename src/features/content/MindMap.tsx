import { useRef } from "react";
import type { JSONContent } from "@tiptap/react";
function text(n: JSONContent): string {
  return n.text || n.content?.map(text).join(" ") || "";
}
export function MindMap({
  doc,
  language,
}: {
  doc: JSONContent;
  language: "ar" | "en";
}) {
  const ref = useRef<SVGSVGElement>(null),
    center = doc.content?.find((n) => n.type === "heading"),
    list = doc.content?.find(
      (n) => n.type === "bulletList" || n.type === "orderedList",
    ),
    nodes = (list?.content || []).slice(0, 12),
    t = (e: string, a: string) => (language === "ar" ? a : e);
  return (
    <section className="mind-map">
      <p className="field-hint">
        {t(
          "The first heading is the central idea; the first list supplies branches. Edit the note to update this map.",
          "العنوان الأول هو الفكرة المركزية، والقائمة الأولى هي الفروع. عدّل الملاحظة لتحديث الخريطة.",
        )}
      </p>
      {!nodes.length ? (
        <p>
          {t(
            "Add a heading and a list to build a mind map.",
            "أضف عنوانًا وقائمة لإنشاء خريطة ذهنية.",
          )}
        </p>
      ) : (
        <>
          <svg
            ref={ref}
            viewBox="0 0 800 500"
            role="img"
            aria-label={t("Mind map", "الخريطة الذهنية")}
          >
            <rect width="800" height="500" fill="#f6f8f3" />
            {nodes.map((n, i) => {
              const angle = (i / nodes.length) * Math.PI * 2,
                x = 400 + Math.cos(angle) * 260,
                y = 250 + Math.sin(angle) * 180,
                label = text(n.content?.[0] || n);
              return (
                <g key={i}>
                  <line
                    x1={400}
                    y1={250}
                    x2={x}
                    y2={y}
                    stroke="#8ba692"
                    strokeWidth={2}
                  />
                  <rect
                    x={x - 95}
                    y={y - 25}
                    width={190}
                    height={50}
                    rx={15}
                    fill="#e2ebdf"
                  />
                  <text
                    x={x}
                    y={y + 5}
                    textAnchor="middle"
                    fill="#173e2d"
                    fontSize={14}
                  >
                    {label.slice(0, 27)}
                    {label.length > 27 ? "…" : ""}
                  </text>
                </g>
              );
            })}
            <rect
              x={295}
              y={215}
              width={210}
              height={70}
              rx={22}
              fill="#216348"
            />
            <text
              x={400}
              y={255}
              textAnchor="middle"
              fill="white"
              fontSize={17}
            >
              {text(center || {}).slice(0, 24) ||
                t("Central idea", "الفكرة المركزية")}
            </text>
          </svg>
          <button
            className="secondary"
            onClick={() => {
              const url = URL.createObjectURL(
                  new Blob([ref.current!.outerHTML], { type: "image/svg+xml" }),
                ),
                a = document.createElement("a");
              a.href = url;
              a.download = "mind-map.svg";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {t("Download mind map", "تنزيل الخريطة الذهنية")}
          </button>
        </>
      )}
    </section>
  );
}
