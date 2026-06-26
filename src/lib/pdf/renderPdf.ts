import 'server-only'

/**
 * Renders an HTML string to a PDF buffer with headless Chromium.
 * Deps are lazy-imported so they never load unless a PDF is actually generated
 * (and so they stay out of the build graph). Runs on Vercel via
 * @sparticuz/chromium; needs a compatible Chromium binary to execute.
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
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
