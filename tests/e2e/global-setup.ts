import { rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Playwright global setup: start every E2E run from a clean mock database.
 *
 * The mock store (src/lib/mock/store.ts) persists to `.mock-db.json` and reseeds
 * from buildSeed() whenever that file is absent. Rows created by one run would
 * otherwise leak into the next, making the suite order-dependent and unfit for
 * CI. Deleting the file here (before the webServer boots) guarantees a
 * deterministic, un-polluted starting state.
 *
 * This runs before the `webServer` is started, so the fresh server process
 * reseeds on first request. A reused server (local `reuseExistingServer`) keeps
 * its in-memory copy - restart it, or let CI start a fresh one, for a clean run.
 */
export default function globalSetup() {
  rmSync(join(process.cwd(), '.mock-db.json'), { force: true })
}
