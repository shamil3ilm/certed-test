import { expect, type Locator, type Page } from '@playwright/test'
import { loginAs, settle, type Persona } from '../staging/support'

export { loginAs, settle, type Persona }

/** The seeded staging class the tutor teaches and the student takes (Biology). */
export const CLASS_ID = process.env.STAGING_CLASS_ID ?? '25e29e9b-3971-4df7-94de-5d9e7a5a5a40'
export const STUDENT_ID = process.env.STAGING_STUDENT_ID ?? 'a98bc5ad-1042-4aea-9625-f6472ff782d4'
export const STUDENT_NAME = process.env.STAGING_STUDENT_NAME ?? 'Test Student 944897'
export const TUTOR_NAME = 'Test Tutor'

/**
 * One tag per run, on every record a workflow creates, so staging data made by the suite is
 * recognisable at a glance and a later run never mistakes an earlier run's record for its own.
 */
export const STAMP = process.env.E2E_RUN_ID ?? new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '')
export const RUN = `E2E ${STAMP}`

export function tagged(label: string): string {
  return `${RUN} ${label}`
}

/** A small, valid one-page PDF. */
export const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
)

/** Page errors and 5xx responses seen while a workflow runs. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`))
  page.on('response', (r) => {
    if (r.status() >= 500) errors.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`)
  })
  return errors
}

/** Open a page and wait for it to finish streaming. */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await settle(page)
}

export async function reload(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
}

/** Submit a server-action form: click, wait for the action's response, then reload to read the
 *  committed state. A reload that races the action reads the page from before the write. */
export async function submitAction(page: Page, click: () => Promise<void>): Promise<number | null> {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST', { timeout: 30_000 }).catch(() => null),
    click(),
  ])
  await page.waitForTimeout(1000)
  await reload(page)
  return response?.status() ?? null
}

/** Answer the app's confirm modal with its confirm button. */
export async function confirm(page: Page, confirmLabel: string): Promise<void> {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  // The confirm button submits a server action: wait for its response, not just for the
  // dialog to close, or a reload right after reads the state from before the write.
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST', { timeout: 30_000 }).catch(() => null),
    dialog.getByRole('button', { name: confirmLabel, exact: true }).click(),
  ])
  await expect(dialog).toBeHidden({ timeout: 30_000 })
  await page.waitForTimeout(1000)
}

/** Whether a toast or status message matching `text` appears (toasts vanish after ~3.5s). */
export async function sawMessage(page: Page, text: RegExp, timeout = 20_000): Promise<boolean> {
  return page
    .getByText(text)
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false)
}

export async function expectNoAppError(page: Page): Promise<void> {
  const body = (await page.locator('body').innerText()).toLowerCase()
  expect(body).not.toContain('application error')
  expect(body).not.toContain('internal server error')
}

/** "YYYY-MM-DDTHH:MM" in the browser's local time, `days` from now. */
export function localDateTime(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Fetch a URL inside the page (session cookie attached) and report status + first bytes. */
export async function fetchBytes(page: Page, url: string): Promise<{ status: number; head: number[]; type: string }> {
  return page.evaluate(async (u) => {
    const res = await fetch(u)
    const buf = new Uint8Array(await res.arrayBuffer())
    return { status: res.status, head: [...buf.slice(0, 4)], type: res.headers.get('content-type') ?? '' }
  }, url)
}

/** Log a finding: something observed that is worth reporting even when the step passed. */
export function note(message: string): void {
  console.log(`NOTE: ${message}`)
}

export async function textOf(locator: Locator): Promise<string> {
  return ((await locator.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
}
