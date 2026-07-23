/**
 * Expand recurring weekly timetable slots into absolute UTC instants across a range.
 *
 * Each slot carries a WALL-CLOCK start/end time and a day_of_week, anchored to the
 * institute timezone (`anchorTz`, from org_settings.timezone). For every calendar day in
 * [rangeStartIso, rangeEndIso) whose weekday matches, we compute the exact UTC instant for
 * that wall-clock time IN THE ANCHOR ZONE (DST-aware), so the produced `startIso`/`endIso`
 * point at the correct real-world moment regardless of any later display timezone.
 */
export type ExpandableSlot = {
  id: string
  day_of_week: number // 0=Sun .. 6=Sat
  start_time: string // "HH:mm" or "HH:mm:ss"
  end_time: string
}

export type SlotOccurrence = {
  slotId: string
  startIso: string // absolute UTC instant
  endIso: string // absolute UTC instant
}

const DAY_MS = 24 * 60 * 60 * 1000

// Parse "HH:mm[:ss]" -> { h, m }.
function parseHm(t: string): { h: number; m: number } {
  const [h, m] = t.split(':')
  return { h: Number(h), m: Number(m) }
}

// Offset (ms) of `tz` from UTC at a given instant: how much later local wall clock is vs UTC.
// Uses Intl to read the zoned wall-clock fields back, which is DST-correct.
function tzOffsetMs(instantMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(instantMs))
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUTC - instantMs
}

// Absolute UTC ms for a wall-clock Y-M-D H:M in `tz` (DST-correct, two-pass fixpoint).
function zonedWallClockToUtcMs(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi, 0)
  let guess = naiveUtc - tzOffsetMs(naiveUtc, tz)
  // refine once more in case the first guess landed on the wrong side of a DST transition
  guess = naiveUtc - tzOffsetMs(guess, tz)
  return guess
}

// Y/M/D weekday (0=Sun) of an instant interpreted in `tz`.
function zonedYmdWeekday(instantMs: number, tz: string): { y: number; mo: number; d: number; wd: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(instantMs))
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { y: Number(get('year')), mo: Number(get('month')), d: Number(get('day')), wd: wdMap[get('weekday')] }
}

export function expandSlots(
  slots: ExpandableSlot[],
  rangeStartIso: string,
  rangeEndIso: string,
  anchorTz: string,
): SlotOccurrence[] {
  const startMs = Date.parse(rangeStartIso)
  const endMs = Date.parse(rangeEndIso)
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) throw new Error('invalid range')

  const occ: SlotOccurrence[] = []
  const seen = new Set<string>()
  // Iterate calendar days IN THE ANCHOR ZONE. We sample one instant per 24h hop and read its
  // zoned Y/M/D + weekday - but UTC-midnight maps to the previous local day for west-of-UTC
  // zones, so we pad the scan by a day on each side and keep only occurrences whose absolute
  // instant lands within [startMs, endMs). Dedupe by (slot, instant) guards DST-boundary days.
  for (let cursor = startMs - DAY_MS; cursor < endMs + DAY_MS; cursor += DAY_MS) {
    const { y, mo, d, wd } = zonedYmdWeekday(cursor, anchorTz)
    for (const slot of slots) {
      if (slot.day_of_week !== wd) continue
      const s = parseHm(slot.start_time)
      const e = parseHm(slot.end_time)
      const startInstant = zonedWallClockToUtcMs(y, mo, d, s.h, s.m, anchorTz)
      const endInstant = zonedWallClockToUtcMs(y, mo, d, e.h, e.m, anchorTz)
      if (startInstant < startMs || startInstant >= endMs) continue
      const key = `${slot.id}@${startInstant}`
      if (seen.has(key)) continue
      seen.add(key)
      occ.push({
        slotId: slot.id,
        startIso: new Date(startInstant).toISOString(),
        endIso: new Date(endInstant).toISOString(),
      })
    }
  }
  occ.sort((a, b) => a.startIso.localeCompare(b.startIso))
  return occ
}
