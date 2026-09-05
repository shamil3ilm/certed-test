import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * One writer at a time for the mock database.
 *
 * `.mock-db.json` is a single file in the repo root, rewritten wholesale on every
 * mutation. Two servers running mock mode therefore clobber each other, and the damage
 * is not a crash - it is a spec failing on rows it never created, reporting
 * "strict mode violation: resolved to 2 elements" against its OWN fixture. That reads
 * like a duplicate-render bug in the app and sends the reader into the component tree.
 *
 * Guarding by PORT does not cover it. The case that actually happened was a process whose
 * listener had been killed but whose children survived: it held the file and wrote to it
 * while holding no port at all, so a port probe saw a clean machine. The lock is on the
 * thing being contended - the file - so it catches the holder however it is reachable.
 */
export const LOCK_FILE = join(process.cwd(), '.mock-db.lock')

/** True when `pid` is a live process. Signal 0 checks existence without delivering. */
export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means it exists but belongs to another user - alive for our purposes.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** The live pid currently holding the mock database, or null when it is free. A lock
 *  naming a dead pid is stale (a crashed or killed server) and does not count. */
export function currentHolder(): number | null {
  if (!existsSync(LOCK_FILE)) return null
  const pid = Number.parseInt(readFileSync(LOCK_FILE, 'utf8').trim(), 10)
  if (!pidAlive(pid) || pid === process.pid) return null
  return pid
}

/**
 * Claim the mock database for this process, throwing when another LIVE process holds it.
 *
 * Called once when the store first loads. Failing here is deliberate: a second server
 * that starts anyway is the thing that produces the misleading test results above, and a
 * refusal that names the holding pid is far cheaper to act on than a spec failing three
 * files later for reasons that look like application code.
 */
export function claimMockDb(): void {
  const holder = currentHolder()
  if (holder !== null) {
    throw new Error(
      `Mock database is already held by pid ${holder}. Two mock servers share ` +
        `.mock-db.json and overwrite each other, which surfaces as tests failing on rows ` +
        `they did not create. Stop that process (or delete ${LOCK_FILE} if it is dead) and retry.`,
    )
  }
  writeFileSync(LOCK_FILE, String(process.pid))
}

/** Release the claim if we still hold it. Best-effort: a lock left by a killed process is
 *  detected as stale by pid, so a missed release never blocks the next run. */
export function releaseMockDb(): void {
  try {
    if (!existsSync(LOCK_FILE)) return
    if (Number.parseInt(readFileSync(LOCK_FILE, 'utf8').trim(), 10) === process.pid) unlinkSync(LOCK_FILE)
  } catch {
    // Never let cleanup failure take down the process it is cleaning up after.
  }
}
