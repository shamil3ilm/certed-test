'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUI } from '../../Providers'
import { api } from './api'
import type { Ev, Slot } from './types'

/**
 * Loading and mutation orchestration for the timetable manager.
 *
 * Slots and events are loaded together and reloaded together, because every
 * mutation on either can change what the other tab shows - creating a
 * cancellation event references a slot, and deactivating a slot changes which
 * events still make sense. Keeping one reload for both is what stops the two
 * tabs drifting out of sync.
 *
 * `run` is the single write path: it clears the previous error, performs the
 * write, reloads, refreshes the server components, and reports. Every mutation
 * goes through it so none of them can forget a step.
 */
export function useTimetableData() {
  const router = useRouter()
  const { toast, confirm } = useUI()
  const [slots, setSlots] = useState<Slot[]>([])
  const [events, setEvents] = useState<Ev[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [slotRows, eventRows] = await Promise.all([
        api<Slot[]>('/api/timetable', 'GET'),
        api<Ev[]>('/api/events', 'GET'),
      ])
      setSlots(slotRows)
      setEvents(eventRows)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load timetable data')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true)
      setError(null)

      try {
        await fn()
        await reload()
        router.refresh()
        toast('Saved', 'success')
      } catch (runError) {
        const message = runError instanceof Error ? runError.message : 'Request failed'
        setError(message)
        toast(message, 'error')
      } finally {
        setBusy(false)
      }
    },
    [reload, router, toast],
  )

  /** Wraps a destructive write in a confirmation. Returns a handler, so a row
   *  can hand it straight to onClick. */
  const confirmDelete = useCallback(
    (what: string, fn: () => Promise<unknown>) => async () => {
      const confirmed = await confirm({
        title: `Delete this ${what}?`,
        message: 'This cannot be undone.',
        confirmLabel: 'Delete',
        variant: 'danger',
      })

      if (confirmed) {
        await run(fn)
      }
    },
    [confirm, run],
  )

  return { slots, events, error, busy, run, confirmDelete }
}
