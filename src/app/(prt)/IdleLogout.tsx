'use client'
import { useEffect } from 'react'

// Auto sign-out after this much inactivity. The portal shows financial documents
// and PII, so an unattended session shouldn't stay open indefinitely. Activity is
// tracked in localStorage so the timeout survives reloads and is shared across tabs.
const IDLE_MS = 30 * 60 * 1000
const KEY = 'cea:last-active'

export function IdleLogout() {
  useEffect(() => {
    const mark = () => {
      try {
        localStorage.setItem(KEY, String(Date.now()))
      } catch {}
    }
    const check = () => {
      let last: number
      try {
        last = Number(localStorage.getItem(KEY)) || Date.now()
      } catch {
        return
      }
      if (Date.now() - last > IDLE_MS) window.location.href = '/api/logout'
    }
    mark()
    const activity = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    activity.forEach((e) => window.addEventListener(e, mark, { passive: true }))
    const onVisible = () => {
      if (!document.hidden) check()
    }
    document.addEventListener('visibilitychange', onVisible)
    const iv = setInterval(check, 60 * 1000)
    return () => {
      activity.forEach((e) => window.removeEventListener(e, mark))
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(iv)
    }
  }, [])
  return null
}
