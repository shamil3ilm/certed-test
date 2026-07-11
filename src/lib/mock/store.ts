import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSeed, type MockDb } from './seed'

/**
 * JSON-file-backed database for MOCK MODE. The data lives in `.mock-db.json` at
 * the project root: it is loaded on first access (seeded if absent) and rewritten
 * on every mutation, so rows you add while clicking around survive dev-server
 * restarts and the file can be opened/edited by hand. A copy is cached on
 * globalThis so reads don't re-hit disk and survive Next's hot-reloads.
 */
const KEY = '__CERTED_MOCK_DB__'
const FILE = join(process.cwd(), '.mock-db.json')

type Holder = { [KEY]?: MockDb }
const holder = globalThis as unknown as Holder

function load(): MockDb {
  if (holder[KEY]) return holder[KEY]!
  if (existsSync(FILE)) {
    try {
      const persisted = JSON.parse(readFileSync(FILE, 'utf8')) as MockDb
      // Non-destructively add any tables introduced to the seed since this file
      // was written (e.g. mentorships), preserving the user's existing rows.
      const seed = buildSeed()
      let changed = false
      for (const key of Object.keys(seed)) {
        if (!(key in persisted)) {
          persisted[key] = seed[key]
          changed = true
        }
      }
      holder[KEY] = persisted
      if (changed) persist()
      return holder[KEY]!
    } catch {
      /* corrupt file → fall through and reseed */
    }
  }
  holder[KEY] = buildSeed()
  persist()
  return holder[KEY]!
}

/** Returns the live array for a table (creating an empty one if unseeded). */
export function table(name: string): Record<string, unknown>[] {
  const d = load()
  if (!d[name]) {
    d[name] = []
    persist()
  }
  return d[name]
}

/** Writes the whole DB back to disk. Called by the query builder after writes. */
export function persist(): void {
  if (!holder[KEY]) return
  try {
    writeFileSync(FILE, JSON.stringify(holder[KEY], null, 2))
  } catch {
    /* best-effort persistence in dev */
  }
}
