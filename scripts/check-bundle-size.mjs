#!/usr/bin/env node
/**
 * First-load bundle ratchet. After `next build`, the gzipped JS that EVERY page
 * loads on first paint (the shared runtime + app shell) must not exceed the
 * budget in bundle-budget.json - so per-page-load weight can't creep up unnoticed.
 *
 * It measures the SHARED first-load set (build-manifest `rootMainFiles`), not the
 * whole `.next/static` tree: code that is code-split into on-demand async chunks
 * (e.g. Sentry lazy-imported only when a DSN is set, or FullCalendar on /calendar)
 * is correctly NOT counted, because users don't download it on page load. That is
 * the point - it rewards code-splitting and catches anything pulled into the
 * always-loaded graph (like an unconditional top-level SDK import).
 *
 * Ratchet DOWN (lower "firstLoadSharedKb") when a change trims first-load; raising
 * it should be a deliberate, justified decision in the PR.
 */
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const MANIFEST = '.next/build-manifest.json'
const BUDGET_FILE = 'bundle-budget.json'

let budget
try {
  budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'))
} catch {
  console.error(`Missing or invalid ${BUDGET_FILE}`)
  process.exit(1)
}

let manifest
try {
  manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
} catch {
  console.error(`Could not read ${MANIFEST}. Run \`next build\` first.`)
  process.exit(1)
}

// Files loaded on every page: the shared runtime/app shell.
const shared = [
  ...new Set([...(manifest.rootMainFiles ?? []), ...((manifest.pages && manifest.pages['/_app']) ?? [])]),
].filter((f) => f.endsWith('.js'))

if (shared.length === 0) {
  console.error('No shared first-load chunks found in the build manifest - unexpected build output.')
  process.exit(1)
}

let bytes = 0
for (const f of shared) bytes += gzipSync(readFileSync('.next/' + f)).length
const kb = Math.round((bytes / 1024) * 10) / 10
const limit = budget.firstLoadSharedKb
console.log(`First-load shared JS (gzipped): ${kb} KB across ${shared.length} chunks. Budget: ${limit} KB.`)

if (kb > limit) {
  console.error(
    `::error::First-load shared JS over budget by ${(kb - limit).toFixed(1)} KB. Code-split the addition (lazy import), or raise "firstLoadSharedKb" in ${BUDGET_FILE} with justification.`,
  )
  process.exit(1)
}

const headroom = limit - kb
if (headroom > limit * 0.12) {
  console.log(
    `::notice::${headroom.toFixed(1)} KB under budget - ratchet "firstLoadSharedKb" down toward ${Math.ceil(kb) + 5} to lock in the reduction.`,
  )
}
console.log('First-load bundle within budget.')
