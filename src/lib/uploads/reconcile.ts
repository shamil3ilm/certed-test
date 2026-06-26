/** Pure: is a `pending` upload stale (started but never finalized)? */
export function isStalePending(
  createdAtIso: string,
  nowMs: number,
  maxAgeHours = 6,
): boolean {
  const created = Date.parse(createdAtIso)
  if (Number.isNaN(created)) return false
  return nowMs - created > maxAgeHours * 3_600_000
}
