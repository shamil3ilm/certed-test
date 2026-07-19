#!/usr/bin/env ts-node

/**
 * Verify the fresh-environment schema against the real migration chain.
 * Usage: npx ts-node scripts/verify-migrations.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

type Phase = {
  name: string
  migrations: string[]
  description: string
  tables: string[]
}

const phases: Phase[] = [
  {
    name: 'Base Schema (0001-0011)',
    migrations: ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011'],
    description: 'Core schema, RLS, and disabled-user hardening',
    tables: [
      'profiles',
      'org_settings',
      'classes',
      'enrollments',
      'class_teachers',
      'mentorships',
      'audit_log',
      'announcements',
      'resources',
      'assignments',
      'submissions',
      'meet_links',
      'comments',
      'timetable_slots',
      'calendar_events',
      'attendance',
      'receipts',
      'receipt_lines',
      'payslips',
      'payslip_lines',
      'document_counters',
      'reminders',
    ],
  },
  {
    name: 'Atomic Operations (0012-0013)',
    migrations: ['0012', '0013'],
    description: 'RPC-backed mutation helpers',
    tables: [],
  },
  {
    name: 'Persona Foundation (0014-0016)',
    migrations: ['0014', '0015', '0016'],
    description: 'Persona table, population, and helper functions',
    tables: ['persona_assignments'],
  },
  {
    name: 'Persona RLS Hardening (0017)',
    migrations: ['0017'],
    description: 'Disabled-user, settings, and finance RLS hardening under the persona model',
    tables: [],
  },
]

async function verifyTable(table: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' })
    if (error) return { ok: false, message: error.message }
    return { ok: true, message: 'ok' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown error' }
  }
}

async function listActivePersonas() {
  const { data, error } = await supabase.from('persona_assignments').select('persona_name').eq('status', 'active')
  if (error) return { error: error.message, counts: null as Record<string, number> | null }

  const counts = (data ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.persona_name] = (acc[row.persona_name] ?? 0) + 1
    return acc
  }, {})

  return { error: null, counts }
}

async function verifyTableGroup(label: string, tables: string[]) {
  console.log(label)
  let okCount = 0
  let issueCount = 0

  for (const table of tables) {
    const result = await verifyTable(table)
    if (result.ok) {
      console.log(`  OK   ${table}`)
      okCount++
    } else {
      console.log(`  FAIL ${table}: ${result.message}`)
      issueCount++
    }
  }

  console.log()
  return { okCount, issueCount }
}

async function main() {
  console.log('Verifying fresh-environment schema for production readiness')
  console.log()

  let totalOK = 0
  let totalIssues = 0

  for (const phase of phases) {
    console.log(`${phase.name}`)
    console.log(`  Migrations: ${phase.migrations.join(', ')}`)
    console.log(`  ${phase.description}`)

    if (phase.tables.length > 0) {
      const result = await verifyTableGroup('  Tables:', phase.tables)
      totalOK += result.okCount
      totalIssues += result.issueCount
    } else {
      console.log('  No direct table checks in this phase')
      console.log()
    }
  }

  console.log('Persona assignment population')
  const personas = await listActivePersonas()
  if (personas.error) {
    console.log(`  FAIL persona_assignments: ${personas.error}`)
    totalIssues++
  } else if (!personas.counts || Object.keys(personas.counts).length === 0) {
    console.log('  WARN no active persona assignments found; run the seed script before persona verification')
  } else {
    for (const [name, count] of Object.entries(personas.counts).sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`  OK   ${name}: ${count}`)
    }
    totalOK++
  }

  console.log()
  console.log('Manual checks still required')
  console.log('  1. Compare pg_policies output against docs/rls-policy-inventory.md')
  console.log('  2. Run the unit and E2E suites against the fresh environment')
  console.log('  3. Confirm the policy count matches the inventory (~40 policies)')
  console.log()
  console.log('Summary')
  console.log(`  OK: ${totalOK}`)
  console.log(`  Issues: ${totalIssues}`)

  process.exit(totalIssues === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
