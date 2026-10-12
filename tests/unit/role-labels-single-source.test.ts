import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { roleLabel } from '@/lib/ui/labels'

/**
 * No surface shows a user the retired tier name.
 *
 * The words and the stored identifiers deliberately disagree - `admin` reads "Super Admin",
 * `sub_admin` reads "Admin" - so a file that spells a label itself is a file that will one day
 * disagree with the rest of the app. That is exactly what happened before this guard existed:
 * six places restated the wording, and one of them called the TOP tier "Admin" while every
 * other surface called it "Super Admin".
 *
 * Scope, deliberately narrow, and every part of it learned the hard way:
 *
 *   - Only STRING LITERALS are checked, and comments are REMOVED before the scan. A comment may
 *     still say `sub_admin` or "admin/sub-admin", because that is the real identifier and prose
 *     about the stored value is correct. Scanning the comments too flags 12 files on this
 *     codebase, every one of them a docstring describing the stored tier.
 *   - CASE-INSENSITIVE, with the separator REQUIRED. The first version of this pattern wanted a
 *     capital S and sailed straight past a user-visible
 *     `PermissionError('Only an admin or sub-admin may record a session...')`. Requiring a space
 *     or hyphen between "sub" and "admin" is what separates a word someone reads from an
 *     identifier nobody does: it flags "Sub Admin" and "sub-admin", and ignores
 *     `subadmin@mock.test`, `'u-subadmin'` and `sub_admin`.
 *
 * A rule like "only these files may contain the word Students" was tried and flagged 18 files,
 * because "Students" and "Tutors" are ordinary heading words. A guard that cries wolf gets
 * deleted, so this one checks only the retired forms.
 */
const SRC = join(process.cwd(), 'src')

/**
 * Comments are not code, and they have to go FIRST.
 *
 * An apostrophe in ordinary prose - `a student's classes` - opens a run that the literal
 * patterns below follow across newlines and straight into a docstring that correctly says
 * "admin/sub-admin". That is not a label anyone is shown, and a guard that names twelve
 * innocent docstrings is a guard someone deletes.
 *
 * `//` is left alone when a colon precedes it, or every `https://` in a string would truncate
 * its own line and leave the quote before it unbalanced.
 */
const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/.*/g, '')

/**
 * The retired display forms, inside a quoted string.
 *
 * A `'` or `"` literal cannot hold a raw newline, so those two arms refuse to cross one - that
 * bound is what keeps one unbalanced quote from swallowing the rest of the file. A template
 * literal legitimately spans lines, so its arm does not.
 */
const RETIRED_IN_A_STRING = /'[^'\n]*sub[ -]admins?[^'\n]*'|"[^"\n]*sub[ -]admins?[^"\n]*"|`[^`]*sub[ -]admins?[^`]*`/i

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return files(full)
    return /\.(ts|tsx)$/.test(e.name) ? [full] : []
  })

describe('the role names stay distinct', () => {
  // The trap this nearly fell into: MessagingMatrixForm labelled the TOP tier "Admin", so
  // relabelling the second tier to "Admin" would have put the same word on two rows of one
  // matrix, with no way to tell which was which. Two tiers sharing a word is the failure that
  // matters, and it is cheapest to assert at the source.
  it('gives the five roles five different words', () => {
    const words = ['admin', 'sub_admin', 'mentor', 'tutor', 'student'].map((r) => roleLabel(r))
    expect(new Set(words).size).toBe(words.length)
  })
})

describe('the retired tier name is not shown to anyone', () => {
  it('the scan reads files at all (an empty walk would pass vacuously)', () => {
    expect(files(SRC).length).toBeGreaterThan(0)
  })

  it('no string literal under src/ says "Sub Admin"', () => {
    const offenders = files(SRC)
      .filter((f) => RETIRED_IN_A_STRING.test(withoutComments(readFileSync(f, 'utf8'))))
      .map((f) => relative(SRC, f).split(sep).join('/'))
    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `These show a user the retired tier name. The second tier reads "Admin" now, and\n` +
            `lib/ui/labels.tsx is the one file that decides the words:\n` +
            offenders.map((o) => `  - ${o}`).join('\n'),
    ).toEqual([])
  })
})
