import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * A read that BYPASSES RLS must not take the person it is about from its caller.
 *
 * Most reads are scoped by RLS: ask for someone else's rows and Postgres returns nothing. A
 * read through the service-role client has no such floor - it returns whatever it is asked
 * for, so the calling code is the entire access decision. That is fine while the only caller
 * is a page that has already proved authority. It stops being fine the moment a second
 * transport exists, because a route handler's most natural line is to pass its path parameter
 * straight through.
 *
 * That is not hypothetical here. `getStudentGradeTrajectory(studentId)` read one student's
 * whole mark history this way and checked nothing; the dashboard happened to pass `me.id`, so
 * it was correct and invisible for as long as the web app was the only client. It is now
 * `getOwnGradeTrajectory(actor)` - no student parameter for anyone to forward.
 *
 * A function passes by doing ONE of:
 *   - taking the actor (`actor: Profile`, `me: Profile`, …) and reading from THAT, or
 *   - calling a named authority helper (`canManageClass`, `assertCanDocument`, …), or
 *   - appearing below with the reason its caller-supplied id is safe.
 *
 * Two shapes are out of scope, because neither hands a caller another person's data: a
 * function returning `Promise<void>` (a fan-out or a sweep), and one with no id-like
 * parameter (nothing for a transport to forward).
 *
 * "It's only called from an admin page" IS an acceptable reason - write it down. The point of
 * the list is that adding to it is a deliberate act a reviewer can see, not that the list is
 * short. What must never happen is a new function of this shape appearing silently.
 *
 * Related gates: `unbounded-reads` asks whether a query bounds itself; `capped-reads` asks
 * whether a capped result is rendered as the whole set. This one asks who the rows are about.
 */

const SERVICES = join(process.cwd(), 'src', 'lib', 'services')
const DATA = join(process.cwd(), 'src', 'lib', 'data')

/** Reason each allowlisted function may take an id it does not authorise. */
const CALLER_PROVES_AUTHORITY: Record<string, string> = {
  'capability-overrides.ts::getCapabilityOverrides':
    'Part of the authority machinery itself - capability resolution calls it, so it cannot call capability resolution back.',
  'classes/queries.ts::listClassesByIds':
    'Name lookup for class ids the caller already resolved. It widens no scope; it labels one.',
  'classes/queries.ts::getClassMembers':
    'The roster itself. markAttendance uses it AS the security boundary (a mark for anyone not on it is dropped), so gating it on the actor would be circular.',
  'finance/finance-docs.ts::getDocLines':
    'The lines of a document the finance handler has already authorised with viewFinance.',
  'finance/hours-billing.ts::buildBillingDraft':
    'Takes actorId and is reached only from the finance handlers, which prove viewFinance before calling it.',
  'page-data/user-detail.ts::loadStudentSubjects':
    'Admin user-detail page only; the obligation is stated in its own docstring.',
  'page-data/user-detail.ts::loadTutorRoster': 'Admin user-detail page only; same contract as loadStudentSubjects.',
  'tags.ts::tagsForEntity': 'The tags on an entity the caller has already reached.',
  'tags.ts::entityIdsForTag':
    'Returns ids only. The rows behind them are then read through RLS-scoped queries, which is where the scoping happens.',
  'users/directory.ts::getProfilesByIds':
    'Display-name lookup for ids the caller already holds. Whether an email is SHOWN is decided by the tiering in the caller (see the audit log).',
  'users/directory.ts::getProfileDetails': "Admin user-detail, and a person's own settings page.",
  'users/directory.ts::getProfileRole': 'Role lookup used by admin flows and by guards.',
}

const EXPORTED = /^export (?:async )?function (\w+)\s*\(([^)]*)\)\s*:\s*([^{]*)\{/gm
const TAKES_ACTOR = /\b(actor|me|author|viewer|profile)\s*:\s*(Profile|ActorContext)/
const TAKES_ID = /\b\w*[Ii]d\s*:\s*string|\bids\s*:\s*(?:readonly )?string\[\]/
const CHECKS_AUTHORITY =
  /\b(canManageClass|canWriteClass|canWriteCalendar|canManageScope|canAccessClass|canMentor|canDocument|assertCanDocument|assertMayAttach|assertParticipant|requireAdminPersona|requireActorCapability|PermissionError|assertClassActive|loadPersonaFlags|scopeFilter|studentIdsOfMentor|mentoringScopeClassIds|canEditStaffNote)\b/

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return tsFilesUnder(full)
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : []
  })
}

/** Each exported function in a file, with its parameter list, return type and body. */
function exportedFunctions(source: string): { name: string; params: string; returns: string; body: string }[] {
  const found = [...source.matchAll(EXPORTED)].map((m) => ({
    at: m.index ?? 0,
    name: m[1],
    params: m[2],
    returns: m[3],
  }))
  return found.map((fn, i) => ({
    name: fn.name,
    params: fn.params,
    returns: fn.returns,
    body: source.slice(fn.at, found[i + 1]?.at ?? source.length),
  }))
}

/** Data-layer exports that build the service-role client, so RLS never runs for them. */
function serviceRoleReaders(): Set<string> {
  const names = new Set<string>()
  for (const file of tsFilesUnder(DATA)) {
    const source = readFileSync(file, 'utf8')
    if (!source.includes('createAdminClient')) continue
    for (const fn of exportedFunctions(source)) {
      if (fn.body.includes('createAdminClient')) names.add(fn.name)
    }
  }
  return names
}

function unauthorisedServiceRoleReads(): string[] {
  const readers = serviceRoleReaders()
  expect(readers.size).toBeGreaterThan(50) // the detector itself must not silently find nothing
  const calls = new RegExp(String.raw`\b(${[...readers].join('|')})\s*\(`)

  const offenders: string[] = []
  for (const file of tsFilesUnder(SERVICES)) {
    const source = readFileSync(file, 'utf8')
    if (!calls.test(source)) continue
    const key = relative(SERVICES, file).split(sep).join('/')
    for (const fn of exportedFunctions(source)) {
      if (!calls.test(fn.body)) continue
      if (fn.returns.includes('Promise<void>')) continue // hands the caller nothing
      if (!TAKES_ID.test(fn.params)) continue // nothing for a transport to forward
      if (TAKES_ACTOR.test(fn.params) || CHECKS_AUTHORITY.test(fn.body)) continue
      offenders.push(`${key}::${fn.name}`)
    }
  }
  return offenders.sort()
}

describe('service-role reads decide who the rows are about', () => {
  it('no service function takes a caller-supplied id into an RLS-bypassing read without a stated reason', () => {
    const undeclared = unauthorisedServiceRoleReads().filter((id) => !(id in CALLER_PROVES_AUTHORITY))
    expect(
      undeclared,
      undeclared.length === 0
        ? ''
        : `These read through the service-role client (no RLS) and decide WHO the rows are about from a caller-supplied id:\n` +
            undeclared.map((id) => `  - ${id}`).join('\n') +
            `\n\nTake the actor and read from that instead (see getOwnGradeTrajectory), or call the authority helper ` +
            `that proves the caller may see this person's rows. If the caller genuinely carries the authority, add the ` +
            `function to CALLER_PROVES_AUTHORITY in this file with the reason - naming it is the point.`,
    ).toEqual([])
  })

  it('every allowlisted function still has the shape the allowlist excuses', () => {
    // A reason left behind after a function is fixed, renamed or deleted quietly stops meaning
    // anything, and the next reader inherits a list they cannot trust.
    const actual = new Set(unauthorisedServiceRoleReads())
    const stale = Object.keys(CALLER_PROVES_AUTHORITY).filter((id) => !actual.has(id))
    expect(
      stale,
      stale.length === 0 ? '' : `Stale entries in CALLER_PROVES_AUTHORITY - remove them:\n${stale.join('\n')}`,
    ).toEqual([])
  })

  it('getOwnGradeTrajectory is not on the list, because it takes no student id at all', () => {
    // The case this gate exists for. If a student parameter ever comes back, the first test
    // above fails unless someone writes a reason for it - which is the conversation to have.
    const source = readFileSync(join(SERVICES, 'page-data', 'grade-trajectory.ts'), 'utf8')
    expect(source).toContain('getOwnGradeTrajectory(actor: Profile)')
    expect(source).not.toMatch(/export async function \w+\(studentId: string\)/)
  })
})
