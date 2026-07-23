#!/usr/bin/env ts-node

/**
 * Seed a fresh verification environment with minimal realistic data.
 * Usage: npx ts-node scripts/seed-test-data.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

type TestUser = {
  key: 'admin' | 'subadmin' | 'teacher' | 'mentor' | 'student'
  email: string
  fullName: string
  role: 'admin' | 'sub_admin' | 'teacher' | 'student'
  globalPersona: 'admin' | 'sub_admin' | 'tutor' | 'student'
}

const testUsers: TestUser[] = [
  { key: 'admin', email: 'admin@test.example.com', fullName: 'Admin User', role: 'admin', globalPersona: 'admin' },
  {
    key: 'subadmin',
    email: 'subadmin@test.example.com',
    fullName: 'Sub-Admin User',
    role: 'sub_admin',
    globalPersona: 'sub_admin',
  },
  {
    key: 'teacher',
    email: 'teacher@test.example.com',
    fullName: 'Teacher User',
    role: 'teacher',
    globalPersona: 'tutor',
  },
  { key: 'mentor', email: 'mentor@test.example.com', fullName: 'Mentor User', role: 'teacher', globalPersona: 'tutor' },
  {
    key: 'student',
    email: 'student@test.example.com',
    fullName: 'Student User',
    role: 'student',
    globalPersona: 'student',
  },
]

async function ensureProfile(user: TestUser): Promise<string | null> {
  const { data: existing, error: fetchError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', user.email)
    .maybeSingle()

  if (fetchError) {
    console.log(`  FAIL profile lookup ${user.email}: ${fetchError.message}`)
    return null
  }

  if (existing?.id) {
    await supabase
      .from('profiles')
      .update({ full_name: user.fullName, role: user.role, status: 'active' })
      .eq('id', existing.id)
    console.log(`  OK   profile ${user.email} (existing)`)
    return existing.id as string
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      email: user.email,
      full_name: user.fullName,
      role: user.role,
      status: 'active',
    })
    .select('id')
    .single()

  if (error) {
    console.log(`  FAIL profile insert ${user.email}: ${error.message}`)
    return null
  }

  console.log(`  OK   profile ${user.email}`)
  return data.id as string
}

async function ensureGlobalPersona(profileId: string, user: TestUser) {
  const { data: existing, error: fetchError } = await supabase
    .from('persona_assignments')
    .select('id')
    .eq('profile_id', profileId)
    .eq('persona_name', user.globalPersona)
    .eq('scope_type', 'global')
    .is('scope_id', null)
    .maybeSingle()

  if (fetchError) {
    console.log(`  FAIL persona lookup ${user.email}: ${fetchError.message}`)
    return
  }

  const payload = {
    profile_id: profileId,
    persona_name: user.globalPersona,
    scope_type: 'global',
    scope_id: null,
    status: 'active',
  }

  const { error } = existing?.id
    ? await supabase.from('persona_assignments').update({ status: 'active' }).eq('id', existing.id)
    : await supabase.from('persona_assignments').insert(payload)

  if (error) {
    console.log(`  FAIL persona ${user.email}: ${error.message}`)
  } else {
    console.log(`  OK   persona ${user.email} -> ${user.globalPersona}`)
  }
}

async function ensureClass(name: string): Promise<string | null> {
  const { data: existing, error: fetchError } = await supabase
    .from('classes')
    .select('id')
    .eq('name', name)
    .maybeSingle()
  if (fetchError) {
    console.log(`  FAIL class lookup ${name}: ${fetchError.message}`)
    return null
  }
  if (existing?.id) {
    console.log(`  OK   class ${name} (existing)`)
    return existing.id as string
  }

  const { data, error } = await supabase.from('classes').insert({ name, status: 'active' }).select('id').single()
  if (error) {
    console.log(`  FAIL class insert ${name}: ${error.message}`)
    return null
  }

  console.log(`  OK   class ${name}`)
  return data.id as string
}

async function main() {
  console.log('Seeding fresh-environment verification data')
  console.log()

  const profileIds: Partial<Record<TestUser['key'], string>> = {}
  for (const user of testUsers) {
    const id = await ensureProfile(user)
    if (id) {
      profileIds[user.key] = id
      await ensureGlobalPersona(id, user)
    }
  }

  console.log()
  const classIds = (
    await Promise.all(['Mathematics 101', 'Physics 101', 'Chemistry 101'].map((name) => ensureClass(name)))
  ).filter((value): value is string => Boolean(value))

  console.log()
  console.log('Assigning class teachers')
  for (const classId of classIds) {
    for (const key of ['teacher', 'mentor'] as const) {
      const teacherId = profileIds[key]
      if (!teacherId) continue
      const { error } = await supabase
        .from('class_teachers')
        .upsert({ class_id: classId, teacher_id: teacherId, active: true }, { onConflict: 'teacher_id,class_id' })
      if (error) console.log(`  FAIL class teacher ${key}: ${error.message}`)
      else console.log(`  OK   class teacher ${key}`)
    }
  }

  console.log()
  console.log('Enrolling student')
  const studentId = profileIds.student
  if (studentId) {
    for (const classId of classIds) {
      const { error } = await supabase
        .from('enrollments')
        .upsert({ student_id: studentId, class_id: classId, active: true }, { onConflict: 'student_id,class_id' })
      if (error) console.log(`  FAIL enrollment: ${error.message}`)
      else console.log('  OK   enrollment')
    }
  }

  console.log()
  console.log('Creating mentorship and mentor persona scope')
  if (profileIds.mentor && studentId) {
    const { error: mentorshipError } = await supabase
      .from('mentorships')
      .upsert(
        { teacher_id: profileIds.mentor, student_id: studentId, active: true },
        { onConflict: 'teacher_id,student_id' },
      )
    if (mentorshipError) {
      console.log(`  FAIL mentorship: ${mentorshipError.message}`)
    } else {
      console.log('  OK   mentorship')
    }

    const { error: mentorPersonaError } = await supabase.from('persona_assignments').upsert(
      {
        profile_id: profileIds.mentor,
        persona_name: 'mentor',
        scope_type: 'student',
        scope_id: studentId,
        status: 'active',
      },
      { onConflict: 'profile_id,persona_name,scope_id' },
    )
    if (mentorPersonaError) {
      console.log(`  FAIL mentor persona: ${mentorPersonaError.message}`)
    } else {
      console.log('  OK   mentor persona scope')
    }
  }

  console.log()
  console.log('Creating sample finance documents')
  if (profileIds.admin && profileIds.teacher && studentId) {
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        number: 'CEA-R-2026-9001',
        student_id: studentId,
        student_name_snapshot: 'Student User',
        class_snapshot: 'Mathematics 101',
        issue_date: '2026-07-17',
        currency: 'INR',
        note: 'Verification receipt',
        subtotal: 5000,
        discount: 0,
        total: 5000,
        voided: false,
        created_by: profileIds.admin,
      })
      .select('id')
      .maybeSingle()

    if (receiptError && !receiptError.message.toLowerCase().includes('duplicate')) {
      console.log(`  FAIL receipt: ${receiptError.message}`)
    } else {
      console.log('  OK   receipt')
      if (receipt?.id) {
        await supabase.from('receipt_lines').upsert(
          {
            receipt_id: receipt.id,
            subject: 'Verification Tuition',
            hours: 10,
            rate: 500,
            amount: 5000,
          },
          { onConflict: 'id' },
        )
      }
    }

    const { data: payslip, error: payslipError } = await supabase
      .from('payslips')
      .insert({
        number: 'CEA-P-2026-9001',
        teacher_id: profileIds.teacher,
        teacher_name_snapshot: 'Teacher User',
        issue_date: '2026-07-17',
        currency: 'INR',
        note: 'Verification payslip',
        subtotal: 3000,
        discount: 0,
        total: 3000,
        voided: false,
        created_by: profileIds.admin,
      })
      .select('id')
      .maybeSingle()

    if (payslipError && !payslipError.message.toLowerCase().includes('duplicate')) {
      console.log(`  FAIL payslip: ${payslipError.message}`)
    } else {
      console.log('  OK   payslip')
      if (payslip?.id) {
        await supabase.from('payslip_lines').upsert(
          {
            payslip_id: payslip.id,
            label: 'Verification Teaching',
            hours: 6,
            rate: 500,
            amount: 3000,
          },
          { onConflict: 'id' },
        )
      }
    }
  }

  console.log()
  console.log('Seed complete')
  console.log('Next: run npx ts-node scripts/verify-migrations.ts')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
