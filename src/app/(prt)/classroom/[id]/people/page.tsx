import { requireClassAccess } from '../../access'
import type { ClassMember } from '@/lib/services/classes'
import { loadClassPeopleViewData } from '@/lib/services/page-data/class-people'
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
  const meta = [showEmail ? m.email : null, subtitle].filter(Boolean).join(' - ')
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
            message="They lose access now, but the link is kept on record - re-add any time."
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
  const data = await loadClassPeopleViewData(me, course.id)

  return (
    <div className="space-y-8">
      {!data.canManage && data.myMentors.length > 0 && (
        <Card className="flex items-center gap-3 p-4">
          <Avatar name={data.myMentors[0].name} role="tutor" />
          <p className="text-sm text-slate-600">
            Your mentor:{' '}
            {data.myMentors.map((m, i) => (
              <span key={m.email}>
                {i > 0 && ', '}
                <a href={`mailto:${m.email}`} className="font-semibold text-primary hover:underline">
                  {m.name}
                </a>
              </span>
            ))}
            <span className="block text-xs text-slate-400">Your point of contact - email them or ask in class.</span>
          </p>
        </Card>
      )}

      {data.isAdmin && (
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Class settings</h2>
          <div className="flex flex-wrap items-end gap-2">
            <form action={renameClassAction} className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={course.id} />
              <Field label="Class name" className="min-w-0 flex-1 sm:max-w-xs">
                <Input name="name" defaultValue={course.name} required />
              </Field>
              <SubmitButton className="btn-sm btn-soft" pendingLabel="Saving...">
                Rename
              </SubmitButton>
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
                <SubmitButton className="btn-sm btn-success" pendingLabel="Restoring...">
                  Restore
                </SubmitButton>
              </form>
            )}
          </div>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Tutors <span className="text-slate-300">- {data.tutors.length}</span>
        </h2>
        {data.isAdmin && data.addableTutors.length > 0 && (
          <form action={addTutorAction} className={cx(CARD, 'flex flex-wrap items-end gap-2 p-3')}>
            <input type="hidden" name="class_id" value={course.id} />
            <Field label="Add a tutor" className="min-w-0 flex-1 sm:max-w-xs">
              <Select name="tutor_id" required defaultValue="">
                <option value="" disabled>
                  Select tutor...
                </option>
                {data.addableTutors.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton className="btn-sm btn-soft" pendingLabel="Adding...">
              Add
            </SubmitButton>
          </form>
        )}
        <ul className="space-y-2">
          {data.tutors.map((t) => (
            <MemberRow
              key={t.id}
              m={t}
              classId={course.id}
              showEmail={data.canManage}
              removeAction={data.isAdmin ? removeTutorAction : undefined}
              removeName="tutor_id"
            />
          ))}
          {data.tutors.length === 0 && <EmptyState as="li">No tutors assigned yet.</EmptyState>}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Students <span className="text-slate-300">- {data.students.length}</span>
        </h2>
        {data.canManage && data.addableStudents.length > 0 && (
          <form action={enrolStudentAction} className={cx(CARD, 'flex flex-wrap items-end gap-2 p-3')}>
            <input type="hidden" name="class_id" value={course.id} />
            <Field label="Enrol a student" className="min-w-0 flex-1 sm:max-w-xs">
              <Select name="student_id" required defaultValue="">
                <option value="" disabled>
                  Select student...
                </option>
                {data.addableStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton className="btn-sm btn-soft" pendingLabel="Enrolling...">
              Enrol
            </SubmitButton>
          </form>
        )}
        <ul className="space-y-2">
          {data.students.map((s) => (
            <MemberRow
              key={s.id}
              m={s}
              subtitle={s.subtitle}
              classId={course.id}
              showEmail={data.canManage}
              removeAction={data.canManage ? removeStudentAction : undefined}
              removeName="student_id"
            />
          ))}
          {data.students.length === 0 && <EmptyState as="li">No students enrolled yet.</EmptyState>}
        </ul>
      </section>
    </div>
  )
}
