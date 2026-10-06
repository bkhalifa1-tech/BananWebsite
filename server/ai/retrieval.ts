/** Bounded lexical retrieval; passages retain source/page labels for citations. */
export function retrieveStudyText(
  text: string,
  query: string,
  maxChars = 12000,
) {
  const terms = Array.from(
    new Set(
      (
        query
          .normalize("NFKC")
          .toLowerCase()
          .match(/[\p{L}\p{N}]{2,}/gu) || []
      ).slice(0, 40),
    ),
  );
  const blocks = text.split(/(?=\[Page \d+\]|\[Source:)/).flatMap((block) => {
    const label = block.match(/^\[(?:Page \d+|Source:[^\]]+)\]/)?.[0] || "";
    const result: string[] = [];
    for (let i = 0; i < block.length; i += 1600)
      result.push(`${label}\n${block.slice(i, i + 1800)}`);
    return result;
  });
  const scored = blocks
    .map((body, index) => {
      const lower = body.toLowerCase();
      return {
        body,
        index,
        score: terms.reduce((n, t) => n + (lower.includes(t) ? 1 : 0), 0),
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = scored
    .slice(0, 6)
    .sort((a, b) => a.index - b.index)
    .map((b) => b.body)
    .join("\n\n")
    .slice(0, maxChars);
  return {
    text: selected,
    truncated: selected.length < text.length,
    matched: scored.some((s) => s.score > 0),
  };
}
