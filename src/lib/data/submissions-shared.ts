import type { SubmissionStatus } from '@/lib/assignments/late-status'

export type SubmissionRow = {
  id: string
  assignment_id: string
  student_id: string
  drive_link: string | null
  file_name: string | null
  status: SubmissionStatus
  score: number | null
  feedback: string | null
  graded_at: string | null
  graded_by: string | null
  submitted_at: string
  is_active: boolean
  created_at: string
}

export type SubmissionBrief = {
  assignment_id: string
  status: SubmissionStatus
  submitted_at: string
  drive_link: string | null
}

export type EvaluatedSubmissionBrief = {
  assignment_id: string
  status: SubmissionStatus
  submitted_at: string
  drive_link: string | null
  score: number
  graded_at: string
}
