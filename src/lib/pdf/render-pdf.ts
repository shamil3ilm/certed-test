import 'server-only'
import { isMock } from '@/lib/mock/env'

/**
 * Renders an HTML string to a PDF buffer with headless Chromium.
 * Deps are lazy-imported so they never load unless a PDF is actually generated
 * (and so they stay out of the build graph). Runs on Vercel via
 * @sparticuz/chromium; needs a compatible Chromium binary to execute.
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  if (isMock()) {
    // Local mock mode still renders the real template, but it must use an actual
    // locally-installed browser. Returning placeholder documents hides setup
    // problems and makes PDF failures harder to detect.
    const { findLocalBrowser } = await import('@/lib/mock/local-chrome')
    const executablePath = findLocalBrowser()
    if (executablePath) {
      const puppeteer = (await import('puppeteer-core')).default
      const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
      try {
        const page = await browser.newPage()
        await page.setContent(html, { waitUntil: 'load', timeout: 30000 })
        const pdf = await page.pdf({ format: 'A4', printBackground: true })
        return Buffer.from(pdf)
      } finally {
        await browser.close()
      }
    }
    throw new Error('Mock PDF rendering requires a local Chrome or Edge installation.')
  }
  const chromium = (await import('@sparticuz/chromium')).default
  const puppeteer = (await import('puppeteer-core')).default

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    const pdf = await page.pdf({ format: 'A4', printBackground: true })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
