/**
 * Formats a mark for display: "17 / 20 (85%)" when the assignment's max is known,
 * or just the raw score when it is not. The percentage is clamped to 100 because
 * grading allows an assignment's max_marks to be LOWERED after a mark is awarded,
 * which would otherwise print an above-100% ratio (the report-card average applies
 * the same per-item clamp).
 */
export function formatMark(score: number, maxMarks: number | null | undefined): string {
  if (maxMarks == null || maxMarks <= 0) return `${score}`
  const pct = Math.round((Math.min(score, maxMarks) / maxMarks) * 100)
  return `${score} / ${maxMarks} (${pct}%)`
}
