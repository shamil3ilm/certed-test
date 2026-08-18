import { existsSync } from 'node:fs'

/**
 * Finds a locally-installed Chrome/Edge/Chromium so MOCK MODE can render the REAL
 * receipt / pay-slip / report-card template with puppeteer-core (the production path
 * uses @sparticuz/chromium, which only ships a serverless-Linux binary). Override with
 * MOCK_CHROME_PATH - E2E sets it to Playwright's Chromium so CI works on any OS.
 */
const CANDIDATES = [
  process.env.MOCK_CHROME_PATH ?? '',
  // Windows
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  // Linux
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

export function findLocalBrowser(): string | null {
  for (const path of CANDIDATES) {
    if (existsSync(path)) return path
  }
  return null
}
