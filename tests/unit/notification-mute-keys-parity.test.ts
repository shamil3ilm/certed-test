import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MUTABLE_NOTIFICATION_KEYS } from '@/lib/notifications/keys'

/**
 * The database CHECK on notification_mutes.key and the app's list of mutable kinds are two copies
 * of one fact. If they drift, a kind the form offers is refused by the database (the save fails),
 * or one the database allows is never offered. This holds them together.
 */
describe('notification mute keys: migration 0125 and the app agree', () => {
  const sql = readFileSync('supabase/migrations/0125_notification_mutes.sql', 'utf8')
  const check = /check \(key in \(([^)]*)\)/.exec(sql)?.[1] ?? ''
  const inDatabase = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()

  it('allow exactly the same keys', () => {
    expect(inDatabase.length).toBeGreaterThan(0)
    expect(inDatabase).toEqual(MUTABLE_NOTIFICATION_KEYS.map((k) => k.key).sort())
  })
})
