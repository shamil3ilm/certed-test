import { readMockModeFlag } from '@/lib/mock/env'

export type DriveConfig = {
  clientId: string
  apiKey: string
  appId: string
}

/** All three client-side Google keys, or null if any is missing. */
export function readDriveConfig(): DriveConfig | null {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? ''
  const appId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? ''
  if (!clientId || !apiKey || !appId) return null
  return { clientId, apiKey, appId }
}

/** True only when Google is configured AND we're not in offline mock mode. */
export function isPickerConfigured(): boolean {
  if (readMockModeFlag()) return false
  return readDriveConfig() !== null
}
