export function answerMap(value: string): Record<string, string> {
  try {
    const v = JSON.parse(value);
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      Object.values(v).every((s) => typeof s === "string")
    )
      return Object.assign(Object.create(null), v) as Record<string, string>;
  } catch {
    /* Non-matching answers are plain text. */
  }
  return Object.create(null) as Record<string, string>;
}
export function displayAnswer(value: string) {
  const pairs = answerMap(value);
  return Object.keys(pairs).length
    ? Object.entries(pairs)
        .map(([left, right]) => `${left} → ${right}`)
        .join("\n")
    : value;
}
