import { describe, it, expect, vi } from 'vitest'
import { ensureChildFolder } from '@/lib/drive/folders'

function fakeDrive(existing: Record<string, string> = {}) {
  const created: any[] = []
  return {
    created,
    files: {
      list: vi.fn(async ({ q }: any) => {
        const name = /name = '([^']+)'/.exec(q)?.[1]
        const id = name ? existing[name] : undefined
        return { data: { files: id ? [{ id, name }] : [] } }
      }),
      create: vi.fn(async ({ requestBody }: any) => {
        const id = 'new-' + requestBody.name
        created.push(requestBody)
        return { data: { id } }
      }),
    },
  } as any
}

describe('ensureChildFolder', () => {
  it('returns the existing folder id without creating', async () => {
    const drive = fakeDrive({ Resources: 'fld-1' })
    const id = await ensureChildFolder(drive, 'parent-0', 'Resources')
    expect(id).toBe('fld-1')
    expect(drive.files.create).not.toHaveBeenCalled()
  })
  it('creates the folder when missing', async () => {
    const drive = fakeDrive()
    const id = await ensureChildFolder(drive, 'parent-0', 'Assignments')
    expect(id).toBe('new-Assignments')
    expect(drive.created[0]).toMatchObject({ name: 'Assignments', parents: ['parent-0'] })
  })
})
