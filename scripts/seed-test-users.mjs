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
  { email: 'subadmin@certed.test', full_name: 'Admin', role: 'sub_admin' },
  { email: 'tutor@certed.test', full_name: 'Test Tutor', role: 'tutor' },
  { email: 'mentor@certed.test', full_name: 'Test Mentor', role: 'mentor' },
  { email: 'student@certed.test', full_name: 'Test Student', role: 'student', class_level: 'Grade 10' },
]

/**
 * Grant the account its GLOBAL persona.
 *
 * `profiles.role` does not confer access: getActorContext resolves an actor's capabilities from
 * persona_assignments alone, and the role-based set in lib/capabilities is identity/display only.
 * An account seeded without this row signs in to an empty nav and an empty dashboard, which
 * reads exactly like a broken login.
 *
 * Select-then-write rather than upsert: the table's UNIQUE(profile_id, persona_name, scope_id)
 * does not constrain a global row, because scope_id is NULL there and Postgres treats every NULL
 * as distinct - see migration 0025, which added a partial unique index for that reason.
 */
async function ensureGlobalPersona(profileId, role) {
  const { data: existing, error: findErr } = await c
    .from('persona_assignments')
    .select('id')
    .eq('profile_id', profileId)
    .eq('persona_name', role)
    .eq('scope_type', 'global')
    .is('scope_id', null)
    .maybeSingle()
  if (findErr) return findErr.message

  const { error } = existing?.id
    ? await c.from('persona_assignments').update({ status: 'active' }).eq('id', existing.id)
    : await c
        .from('persona_assignments')
        .insert({ profile_id: profileId, persona_name: role, scope_type: 'global', scope_id: null, status: 'active' })
  return error?.message ?? null
}

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
    const personaErr = await ensureGlobalPersona(prof.id, u.role)
    if (personaErr) {
      console.error(`❌ persona ${u.email}: ${personaErr}`)
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
      .upsert({ mentor_id: mentor.id, student_id: student.id, active: true }, { onConflict: 'mentor_id,student_id' })
    if (error) console.error(`❌ mentorship: ${error.message}`)
    else console.log('✅ mentorship  mentor@certed.test → student@certed.test')

    // The mentorship row alone grants nothing: the mentors_student RLS policy (0037) and
    // canMentor both require a mentor persona scoped to THAT student. scope_id is non-null
    // here, so the table's own UNIQUE(profile_id, persona_name, scope_id) carries the upsert.
    const { error: scopeErr } = await c.from('persona_assignments').upsert(
      {
        profile_id: mentor.id,
        persona_name: 'mentor',
        scope_type: 'student',
        scope_id: student.id,
        status: 'active',
      },
      { onConflict: 'profile_id,persona_name,scope_id' },
    )
    if (scopeErr) console.error(`❌ mentor persona scope: ${scopeErr.message}`)
    else console.log('✅ mentor scope  mentor@certed.test → student@certed.test')
  }

  console.log(`\nAll set. Sign in with any of the above and password: ${PASSWORD}`)
}

seed().catch((e) => {
  console.error('Unhandled error during seed:', e)
  process.exit(1)
})
