import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { REQUIRED_COLUMNS, missingRequiredColumn, nulledRequiredColumn } from '@/lib/mock/constraints'

/**
 * The mock store is a fixture, not a database, and is loose on purpose. But looseness in
 * the wrong place makes it LIE: a column the schema declares NOT NULL, written as null, is
 * refused by Postgres and accepted by the mock. The E2E suite then passes on a write
 * production would reject, and the failure surfaces only after deploy.
 *
 * The gate that matters is the reverse direction: every column the mock claims to require
 * must genuinely be NOT NULL in the chain, for THAT TABLE. A mock stricter than production
 * rejects writes that are actually fine, which is its own kind of lie - and a check that
 * merely greps the whole chain for "<column> not null" would accept a claim about a table
 * that has no such column at all, because some OTHER table does.
 */

const MIGRATIONS_DIR = 'supabase/migrations'

function chainSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
    .map((f) => readFileSync(`${MIGRATIONS_DIR}/${f}`, 'utf8'))
    .join('\n')
    .toLowerCase()
}

/** The body of `create table [if not exists] <table> ( ... )`, or '' when absent. Balanced
 *  to the matching paren so a nested type/CHECK does not truncate it early. */
function createTableBody(sql: string, table: string): string {
  const head = new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${table}\\s*\\(`, 'i')
  const at = sql.search(head)
  if (at < 0) return ''
  const open = sql.indexOf('(', at)
  let depth = 0
  for (let i = open; i < sql.length; i++) {
    if (sql[i] === '(') depth++
    else if (sql[i] === ')') {
      depth--
      if (depth === 0) return sql.slice(open + 1, i)
    }
  }
  return ''
}

/** Is `column` NOT NULL on `table` - either declared in its CREATE TABLE, or set so by a
 *  later ALTER on that same table? Both are scoped to the table, never chain-wide. */
function isNotNull(sql: string, table: string, column: string): boolean {
  const inCreate = createTableBody(sql, table)
    .split(',')
    .some((line) => new RegExp(`^\\s*${column}\\s`, 'i').test(line) && /not\s+null/i.test(line))
  const altered = new RegExp(
    `alter\\s+table\\s+(?:only\\s+)?(?:public\\.)?${table}\\s+alter\\s+column\\s+${column}\\s+set\\s+not\\s+null`,
    'i',
  ).test(sql)
  return inCreate || altered
}

describe('mock NOT NULL parity', () => {
  const sql = chainSql()

  it('only requires columns the chain declares NOT NULL ON THAT TABLE', () => {
    const overreach: string[] = []
    for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
      for (const column of columns) {
        if (!isNotNull(sql, table, column)) overreach.push(`${table}.${column}`)
      }
    }
    expect(
      overreach,
      `the mock requires these, but the chain never declares them NOT NULL on that table: ` +
        `${overreach.join(', ')}. A mock stricter than production rejects writes that would succeed.`,
    ).toEqual([])
  })

  it('is table-aware: a column NOT NULL elsewhere does not satisfy a claim about this table', () => {
    // profiles has no session_id at all, though attendance.session_id is NOT NULL. A
    // chain-wide grep would accept this; the gate must not.
    expect(isNotNull(sql, 'profiles', 'session_id')).toBe(false)
    expect(isNotNull(sql, 'attendance', 'session_id')).toBe(true)
  })

  it('names the missing column on INSERT so the rejection is diagnosable', () => {
    expect(missingRequiredColumn('attendance', { class_id: 'c', student_id: 's' })).toBe('session_id')
    expect(missingRequiredColumn('attendance', { class_id: 'c', student_id: 's', session_id: null })).toBe('session_id')
    expect(missingRequiredColumn('attendance', { class_id: 'c', student_id: 's', session_id: 'x' })).toBeNull()
    expect(missingRequiredColumn('profiles', {})).toBeNull()
  })

  it('on UPDATE rejects an explicit NULL but ignores a column the patch omits', () => {
    // A partial patch is normal; clearing a required foreign key is the write Postgres
    // refuses, and guarding inserts alone let exactly that through.
    expect(nulledRequiredColumn('attendance', { status: 'present' })).toBeNull()
    expect(nulledRequiredColumn('attendance', { session_id: null })).toBe('session_id')
    expect(nulledRequiredColumn('attendance', { session_id: 'sess-1' })).toBeNull()
  })
})
