// Post-build guard: assert that every client boundary a page DIRECTLY imports is present
// in that page's React client-reference manifest.
//
// The failure this catches: under `next build --webpack`, a client component can stay in
// the module graph yet be DROPPED from the page's client-reference manifest (a barrel-import
// / manifest-generation quirk). The page then throws at runtime -
//   "Could not find the module ...#Component in the React Client Manifest"
// - and renders "Something went wrong" for every user, while dev, typecheck, and unit tests
// all stay green. Only E2E catches it, and only if a spec happens to open that page.
// (The known case: /messages/[id]'s MessageComposer, kept in the manifest by
// deep-importing Card from @/lib/ui/layout instead of the @/lib/ui barrel.)
//
// Same spirit as the duplicate-migration-prefix and snapshot-freshness gates: turn an
// otherwise-invisible failure into a loud, mechanical build-time error.
//
// Run AFTER `next build`. Exit 0 when every page's directly-imported client boundary is
// registered, 1 (listing the offenders) otherwise.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { normalize } from 'node:path'

const SRC_APP = 'src/app'
const NEXT_APP = '.next/server/app'

// Collapse any run of forward/back slashes to a single '/', so paths compare identically
// regardless of OS separator or the JSON '\\' escaping used inside the manifest.
const toPosix = (p) => p.replace(/[\\/]+/g, '/')

if (!existsSync(NEXT_APP)) {
  console.error('check-client-manifest: no build output at .next/server/app - run `next build` first.')
  process.exit(1)
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = `${dir}/${name}`
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

// A client boundary declares 'use client' at the very top of the file.
function isClientModule(file) {
  if (!existsSync(file)) return false
  return /^\s*(['"])use client\1/.test(readFileSync(file, 'utf8'))
}

// Resolve a relative import specifier (./x, ../x) from a page's dir to a source file,
// returned as a normalized posix path with '.'/'..' segments collapsed - the form the
// manifest stores it in.
function resolveImport(fromDir, spec) {
  const base = `${fromDir}/${spec}`
  const found = [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`].find((c) => existsSync(c))
  return found ? toPosix(normalize(found)) : null
}

const pages = walk(SRC_APP)
  .map(toPosix)
  .filter((f) => f.endsWith('/page.tsx'))
const failures = []
let scannedWithClients = 0

for (const page of pages) {
  const src = readFileSync(page, 'utf8')
  const dir = page.slice(0, page.lastIndexOf('/'))

  const clientDeps = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)]
    .map((m) => resolveImport(dir, m[1]))
    .filter((r) => r && isClientModule(r))
  if (clientDeps.length === 0) continue
  scannedWithClients++

  // src/app/<route>/page.tsx  ->  .next/server/app/<route>/page_client-reference-manifest.js
  const route = dir.slice(SRC_APP.length + 1)
  const manifest = `${NEXT_APP}/${route}/page_client-reference-manifest.js`
  if (!existsSync(manifest)) {
    failures.push(`${page}: imports client component(s) but emitted no client-reference manifest (${manifest}).`)
    continue
  }
  const manifestNorm = toPosix(readFileSync(manifest, 'utf8'))
  for (const dep of clientDeps) {
    if (!manifestNorm.includes(dep)) {
      failures.push(
        `${page}: client boundary ${dep} is NOT registered in its client-reference manifest - ` +
          `the page will 500 at runtime ("Could not find the module in the React Client Manifest").`,
      )
    }
  }
}

if (failures.length > 0) {
  console.error(`::error::${failures.length} client boundary/manifest mismatch(es):`)
  for (const f of failures) console.error(`  ${f}`)
  console.error(
    '\nA page that imports a client component missing from its manifest renders "Something went wrong"\n' +
      'for every user. Deep-import the offending module (see src/app/(prt)/messages/[id]/page.tsx) or\n' +
      'adjust its imports, rebuild, and re-run.',
  )
  process.exit(1)
}

console.log(
  `check-client-manifest: OK - every directly-imported client boundary is registered (${scannedWithClients} pages with client deps).`,
)
