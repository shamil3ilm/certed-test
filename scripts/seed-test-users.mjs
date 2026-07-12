import { createClient } from '@supabase/supabase-js'

// Seeds one ready-to-use account per role (email + password) for testing personas
// against a real Supabase project. Run once:
//   node --env-file=.env.local scripts/seed-test-users.mjs
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY. Optional SEED_TEST_PASSWORD.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
if (!url || !secret) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set.')
  process.exit(1)
}

const PASSWORD = process.env.SEED_TEST_PASSWORD || 'CertEd@123'
const c = createClient(url, secret)

const USERS = [
  { email: 'superadmin@certed.test', full_name: 'Super Admin', role: 'admin' },
  { email: 'subadmin@certed.test', full_name: 'Sub Admin', role: 'sub_admin' },
  { email: 'tutor@certed.test', full_name: 'Test Tutor', role: 'teacher' },
  { email: 'mentor@certed.test', full_name: 'Test Mentor', role: 'teacher' },
  { email: 'student@certed.test', full_name: 'Test Student', role: 'student', class_level: 'Grade 10' },
]

async function findAuthUserId(email) {
  // Paginate the admin user list to find an existing auth user by email.
  for (let page = 1; page <= 20; page++) {
    const { data } = await c.auth.admin.listUsers({ page, perPage: 200 })
    const hit = data?.users?.find((u) => u.email === email)
    if (hit) return hit.id
    if (!data?.users?.length || data.users.length < 200) break
  }
  return null
}

async function seed() {
  for (const u of USERS) {
    // 1. Allowlist profile row.
    const { data: prof, error: pErr } = await c
      .from('profiles')
      .upsert(
        { email: u.email, full_name: u.full_name, role: u.role, status: 'active', class_level: u.class_level ?? null },
        { onConflict: 'email' },
      )
      .select('id')
      .single()
    if (pErr) {
      console.error(`❌ profile ${u.email}: ${pErr.message}`)
      continue
    }

    // 2. Auth account with a password (email pre-confirmed). Reuse if it exists.
    let authId
    const { data: created, error: aErr } = await c.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
    })
    if (created?.user) {
      authId = created.user.id
    } else {
      authId = await findAuthUserId(u.email)
      if (authId) {
        await c.auth.admin.updateUserById(authId, { password: PASSWORD, email_confirm: true })
      } else {
        console.error(`❌ auth ${u.email}: ${aErr?.message ?? 'could not create or find'}`)
        continue
      }
    }

    // 3. Bind + clear any setup code.
    const { error: bErr } = await c
      .from('profiles')
      .update({ auth_user_id: authId, setup_code_hash: null, setup_code_expires_at: null })
      .eq('id', prof.id)
    if (bErr) {
      console.error(`❌ bind ${u.email}: ${bErr.message}`)
      continue
    }
    console.log(`✅ ${u.role.padEnd(9)} ${u.email}`)
  }

  // Link the mentor to the test student so the "mentor" persona has a mentee to see.
  const { data: mentor } = await c.from('profiles').select('id').eq('email', 'mentor@certed.test').maybeSingle()
  const { data: student } = await c.from('profiles').select('id').eq('email', 'student@certed.test').maybeSingle()
  if (mentor && student) {
    const { error } = await c
      .from('mentorships')
      .upsert({ teacher_id: mentor.id, student_id: student.id, active: true }, { onConflict: 'teacher_id,student_id' })
    if (error) console.error(`❌ mentorship: ${error.message}`)
    else console.log('✅ mentorship  mentor@certed.test → student@certed.test')
  }

  console.log(`\nAll set. Sign in with any of the above and password: ${PASSWORD}`)
}

seed().catch((e) => {
  console.error('Unhandled error during seed:', e)
  process.exit(1)
})
