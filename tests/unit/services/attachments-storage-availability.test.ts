import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/mock/env', () => ({ isMock: vi.fn() }))

import { isMock } from '@/lib/mock/env'
import { driveStorageAvailable } from '@/lib/google/drive-storage'
import { apiError } from '@/lib/api/response'
import { StorageUnavailableError } from '@/lib/errors'

const DRIVE_VARS = [
  'GOOGLE_DRIVE_CLIENT_ID',
  'GOOGLE_DRIVE_CLIENT_SECRET',
  'GOOGLE_DRIVE_REFRESH_TOKEN',
  'GOOGLE_DRIVE_ROOT_FOLDER_ID',
] as const

describe('driveStorageAvailable', () => {
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const key of DRIVE_VARS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
  })
  afterEach(() => {
    for (const key of DRIVE_VARS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    vi.restoreAllMocks()
  })

  it('is always available in mock mode, even with no Drive credentials', () => {
    vi.mocked(isMock).mockReturnValue(true)
    expect(driveStorageAvailable()).toBe(true)
  })

  it('is unavailable in real mode when the credentials are missing', () => {
    vi.mocked(isMock).mockReturnValue(false)
    expect(driveStorageAvailable()).toBe(false)
  })

  it('is unavailable in real mode when only some credentials are set', () => {
    vi.mocked(isMock).mockReturnValue(false)
    process.env.GOOGLE_DRIVE_CLIENT_ID = 'x'
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = 'x'
    expect(driveStorageAvailable()).toBe(false)
  })

  it('is available in real mode once all four credentials are set', () => {
    vi.mocked(isMock).mockReturnValue(false)
    for (const key of DRIVE_VARS) process.env[key] = 'x'
    expect(driveStorageAvailable()).toBe(true)
  })
})

describe('StorageUnavailableError mapping', () => {
  it('apiError returns a 503 SERVICE_UNAVAILABLE envelope with a friendly message', async () => {
    const res = apiError(new StorageUnavailableError())
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      code: 'SERVICE_UNAVAILABLE',
      error: expect.stringContaining('storage'),
    })
  })
})
