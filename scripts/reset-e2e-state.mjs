import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const MOCK_DB = join(root, '.mock-db.json')
const LOCK = join(root, '.mock-db.lock')

/**
 * The image name of a live process, lowercased, or null when it is not running.
 *
 * This exists because a bare pid is not an identity. `.mock-db.lock` holds only a number
 * (src/lib/mock/exclusive.ts writes it), and `process.kill(pid, 0)` succeeds for ANY live
 * process - so once the OS recycles a dead mock server's pid, the lock points at whatever
 * now owns that number. That is not hypothetical: a run was refused naming a pid that had
 * become a Chrome renderer in the developer's own browser, and the advice printed below
 * used to be an unconditional force-kill of it.
 *
 * A probe, not a guess: only a node process can be the mock server, so anything else means
 * the lock is stale. An unreadable probe returns undefined and is treated as "cannot tell",
 * which keeps the refusal rather than risking two servers sharing one database.
 */
function processImage(pid) {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      // No match prints an INFO line rather than failing, and carries no CSV quoting.
      const name = out.trim().startsWith('"') ? out.trim().split('","')[0].replace(/^"/, '') : null
      return name ? name.toLowerCase() : null
    }
    const out = execFileSync('ps', ['-p', String(pid), '-o', 'comm='], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.trim() ? out.trim().toLowerCase() : null
  } catch {
    // ps exits non-zero when the pid is gone; tasklist may be unavailable in a stripped
    // environment. Neither case can be distinguished here, so report "cannot tell".
    return undefined
  }
}

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
 * A lock naming a dead pid is stale - a crashed or killed server - and is cleared rather
 * than treated as a conflict, so a hard kill never wedges the next run. A lock naming a
 * live pid that is NOT a node process is stale too: the number was recycled.
 */
function liveHolder() {
  if (!existsSync(LOCK)) return null
  const pid = Number.parseInt(readFileSync(LOCK, 'utf8').trim(), 10)
  if (!Number.isInteger(pid) || pid <= 0) return null

  const image = processImage(pid)
  if (image === null) return null // not running at all
  if (image !== undefined && !image.includes('node')) return null // recycled onto something else

  return { pid, image: image ?? 'unknown' }
}

const holder = liveHolder()
if (holder !== null) {
  console.error('')
  console.error(`E2E reset REFUSED: pid ${holder.pid} (${holder.image}) still holds the mock database.`)
  console.error('It shares this run’s .mock-db.json, so specs would fail on rows they did not create')
  console.error('- typically "strict mode violation: resolved to 2 elements" naming their own fixture.')
  console.error('Nothing has been reset and no test has run.')
  console.error('')
  console.error('If that is a mock server of this repo, stop it and re-run.')
  console.error('If it is something else - the lock holds a bare pid, and a dead server’s pid can be')
  console.error('recycled onto an unrelated process - then the lock is stale and deleting it is enough:')
  console.error(`  rm ${LOCK}`)
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
