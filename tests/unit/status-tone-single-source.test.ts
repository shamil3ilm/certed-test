import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * A status's COLOUR is decided in one place, not at each render site.
 *
 * The same mapping written at each site does not stay the same. It had already drifted:
 * `late` was amber for an attendance mark and red for a submission, and the student detail
 * page renders both lists - so one page carried two "Late" badges in different colours, a
 * few rows apart, with nothing to explain the difference. The account-status mapping was
 * copied byte-for-byte under two names (`statusChipTone`, `statusTone`), and the second of
 * those names collided with a THIRD `statusTone` that meant attendance.
 *
 * None of that is visible at any single call site, which is why review does not catch it
 * and a gate has to. Tones live in src/lib/ui/labels.tsx; screens call the helper.
 */

const ROOTS = ['src/app']

/**
 * The status VALUES that have a shared meaning across screens, and so a shared colour.
 *
 * Scoped deliberately. A one-off emphasis choice - `pending > 0 ? 'primary'`, a conversation
 * that is a group, an attendance percentage under 50 - is a decision belonging to that
 * screen, and flagging those would bury the real finding and get the gate turned off. What
 * is governed here is a value from a fixed domain that other screens also render.
 */
const SHARED_STATUS = /=== '(present|absent|late|active|pending)'/

/** A ternary that picks a Badge tone from one of those statuses - the inlined mapping. */
const INLINE_TONE = new RegExp(`${SHARED_STATUS.source}[\\s\\S]*?\\?\\s*'(success|warning|danger|primary|slate)'`)

/** A local function whose body returns Badge tones - the shape of a copied helper. */
const LOCAL_TONE_FN = /function\s+\w*[Tt]one\w*\s*\([^)]*\)\s*:\s*'(success|warning|danger|primary|slate)'/

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

function offenders(pattern: RegExp): string[] {
  const found: string[] = []
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const rel = relative('.', file).split(sep).join('/')
      const text = readFileSync(file, 'utf8')
      text.split('\n').forEach((line, i) => {
        if (pattern.test(line)) found.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`)
      })
    }
  }
  return found
}

describe('status tones have a single source', () => {
  it('the scan reaches real files, so an empty result means what it says', () => {
    expect(walk('src/app').length).toBeGreaterThan(20)
    expect(INLINE_TONE.test("tone={s === 'late' ? 'warning' : 'danger'}")).toBe(true)
    expect(LOCAL_TONE_FN.test("function statusTone(s: string): 'success' | 'warning' {")).toBe(true)
    // The helpers this gate points people at must exist to be pointed at.
    const labels = readFileSync('src/lib/ui/labels.tsx', 'utf8')
    for (const fn of ['profileStatusTone', 'attendanceTone', 'submissionTone', 'submissionLabel']) {
      expect(labels, `${fn} is missing from labels.tsx`).toContain(`export function ${fn}`)
    }
  })

  it('no screen maps a status to a tone inline', () => {
    expect(
      offenders(INLINE_TONE),
      'Use profileStatusTone / attendanceTone / submissionTone from @/lib/ui instead. A tone ' +
        'chosen at the render site is a mapping that only agrees with the others by luck.',
    ).toEqual([])
  })

  it('no screen defines its own tone helper', () => {
    expect(
      offenders(LOCAL_TONE_FN),
      'A local *Tone helper is the copy that drifts, and its name is free to collide with a ' +
        'helper meaning something else. Add it to src/lib/ui/labels.tsx and import it.',
    ).toEqual([])
  })
})
