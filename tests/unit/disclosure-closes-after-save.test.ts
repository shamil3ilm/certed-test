import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { closeEnclosingDisclosure } from '@/app/(prt)/CloseDisclosureWhenDone'

/**
 * An edit popover lives in a <details>. Its form posts a server action, which re-renders the page
 * - but the <details> element survives that re-render with `open` still set, so the panel stayed
 * sitting over the row it had just saved and the save looked like it had done nothing.
 */
describe('closeEnclosingDisclosure', () => {
  it('closes the disclosure the node sits in', () => {
    document.body.innerHTML = '<details open><summary>Edit</summary><form><span id="m"></span></form></details>'
    const details = document.querySelector('details')!
    expect(details.open).toBe(true)
    closeEnclosingDisclosure(document.getElementById('m'))
    expect(details.open).toBe(false)
  })

  it('leaves every OTHER row alone - one save must not shut the panel a colleague opened', () => {
    document.body.innerHTML =
      '<details open id="a"><form><span id="m"></span></form></details><details open id="b"></details>'
    closeEnclosingDisclosure(document.getElementById('m'))
    expect(document.querySelector<HTMLDetailsElement>('#a')!.open).toBe(false)
    expect(document.querySelector<HTMLDetailsElement>('#b')!.open).toBe(true)
  })

  it('does nothing for a form that is not in a disclosure, and nothing for no node', () => {
    document.body.innerHTML = '<form><span id="m"></span></form>'
    expect(() => closeEnclosingDisclosure(document.getElementById('m'))).not.toThrow()
    expect(() => closeEnclosingDisclosure(null)).not.toThrow()
  })
})

/** Every .ts/.tsx file under src/app. */
function appFiles(dir = 'src/app'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return appFiles(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

describe('every disclosure that can submit also closes itself', () => {
  it('a form inside an EscapableDetails renders CloseDisclosureWhenDone', () => {
    const offenders: string[] = []
    for (const file of appFiles()) {
      const source = readFileSync(file, 'utf8')
      // Each disclosure block, from its opening tag to its close.
      for (const block of source.split('<EscapableDetails').slice(1)) {
        const body = block.split('</EscapableDetails>')[0]
        if (body.includes('<form') && !body.includes('CloseDisclosureWhenDone')) offenders.push(file)
      }
    }
    // Without it the panel stays open over the row it just saved - the save reads as a no-op.
    expect(offenders).toEqual([])
  })
})
