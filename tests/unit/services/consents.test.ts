import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/profiles-directory', () => ({ selectActiveProfileIds: vi.fn() }))
vi.mock('@/lib/data/consents', () => ({
  insertConsent: vi.fn(),
  selectLatestConsent: vi.fn(),
  markStandingConsentsWithdrawn: vi.fn(),
  selectProfileIdsWithCurrentConsent: vi.fn(),
}))

import {
  insertConsent,
  markStandingConsentsWithdrawn,
  selectLatestConsent,
  selectProfileIdsWithCurrentConsent,
} from '@/lib/data/consents'
import { selectActiveProfileIds } from '@/lib/data/profiles-directory'
import { getConsentStatus, reaffirmCurrentConsent, withdrawConsent, reconcileConsents } from '@/lib/services/consents'
import { TERMS_VERSION, PRIVACY_VERSION } from '@/lib/policy/versions'

const row = (over: Record<string, unknown> = {}) => ({
  terms_version: TERMS_VERSION,
  privacy_version: PRIVACY_VERSION,
  guardian_consent: false,
  cross_border_consent: false,
  accepted_at: '2026-08-25T10:00:00.000Z',
  withdrawn_at: null,
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('getConsentStatus', () => {
  it('reports up-to-date when the latest accepted versions match the current ones', async () => {
    vi.mocked(selectLatestConsent).mockResolvedValue(row() as never)
    const status = await getConsentStatus('u1')
    expect(status.upToDate).toBe(true)
    expect(status.acceptedTermsVersion).toBe(TERMS_VERSION)
  })

  it('needs re-acceptance when the accepted version is older than the current one', async () => {
    vi.mocked(selectLatestConsent).mockResolvedValue(row({ terms_version: '2020-01-01' }) as never)
    const status = await getConsentStatus('u1')
    expect(status.upToDate).toBe(false)
    expect(status.acceptedTermsVersion).toBe('2020-01-01')
    expect(status.currentTermsVersion).toBe(TERMS_VERSION)
  })

  it('needs acceptance when there is no consent on record at all', async () => {
    vi.mocked(selectLatestConsent).mockResolvedValue(null)
    const status = await getConsentStatus('u1')
    expect(status.upToDate).toBe(false)
    expect(status.acceptedAt).toBeNull()
  })
})

describe('reaffirmCurrentConsent', () => {
  it('appends a fresh acceptance of the CURRENT versions', async () => {
    await reaffirmCurrentConsent('u1')
    expect(insertConsent).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: 'u1', terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION }),
    )
  })
})

describe('consent withdrawal (N-07)', () => {
  it('a withdrawn acceptance is no longer up to date, so the app re-prompts', async () => {
    // The policy offers withdrawal; before this the log could only ever say "accepted".
    vi.mocked(selectLatestConsent).mockResolvedValue(row({ withdrawn_at: '2026-09-05T09:00:00.000Z' }) as never)
    const status = await getConsentStatus('u1')
    expect(status.withdrawnAt).toBe('2026-09-05T09:00:00.000Z')
    expect(status.upToDate, 'a withdrawal must re-open the acceptance prompt').toBe(false)
    // The historical fact is preserved, not erased.
    expect(status.acceptedTermsVersion).toBe(TERMS_VERSION)
    expect(status.acceptedAt).toBe('2026-08-25T10:00:00.000Z')
  })

  it('withdrawing marks the standing acceptance rather than deleting it', async () => {
    await withdrawConsent('u1')
    expect(markStandingConsentsWithdrawn).toHaveBeenCalledWith('u1', expect.any(String))
    expect(insertConsent, 'withdrawal is not a new acceptance').not.toHaveBeenCalled()
  })
})

/**
 * The consent trail must not be able to lose an entry silently.
 *
 * Recording acceptance is best-effort on purpose - registration and the OAuth callback both
 * `await ... .catch(log)` so a write hiccup cannot fail an account that is already bound.
 * That left a gap nothing noticed: the row is missing, the failure is a log line, and the
 * only surface that would reveal it is a settings page the person may never open.
 */
describe('reconcileConsents', () => {
  beforeEach(() => {
    vi.mocked(selectActiveProfileIds).mockResolvedValue([])
    vi.mocked(selectProfileIdsWithCurrentConsent).mockResolvedValue([])
  })

  it('reports an active profile that holds no current acceptance', async () => {
    vi.mocked(selectActiveProfileIds).mockResolvedValue(['a', 'b', 'c'])
    vi.mocked(selectProfileIdsWithCurrentConsent).mockResolvedValue(['a', 'c'])

    const result = await reconcileConsents()

    expect(result.missing).toBe(1)
    expect(result.missingProfileIds).toEqual(['b'])
    expect(result.activeProfiles).toBe(3)
    expect(result.withCurrentConsent).toBe(2)
  })

  it('reports nothing when every active profile has consented', async () => {
    vi.mocked(selectActiveProfileIds).mockResolvedValue(['a', 'b'])
    vi.mocked(selectProfileIdsWithCurrentConsent).mockResolvedValue(['b', 'a'])
    const result = await reconcileConsents()
    expect(result.missing).toBe(0)
    expect(result.missingProfileIds).toEqual([])
  })

  it('asks for the CURRENT policy versions, not whatever is on the row', async () => {
    await reconcileConsents()
    expect(selectProfileIdsWithCurrentConsent).toHaveBeenCalledWith(TERMS_VERSION, PRIVACY_VERSION)
  })

  it('keeps the COUNT exact while capping the id sample', async () => {
    // A large gap must not turn one cron response into a bulk export of who has not
    // consented, but under-reporting the count would hide the size of the problem.
    vi.mocked(selectActiveProfileIds).mockResolvedValue(Array.from({ length: 120 }, (_, i) => `p${i}`))
    const result = await reconcileConsents()
    expect(result.missing).toBe(120)
    expect(result.missingProfileIds).toHaveLength(50)
  })

  it('NEVER writes a consent row', async () => {
    // The decision this encodes: a sweep cannot know that someone accepted. Inserting a row
    // to make the numbers agree would forge the fact the log exists to evidence.
    vi.mocked(selectActiveProfileIds).mockResolvedValue(['a', 'b'])
    vi.mocked(selectProfileIdsWithCurrentConsent).mockResolvedValue([])
    await reconcileConsents()
    expect(insertConsent).not.toHaveBeenCalled()
  })
})
