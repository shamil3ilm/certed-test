'use client'

import { Badge, SEGMENTED_GROUP, cx, segmentedButtonClass } from '@/lib/ui'
import { COLORS, SOURCES, VIEW_LABELS, VIEW_MODES, VIEW_SPANS } from './calendar-config'
import type { CalendarItem, CalendarMode, CalendarSpan, ComposerTab } from './calendar-types'

function ToolbarLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-slate-500">{children}</span>
}

type CalendarToolbarProps = {
  canOpenComposer: boolean
  hiddenSources: ReadonlySet<CalendarItem['source']>
  mode: CalendarMode
  span: CalendarSpan
  currentView: string
  deviceTz: string | null
  onModeChange: (mode: CalendarMode) => void
  onSpanChange: (span: CalendarSpan) => void
  onToggleSource: (source: CalendarItem['source']) => void
  onResetFilters: () => void
  onQuickAdd: (tab?: ComposerTab) => void
}

export function CalendarToolbar({
  canOpenComposer,
  hiddenSources,
  mode,
  span,
  currentView,
  deviceTz,
  onModeChange,
  onSpanChange,
  onToggleSource,
  onResetFilters,
  onQuickAdd,
}: CalendarToolbarProps) {
  const hasActiveFilters = hiddenSources.size > 0
  const visibleSourceCount = SOURCES.length - hiddenSources.size

  return (
    <div className="mb-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-end gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <ToolbarLabel>Layout</ToolbarLabel>
              <div className={SEGMENTED_GROUP}>
                {VIEW_MODES.map((viewMode) => (
                  <button
                    key={viewMode.id}
                    type="button"
                    onClick={() => onModeChange(viewMode.id)}
                    aria-pressed={mode === viewMode.id}
                    className={segmentedButtonClass(mode === viewMode.id, 'soft')}
                  >
                    {viewMode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <ToolbarLabel>Period</ToolbarLabel>
              <div className={SEGMENTED_GROUP}>
                {VIEW_SPANS.map((viewSpan) => (
                  <button
                    key={viewSpan.id}
                    type="button"
                    onClick={() => onSpanChange(viewSpan.id)}
                    aria-pressed={span === viewSpan.id}
                    className={segmentedButtonClass(span === viewSpan.id, 'soft')}
                  >
                    {viewSpan.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <ToolbarLabel>Visible items</ToolbarLabel>
            {SOURCES.map(({ source, label }) => {
              const isVisible = !hiddenSources.has(source)
              return (
                <button
                  key={source}
                  type="button"
                  onClick={() => onToggleSource(source)}
                  aria-pressed={isVisible}
                  title={isVisible ? `Hide ${label}` : `Show ${label}`}
                  className={cx(
                    'inline-flex min-h-8 items-center gap-2 transition',
                    isVisible ? 'text-slate-700' : 'text-slate-400',
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: isVisible ? COLORS[source] : '#cbd5e1' }}
                  />
                  <span className={cx('font-medium', !isVisible && 'line-through')}>{label}</span>
                </button>
              )
            })}
            <Badge tone="slate">{visibleSourceCount} visible</Badge>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="text-xs font-medium text-slate-500 transition hover:text-primary"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {canOpenComposer && (
          <button type="button" onClick={() => onQuickAdd()} className="btn btn-sm btn-soft min-h-9 px-4">
            Add
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
        <span data-tz={deviceTz ?? undefined}>
          Times shown in your timezone: <span className="font-medium">{deviceTz ?? '...'}</span>
        </span>
        <span className="font-medium text-slate-600">Viewing: {VIEW_LABELS[currentView] ?? 'Calendar'}</span>
      </div>
    </div>
  )
}
