import { requireClassAccess } from '../../access'
import { getClassMembers, mentorsByStudent, type ClassMember } from '@/lib/services/classes'
import { listActiveByRole } from '@/lib/services/users'
import { Avatar, Card, EmptyState, cx, CARD } from '../../../ui'
import { Field, Input, Select, SubmitButton } from '../../../form'
import { ConfirmSubmit } from '../../../ConfirmSubmit'
import {
  renameClassAction,
  archiveClassAction,
  restoreClassAction,
  addTutorAction,
  removeTutorAction,
  enrolStudentAction,
  removeStudentAction,
} from '../../class-actions'

function MemberRow({
  m,
  subtitle,
  classId,
  removeAction,
  removeName,
  showEmail,
}: {
  m: ClassMember
  subtitle?: string
  classId?: string
  removeAction?: (fd: FormData) => void
  removeName?: string
  showEmail?: boolean
}) {
  // Students see classmates' names only — email is roster PII shown to managers.
  const meta = [showEmail ? m.email : null, subtitle].filter(Boolean).join(' · ')
  return (
    <Card as="li" className="flex items-center gap-3 p-4">
      <Avatar name={m.name} role={m.role} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{m.name}</p>
        {meta && <p className="truncate text-xs text-slate-400">{meta}</p>}
      </div>
      {removeAction && classId && removeName && (
        <form action={removeAction}>
          <input type="hidden" name="class_id" value={classId} />
          <input type="hidden" name={removeName} value={m.id} />
          <ConfirmSubmit
            className="btn btn-sm btn-danger"
            title="Remove from class?"
            message="They lose access now, but the link is kept on record — re-add any time."
            confirmLabel="Remove"
          >
            Remove
          </ConfirmSubmit>
        </form>
      )}
    </Card>
  )
}

export default async function ClassPeoplePage({ params }: { params: { id: string } }) {
  const { me, course } = await requireClassAccess(params.id)
  const canManage = me.role !== 'student' // requireClassAccess already scopes a tutor to this class
  const isAdmin = me.role === 'admin' // class settings + tutor roster are admin-only
  const { teachers, students } = await getClassMembers(course.id)

  const [mentorMap, allTeachers, allStudents] = await Promise.all([
    canManage ? mentorsByStudent(students.map((s) => s.id)) : Promise.resolve(new Map()),
    isAdmin ? listActiveByRole('teacher') : Promise.resolve([] as { id: string; name: string }[]),
    canManage ? listActiveByRole('student') : Promise.resolve([] as { id: string; name: string }[]),
  ])
  const assignedTutorIds = new Set(teachers.map((t) => t.id))
  const enrolledStudentIds = new Set(students.map((s) => s.id))
  const addableTutors = allTeachers.filter((t) => !assignedTutorIds.has(t.id))
  const addableStudents = allStudents.filter((s) => !enrolledStudentIds.has(s.id))

  return (
    <div className="space-y-8">
      {/* Class settings (rename/archive) are admin-only — a tutor manages students, not the class. */}
      {isAdmin && (
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Class settings</h2>
          {/* Rename and archive/restore are SEPARATE, sibling forms (never nested,
              or the archive button would submit the rename action). */}
          <div className="flex flex-wrap items-end gap-2">
            <form action={renameClassAction} className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={course.id} />
              <Field label="Class name" className="min-w-0 flex-1 sm:max-w-xs">
                <Input name="name" defaultValue={course.name} required />
              </Field>
              <SubmitButton className="btn-sm btn-soft" pendingLabel="Saving…">Rename</SubmitButton>
            </form>
            {course.status === 'active' ? (
              <form action={archiveClassAction} className="ml-auto">
                <input type="hidden" name="id" value={course.id} />
                <ConfirmSubmit
                  className="btn btn-sm btn-warning"
                  title="Archive this class?"
                  message="It's hidden from active lists; records are kept and you can restore it."
                  confirmLabel="Archive"
                >
                  Archive
                </ConfirmSubmit>
              </form>
            ) : (
              <form action={restoreClassAction} className="ml-auto">
                <input type="hidden" name="id" value={course.id} />
                <SubmitButton className="btn-sm btn-success" pendingLabel="Restoring…">Restore</SubmitButton>
              </form>
            )}
          </div>
        </Card>
      )}

      {/* Tutors */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Tutors <span className="text-slate-300">· {teachers.length}</span>
        </h2>
        {isAdmin && addableTutors.length > 0 && (
          <form action={addTutorAction} className={cx(CARD, 'flex flex-wrap items-end gap-2 p-3')}>
            <input type="hidden" name="class_id" value={course.id} />
            <Field label="Add a tutor" className="min-w-0 flex-1 sm:max-w-xs">
              <Select name="teacher_id" required defaultValue="">
                <option value="" disabled>Select tutor…</option>
                {addableTutors.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </Field>
            <SubmitButton className="btn-sm btn-soft" pendingLabel="Adding…">Add</SubmitButton>
          </form>
        )}
        <ul className="space-y-2">
          {teachers.map((t) => (
            <MemberRow
              key={t.id}
              m={t}
              classId={course.id}
              showEmail={canManage}
              removeAction={isAdmin ? removeTutorAction : undefined}
              removeName="teacher_id"
            />
          ))}
          {teachers.length === 0 && <EmptyState as="li">No tutors assigned yet.</EmptyState>}
        </ul>
      </section>

      {/* Students */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Students <span className="text-slate-300">· {students.length}</span>
        </h2>
        {canManage && addableStudents.length > 0 && (
          <form action={enrolStudentAction} className={cx(CARD, 'flex flex-wrap items-end gap-2 p-3')}>
            <input type="hidden" name="class_id" value={course.id} />
            <Field label="Enrol a student" className="min-w-0 flex-1 sm:max-w-xs">
              <Select name="student_id" required defaultValue="">
                <option value="" disabled>Select student…</option>
                {addableStudents.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <SubmitButton className="btn-sm btn-soft" pendingLabel="Enrolling…">Enrol</SubmitButton>
          </form>
        )}
        <ul className="space-y-2">
          {students.map((s) => {
            const mentors = mentorMap.get(s.id)
            return (
              <MemberRow
                key={s.id}
                m={s}
                subtitle={mentors && mentors.length ? `Mentor: ${mentors.map((mm: { name: string }) => mm.name).join(', ')}` : undefined}
                classId={course.id}
                showEmail={canManage}
                removeAction={canManage ? removeStudentAction : undefined}
                removeName="student_id"
              />
            )
          })}
          {students.length === 0 && <EmptyState as="li">No students enrolled yet.</EmptyState>}
        </ul>
      </section>
    </div>
  )
}
