import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClientCapturing } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/mock/env', () => ({ isMock: vi.fn(() => false) }))

import { createAdminClient } from '@/lib/supabase/admin'
import { isMock } from '@/lib/mock/env'
import { selectExchangeRates, upsertExchangeRate, deleteExchangeRate } from '@/lib/data/exchange-rates'
import { selectRlsDisabledTables } from '@/lib/data/schema-health'

/**
 * FX rates decide what every finance figure reports in, and re-pricing reads them for every
 * document. Two things are worth pinning: the upsert's conflict target (it is what makes
 * re-entering a rate a CORRECTION rather than a duplicate), and that `rate` is coerced to a
 * number - Postgres returns numeric as a string over PostgREST, and a string would turn
 * later arithmetic into concatenation.
 */

function stub(result: { data: unknown; error: unknown }) {
  const { builder, client } = makeClientCapturing(result)
  vi.mocked(createAdminClient).mockReturnValue(client as never)
  return { builder, client }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(isMock).mockReturnValue(false)
})

describe('exchange rates', () => {
  it('coerces the numeric rate to a number, not the string PostgREST returns', async () => {
    stub({
      data: [
        {
          id: 'r-1',
          currency: 'AED',
          base_currency: 'INR',
          rate: '22.75',
          effective_from: '2026-01-01',
          note: null,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    })
    const [row] = await selectExchangeRates()
    expect(row.rate).toBe(22.75)
    expect(typeof row.rate).toBe('number')
  })

  it('orders by currency then newest effective date', async () => {
    const { builder } = stub({ data: [], error: null })
    await selectExchangeRates()
    expect(builder.order).toHaveBeenCalledWith('currency', { ascending: true })
    expect(builder.order).toHaveBeenCalledWith('effective_from', { ascending: false })
  })

  it('returns an empty list rather than null when no rates are stored', async () => {
    stub({ data: null, error: null })
    await expect(selectExchangeRates()).resolves.toEqual([])
  })

  it('upserts on (currency, base_currency, effective_from) so a re-entry CORRECTS', async () => {
    // That triple is the table's unique key. A different conflict target - or none - would
    // make an admin fixing a typo silently create a second rate for the same date, and
    // which one applied would depend on read order.
    const { builder } = stub({ data: null, error: null })
    await upsertExchangeRate({
      currency: 'AED',
      base_currency: 'INR',
      rate: 22.75,
      effective_from: '2026-01-01',
      note: null,
      created_by: 'admin-1',
    })
    expect(builder.upsert).toHaveBeenCalledWith(expect.objectContaining({ currency: 'AED' }), {
      onConflict: 'currency,base_currency,effective_from',
    })
  })

  it('deletes by id', async () => {
    const { builder } = stub({ data: null, error: null })
    await deleteExchangeRate('r-1')
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.eq).toHaveBeenCalledWith('id', 'r-1')
  })

  it.each([
    ['select', () => selectExchangeRates()],
    ['delete', () => deleteExchangeRate('r-1')],
  ])('%s surfaces a PostgREST error rather than returning empty', async (_n, call) => {
    stub({ data: null, error: { message: 'boom' } })
    await expect(call()).rejects.toThrow(/boom/)
  })
})

describe('schema health', () => {
  it('short-circuits in mock mode without touching the database', async () => {
    // This guard is why the mock RPC parity gate exempts rls_disabled_tables - that
    // exemption is only sound while this early return exists, so pin it here too.
    vi.mocked(isMock).mockReturnValue(true)
    await expect(selectRlsDisabledTables(['profiles'])).resolves.toEqual([])
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('short-circuits on an empty table list', async () => {
    await expect(selectRlsDisabledTables([])).resolves.toEqual([])
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('reports the tables the function names', async () => {
    const { client } = stub({ data: null, error: null })
    client.rpc = vi.fn(async () => ({ data: ['attendance'], error: null })) as never
    await expect(selectRlsDisabledTables(['attendance', 'profiles'])).resolves.toEqual(['attendance'])
    expect(client.rpc).toHaveBeenCalledWith('rls_disabled_tables', { p_tables: ['attendance', 'profiles'] })
  })

  it('throws when the diagnostic itself fails, rather than reporting "all healthy"', async () => {
    const { client } = stub({ data: null, error: null })
    client.rpc = vi.fn(async () => ({ data: null, error: { message: 'no such function' } })) as never
    await expect(selectRlsDisabledTables(['profiles'])).rejects.toThrow(/no such function/)
  })
})
