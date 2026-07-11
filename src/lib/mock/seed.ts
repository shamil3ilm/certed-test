/**
 * Seed data for MOCK MODE. Plain rows keyed by table name, matching the columns
 * defined in migrations 0001–0006. IDs for classes/profiles are valid v4 UUIDs
 * so they pass the Zod schemas if you copy them into a management form.
 */
export type MockDb = Record<string, Record<string, unknown>[]>

// Stable ids ------------------------------------------------------------------
export const IDS = {
  admin: 'a0000000-0000-4000-8000-000000000001',
  teacher: 'a0000000-0000-4000-8000-000000000002',
  student: 'a0000000-0000-4000-8000-000000000003',
  student2: 'a0000000-0000-4000-8000-000000000004',
  // Mentor is a SEPARATE person from the class teacher: pastoral scope only,
  // teaches none of the mentee's classes (so mentee class links are non-entry).
  mentor: 'a0000000-0000-4000-8000-000000000005',
  math: 'c0000000-0000-4000-8000-000000000001',
  science: 'c0000000-0000-4000-8000-000000000002',
} as const

const NOW = '2026-06-20T08:00:00.000Z'

export function buildSeed(): MockDb {
  return {
    org_settings: [
      {
        id: true,
        institute_name: 'Cert-Ed Academia',
        contact_email: 'hello@certedacademia.com',
        contact_phone: '+91 98765 43210',
        bank_account: '1234567890',
        bank_ifsc: 'HDFC0001234',
        bank_branch: 'MG Road, Bengaluru',
        terms_text: 'Fees once paid are non-refundable.',
        signatory_name: 'Principal',
        signatory_title: 'Director, Cert-Ed Academia',
        signature_mode: 'text',
        signature_text: 'Digitally signed',
        default_currency: 'INR',
        timezone: 'Asia/Kolkata',
        receipt_prefix: 'CEA-R',
        payslip_prefix: 'CEA-P',
      },
    ],
    profiles: [
      { id: IDS.admin, auth_user_id: 'u-admin', email: 'admin@mock.test', full_name: 'Asha Admin', role: 'admin', status: 'active', class_level: null, created_at: NOW },
      { id: IDS.teacher, auth_user_id: 'u-teacher', email: 'teacher@mock.test', full_name: 'Tarun Teacher', role: 'teacher', status: 'active', class_level: null, created_at: NOW },
      { id: IDS.mentor, auth_user_id: 'u-mentor', email: 'mentor@mock.test', full_name: 'Maya Mentor', role: 'teacher', status: 'active', class_level: null, created_at: NOW },
      { id: IDS.student, auth_user_id: 'u-student', email: 'student@mock.test', full_name: 'Sara Student', role: 'student', status: 'active', class_level: 'Grade 10', created_at: NOW },
      { id: IDS.student2, auth_user_id: 'u-student2', email: 'student2@mock.test', full_name: 'Sam Student', role: 'student', status: 'active', class_level: 'Grade 9', created_at: NOW },
    ],
    classes: [
      { id: IDS.math, name: 'Mathematics — Grade 10', status: 'active', created_at: NOW },
      { id: IDS.science, name: 'Science — Grade 10', status: 'active', created_at: NOW },
    ],
    enrollments: [
      { id: 'e0000000-0000-4000-8000-000000000001', student_id: IDS.student, class_id: IDS.math, active: true, created_at: NOW },
      { id: 'e0000000-0000-4000-8000-000000000002', student_id: IDS.student, class_id: IDS.science, active: true, created_at: NOW },
      { id: 'e0000000-0000-4000-8000-000000000003', student_id: IDS.student2, class_id: IDS.math, active: true, created_at: NOW },
    ],
    class_teachers: [
      { id: 't0000000-0000-4000-8000-000000000001', teacher_id: IDS.teacher, class_id: IDS.math, active: true, created_at: NOW },
      { id: 't0000000-0000-4000-8000-000000000002', teacher_id: IDS.teacher, class_id: IDS.science, active: true, created_at: NOW },
    ],
    mentorships: [
      // Maya (mentor) mentors both students; Tarun (teacher) mentors nobody.
      { id: 'me000000-0000-4000-8000-000000000001', teacher_id: IDS.mentor, student_id: IDS.student, active: true, created_at: NOW },
      { id: 'me000000-0000-4000-8000-000000000002', teacher_id: IDS.mentor, student_id: IDS.student2, active: true, created_at: NOW },
    ],
    announcements: [
      { id: 'an000000-0000-4000-8000-000000000001', class_id: null, title: 'Welcome to the new term', message: 'Classes resume Monday. Check your timetable.', author_id: IDS.admin, status: 'active', created_at: NOW },
      { id: 'an000000-0000-4000-8000-000000000002', class_id: IDS.math, title: 'Algebra revision', message: 'Bring your worksheets to the next Maths class.', author_id: IDS.teacher, status: 'active', created_at: NOW },
    ],
    resources: [
      { id: 'r0000000-0000-4000-8000-000000000001', class_id: IDS.math, title: 'Quadratic equations — notes (PDF)', drive_link: 'https://drive.google.com/file/d/mock-res-1/view', uploaded_by: IDS.teacher, status: 'active', created_at: NOW },
      { id: 'r0000000-0000-4000-8000-000000000002', class_id: IDS.science, title: 'Periodic table reference', drive_link: 'https://drive.google.com/file/d/mock-res-2/view', uploaded_by: IDS.teacher, status: 'active', created_at: NOW },
    ],
    assignments: [
      { id: 'a5000000-0000-4000-8000-000000000001', class_id: IDS.math, title: 'Problem set 3', description: 'Questions 1–10 from chapter 4.', due_date: '2026-07-10T18:30:00.000Z', attachment_drive_link: null, created_by: IDS.teacher, status: 'active', created_at: NOW },
      { id: 'a5000000-0000-4000-8000-000000000002', class_id: IDS.science, title: 'Lab report: acids & bases', description: 'Submit your write-up as a PDF.', due_date: '2026-06-30T18:30:00.000Z', attachment_drive_link: null, created_by: IDS.teacher, status: 'active', created_at: NOW },
    ],
    submissions: [
      { id: 'su000000-0000-4000-8000-000000000001', assignment_id: 'a5000000-0000-4000-8000-000000000001', student_id: IDS.student, drive_link: 'https://drive.google.com/file/d/mock-sub-1/view', status: 'submitted', submitted_at: NOW, is_active: true, created_at: NOW },
    ],
    receipts: [
      { id: 'rc000000-0000-4000-8000-000000000001', number: 'CEA-R-2026-0001', student_id: IDS.student, student_name_snapshot: 'Sara Student', class_snapshot: 'Grade 10', issue_date: '2026-06-01', currency: 'INR', note: null, subtotal: 5000, discount: null, total: 5000, voided: false, created_by: IDS.admin, created_at: NOW },
    ],
    receipt_lines: [
      { id: 'rl000000-0000-4000-8000-000000000001', receipt_id: 'rc000000-0000-4000-8000-000000000001', subject: 'Maths tuition — June', hours: 20, rate: 250, amount: 5000 },
    ],
    payslips: [
      { id: 'ps000000-0000-4000-8000-000000000001', number: 'CEA-P-2026-0001', teacher_id: IDS.teacher, teacher_name_snapshot: 'Tarun Teacher', issue_date: '2026-06-01', currency: 'INR', note: null, subtotal: 8000, discount: null, total: 8000, voided: false, created_by: IDS.admin, created_at: NOW },
    ],
    payslip_lines: [
      { id: 'pl000000-0000-4000-8000-000000000001', payslip_id: 'ps000000-0000-4000-8000-000000000001', label: 'Teaching — June', hours: 40, rate: 200, amount: 8000 },
    ],
    document_counters: [
      { doc_type: 'receipt', year: 2026, last_number: 1 },
      { doc_type: 'payslip', year: 2026, last_number: 1 },
    ],
    timetable_slots: [
      { id: 'ts000000-0000-4000-8000-000000000001', class_id: IDS.math, subject: 'Mathematics', teacher_id: IDS.teacher, day_of_week: 1, start_time: '09:00:00', end_time: '10:00:00', mode_or_location: 'Room 1', active: true, created_at: NOW },
      { id: 'ts000000-0000-4000-8000-000000000002', class_id: IDS.science, subject: 'Science', teacher_id: IDS.teacher, day_of_week: 3, start_time: '14:00:00', end_time: '15:00:00', mode_or_location: 'Online', active: true, created_at: NOW },
    ],
    calendar_events: [
      { id: 'ce000000-0000-4000-8000-000000000001', title: 'Founders Day (holiday)', description: 'Institute closed.', event_date: '2026-07-15', start_time: null, end_time: null, class_id: null, kind: 'holiday', slot_id: null, created_by: IDS.admin, created_at: NOW },
      { id: 'ce000000-0000-4000-8000-000000000002', title: 'Maths doubt-clearing session', description: 'Extra session before the test.', event_date: '2026-06-28', start_time: '14:00', end_time: '15:00', class_id: IDS.math, kind: 'event', slot_id: null, created_by: IDS.teacher, created_at: NOW },
    ],
    meet_links: [
      {
        id: 'ml000000-0000-4000-8000-000000000001',
        class_id: IDS.math,
        title: 'Weekly Mathematics Class',
        url: 'https://meet.google.com/abc-defg-hij',
        description: 'Every Monday morning standard tuition session.',
        active: true,
        created_by: IDS.teacher,
        created_at: NOW,
      },
      {
        id: 'ml000000-0000-4000-8000-000000000002',
        class_id: null,
        title: 'General Academy Doubt Solving',
        url: 'https://meet.google.com/xyz-pdq-rst',
        description: 'Global meet link open to all students for general inquiries.',
        active: true,
        created_by: IDS.admin,
        created_at: NOW,
      },
    ],
    comments: [
      {
        id: 'cm000000-0000-4000-8000-000000000001',
        entity_type: 'submission',
        entity_id: 'su000000-0000-4000-8000-000000000001',
        author_id: IDS.teacher,
        content: 'Great start! Please add more working steps to question 3.',
        created_at: NOW,
      },
      {
        id: 'cm000000-0000-4000-8000-000000000002',
        entity_type: 'resource',
        entity_id: 'r0000000-0000-4000-8000-000000000001',
        author_id: IDS.student,
        content: 'Teacher, is chapter 4 completely covered in this PDF?',
        created_at: NOW,
      },
      {
        id: 'cm000000-0000-4000-8000-000000000003',
        entity_type: 'resource',
        entity_id: 'r0000000-0000-4000-8000-000000000001',
        author_id: IDS.teacher,
        content: 'Yes Sara, check section 4.2 onwards for practice questions.',
        created_at: NOW,
      },
      {
        id: 'cm000000-0000-4000-8000-000000000004',
        entity_type: 'meet',
        entity_id: 'ml000000-0000-4000-8000-000000000001',
        author_id: IDS.student,
        content: 'Should we join this link 5 minutes before scheduled time?',
        created_at: NOW,
      },
      {
        id: 'cm000000-0000-4000-8000-000000000005',
        entity_type: 'meet',
        entity_id: 'ml000000-0000-4000-8000-000000000001',
        author_id: IDS.teacher,
        content: 'Yes please. We will start sharp at 9:00 AM.',
        created_at: NOW,
      },
    ],
    reminders: [],
    audit_log: [
      { id: 'au000000-0000-4000-8000-000000000001', actor_id: IDS.admin, action: 'course.create', entity_type: 'course', entity_id: IDS.math, created_at: '2026-06-15T09:00:00.000Z' },
      { id: 'au000000-0000-4000-8000-000000000002', actor_id: IDS.admin, action: 'user.add', entity_type: 'profile', entity_id: IDS.teacher, created_at: '2026-06-15T09:05:00.000Z' },
      { id: 'au000000-0000-4000-8000-000000000003', actor_id: IDS.admin, action: 'user.add', entity_type: 'profile', entity_id: IDS.student, created_at: '2026-06-15T09:06:00.000Z' },
      { id: 'au000000-0000-4000-8000-000000000004', actor_id: IDS.teacher, action: 'announcement.create', entity_type: 'announcement', entity_id: 'an000000-0000-4000-8000-000000000002', created_at: '2026-06-19T08:00:00.000Z' },
      { id: 'au000000-0000-4000-8000-000000000005', actor_id: IDS.admin, action: 'receipt.issue', entity_type: 'receipt', entity_id: 'rc000000-0000-4000-8000-000000000001', created_at: '2026-06-01T10:00:00.000Z' },
      { id: 'au000000-0000-4000-8000-000000000006', actor_id: IDS.admin, action: 'payslip.issue', entity_type: 'payslip', entity_id: 'ps000000-0000-4000-8000-000000000001', created_at: '2026-06-01T10:05:00.000Z' },
    ],
  }
}
