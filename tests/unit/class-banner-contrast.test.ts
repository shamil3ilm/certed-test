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
 * The second rule is UNIFORMITY: one gradient, for every class. A per-class palette gave
 * each card a colour the reader could not attribute to anything - two classes for the same
 * student, side by side, differing for no reason the card explained. It could not be made
 * to look like a set either: `secondary` is the only LIGHT brand token, so a variant not
 * ending there had nowhere to travel and rendered nearly flat (L* 13) beside one that did
 * (L* 47.6). A class is named by its title and subject; the banner is brand furniture.
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

/** The design system's own colours (globals.css `:root`). The palette may use nothing else;
 *  HEX above stays wider so the contrast maths still works if one is ever proposed. */
const BRAND_TOKENS = new Set(['primary', 'primary-strong', 'secondary', 'secondary-ink'])

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

/** Perceptual lightness (CIE L*), which is what "does this look like a gradient" tracks -
 *  relative luminance alone understates how flat a dark-to-dark sweep appears. */
function lightness(hex: string): number {
  const y = relativeLuminance(hex)
  return y <= 0.008856 ? 903.3 * y : 116 * Math.cbrt(y) - 16
}

/** Contrast of a colour against WHITE text. */
function contrastWithWhite(hex: string): number {
  return 1.05 / (relativeLuminance(hex) + 0.05)
}

/** The gradient as written in the component, so the test reads the real source. */
function banner(): string {
  const source = readFileSync(SOURCE, 'utf8')
  const m = source.match(/export const CLASS_BANNER = '([^']+)'/)
  expect(m, `CLASS_BANNER not found in ${SOURCE} - has it been renamed?`).not.toBeNull()
  return m![1]
}

/** The whole source, for the check that no per-class palette has crept back in. */
function source(): string {
  return readFileSync(SOURCE, 'utf8')
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
  it('has a gradient to check', () => {
    // Guards the scanner: a regex that matched nothing would make every assertion below
    // vacuously true.
    expect(banner()).toMatch(/from-\S+\s+to-\S+/)
  })

  it('is ONE gradient, shared by every class', () => {
    // The uniformity rule itself. A per-class palette is what this replaced: an array of
    // variants picked by hashing the class id, which gave two cards in one group different
    // colours for a reason nothing on the card explained.
    const src = source()
    expect(
      /CLASS_BANNERS|const\s+CLASS_BANNER\s*=\s*\[/.test(src),
      'The banner is uniform. Do not reintroduce a per-class palette: a class is identified ' +
        'by its name and subject, and with four brand tokens the variants cannot be made to ' +
        'look like a set.',
    ).toBe(false)
    expect(
      /charCodeAt|% CLASS_BANNER/.test(src),
      'A hash of the class id means the colour varies per class again.',
    ).toBe(false)
  })

  it('uses BRAND tokens only - no borrowed Tailwind hues', () => {
    // A class card is a large, repeated block of colour. A borrowed indigo/violet/rose puts
    // a hue on screen that appears nowhere else in the product, so the cards stop reading as
    // this brand - which is a design decision, not a contrast one, and nothing else checks it.
    const offBrand = [fromColour(banner()), toColour(banner())].filter((c) => !BRAND_TOKENS.has(c))
    expect(
      offBrand,
      'Class banners may only use the brand tokens defined in globals.css ' +
        `(${[...BRAND_TOKENS].join(', ')}). Re-brand by editing :root, not by reaching for a ` +
        'Tailwind palette colour here.',
    ).toEqual([])
  })

  it('every colour used is one this gate knows the hex for', () => {
    const unknown = [fromColour(banner()), toColour(banner())].filter((c) => !(c in HEX))
    expect(unknown, `add these to HEX so their contrast can be checked: ${unknown.join(', ')}`).toEqual([])
  })

  it('starts from a colour that carries white text at 4.5:1', () => {
    const colour = fromColour(banner())
    const ratio = contrastWithWhite(HEX[colour])
    expect(
      ratio,
      `The title and subtitle sit at the from- corner. White on ${colour} is ${ratio.toFixed(2)}:1; ` +
        'below 4.5:1 the class name is hard to read. The to- end is unconstrained, so put the ' +
        'light accent there instead.',
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('travels far enough to read as a gradient rather than a flat block', () => {
    // `secondary` is the only LIGHT brand token, so ending anywhere else leaves the gradient
    // with nowhere to travel - which is exactly how a card came to look unpainted.
    const delta = lightness(HEX[toColour(banner())]) - lightness(HEX[fromColour(banner())])
    expect(
      delta,
      `${banner()} spans only L* ${delta.toFixed(1)}. Under 20 it reads as a flat block. ` +
        'End the gradient at `secondary` (L* 69.6), the only light brand token.',
    ).toBeGreaterThanOrEqual(20)
  })
})
