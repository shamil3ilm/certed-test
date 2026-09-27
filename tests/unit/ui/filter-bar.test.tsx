import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FilterBar } from '@/lib/ui'

/**
 * A filter bar over an empty list is a control that cannot change what is on screen: Apply
 * submits, the page reloads identically, and the button reads as broken. It has to disappear
 * when there is nothing to filter - but NOT while a filter is set, or a search matching nothing
 * would leave no way back.
 */
describe('FilterBar', () => {
  it('renders nothing at all when there is nothing to filter', () => {
    expect(renderToStaticMarkup(<FilterBar hidden>{<input name="q" />}</FilterBar>)).toBe('')
  })

  it('renders its fields and Apply otherwise', () => {
    const html = renderToStaticMarkup(<FilterBar>{<input name="q" />}</FilterBar>)
    expect(html).toContain('Apply')
    expect(html).toContain('name="q"')
  })

  it('stays while a filter is active, so an empty result can be cleared', () => {
    const html = renderToStaticMarkup(
      <FilterBar hidden={false} showClear clearHref="/documents">
        {<input name="q" />}
      </FilterBar>,
    )
    expect(html).toContain('Clear')
    expect(html).toContain('/documents')
  })
})
