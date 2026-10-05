/** A data-driven chart primitive for later analytics; no example study data is exposed. */
export function BarChart({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number; color?: string }[];
}) {
  const maximum = Math.max(1, ...items.map((item) => item.value));
  return (
    <figure aria-label={title} className="bar-chart">
      <figcaption>{title}</figcaption>
      {items.map((item, index) => (
        <div className="bar-chart-row" key={`${index}:${item.label}`}>
          <span>{item.label}</span>
          <span className="bar-chart-track">
            <span
              style={{
                width: `${(Math.max(0, item.value) / maximum) * 100}%`,
                background: item.color ?? "var(--chart)",
              }}
            />
          </span>
          <output>{item.value}</output>
        </div>
      ))}
    </figure>
  );
}
