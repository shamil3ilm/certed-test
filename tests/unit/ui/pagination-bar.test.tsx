import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PaginationBar } from '@/lib/ui'

/**
 * The pager states what `total` counts. Most lists page the thing they render, so "total"
 * is right - but the Classes list pages by STUDENT while rendering class cards, and without
 * a label "37 total" reads as 37 classes on a page showing twelve.
 */

describe('PaginationBar', () => {
  it('says "total" by default', () => {
    const html = renderToStaticMarkup(<PaginationBar page={1} totalPages={3} total={37} />)
    expect(html).toContain('37 total')
  })

  it('uses the given label when the unit is not what the page renders', () => {
    const html = renderToStaticMarkup(<PaginationBar page={1} totalPages={3} total={37} label="students" />)
    expect(html).toContain('37 students')
    expect(html).not.toContain('37 total')
  })

  it('renders nothing at all when there is only one page', () => {
    // A pager over a single page is noise, and "Page 1 of 1" invites a click that does
    // nothing - which is why the student view of Classes shows no pager.
    expect(renderToStaticMarkup(<PaginationBar page={1} totalPages={1} total={4} />)).toBe('')
  })

  it('omits the previous link on the first page and the next link on the last', () => {
    const first = renderToStaticMarkup(<PaginationBar page={1} totalPages={3} total={37} nextHref="/x?page=2" />)
    expect(first).toContain('Next')
    expect(first).not.toContain('Previous')
    const last = renderToStaticMarkup(<PaginationBar page={3} totalPages={3} total={37} previousHref="/x?page=2" />)
    expect(last).toContain('Previous')
    expect(last).not.toContain('Next')
  })
})
