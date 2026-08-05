type GradeLike = { score: number; maxMarks: number | null | undefined }

/** A mark's percentage, or null when there is no positive maximum. Clamped so a
 * later lowered max_marks never yields an above-100% percentage. */
export function markPercent(score: number, maxMarks: number | null | undefined): number | null {
  if (maxMarks == null || maxMarks <= 0) return null
  return Math.round((Math.min(score, maxMarks) / maxMarks) * 100)
}

/** Points-weighted percentage (earned / possible x 100) over items with a
 * positive maximum. Returns null when none of the items can yield a percentage. */
export function weightedAveragePercent(marks: GradeLike[]): number | null {
  const weightable = marks.filter((mark) => mark.maxMarks != null && mark.maxMarks > 0)
  if (weightable.length === 0) return null
  const earned = weightable.reduce((sum, mark) => sum + Math.min(mark.score, mark.maxMarks as number), 0)
  const possible = weightable.reduce((sum, mark) => sum + (mark.maxMarks as number), 0)
  return possible > 0 ? (earned / possible) * 100 : null
}

/**
 * Formats a mark for display: "17 / 20 (85%)" when the assignment's max is known,
 * or just the raw score when it is not.
 */
export function formatMark(score: number, maxMarks: number | null | undefined): string {
  const pct = markPercent(score, maxMarks)
  if (pct == null) return `${score}`
  return `${score} / ${maxMarks} (${pct}%)`
}
