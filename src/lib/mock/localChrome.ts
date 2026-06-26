import { existsSync } from 'node:fs'

/**
 * Finds a locally-installed Chrome/Edge so MOCK MODE can render the REAL receipt
 * /pay-slip template with puppeteer-core (the production path uses @sparticuz/
 * chromium, which has no Windows binary). Override with MOCK_CHROME_PATH.
 */
const CANDIDATES = [
  process.env.MOCK_CHROME_PATH ?? '',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

export function findLocalBrowser(): string | null {
  for (const path of CANDIDATES) {
    if (existsSync(path)) return path
  }
  return null
}
