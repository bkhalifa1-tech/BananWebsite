import { useRef, useState, type ReactNode } from "react";
export function SplitPane({
  first,
  second,
  label,
  direction,
}: {
  first: ReactNode;
  second: ReactNode;
  label: string;
  direction: "rtl" | "ltr";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(50);
  return (
    <div
      ref={ref}
      className="split-pane"
      style={{
        gridTemplateColumns: `minmax(0,${ratio}fr) 10px minmax(0,${100 - ratio}fr)`,
      }}
    >
      <div>{first}</div>
      <div
        className="split-handle"
        role="separator"
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={25}
        aria-valuemax={75}
        aria-valuenow={Math.round(ratio)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const step =
              (e.key === "ArrowRight" ? 3 : -3) *
              (direction === "rtl" ? -1 : 1);
            setRatio((r) => Math.max(25, Math.min(75, r + step)));
          }
        }}
        onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId) && ref.current) {
            const rect = ref.current.getBoundingClientRect();
            const percent = ((e.clientX - rect.left) / rect.width) * 100;
            setRatio(
              Math.max(
                25,
                Math.min(75, direction === "rtl" ? 100 - percent : percent),
              ),
            );
          }
        }}
      >
        <span />
      </div>
      <div>{second}</div>
    </div>
  );
}
