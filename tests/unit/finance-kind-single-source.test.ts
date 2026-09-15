import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FINANCE_KINDS, isFinanceParty } from '@/lib/finance/kinds'

/**
 * What differs between a receipt and a pay slip lives in FINANCE_KINDS (src/lib/finance/kinds.ts).
 *
 * An inline `kind === 'receipt' ? ... : ...` re-states one of those rules in a second place, with
 * its own error type and wording, so a new payee role means finding every copy. This keeps such
 * branches out; a file that genuinely renders the two kinds differently is listed with why.
 */

const ROOTS = ['src/app', 'src/lib']
const KIND_BRANCH = /\bkind === 'receipt'|\bkind === 'payslip'/

const ALLOWED: Record<string, string> = {
  'src/lib/finance/kinds.ts': 'names the pattern in its own documentation',
  'src/lib/finance/render.ts': 'picks the HTML template - two different documents, not a rule',
  'src/lib/finance/handlers.ts': 'lays out the CSV export, whose columns differ by kind',
  'src/lib/services/finance/hours-billing.ts':
    'reads the side of the hours report a kind bills - students received, tutors taught',
}

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'mock' ? [] : files(full)
    return /\.tsx?$/.test(entry.name) ? [full.replace(/\\/g, '/')] : []
  })
}

describe('finance kinds come from one table', () => {
  it('each kind states every rule the issue path reads', () => {
    expect(isFinanceParty('receipt', 'student')).toBe(true)
    expect(isFinanceParty('receipt', 'tutor')).toBe(false)
    expect(isFinanceParty('payslip', 'mentor')).toBe(true)
    expect(FINANCE_KINDS.receipt.rateField).toBe('fee_rate')
    expect(FINANCE_KINDS.payslip.prefixField).toBe('payslip_prefix')
  })

  it('no other file branches on the kind', () => {
    const offenders = ROOTS.flatMap(files)
      .filter((file) => !(file in ALLOWED))
      .filter((file) => KIND_BRANCH.test(readFileSync(file, 'utf8')))
    expect(offenders, 'Read the difference from FINANCE_KINDS, or list the file in ALLOWED with why').toEqual([])
  })

  it('every allowed file still branches', () => {
    const stale = Object.keys(ALLOWED).filter((file) => !KIND_BRANCH.test(readFileSync(file, 'utf8')))
    expect(stale).toEqual([])
  })
})
