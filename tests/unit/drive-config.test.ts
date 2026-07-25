import { describe, it, expect, vi, afterEach } from 'vitest'
import { readDriveConfig, isPickerConfigured } from '@/lib/google/drive-config'

afterEach(() => vi.unstubAllEnvs())

function setAll() {
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'cid')
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_API_KEY', 'key')
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_APP_ID', '123')
}

describe('driveConfig', () => {
  it('readDriveConfig is null when any var is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'cid')
    expect(readDriveConfig()).toBeNull()
  })

  it('readDriveConfig returns the three values when all set', () => {
    setAll()
    expect(readDriveConfig()).toEqual({ clientId: 'cid', apiKey: 'key', appId: '123' })
  })

  it('isPickerConfigured is false in mock mode even when set', () => {
    setAll()
    vi.stubEnv('MOCK_MODE', '1')
    expect(isPickerConfigured()).toBe(false)
  })

  it('isPickerConfigured is true when configured and not mock', () => {
    setAll()
    vi.stubEnv('MOCK_MODE', '0')
    expect(isPickerConfigured()).toBe(true)
  })
})
