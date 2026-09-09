import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Text a reader is meant to READ must be dark enough to read.
 *
 * On white, `text-slate-300` is 1.48:1 and `text-slate-400` is 2.56:1 - both under the 4.5:1
 * floor, and slate-300 so far under it that the words are present in the DOM and absent from
 * the page. That is how a section's item count, a "no email" fallback and an empty-cell dash
 * came to be invisible: each looked like a reasonable "muted" choice at its own call site,
 * and nothing compared them against the 366 places that use `text-slate-600` for the same
 * intent.
 *
 * Two uses are legitimate and stay allowed, because the rule is about READING:
 *  - an ICON or decoration, which carries no words;
 *  - a `placeholder:` colour, which is a hint inside a field that has its own label.
 * A file rendering on a DARK surface is exempt by allowlist, with the surface named.
 */

const ROOTS = ['src/app', 'src/lib']

/** Faint tones and what they measure against white, for the failure message. */
const FAINT: Record<string, string> = {
  'text-slate-300': '1.48:1',
  'text-slate-400': '2.56:1',
}

/** Uses that carry no words, so contrast does not apply. */
const DECORATIVE = /svg|stroke|fill=|h-\d w-\d|icon|chevron|placeholder:|aria-hidden/i

/** Files whose content sits on a dark surface, with the surface named. */
const ON_DARK: Record<string, string> = {
  'src/app/components/Footer.tsx':
    'The footer is bg-primary (#124d7e) with text-slate-100 - these tones are LIGHT text on a ' +
    'dark ground, which is the inverse of the case this gate is about.',
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.tsx$/.test(entry.name) && !/\.(test|spec)\.tsx$/.test(entry.name)) out.push(full)
  }
  return out
}

function offenders(): string[] {
  const found: string[] = []
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const rel = relative('.', file).split(sep).join('/')
      if (rel in ON_DARK) continue
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const [cls, ratio] of Object.entries(FAINT)) {
            if (!line.includes(cls)) continue
            if (DECORATIVE.test(line)) continue
            found.push(`${rel}:${i + 1}  ${cls} (${ratio}) - ${line.trim().slice(0, 70)}`)
          }
        })
    }
  }
  return found
}

describe('faint text is legible', () => {
  it('the scan reaches real files and the pattern still matches', () => {
    expect(walk('src/app').length).toBeGreaterThan(20)
    expect(DECORATIVE.test('<svg className="h-4 w-4 text-slate-300" />')).toBe(true)
    expect(DECORATIVE.test('<span className="text-slate-300">no email</span>')).toBe(false)
  })

  it('no readable text uses a tone below the contrast floor', () => {
    expect(
      offenders(),
      'Use text-slate-500 (4.76:1) for a muted value or text-slate-600 (7.58:1) for ordinary ' +
        'secondary text. If the element carries no words, or sits on a dark surface, say which ' +
        'in DECORATIVE / ON_DARK rather than lightening the text.',
    ).toEqual([])
  })

  it('every dark-surface exemption names its surface', () => {
    const weak = Object.entries(ON_DARK)
      .filter(([, why]) => !/bg-|dark|surface/i.test(why) || why.length < 40)
      .map(([f]) => f)
    expect(weak, 'name the background these sit on, so the exemption can be checked').toEqual([])
  })
})
