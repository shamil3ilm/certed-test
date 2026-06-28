import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your environment.')
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
    { email: adminEmail, full_name: 'Academy Admin', role: 'admin', status: 'active' },
    { email: teacherEmail, full_name: 'Tutor / Teacher', role: 'teacher', status: 'active' },
    { email: studentEmail, full_name: 'Student', role: 'student', status: 'active', class_level: 'Grade 10' }
  ]

  for (const p of profiles) {
    const { data, error } = await supabase
      .from('profiles')
      .upsert(p, { onConflict: 'email' })
      .select('id, email, role')
      .single()

    if (error) {
      console.error(`❌ Failed to seed ${p.role} (${p.email}):`, error.message)
    } else {
      console.log(`✅ Seeded ${data.role} successfully: ${data.email} (ID: ${data.id})`)
    }
  }
}

seed().catch((err) => {
  console.error('Unhandled error during seed:', err)
  process.exit(1)
})
