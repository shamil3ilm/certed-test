import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const MOCK_DB = join(root, '.mock-db.json')
const LOCK = join(root, '.mock-db.lock')

/**
 * Refuse to reset while another process still holds the mock database.
 *
 * `.mock-db.json` is one file in the repo root, rewritten wholesale on every mutation, so
 * two mock servers overwrite each other. The damage is not a crash: a spec fails on rows
 * it never created and reports "strict mode violation: resolved to 2 elements" against its
 * OWN fixture, which reads like a duplicate-render bug and sends the reader into the
 * component tree. Five specs failed that way once; the same suite passed 79/79 the moment
 * the stale server was killed.
 *
 * The check is on the LOCK, not on ports 3100/3101. A port probe would have missed the
 * case that actually happened - a process whose listener was killed but whose children
 * survived, holding the file while holding no port. The lock is written by the mock store
 * itself (src/lib/mock/exclusive.ts), so it names the holder however it is reachable.
 *
 * A lock naming a DEAD pid is stale - a crashed or killed server - and is cleared rather
 * than treated as a conflict, so a hard kill never wedges the next run.
 */
function liveHolder() {
  if (!existsSync(LOCK)) return null
  const pid = Number.parseInt(readFileSync(LOCK, 'utf8').trim(), 10)
  if (!Number.isInteger(pid) || pid <= 0) return null
  try {
    process.kill(pid, 0)
    return pid
  } catch (error) {
    // EPERM: exists but owned by another user - still a live holder.
    return error.code === 'EPERM' ? pid : null
  }
}

const holder = liveHolder()
if (holder !== null) {
  console.error('')
  console.error(`E2E reset REFUSED: pid ${holder} still holds the mock database.`)
  console.error('It shares this run’s .mock-db.json, so specs would fail on rows they did not create')
  console.error('- typically "strict mode violation: resolved to 2 elements" naming their own fixture.')
  console.error('Nothing has been reset and no test has run. Stop that process, then re-run:')
  console.error(`  Windows:  taskkill /PID ${holder} /T /F`)
  console.error(`  POSIX:    kill -9 ${holder}`)
  console.error('')
  process.exit(1)
}

// No live holder: clear a stale lock along with the data so the next server starts clean.
rmSync(LOCK, { force: true })
rmSync(MOCK_DB, { force: true })

const staleLock = join(root, '.next', 'lock')
if (existsSync(staleLock)) {
  rmSync(staleLock, { force: true })
}
