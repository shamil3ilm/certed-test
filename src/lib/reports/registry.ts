/**
 * The institution's report catalogue. One source of truth for every
 * report the app can produce, the label to show it under, and the route that
 * generates it. Adding a report = one builder + one entry here, so a future
 * "Reports" hub can list them without hunting through the codebase.
 *
 * Presentation-only (no server imports) so client components can render the list.
 */

export type ReportScope = 'student' | 'finance'

export type ReportTypeDef = {
  type: string
  label: string
  scope: ReportScope
  /** PDF download URL for a subject id (studentId, or a finance doc id). */
  pdfPath: (id: string) => string
  /** Optional print-friendly (in-browser HTML) URL. */
  printPath?: (id: string) => string
}

export const REPORT_TYPES: ReportTypeDef[] = [
  {
    type: 'report-card',
    label: 'Report Card',
    scope: 'student',
    pdfPath: (id) => `/api/report-card/${id}/pdf`,
  },
  {
    type: 'progress',
    label: 'Student Progress Report',
    scope: 'student',
    pdfPath: (id) => `/api/reports/progress/${id}`,
    printPath: (id) => `/api/reports/progress/${id}?format=html`,
  },
  {
    type: 'attendance',
    label: 'Attendance Report',
    scope: 'student',
    pdfPath: (id) => `/api/reports/attendance/${id}`,
    printPath: (id) => `/api/reports/attendance/${id}?format=html`,
  },
  {
    type: 'receipt',
    label: 'Fee Receipt',
    scope: 'finance',
    pdfPath: (id) => `/api/receipts/${id}/pdf`,
  },
  {
    // A payslip IS the salary slip - one document, two common names.
    type: 'payslip',
    label: 'Payslip / Salary Slip',
    scope: 'finance',
    pdfPath: (id) => `/api/payslips/${id}/pdf`,
  },
]

/** Student-scoped reports for the download menu on a student/mentee page. */
export const STUDENT_REPORTS = REPORT_TYPES.filter((r) => r.scope === 'student')
