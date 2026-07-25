'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { Modal } from './Modal'

type ToastType = 'success' | 'error' | 'info'
type ToastItem = { id: number; msg: string; type: ToastType }
type ConfirmOpts = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'primary'
}

type UI = {
  toast: (msg: string, type?: ToastType) => void
  confirm: (opts: ConfirmOpts) => Promise<boolean>
}

const Ctx = createContext<UI | null>(null)

const TOAST_ICON = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const

export function useUI(): UI {
  const c = useContext(Ctx)
  if (!c) throw new Error('useUI must be used within <PortalProviders>')
  return c
}

export function PortalProviders({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const toastTimeoutsRef = useRef(new Set<ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const timeouts = toastTimeoutsRef.current
    return () => {
      for (const timeout of timeouts) clearTimeout(timeout)
      timeouts.clear()
    }
  }, [])

  const toast = useCallback((msg: string, type: ToastType = 'success') => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, msg, type }])
    const timeout = setTimeout(() => {
      toastTimeoutsRef.current.delete(timeout)
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 3500)
    toastTimeoutsRef.current.add(timeout)
  }, [])

  const [confirmState, setConfirmState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const confirm = useCallback(
    (opts: ConfirmOpts) => new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })),
    [],
  )
  const close = (v: boolean) => {
    confirmState?.resolve(v)
    setConfirmState(null)
  }

  const confirmBtn =
    confirmState?.variant === 'warning'
      ? 'btn-warning'
      : confirmState?.variant === 'primary'
        ? 'btn-primary'
        : 'btn-danger'

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}

      {/* Toasts - announced to assistive tech (the only success/error signal for the forms) */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2"
      >
        {toasts.map((t) => {
          const Icon = TOAST_ICON[t.type]

          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm shadow-lg ${
                t.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : t.type === 'error'
                    ? 'border-red-200 bg-red-50 text-red-800'
                    : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t.msg}
            </div>
          )
        })}
      </div>

      {/* Confirm / warning dialog - reuses the one shared Modal shell */}
      <Modal open={!!confirmState} onClose={() => close(false)} size="sm" title={confirmState?.title}>
        {confirmState?.message && <p className="text-sm text-slate-500">{confirmState.message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => close(false)}>
            {confirmState?.cancelLabel ?? 'Cancel'}
          </button>
          <button type="button" className={`btn ${confirmBtn}`} onClick={() => close(true)}>
            {confirmState?.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </Modal>
    </Ctx.Provider>
  )
}
