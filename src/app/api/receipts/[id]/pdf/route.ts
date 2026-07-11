import { pdfHandler } from '@/lib/finance/handlers'

// Headless-Chromium render: pin the Node runtime and allow generous time so the
// cold-start (Chromium unpack + launch, a few seconds after idle) can't hit
// Hobby's ~10s default and 504 on the first download.
export const runtime = 'nodejs'
export const maxDuration = 60

export const GET = pdfHandler('receipt')
