export type Mark = { weight: number; total: number; score: number | null };
export type GradeScale = {
  scale: "4" | "4.3" | "100" | "custom";
  max: number;
  rules: { min: number; points: number }[];
};
export type GradeSummary = {
  current: number | null;
  gradedWeight: number;
  totalWeight: number;
  earnedContribution: number;
};
export function gradeSummary(marks: Mark[]): GradeSummary {
  let numerator = 0,
    gradedWeight = 0,
    totalWeight = 0;
  for (const m of marks) {
    totalWeight += m.weight;
    if (m.score !== null && m.total > 0) {
      gradedWeight += m.weight;
      numerator += (m.score / m.total) * m.weight;
    }
  }
  return {
    current: gradedWeight > 0 ? (numerator / gradedWeight) * 100 : null,
    gradedWeight,
    totalWeight,
    earnedContribution: numerator,
  };
}
const four = [
  { min: 90, points: 4 },
  { min: 80, points: 3 },
  { min: 70, points: 2 },
  { min: 60, points: 1 },
  { min: 0, points: 0 },
];
const fourThree = [
  { min: 97, points: 4.3 },
  { min: 93, points: 4 },
  { min: 90, points: 3.7 },
  { min: 87, points: 3.3 },
  { min: 83, points: 3 },
  { min: 80, points: 2.7 },
  { min: 77, points: 2.3 },
  { min: 73, points: 2 },
  { min: 70, points: 1.7 },
  { min: 67, points: 1.3 },
  { min: 63, points: 1 },
  { min: 60, points: 0.7 },
  { min: 0, points: 0 },
];
export function gradePoints(percent: number, scale: GradeScale) {
  if (scale.scale === "100") return percent;
  const rules =
    scale.scale === "4"
      ? four
      : scale.scale === "4.3"
        ? fourThree
        : scale.rules;
  return (
    [...rules].sort((a, b) => b.min - a.min).find((r) => percent >= r.min)
      ?.points ?? 0
  );
}
export function weightedGpa(
  courses: { credits: number; grade: number | null }[],
  scale: GradeScale,
) {
  let credits = 0,
    total = 0;
  for (const c of courses)
    if (c.grade !== null && c.credits > 0) {
      credits += c.credits;
      total += c.credits * gradePoints(c.grade, scale);
    }
  return { value: credits ? total / credits : null, credits };
}
