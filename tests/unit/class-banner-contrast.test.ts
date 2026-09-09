import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * A class banner carries WHITE text over a gradient, so the colour it starts from is a
 * legibility decision, not a decorative one.
 *
 * `bg-gradient-to-br` runs top-left to bottom-right, and the title and "Active class"
 * subtitle both sit at the TOP-LEFT - the `from-` end. So the `from-` colour is what the
 * text is actually read against; the `to-` colour is free to be any accent, because no text
 * reaches that corner. `from-secondary` (#50b5e1) put white on light sky at 2.32:1, under
 * even the 3:1 large-text floor, and the subtitle is text-xs at white/80 - worse again.
 *
 * The second rule is about looking DELIBERATE. The palette held both
 * `from-primary to-secondary` and `from-secondary to-primary` - the same two brand colours
 * reversed. Two cards side by side then differ in a way a reader cannot attribute to
 * anything, which reads as a rendering fault rather than variety.
 *
 * axe cannot catch either: it measures a computed background colour, and a gradient has
 * none. So the check lives here, against the source of truth.
 */

const SOURCE = 'src/lib/ui/identity.tsx'

/** Hex for every colour the banner palette may use. Brand values come from globals.css;
 *  the rest are Tailwind's own. A new colour must be added here to be usable, which is
 *  what keeps this gate from being silently bypassed. */
const HEX: Record<string, string> = {
  primary: '#124d7e',
  'primary-strong': '#0f365c',
  secondary: '#50b5e1',
  'secondary-ink': '#15719b',
  'sky-500': '#0ea5e9',
  'violet-500': '#8b5cf6',
  'violet-600': '#7c3aed',
  'emerald-500': '#10b981',
  'emerald-600': '#059669',
  'teal-500': '#14b8a6',
  'teal-600': '#0d9488',
  'rose-600': '#e11d48',
  'indigo-600': '#4f46e5',
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

/** Contrast of a colour against WHITE text. */
function contrastWithWhite(hex: string): number {
  return 1.05 / (relativeLuminance(hex) + 0.05)
}

/** The palette as written in the component, so the test reads the real source. */
function banners(): string[] {
  const source = readFileSync(SOURCE, 'utf8')
  const block = source.match(/const CLASS_BANNERS = \[([\s\S]*?)\]/)
  expect(block, `CLASS_BANNERS not found in ${SOURCE} - has it been renamed?`).not.toBeNull()
  return [...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

function fromColour(banner: string): string {
  const m = banner.match(/from-([a-z0-9-]+)/)
  expect(m, `no from- colour in "${banner}"`).not.toBeNull()
  return m![1]
}

function toColour(banner: string): string {
  const m = banner.match(/to-([a-z0-9-]+)/)
  expect(m, `no to- colour in "${banner}"`).not.toBeNull()
  return m![1]
}

describe('class banner gradients', () => {
  it('has a palette to check', () => {
    // Guards the scanner: a regex that matched nothing would make every assertion below
    // vacuously true.
    expect(banners().length).toBeGreaterThan(1)
  })

  it('every colour used is one this gate knows the hex for', () => {
    const unknown = banners()
      .flatMap((b) => [fromColour(b), toColour(b)])
      .filter((c) => !(c in HEX))
    expect(unknown, `add these to HEX so their contrast can be checked: ${[...new Set(unknown)].join(', ')}`).toEqual(
      [],
    )
  })

  it('starts every gradient from a colour that carries white text at 4.5:1', () => {
    const failures = banners()
      .map((b) => ({ banner: b, colour: fromColour(b) }))
      .map((x) => ({ ...x, ratio: contrastWithWhite(HEX[x.colour]) }))
      .filter((x) => x.ratio < 4.5)
      .map((x) => `${x.banner} - white on ${x.colour} is ${x.ratio.toFixed(2)}:1`)
    expect(
      failures,
      'The title and subtitle sit at the from- corner. Below 4.5:1 the class name is hard ' +
        'to read; the to- end is unconstrained, so put the light accent there instead.',
    ).toEqual([])
  })

  it('holds no gradient that is another one reversed', () => {
    const seen = new Map<string, string>()
    const reversals: string[] = []
    for (const banner of banners()) {
      const key = [fromColour(banner), toColour(banner)].sort().join('~')
      const twin = seen.get(key)
      if (twin) reversals.push(`"${banner}" is "${twin}" reversed`)
      else seen.set(key, banner)
    }
    expect(
      reversals,
      'Two cards then differ in a way the reader cannot attribute to anything, which looks ' +
        'like a fault rather than variety. Use a different hue instead.',
    ).toEqual([])
  })
})
