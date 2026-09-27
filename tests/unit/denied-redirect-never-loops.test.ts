import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))
vi.mock('@/lib/session/actor-context', () => ({ getActorContext: vi.fn() }))

import { getActorContext } from '@/lib/session/actor-context'
import { redirectDenied, requireCapability, requireRole } from '@/lib/auth/require-role'

/** An active account holding exactly `caps` and the given personas. */
const actor = (caps: string[], personas: string[] = []) =>
  ({
    userId: 'u1',
    profile: { id: 'p1', email: 'a@b.c', full_name: null, role: 'student', status: 'active' },
    personas: personas.map((persona_name) => ({ persona_name })),
    capabilities: { allowed: new Set(caps), denied: new Set(), sourceByCapability: new Map() },
    accessState: 'active',
  }) as any

/** The path a guard redirected to, or null if it did not redirect. */
async function target(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run()
    return null
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!message.startsWith('REDIRECT:')) throw error
    return message.slice('REDIRECT:'.length)
  }
}

beforeEach(() => vi.resetAllMocks())

describe('a refused guard never sends someone somewhere they are also refused', () => {
  it('sends an account with no capabilities to the dead end, not to the dashboard', async () => {
    // A profile with no persona holds no capability at all. The dashboard needs viewDashboard to
    // open, so aiming its own refusal there redirected such an account to it forever.
    expect(await target(async () => redirectDenied(actor([])))).toBe('/no-access')
  })

  it('keeps the dashboard notice for someone who can actually open the dashboard', async () => {
    expect(await target(async () => redirectDenied(actor(['viewDashboard'])))).toBe('/dashboard?denied=1')
  })

  it('requireCapability refuses a capability-less account to the dead end', async () => {
    vi.mocked(getActorContext).mockResolvedValue(actor([]))
    expect(await target(() => requireCapability('viewClasses'))).toBe('/no-access')
  })

  it('requireCapability still explains itself on the dashboard when that page is reachable', async () => {
    vi.mocked(getActorContext).mockResolvedValue(actor(['viewDashboard']))
    expect(await target(() => requireCapability('viewFinance'))).toBe('/dashboard?denied=1')
  })

  it('requireRole refuses a persona-less account to the dead end', async () => {
    vi.mocked(getActorContext).mockResolvedValue(actor([]))
    expect(await target(() => requireRole(['admin']))).toBe('/no-access')
  })

  it('requireRole explains itself on the dashboard for a persona holder missing one role', async () => {
    vi.mocked(getActorContext).mockResolvedValue(actor(['viewDashboard'], ['student']))
    expect(await target(() => requireRole(['admin']))).toBe('/dashboard?denied=1')
  })
})

/** Every .ts/.tsx file under src/app. */
function appFiles(dir = 'src/app'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return appFiles(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

describe('the refusal destination is decided in one place', () => {
  it('no route names /dashboard?denied=1 itself - they all go through redirectDenied', () => {
    const offenders = appFiles().filter((file) => readFileSync(file, 'utf8').includes("'/dashboard?denied=1'"))
    // Naming the path directly is how a page ends up refusing an account to a page that refuses
    // it back. redirectDenied is the one place that knows whether the dashboard is reachable.
    expect(offenders).toEqual([])
  })

  it('the dashboard does not refuse itself with the guard that redirects to it', () => {
    const page = readFileSync('src/app/(prt)/dashboard/page.tsx', 'utf8')
    // The CALL, not a mention: the comment above the fix names the old guard deliberately.
    expect(page).not.toMatch(/await\s+requireCapability\('viewDashboard'\)/)
    // And it sends an account that cannot open it to the page that always renders.
    expect(page).toContain("redirect('/no-access')")
  })
})
