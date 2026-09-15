import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { table, persist } from './store'
import { MockQueryBuilder } from './query-builder'
import { getMockUidFromStore } from './session'
import { receiptNumber } from '@/lib/services/finance/org-settings'
import { computeStatus } from '@/lib/assignments/late-status'

type Args = Record<string, unknown>

function profileByUid(uid: string | null): Record<string, unknown> | null {
  if (!uid) return null
  return table('profiles').find((p) => p.auth_user_id === uid) ?? null
}

/** Mirrors 0110's billing_source_fingerprint: the sessions (and, for a receipt, the attended
 *  marks) a month's figure is computed from, over [from, to), outside archived classes. */
function mockBillingFingerprint(kind: string, partyId: unknown, from: string, to: string): string {
  const archived = new Set(
    table('classes')
      .filter((c) => c.status === 'archived')
      .map((c) => c.id),
  )
  const inWindow = table('class_sessions').filter(
    (s) =>
      s.actual_start != null &&
      String(s.actual_start) >= from &&
      String(s.actual_start) < to &&
      !archived.has(s.class_id),
  )
  const counted =
    kind === 'payslip'
      ? inWindow.filter((s) => s.tutor_id === partyId)
      : inWindow.filter((s) =>
          table('attendance').some(
            (a) => a.session_id === s.id && a.student_id === partyId && (a.status === 'present' || a.status === 'late'),
          ),
        )
  return JSON.stringify(
    counted
      .map((s) => [s.id, s.class_id, s.subject_id ?? null, s.actual_start, s.actual_end])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  )
}

/** Mirrors 0112's fx_source_version: the base currency and every rate, as one comparable value. */
function mockFxSourceVersion(): string {
  const base = table('org_settings')[0]?.base_currency ?? ''
  const rates = table('exchange_rates')
    .map((r) => [r.id, r.currency, r.base_currency, Number(r.rate), r.effective_from])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  return JSON.stringify([base, rates])
}

/** Reactivate a profile's global persona, creating it when missing (0109's helper). */
function activateGlobalPersona(profileId: unknown, personaName: string): void {
  const existing = table('persona_assignments').find(
    (p) => p.profile_id === profileId && p.persona_name === personaName && p.scope_type === 'global',
  )
  if (existing) {
    existing.status = 'active'
    return
  }
  table('persona_assignments').push({
    id: randomUUID(),
    profile_id: profileId,
    persona_name: personaName,
    scope_type: 'global',
    scope_id: null,
    status: 'active',
    assigned_at: new Date().toISOString(),
  })
}

/** Remove matching rows from a store table in place, as a DELETE would. */
function removeWhere(tableName: string, predicate: (row: Record<string, unknown>) => boolean): void {
  const rows = table(tableName)
  for (let i = rows.length - 1; i >= 0; i--) {
    if (predicate(rows[i])) rows.splice(i, 1)
  }
}

async function rpc(uid: string | null, fn: string, args: Args) {
  if (fn === 'is_enrolled') {
    const me = profileByUid(uid)
    if (!me) return { data: false, error: null }
    const found = table('enrollments').some((r) => r.student_id === me.id && r.class_id === args.p_class_id)
    return { data: found, error: null }
  }
  if (fn === 'teaches_class' || fn === 'teaches_class_write') {
    const me = profileByUid(uid)
    if (!me) return { data: false, error: null }
    const teaches = table('class_tutors').some((r) => r.tutor_id === me.id && r.class_id === args.p_class_id)
    // teaches_class_write (0079) is the TUTOR-ONLY write scope.
    if (fn === 'teaches_class_write') return { data: teaches, error: null }
    // teaches_class (0043) is the READ scope: tutor OR mentor of a student actively enrolled
    // in the class (mentors_class - active mentorship AND matching student-scoped persona AND
    // enrollment). Post-0082 the two scopes genuinely diverge (calendar write went back to
    // teaches_class), so the mock must too, or a mentor's calendar create/edit is wrongly
    // refused (403) in mock mode while production allows it - the E2E suite runs on the mock.
    const mentee = new Set(
      table('mentorships')
        .filter((m) => m.mentor_id === me.id && m.active)
        .map((m) => m.student_id),
    )
    const scoped = new Set(
      table('persona_assignments')
        .filter(
          (p) =>
            p.profile_id === me.id &&
            p.persona_name === 'mentor' &&
            p.scope_type === 'student' &&
            p.status === 'active',
        )
        .map((p) => p.scope_id),
    )
    const mentorsClass = table('enrollments').some(
      (e) => e.class_id === args.p_class_id && mentee.has(e.student_id) && scoped.has(e.student_id),
    )
    return { data: teaches || mentorsClass, error: null }
  }
  if (fn === 'finance_totals_base') {
    // Mirrors migration 0056's finance_totals_base: per-kind totals already
    // normalised into the CURRENT base currency, never mixing currencies. A doc
    // counts as converted only if it carries a base amount in that base; a
    // same-currency doc converts 1:1 (the 0056 backfill). Everything else is
    // flagged unconverted rather than summed.
    const base = String((table('org_settings')[0]?.base_currency as string | undefined) ?? 'INR')
    const rows = table(args.p_kind === 'receipt' ? 'receipts' : 'payslips').filter((r) => !r.voided)
    let baseTotal = 0
    let converted = 0
    let unconverted = 0
    for (const r of rows) {
      const bt = r.base_total != null ? Number(r.base_total) : r.currency === base ? Number(r.total) : null
      const bc = (r.base_currency as string | undefined) ?? (r.currency === base ? base : undefined)
      if (bt != null && bc === base) {
        baseTotal += bt
        converted += 1
      } else {
        unconverted += 1
      }
    }
    return {
      data: [
        { base_currency: base, base_total: baseTotal, converted_count: converted, unconverted_count: unconverted },
      ],
      error: null,
    }
  }
  if (fn === 'revoke_profile_guarded') {
    // Mirrors migration 0042: refuse to disable the last active admin, else flip
    // the target to disabled. Returns the same 'ok' | 'not_found' | 'last_admin'.
    const profiles = table('profiles')
    const target = profiles.find((p) => p.id === args.p_target)
    if (!target) return { data: 'not_found', error: null }
    if (target.role === 'admin' && target.status === 'active') {
      const activeAdmins = profiles.filter((p) => p.role === 'admin' && p.status === 'active').length
      if (activeAdmins <= 1) return { data: 'last_admin', error: null }
    }
    target.status = 'disabled'
    // 0109: every persona at every scope goes inactive in the same step.
    table('persona_assignments')
      .filter((p) => p.profile_id === target.id)
      .forEach((p) => {
        p.status = 'inactive'
      })
    persist()
    return { data: 'ok', error: null }
  }
  if (fn === 'restore_profile_guarded') {
    // Mirrors 0109: status, role persona, teaching persona and scoped mentor personas together.
    const target = table('profiles').find((p) => p.id === args.p_target)
    if (!target) return { data: 'not_found', error: null }
    if (target.erased_at != null) return { data: 'erased', error: null }
    target.status = 'active'
    activateGlobalPersona(target.id, String(target.role))
    if (table('class_tutors').some((t) => t.tutor_id === target.id && t.active === true)) {
      activateGlobalPersona(target.id, 'tutor')
    }
    for (const m of table('mentorships').filter((row) => row.mentor_id === target.id && row.active === true)) {
      const scoped = table('persona_assignments').find(
        (p) => p.profile_id === target.id && p.persona_name === 'mentor' && p.scope_id === m.student_id,
      )
      if (scoped) {
        scoped.status = 'active'
        scoped.scope_type = 'student'
      } else {
        table('persona_assignments').push({
          id: randomUUID(),
          profile_id: target.id,
          persona_name: 'mentor',
          scope_type: 'student',
          scope_id: m.student_id,
          status: 'active',
          assigned_at: new Date().toISOString(),
        })
      }
    }
    persist()
    return { data: 'ok', error: null }
  }
  if (fn === 'erase_profile_guarded') {
    const target = table('profiles').find((p) => p.id === args.p_target)
    if (!target) return { data: { outcome: 'not_found', auth_user_id: null }, error: null }
    if (target.erased_at != null) {
      return { data: { outcome: 'already_erased', auth_user_id: target.auth_user_id ?? null }, error: null }
    }
    if (target.status !== 'disabled') return { data: { outcome: 'not_disabled', auth_user_id: null }, error: null }
    removeWhere('mentee_notes', (n) => n.student_id === target.id)
    removeWhere('guardians', (g) => g.student_id === target.id)
    Object.assign(target, {
      full_name: 'Erased user',
      email: `erased+${String(target.id)}@erased.invalid`,
      phone: null,
      guardian_name: null,
      guardian_phone: null,
      date_of_birth: null,
      country: null,
      class_level: null,
      qualifications: null,
      bio: null,
      setup_code_hash: null,
      setup_code_expires_at: null,
      status: 'disabled',
      erased_at: new Date().toISOString(),
    })
    persist()
    return { data: { outcome: 'erased', auth_user_id: target.auth_user_id ?? null }, error: null }
  }
  if (fn === 'assign_class_tutor' || fn === 'unassign_class_tutor') {
    // Mirrors 0109: the membership and a dedicated mentor's tutor persona together.
    const tutors = table('class_tutors')
    const row = tutors.find((t) => t.class_id === args.p_class_id && t.tutor_id === args.p_tutor_id)
    if (fn === 'unassign_class_tutor') {
      if (!row) return { data: false, error: null }
      row.active = false
      const profile = table('profiles').find((p) => p.id === args.p_tutor_id)
      const stillTeaches = tutors.some((t) => t.tutor_id === args.p_tutor_id && t.active === true)
      if (profile?.role === 'mentor' && profile.status === 'active' && !stillTeaches) {
        table('persona_assignments')
          .filter((p) => p.profile_id === args.p_tutor_id && p.persona_name === 'tutor' && p.scope_type === 'global')
          .forEach((p) => {
            p.status = 'inactive'
          })
      }
      persist()
      return { data: true, error: null }
    }
    const tutor = table('profiles').find(
      (p) => p.id === args.p_tutor_id && (p.role === 'tutor' || p.role === 'mentor') && p.status === 'active',
    )
    if (!tutor) return { data: null, error: { message: 'tutor_not_assignable' } }
    if (!table('classes').some((c) => c.id === args.p_class_id && c.status === 'active')) {
      return { data: null, error: { message: 'class_not_active' } }
    }
    if (row) row.active = true
    else {
      tutors.push({
        id: randomUUID(),
        tutor_id: args.p_tutor_id,
        class_id: args.p_class_id,
        active: true,
        created_at: new Date().toISOString(),
      })
    }
    if (tutor.role === 'mentor') activateGlobalPersona(tutor.id, 'tutor')
    persist()
    return { data: null, error: null }
  }
  if (fn === 'ensure_day_session') {
    // Mirrors 0109 - and stamps the class's subject, which the database does by trigger (0104).
    const sameDay = table('class_sessions')
      .filter((s) => s.class_id === args.p_class_id && s.session_date === args.p_session_date)
      .sort(
        (a, b) =>
          (a.actual_start == null ? 0 : 1) - (b.actual_start == null ? 0 : 1) ||
          String(a.actual_start ?? '').localeCompare(String(b.actual_start ?? '')) ||
          String(a.created_at).localeCompare(String(b.created_at)),
      )
    if (sameDay.length > 0) return { data: sameDay[0].id, error: null }
    const now = new Date().toISOString()
    const created = {
      id: randomUUID(),
      class_id: args.p_class_id,
      session_date: args.p_session_date,
      scheduled_start: null,
      scheduled_end: null,
      actual_start: null,
      actual_end: null,
      tutor_id: null,
      tutor_join_at: null,
      tutor_leave_at: null,
      summary: null,
      student_feedback: null,
      staff_note: null,
      hours_recorded_by: null,
      subject_id: table('classes').find((c) => c.id === args.p_class_id)?.subject_id ?? null,
      created_at: now,
      updated_at: now,
    }
    table('class_sessions').push(created)
    persist()
    return { data: created.id, error: null }
  }
  if (fn === 'replace_own_submission') {
    const me = profileByUid(uid)
    if (!me || me.status !== 'active') {
      return { data: null, error: { message: 'actor_not_active' } }
    }
    const assignments = table('assignments')
    const assignment = assignments.find((row) => row.id === args.p_assignment_id && row.status === 'active')
    if (!assignment) {
      return { data: null, error: { message: 'assignment_not_found' } }
    }
    const enrolled = table('enrollments').some(
      (row) => row.class_id === assignment.class_id && row.student_id === me.id,
    )
    if (!enrolled) {
      return { data: null, error: { message: 'not_enrolled' } }
    }

    const submissions = table('submissions')
    const current = submissions.find(
      (row) => row.assignment_id === args.p_assignment_id && row.student_id === me.id && row.is_active === true,
    )
    if (current && current.score != null) {
      return { data: null, error: { message: 'submission_already_graded' } }
    }
    submissions.forEach((row) => {
      if (row.assignment_id === args.p_assignment_id && row.student_id === me.id && row.is_active === true) {
        row.is_active = false
      }
    })

    const now = new Date().toISOString()
    const next = {
      id: randomUUID(),
      assignment_id: args.p_assignment_id,
      student_id: me.id,
      drive_link: args.p_drive_link ?? null,
      file_name: args.p_file_name ?? null,
      status: assignment.due_date != null && String(now) > String(assignment.due_date) ? 'late' : 'submitted',
      score: null,
      feedback: null,
      graded_at: null,
      graded_by: null,
      submitted_at: now,
      is_active: true,
      created_at: now,
    }
    submissions.push(next)
    persist()
    return { data: next, error: null }
  }
  if (fn === 'billing_source_fingerprint') {
    return {
      data: mockBillingFingerprint(String(args.p_kind), args.p_party_id, String(args.p_from), String(args.p_to)),
      error: null,
    }
  }
  if (fn === 'issue_receipt_doc' || fn === 'issue_payslip_doc') {
    const docType = fn === 'issue_receipt_doc' ? 'receipt' : 'payslip'
    // 0110's pre-insert checks: unchanged hours for a billing-period document, no identical twin
    // moments ago for one without.
    if (args.p_billing_period != null) {
      if (args.p_source_fingerprint == null) return { data: null, error: { message: 'billing_source_required' } }
      const now = mockBillingFingerprint(docType, args.p_party_id, String(args.p_source_from), String(args.p_source_to))
      if (now !== args.p_source_fingerprint) return { data: null, error: { message: 'billing_source_changed' } }
    } else {
      const partyKey = docType === 'receipt' ? 'student_id' : 'tutor_id'
      const since = Date.now() - 2 * 60 * 1000
      const twin = table(docType === 'receipt' ? 'receipts' : 'payslips').find(
        (d) =>
          d[partyKey] === args.p_party_id &&
          d.voided !== true &&
          d.billing_period == null &&
          d.currency === args.p_currency &&
          Number(d.total) === Number(args.p_total) &&
          Date.parse(String(d.created_at)) > since,
      )
      if (twin) return { data: null, error: { message: `duplicate_recent:${String(twin.number)}` } }
    }
    const year = new Date(String(args.p_issue_date)).getFullYear()
    const counters = table('document_counters')
    let counter = counters.find((row) => row.doc_type === docType && row.year === year)
    if (!counter) {
      counter = { doc_type: docType, year, last_number: 0 }
      counters.push(counter)
    }
    counter.last_number = Number(counter.last_number) + 1

    const number = receiptNumber(String(args.p_prefix), year, Number(counter.last_number))
    const now = new Date().toISOString()
    const tableName = docType === 'receipt' ? 'receipts' : 'payslips'
    const lineTableName = docType === 'receipt' ? 'receipt_lines' : 'payslip_lines'
    const lineLabelKey = docType === 'receipt' ? 'subject' : 'label'
    const fkKey = docType === 'receipt' ? 'receipt_id' : 'payslip_id'
    const created = {
      id: randomUUID(),
      number,
      issue_date: String(args.p_issue_date),
      currency: String(args.p_currency),
      note: args.p_note ?? null,
      subtotal: Number(args.p_subtotal),
      discount: args.p_discount == null ? null : Number(args.p_discount),
      total: Number(args.p_total),
      voided: false,
      created_by: args.p_created_by ?? null,
      created_at: now,
      // 0094: the month the document bills for, set in the same write as the document
      // itself - mirroring issue_receipt_doc/issue_payslip_doc.
      billing_period: args.p_billing_period ?? null,
      ...(docType === 'receipt'
        ? {
            student_id: args.p_party_id,
            student_name_snapshot: args.p_party_name,
            class_snapshot: args.p_class_level ?? null,
          }
        : {
            tutor_id: args.p_party_id,
            tutor_name_snapshot: args.p_party_name,
          }),
    }
    table(tableName).push(created)

    const rawLines = Array.isArray(args.p_lines) ? args.p_lines : []
    const lineRows = rawLines.map((line) => ({
      id: randomUUID(),
      [fkKey]: created.id,
      [lineLabelKey]: (line as Record<string, unknown>).label,
      hours: (line as Record<string, unknown>).hours,
      rate: (line as Record<string, unknown>).rate,
      amount: (line as Record<string, unknown>).amount,
    }))
    table(lineTableName).push(...lineRows)
    persist()
    return { data: created, error: null }
  }
  if (fn === 'edit_assignment_and_reclassify') {
    // Mirror the SECURITY DEFINER function (migration 0026): update the assignment
    // and re-derive every submission's lateness, atomically from the caller's view.
    const assignment = table('assignments').find((row) => row.id === args.p_id)
    if (!assignment) return { data: null, error: { message: `assignment ${String(args.p_id)} not found` } }
    assignment.title = args.p_title
    assignment.description = args.p_description
    assignment.due_date = args.p_due_date
    assignment.attachment_drive_link = args.p_attachment_drive_link
    assignment.topic = args.p_topic
    assignment.max_marks = args.p_max_marks
    // 0111: every field in the same write.
    assignment.enforce_deadline = args.p_enforce_deadline
    assignment.type = args.p_type
    assignment.expects_submission = args.p_expects_submission
    assignment.ends_at = args.p_ends_at
    const due = String(args.p_due_date)
    for (const sub of table('submissions')) {
      if (sub.assignment_id !== args.p_id) continue
      sub.status = computeStatus(String(sub.submitted_at), due)
    }
    persist()
    return { data: null, error: null }
  }
  if (fn === 'ensure_submission_for_student') {
    // Mirrors 0111: reuse the student's active submission, creating an empty one only when none.
    const assignment = table('assignments').find((a) => a.id === args.p_assignment_id && a.status === 'active')
    if (!assignment) return { data: null, error: { message: 'assignment_not_found' } }
    const now = new Date().toISOString()
    if (assignment.enforce_deadline === true && now > String(assignment.due_date)) {
      return { data: null, error: { message: 'deadline_passed' } }
    }
    if (!table('profiles').some((p) => p.id === args.p_student_id && p.status === 'active')) {
      return { data: null, error: { message: 'actor_not_active' } }
    }
    const enrolled = table('enrollments').some(
      (e) => e.student_id === args.p_student_id && e.class_id === assignment.class_id && e.active === true,
    )
    if (!enrolled) return { data: null, error: { message: 'not_enrolled' } }
    const submissions = table('submissions')
    const active = submissions.find(
      (s) => s.assignment_id === args.p_assignment_id && s.student_id === args.p_student_id && s.is_active === true,
    )
    if (active) return { data: { id: active.id, created: false }, error: null }
    const created = {
      id: randomUUID(),
      assignment_id: args.p_assignment_id,
      student_id: args.p_student_id,
      drive_link: null,
      file_name: null,
      status: computeStatus(now, String(assignment.due_date)),
      score: null,
      feedback: null,
      graded_at: null,
      graded_by: null,
      submitted_at: now,
      is_active: true,
      created_at: now,
    }
    submissions.push(created)
    persist()
    return { data: { id: created.id, created: true }, error: null }
  }
  if (fn === 'activate_attachment') {
    // Mirrors 0111: re-check the owner, retire a document's previous file, cap additive owners.
    const attachments = table('attachments')
    const att = attachments.find((a) => a.id === args.p_id)
    if (!att) return { data: null, error: { message: 'attachment_not_found' } }
    if (att.status !== 'pending') return { data: null, error: { message: 'attachment_not_pending' } }
    const now = new Date().toISOString()
    let published = false
    if (att.resource_id != null) {
      attachments
        .filter((a) => a.resource_id === att.resource_id && a.status === 'active' && a.id !== att.id)
        .forEach((a) => {
          a.status = 'deleted'
          a.deleted_at = now
        })
      // 0113: a pending custodial document goes live with its first file.
      const resource = table('resources').find((r) => r.id === att.resource_id)
      if (resource?.status === 'pending') {
        resource.status = 'active'
        published = true
      }
    } else {
      if (att.submission_id != null) {
        const sub = table('submissions').find((s) => s.id === att.submission_id)
        const assignment = sub ? table('assignments').find((a) => a.id === sub.assignment_id) : undefined
        const open =
          sub != null &&
          sub.is_active === true &&
          sub.score == null &&
          sub.graded_at == null &&
          assignment?.status === 'active' &&
          !(assignment.enforce_deadline === true && now > String(assignment.due_date))
        if (!open) return { data: null, error: { message: 'submission_closed' } }
      }
      const ownerKey = (['submission_id', 'announcement_id', 'assignment_id'] as const).find((k) => att[k] != null)
      const active = ownerKey
        ? attachments.filter((a) => a[ownerKey] === att[ownerKey] && a.status === 'active').length
        : 0
      if (active >= Number(args.p_max_active)) return { data: null, error: { message: 'attachment_cap_reached' } }
    }
    att.status = 'active'
    att.drive_file_id = args.p_drive_file_id
    att.drive_folder_id = args.p_drive_folder_id
    att.updated_at = now
    persist()
    return { data: published, error: null }
  }
  if (fn === 'create_invited_profile') {
    // Mirrors 0112: insert the invite with its role persona; a taken email is refused, not overwritten.
    const email = String(args.p_email).trim().toLowerCase()
    const profiles = table('profiles')
    if (profiles.some((p) => String(p.email).toLowerCase() === email)) {
      return { data: null, error: { message: 'email_taken' } }
    }
    const now = new Date().toISOString()
    const profile = {
      id: randomUUID(),
      auth_user_id: null,
      email,
      full_name: args.p_full_name ?? null,
      role: args.p_role,
      status: 'pending',
      class_level: args.p_class_level ?? null,
      created_at: now,
      setup_code_hash: args.p_setup_code_hash,
      setup_code_expires_at: args.p_setup_code_expires_at,
      country: args.p_country ?? null,
      phone: args.p_phone ?? null,
      guardian_name: args.p_guardian_name ?? null,
      guardian_phone: args.p_guardian_phone ?? null,
      date_of_birth: null,
      joined_on: args.p_joined_on ?? null,
      qualifications: null,
      bio: null,
      erased_at: null,
    }
    profiles.push(profile)
    activateGlobalPersona(profile.id, String(args.p_role))
    persist()
    return { data: profile, error: null }
  }
  if (fn === 'fx_source_version') {
    return { data: mockFxSourceVersion(), error: null }
  }
  if (fn === 'apply_fx_conversions') {
    // Mirrors 0112: write every priced figure, only if the inputs are still the version priced from.
    if (args.p_version !== mockFxSourceVersion()) return { data: null, error: { message: 'fx_source_changed' } }
    let written = 0
    for (const row of (Array.isArray(args.p_rows) ? args.p_rows : []) as Record<string, unknown>[]) {
      const doc = table(row.kind === 'receipt' ? 'receipts' : 'payslips').find((d) => d.id === row.id)
      if (!doc) continue
      Object.assign(doc, {
        base_currency: row.base_currency,
        base_total: row.base_total,
        fx_rate: row.fx_rate,
        fx_rate_id: row.fx_rate_id,
      })
      written += 1
    }
    persist()
    return { data: written, error: null }
  }
  if (fn === 'rate_limit_hit') {
    // Mirrors the fixed-window counter (0067) over rate_limit_counters. The security layer
    // above CAN degrade to its in-process limiter when this RPC is missing, but leaving it
    // unimplemented means mock mode silently exercises a different limiter than production -
    // and the parity gate cannot tell that apart from an RPC nobody remembered to add.
    const key = String(args.p_key ?? '')
    const limit = Number(args.p_limit ?? 0)
    const windowSeconds = Number(args.p_window_seconds ?? 0)
    const now = Date.now()
    const rows = table('rate_limit_counters')
    let row = rows.find((r) => r.bucket_key === key)
    const startedAt = row ? Date.parse(String(row.window_started_at)) : 0
    if (!row || now - startedAt >= windowSeconds * 1000) {
      if (row) rows.splice(rows.indexOf(row), 1)
      row = { bucket_key: key, window_started_at: new Date(now).toISOString(), hits: 0 }
      rows.push(row)
    }
    row.hits = Number(row.hits ?? 0) + 1
    persist()
    const allowed = Number(row.hits) <= limit
    const elapsed = Math.floor((now - Date.parse(String(row.window_started_at))) / 1000)
    return {
      data: [{ allowed, retry_after_seconds: allowed ? 0 : Math.max(windowSeconds - elapsed, 1) }],
      error: null,
    }
  }
  if (fn === 'rls_disabled_tables') {
    // Mock mode has no RLS to report on, so the honest answer is an empty list - the same
    // thing the data layer already short-circuits to before ever reaching this dispatcher.
    return { data: [], error: null }
  }
  if (fn === 'claim_pending_emails') {
    // Mirrors 0066: take the oldest pending rows, flip them to 'sending' and return them.
    // The real function does it under FOR UPDATE SKIP LOCKED so two concurrent drains get
    // disjoint batches; the mock is single-threaded, so ordering and the status flip are the
    // parts that matter for behaviour parity.
    const limit = Number(args.p_limit ?? 0)
    const claimed = table('pending_emails')
      .filter((row) => row.status === 'pending')
      .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
      .slice(0, limit)
    for (const row of claimed) {
      row.status = 'sending'
      row.claimed_at = new Date().toISOString()
    }
    if (claimed.length > 0) persist()
    return { data: claimed, error: null }
  }
  if (fn === 'increment_resource_download_count') {
    // Mirrors 0101: the increment happens in ONE statement so two concurrent downloads
    // cannot both read the same value and write value+1. The mock is single-threaded, so
    // this is about parity of BEHAVIOUR - without it, every download throws here in mock
    // mode while working in production.
    const resource = table('resources').find((row) => row.id === args.p_resource_id)
    if (resource) {
      resource.download_count = Number(resource.download_count ?? 0) + 1
      persist()
    }
    return { data: null, error: null }
  }
  if (fn === 'count_active_enrollments_per_class') {
    // Mirrors 0105: active enrolments grouped by class. Returned as (class_id,
    // student_count) rows, not a Map - the caller does the folding, exactly as it does
    // against PostgREST.
    const counts = new Map<string, number>()
    for (const row of table('enrollments')) {
      if (row.active !== true) continue
      const key = String(row.class_id)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return { data: [...counts].map(([class_id, student_count]) => ({ class_id, student_count })), error: null }
  }
  if (fn === 'create_student_subject_class' || fn === 'set_class_subject_when_unset') {
    // Mirrors 0107. The database also enforces the one-live-class-per-subject rule by trigger on
    // every enrolment and class write; the mock runs no triggers, so only these two check it.
    const classes = table('classes')
    const takesElsewhere = (studentId: unknown, subjectId: unknown, exceptClassId: unknown) =>
      table('enrollments').some(
        (e) =>
          e.student_id === studentId &&
          e.active === true &&
          e.class_id !== exceptClassId &&
          classes.some((c) => c.id === e.class_id && c.status !== 'archived' && c.subject_id === subjectId),
      )
    if (!table('subjects').some((s) => s.id === args.p_subject_id)) {
      return { data: null, error: { message: 'subject_not_found' } }
    }
    if (fn === 'create_student_subject_class') {
      const eligible = table('profiles').some(
        (p) => p.id === args.p_student_id && p.role === 'student' && p.status !== 'disabled',
      )
      if (!eligible) return { data: null, error: { message: 'student_not_eligible' } }
      if (takesElsewhere(args.p_student_id, args.p_subject_id, null)) {
        return { data: null, error: { message: 'subject_already_taken' } }
      }
      const now = new Date().toISOString()
      const created = {
        id: randomUUID(),
        name: args.p_name,
        status: 'active',
        created_at: now,
        subject_id: args.p_subject_id,
      }
      classes.push(created)
      table('enrollments').push({
        id: randomUUID(),
        student_id: args.p_student_id,
        class_id: created.id,
        active: true,
        created_at: now,
      })
      persist()
      return { data: created, error: null }
    }
    const target = classes.find((c) => c.id === args.p_class_id)
    if (!target) return { data: null, error: { message: 'class_not_found' } }
    if (target.subject_id != null) return { data: null, error: { message: 'subject_already_set' } }
    const students = table('enrollments').filter((e) => e.class_id === target.id && e.active === true)
    if (students.some((e) => takesElsewhere(e.student_id, args.p_subject_id, target.id))) {
      return { data: null, error: { message: 'subject_already_taken' } }
    }
    target.subject_id = args.p_subject_id
    const unlabelled = table('class_sessions').filter((s) => s.class_id === target.id && s.subject_id == null)
    unlabelled.forEach((s) => {
      s.subject_id = args.p_subject_id
    })
    persist()
    return { data: unlabelled.length, error: null }
  }
  if (fn === 'set_global_capability_override') {
    // Mirrors 0108: replace the profile's global override for one capability in one step.
    if (args.p_effect !== 'default') {
      const active = table('profiles').some((p) => p.id === args.p_profile_id && p.status === 'active')
      if (!active) return { data: null, error: { message: 'target_not_active' } }
    }
    removeWhere(
      'capability_overrides',
      (r) => r.profile_id === args.p_profile_id && r.capability === args.p_capability && r.scope_type === 'global',
    )
    if (args.p_effect === 'default') {
      persist()
      return { data: null, error: null }
    }
    const now = new Date().toISOString()
    const row = {
      id: randomUUID(),
      profile_id: args.p_profile_id,
      capability: args.p_capability,
      effect: args.p_effect,
      scope_type: 'global',
      scope_id: null,
      reason: args.p_reason ?? null,
      status: 'active',
      created_by: args.p_actor_id ?? null,
      created_at: now,
      updated_at: now,
    }
    table('capability_overrides').push(row)
    persist()
    return { data: row.id, error: null }
  }
  if (fn === 'add_guardian' || fn === 'make_guardian_primary') {
    // Mirrors 0108: at most one primary guardian per student, moved in one step.
    const guardians = table('guardians')
    if (fn === 'make_guardian_primary') {
      const target = guardians.find((g) => g.id === args.p_guardian_id && g.student_id === args.p_student_id)
      if (!target) return { data: false, error: null }
      guardians.filter((g) => g.student_id === args.p_student_id).forEach((g) => (g.is_primary = g === target))
      persist()
      return { data: true, error: null }
    }
    if (args.p_is_primary === true) {
      guardians.filter((g) => g.student_id === args.p_student_id).forEach((g) => (g.is_primary = false))
    }
    const row = {
      id: randomUUID(),
      student_id: args.p_student_id,
      name: args.p_name,
      phone: args.p_phone ?? null,
      email: args.p_email ?? null,
      relationship: args.p_relationship ?? null,
      is_primary: args.p_is_primary === true,
      created_at: new Date().toISOString(),
    }
    guardians.push(row)
    persist()
    return { data: row.id, error: null }
  }
  if (fn === 'assign_mentorship') {
    // Mirrors 0108: the link and the student-scoped mentor persona together.
    const profiles = table('profiles')
    const mentorOk = profiles.some(
      (p) => p.id === args.p_mentor_id && (p.role === 'mentor' || p.role === 'tutor') && p.status === 'active',
    )
    if (!mentorOk) return { data: null, error: { message: 'mentor_not_assignable' } }
    const studentOk = profiles.some((p) => p.id === args.p_student_id && p.role === 'student' && p.status === 'active')
    if (!studentOk) return { data: null, error: { message: 'student_not_active' } }
    const now = new Date().toISOString()
    let link = table('mentorships').find((m) => m.mentor_id === args.p_mentor_id && m.student_id === args.p_student_id)
    if (link) link.active = true
    else {
      link = {
        id: randomUUID(),
        mentor_id: args.p_mentor_id,
        student_id: args.p_student_id,
        active: true,
        created_at: now,
      }
      table('mentorships').push(link)
    }
    const persona = table('persona_assignments').find(
      (p) => p.profile_id === args.p_mentor_id && p.persona_name === 'mentor' && p.scope_id === args.p_student_id,
    )
    if (persona) {
      persona.status = 'active'
      persona.scope_type = 'student'
    } else {
      table('persona_assignments').push({
        id: randomUUID(),
        profile_id: args.p_mentor_id,
        persona_name: 'mentor',
        scope_type: 'student',
        scope_id: args.p_student_id,
        status: 'active',
        assigned_at: now,
      })
    }
    persist()
    return { data: link.id, error: null }
  }
  if (fn === 'remove_mentorship') {
    const link = table('mentorships').find((m) => m.id === args.p_id)
    if (!link) return { data: false, error: null }
    removeWhere(
      'persona_assignments',
      (p) =>
        p.profile_id === link.mentor_id &&
        p.persona_name === 'mentor' &&
        p.scope_type === 'student' &&
        p.scope_id === link.student_id,
    )
    link.active = false
    persist()
    return { data: true, error: null }
  }
  if (fn === 'create_conversation') {
    // Mirrors 0108: the conversation and its participants together; a direct pair reuses its thread.
    const ids = Array.isArray(args.p_participant_ids) ? (args.p_participant_ids as unknown[]) : []
    if (ids.length < 2) return { data: null, error: { message: 'too_few_participants' } }
    const conversations = table('conversations')
    let conversation =
      args.p_kind === 'direct'
        ? conversations.find((c) => c.kind === 'direct' && c.direct_key === args.p_direct_key)
        : undefined
    const created = !conversation
    const now = new Date().toISOString()
    if (!conversation) {
      conversation = {
        id: randomUUID(),
        kind: args.p_kind,
        title: args.p_title ?? null,
        created_by: args.p_created_by ?? null,
        last_message_at: now,
        last_message_body: null,
        last_message_sender_id: null,
        direct_key: args.p_kind === 'direct' ? args.p_direct_key : null,
        created_at: now,
      }
      conversations.push(conversation)
    }
    const participants = table('conversation_participants')
    for (const profileId of ids) {
      if (!participants.some((p) => p.conversation_id === conversation.id && p.profile_id === profileId)) {
        participants.push({
          id: randomUUID(),
          conversation_id: conversation.id,
          profile_id: profileId,
          last_read_at: null,
          joined_at: now,
        })
      }
    }
    persist()
    return { data: { id: conversation.id, created }, error: null }
  }
  if (fn === 'post_message') {
    const now = new Date().toISOString()
    const message = {
      id: randomUUID(),
      conversation_id: args.p_conversation_id,
      sender_id: args.p_sender_id,
      body: args.p_body,
      created_at: now,
    }
    table('messages').push(message)
    const conversation = table('conversations').find((c) => c.id === args.p_conversation_id)
    if (conversation && (conversation.last_message_at == null || String(conversation.last_message_at) <= now)) {
      conversation.last_message_at = now
      conversation.last_message_body = message.body
      conversation.last_message_sender_id = message.sender_id
    }
    persist()
    return { data: message, error: null }
  }
  if (fn === 'sum_active_resource_downloads') {
    // Mirrors 0103: total downloads across ACTIVE documents only.
    const total = table('resources')
      .filter((row) => row.status === 'active')
      .reduce((sum, row) => sum + Number(row.download_count ?? 0), 0)
    return { data: total, error: null }
  }
  return { data: null, error: { message: `mock rpc not implemented: ${fn}` } }
}

/** Builds a fake SupabaseClient over the in-memory store, acting as user `uid`. */
function createMockClient(uid: string | null): SupabaseClient {
  const me = profileByUid(uid)
  const client = {
    from: (name: string) => new MockQueryBuilder(table(name), name),
    rpc: (fn: string, args: Args = {}) => rpc(uid, fn, args),
    auth: {
      getUser: async () => ({ data: { user: me ? { id: uid, email: me.email } : null }, error: null }),
      // Mirrors supabase-js getClaims(): { data: { claims } | null }. sub === the
      // auth uid, matching what getActorContext reads.
      getClaims: async () => ({ data: me ? { claims: { sub: uid, email: me.email } } : null, error: null }),
      // OAuth paths are bypassed by the dev login in mock mode; provide harmless no-ops.
      exchangeCodeForSession: async () => ({ data: { user: null, session: null }, error: null }),
      signInWithOAuth: async () => ({ data: { provider: 'google', url: '/login' }, error: null }),
      // Service-role surface. Mock mode has no identity provider, so these succeed
      // without doing anything - the profiles table is the whole source of truth.
      // They must EXIST rather than be left off: a caller reaching for a missing
      // `auth.admin.x` gets a TypeError, not a Supabase `{ error }`, so code that
      // correctly fails closed on an auth error (restore un-banning a revoked
      // account) would break in mock mode for a reason that cannot happen in real mode.
      admin: {
        createUser: async (attrs: { email?: string } = {}) => ({
          data: { user: { id: `mock-auth-${attrs.email ?? 'user'}` } },
          error: null,
        }),
        deleteUser: async () => ({ data: { user: null }, error: null }),
        updateUserById: async () => ({ data: { user: null }, error: null }),
      },
    },
  }
  return client as unknown as SupabaseClient
}

/** Server (RLS-equivalent) client: identity comes from the dev-login cookie. */
export async function createMockServerClient(): Promise<SupabaseClient> {
  const uid = await getMockUidFromStore()
  return createMockClient(uid)
}

/** Admin/service-role client: no user identity; the mock ignores RLS anyway. */
export function createMockAdminClient(): SupabaseClient {
  return createMockClient(null)
}
