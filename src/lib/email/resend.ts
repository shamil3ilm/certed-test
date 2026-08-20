import 'server-only'
import { Resend } from 'resend'
import { logError } from '@/lib/observability/log'

/**
 * Transactional email via Resend. OFF by default: it sends only when the opt-in
 * flag, the API key, and a verified From address are ALL set, so the rest of the
 * notification pipeline stays email-ready without a provider. Every
 * send is best-effort - it logs and returns false on failure, never throws, since
 * the callers are non-critical notification side effects.
 */
export function emailEnabled(): boolean {
  return process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true' && !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM
}

let client: Resend | null = null
function resend(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY!)
  return client
}

/** Minimal HTML escape so notification title/body can't inject markup into the email. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Send one email. Best-effort: false + logged on failure, never throws. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!emailEnabled()) return false
  try {
    const { error } = await resend().emails.send({ from: process.env.EMAIL_FROM!, to, subject, html })
    if (error) throw new Error(error.message)
    return true
  } catch (error) {
    // Log the domain only, never the recipient address: meta is forwarded to the
    // error tracker, and a student's/guardian's email must not leave for a third
    // party. The domain is enough to tell "our sender is misconfigured" from "one
    // provider is bouncing".
    logError('email.send', error, { toDomain: to.split('@')[1] ?? 'unknown' })
    return false
  }
}
