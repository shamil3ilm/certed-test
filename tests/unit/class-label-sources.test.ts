import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Screens name a class from its LIVE student and subject, never from its stored name.
 *
 * A class's stored `name` is a "Student - Subject" string written once, when the class is
 * created, and nothing rewrites it - not a student's rename, not a subject set later. A screen
 * printing it prints a snapshot, and prints the student twice wherever the page has already
 * named them. That was true of the report card handed to parents, the Grading landing, a
 * student's detail page, the mentor dashboard and every class picker, each built on its own
 * copy of the same `[c.id, c.name]` map.
 *
 * Labels come from src/lib/services/classes/class-labels.ts. This gate keeps them there: it
 * refuses a new label map built from stored class names, and pins the FORM each known screen
 * uses - 'subject' where the page already says whose class it is, 'student-subject' where it
 * does not.
 */

const ROOTS = ['src/app', 'src/lib']

/** `new Map(<something class-ish>.map((x) => [x.id, x.name]))` - a label map from stored names. */
const STORED_NAME_MAP =
  /new Map\(\s*(\w*[Cc]lass\w*)\.map\(\(\s*(\w+)\s*\)\s*=>\s*\[\s*\2\.id\s*,\s*\2\.name\s*\]\s*\)\s*\)/

/** Files that may build one, each with WHY the stored name is right there. */
const ALLOWED_STORED_NAME_MAPS: Record<string, string> = {
  'src/lib/services/teaching-hours.ts':
    'The FALLBACK only: every hours row carries subjectName, and the stored class name stands in ' +
    'solely for a class with no subject set - the same fallback class-labels applies.',
  'src/app/(prt)/meetings/MeetList.tsx':
    'Its `classes` prop is the classList from the class-meet loader, already labelled by ' +
    'withClassLabels upstream - the map here is over resolved labels, not stored names.',
}

/** Screens and the label form each must request. */
const PINNED_MODES: Array<[file: string, mode: 'subject' | 'student-subject', why: string]> = [
  ['src/lib/report-card/data.ts', 'subject', 'the document header already names the student'],
  ['src/lib/services/mentees.ts', 'subject', "one student's own detail page"],
  ['src/lib/services/mentees-dashboard.ts', 'subject', 'every row leads with the mentee'],
  ['src/lib/services/page-data/calendar-page.ts', 'student-subject', 'a picker spanning many students'],
  ['src/lib/services/page-data/class-meet.ts', 'student-subject', 'the meet form shares the calendar picker'],
  ['src/lib/services/page-data/classwork.ts', 'student-subject', 'the forms share the calendar picker'],
  ['src/app/(prt)/dashboard/exam-widget.tsx', 'student-subject', 'exams from many students share one tile'],
  ['src/lib/services/mentor-session-timings.ts', 'subject', 'each row has its own student and subject columns'],
  ['src/lib/services/page-data/grading.ts', 'subject', 'every queue row names its student'],
  ['src/lib/services/resources.ts', 'subject', 'the Documents page groups results under the student'],
  ['src/lib/services/student-relationship-subtitles.ts', 'subject', "the subtitle sits under the student's name"],
]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

const rel = (file: string) => relative('.', file).split(sep).join('/')

describe('class labels come from the live student and subject', () => {
  it('the scan reaches real files and the pattern still matches', () => {
    expect(walk('src/lib').length).toBeGreaterThan(20)
    expect(STORED_NAME_MAP.test('new Map(classes.map((course) => [course.id, course.name]))')).toBe(true)
    // a map over something that is not a class is not this gate's business
    expect(STORED_NAME_MAP.test('new Map(profiles.map((p) => [p.id, p.name]))')).toBe(false)
  })

  it('no screen builds a label map from stored class names', () => {
    const offenders = ROOTS.flatMap((root) => walk(root))
      .filter((file) => !(rel(file) in ALLOWED_STORED_NAME_MAPS))
      .filter((file) => STORED_NAME_MAP.test(readFileSync(file, 'utf8')))
      .map(rel)
    expect(
      offenders,
      'Resolve labels with resolveClassLabels / withClassLabels from ' +
        "src/lib/services/classes/class-labels.ts ('subject' where the page names the student, " +
        "'student-subject' where it does not), or add the file to ALLOWED_STORED_NAME_MAPS with " +
        'the reason the stored name is right there.',
    ).toEqual([])
  })

  it.each(PINNED_MODES)('%s asks for %s labels (%s)', (file, mode) => {
    const source = readFileSync(file, 'utf8')
    const call = new RegExp(`(resolveClassLabels|withClassLabels)\\([^)]*,\\s*'${mode}'`)
    expect(call.test(source), `${file} no longer requests '${mode}' labels`).toBe(true)
  })

  it('the Grading landing titles its cards by subject, not by stored class name', () => {
    const source = readFileSync('src/app/(prt)/grading/page.tsx', 'utf8')
    expect(source).toContain('subjectByClass')
    expect(source).not.toMatch(/name=\{course\.name\}/)
  })

  it('every allowlist entry still has something to allow', () => {
    const stale = Object.keys(ALLOWED_STORED_NAME_MAPS).filter(
      (file) => !STORED_NAME_MAP.test(readFileSync(file, 'utf8')),
    )
    expect(stale, 'These no longer build a stored-name map - delete their entries').toEqual([])
  })
})
