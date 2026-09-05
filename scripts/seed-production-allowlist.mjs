import { createClient } from '@supabase/supabase-js'
import { randomBytes, createHash } from 'node:crypto'

// One-time setup codes, mirroring src/lib/auth/setup-code.ts. A seeded allowlist row
// must be REGISTRABLE - status 'pending' with a hashed code + expiry - because
// /register requires exactly that (B-10: a status:'active' row with no code can never
// complete registration, bricking the bootstrap admin). The plain code is printed once
// here; hand it to the person to finish setup at /register.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous I/O/0/1
const CODE_LENGTH = 8
const CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days, same as the invite flow

function generateSetupCode() {
  const bytes = randomBytes(CODE_LENGTH)
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return out
}

function hashSetupCode(code) {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex')
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in your environment.')
  process.exit(1)
}

/**
 * Every persona the portal has a distinct experience for. Seeding only admin/tutor/student
 * leaves sub_admin and mentor with no account at all - which is how an environment ends up
 * unable to exercise (or even sign into) half its roles. `role` values are the user_role
 * enum: admin | sub_admin | tutor | mentor | student.
 */
const PERSONAS = [
  { role: 'admin', env: 'PRODUCTION_SEED_ADMIN_EMAIL', full_name: 'Academy Admin' },
  { role: 'sub_admin', env: 'PRODUCTION_SEED_SUB_ADMIN_EMAIL', full_name: 'Sub Admin' },
  // PRODUCTION_SEED_TEACHER_EMAIL kept as an alias so existing .env files keep working.
  { role: 'tutor', env: 'PRODUCTION_SEED_TUTOR_EMAIL', alias: 'PRODUCTION_SEED_TEACHER_EMAIL', full_name: 'Tutor' },
  { role: 'mentor', env: 'PRODUCTION_SEED_MENTOR_EMAIL', full_name: 'Mentor' },
  { role: 'student', env: 'PRODUCTION_SEED_STUDENT_EMAIL', full_name: 'Student', class_level: 'Grade 10' },
]

// Positional args follow the PERSONAS order; either source may be used, and any persona
// may be omitted - so the same script seeds a fresh environment or repairs one account.
const requested = PERSONAS.map((p, i) => ({
  ...p,
  email: process.argv[2 + i] || process.env[p.env] || (p.alias ? process.env[p.alias] : undefined),
})).filter((p) => p.email)

if (requested.length === 0) {
  console.log(`
Usage:
  node --env-file=.env.local scripts/seed-production-allowlist.mjs <admin> <sub_admin> <tutor> <mentor> <student>

Every argument is optional - pass only the personas you want to seed or repair.
Or set any of these in .env.local:
${PERSONAS.map((p) => `  ${p.env}=...`).join('\n')}
`)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function seed() {
  console.log('Seeding profiles allowlist in database...')

  const issued = []
  for (const p of requested) {
    const { email, role, full_name, class_level } = p
    // Never clobber an already-registered account: if a row exists with an auth
    // identity bound, resetting it to pending + a fresh code would lock that person
    // out. Only (re)issue a code to an un-registered row.
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, auth_user_id, status, setup_code_hash')
      .eq('email', email)
      .maybeSingle()

    if (existing?.auth_user_id) {
      console.log(`↷ Skipped ${role} (${email}) - already registered (auth bound).`)
      continue
    }

    // A row that is ACTIVE yet has no auth identity and no setup code is BRICKED: it
    // cannot sign in (no password) and cannot self-register either, because /register
    // requires status 'pending' AND a valid code. Older seeding created exactly this.
    // Re-issuing below repairs it, so say so rather than reporting a plain "seeded".
    const bricked = Boolean(existing && !existing.auth_user_id && existing.status !== 'pending')
    if (bricked) {
      console.log(`🔧 Repairing ${role} (${email}) - was '${existing.status}' with no login; re-issuing a setup code.`)
    }

    const code = generateSetupCode()
    const row = {
      email,
      role,
      full_name,
      ...(class_level ? { class_level } : {}),
      status: 'pending',
      setup_code_hash: hashSetupCode(code),
      setup_code_expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    }

    const { data, error } = await supabase
      .from('profiles')
      .upsert(row, { onConflict: 'email' })
      .select('id, email, role')
      .single()

    if (error) {
      console.error(`❌ Failed to seed ${p.role} (${p.email}):`, error.message)
    } else {
      console.log(`✅ Seeded ${data.role}: ${data.email} (ID: ${data.id})`)
      issued.push({ role: data.role, email: data.email, code })
    }
  }

  if (issued.length) {
    console.log('\nSetup codes (valid 7 days) - hand each to the person to finish at /register:')
    for (const i of issued) console.log(`  ${i.role.padEnd(9)} ${i.email.padEnd(32)} code: ${i.code}`)
    console.log('\nEach person signs in at /register with their email + code to set a password.')
  }
}

seed().catch((err) => {
  console.error('Unhandled error during seed:', err)
  process.exit(1)
})
