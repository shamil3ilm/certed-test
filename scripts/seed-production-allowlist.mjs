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

// Read from command line arguments or fall back to environment variables
const adminEmail = process.argv[2] || process.env.PRODUCTION_SEED_ADMIN_EMAIL
const teacherEmail = process.argv[3] || process.env.PRODUCTION_SEED_TEACHER_EMAIL
const studentEmail = process.argv[4] || process.env.PRODUCTION_SEED_STUDENT_EMAIL

if (!adminEmail || !teacherEmail || !studentEmail) {
  console.log(`
Usage:
  node --env-file=.env.local scripts/seed-production-allowlist.mjs <admin-email> <teacher-email> <student-email>

Or set these variables in .env.local:
  PRODUCTION_SEED_ADMIN_EMAIL=...
  PRODUCTION_SEED_TEACHER_EMAIL=...
  PRODUCTION_SEED_STUDENT_EMAIL=...
`)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function seed() {
  console.log('Seeding profiles allowlist in database...')

  const profiles = [
    { email: adminEmail, full_name: 'Academy Admin', role: 'admin' },
    { email: teacherEmail, full_name: 'Tutor', role: 'tutor' },
    { email: studentEmail, full_name: 'Student', role: 'student', class_level: 'Grade 10' },
  ]

  const issued = []
  for (const p of profiles) {
    // Never clobber an already-registered account: if a row exists with an auth
    // identity bound, resetting it to pending + a fresh code would lock that person
    // out (B-11 upsert-overwrite). Only (re)issue a code to an un-registered row.
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, auth_user_id')
      .eq('email', p.email)
      .maybeSingle()

    if (existing?.auth_user_id) {
      console.log(`↷ Skipped ${p.role} (${p.email}) - already registered (auth bound).`)
      continue
    }

    const code = generateSetupCode()
    const row = {
      ...p,
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
    for (const i of issued) console.log(`  ${i.role.padEnd(7)} ${i.email.padEnd(32)} code: ${i.code}`)
    console.log('\nEach person signs in at /register with their email + code to set a password.')
  }
}

seed().catch((err) => {
  console.error('Unhandled error during seed:', err)
  process.exit(1)
})
