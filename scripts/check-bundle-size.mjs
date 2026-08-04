#!/usr/bin/env node
/**
 * Bundle-size ratchet. After `next build`, the total gzipped client JS must not
 * exceed the recorded budget in bundle-budget.json - so the client payload can't
 * silently grow PR by PR. When a change genuinely reduces the bundle, ratchet the
 * budget DOWN (lower "totalGzipKb") to lock in the win; the check nudges you when
 * there's comfortable headroom. Raising the budget should be a deliberate, noted
 * decision in the PR.
 *
 * Metric: total gzipped size of every .js under .next/static - stable and
 * independent of the build tool's chunk layout (webpack uses chunks/, turbopack
 * a build-id folder).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

const STATIC_DIR = '.next/static'
const BUDGET_FILE = 'bundle-budget.json'

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

let budget
try {
  budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'))
} catch {
  console.error(`Missing or invalid ${BUDGET_FILE}`)
  process.exit(1)
}

let bytes = 0
let count = 0
try {
  for (const file of walk(STATIC_DIR)) {
    bytes += gzipSync(readFileSync(file)).length
    count++
  }
} catch {
  console.error(`Could not read ${STATIC_DIR}. Run \`next build\` first.`)
  process.exit(1)
}

const kb = Math.round((bytes / 1024) * 10) / 10
const limit = budget.totalGzipKb
console.log(`Client JS (gzipped): ${kb} KB across ${count} chunks. Budget: ${limit} KB.`)

if (kb > limit) {
  console.error(
    `::error::Bundle over budget by ${(kb - limit).toFixed(1)} KB. Reduce client JS, or raise "totalGzipKb" in ${BUDGET_FILE} with justification.`,
  )
  process.exit(1)
}

const headroom = limit - kb
if (headroom > limit * 0.08) {
  console.log(
    `::notice::${headroom.toFixed(1)} KB under budget - ratchet "totalGzipKb" down toward ${Math.ceil(kb) + 5} to lock in the reduction.`,
  )
}
console.log('Bundle size within budget.')
