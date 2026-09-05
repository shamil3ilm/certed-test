import { requireClassAccess } from '../../access'
import type { ClassMember } from '@/lib/services/classes'
import { loadClassPeopleViewData } from '@/lib/services/page-data/class-people'
import { listTags, tagsForEntity } from '@/lib/services/tags'
import {
  AlertBanner,
  Avatar,
  Card,
  EmptyState,
  FilterBar,
  ListRow,
  SearchFilterField,
  SectionJumpNav,
  SectionLabel,
  cx,
  CARD,
} from '@/lib/ui'
import { Field, Input, Select, SubmitButton } from '../../../form'
import { ConfirmSubmit } from '../../../ConfirmSubmit'
import { MessageUserButton } from '../../../messages/MessageUserButton'
import { TagEditor } from '../../../tags/TagEditor'
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
    <li>
      <ListRow
        leading={<Avatar name={m.name} role={m.role} />}
        title={m.name}
        subtitle={meta || undefined}
        trailing={
          removeAction && classId && removeName ? (
            <form action={removeAction}>
              <input type="hidden" name="class_id" value={classId} />
              <input type="hidden" name={removeName} value={m.id} />
              <ConfirmSubmit
                className="btn btn-sm btn-danger"
                title="Remove from class?"
                message={`${m.name} loses access now, but the link is kept on record - re-add any time.`}
                confirmLabel="Remove"
                pendingLabel="Removing..."
                aria-label={`Remove ${m.name} from class`}
              >
                Remove
              </ConfirmSubmit>
            </form>
          ) : undefined
        }
      />
    </li>
  )
}

export default async function ClassPeoplePage(props: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string; enrolQ?: string }>
}) {
  const searchParams = await props.searchParams
  const params = await props.params
  const { me, course } = await requireClassAccess(params.id)
  const data = await loadClassPeopleViewData(me, course.id, searchParams?.enrolQ)
  const [classTags, allTags] = data.canManage
    ? await Promise.all([tagsForEntity('class', course.id), listTags()])
    : [[], []]

  return (
    <div className="space-y-8">
      {searchParams?.error === '1' && (
        <AlertBanner>That change couldn&apos;t be applied. Please check the details and try again.</AlertBanner>
      )}

      <SectionJumpNav
        label="People sections"
        items={[
          ...(data.canManage ? [{ href: '#tags', label: 'Tags' }] : []),
          ...(data.isAdmin ? [{ href: '#settings', label: 'Class settings' }] : []),
          { href: '#teachers', label: 'Tutors' },
          { href: '#students', label: 'Students' },
        ]}
      />

      {!data.canManage && data.myMentors.length > 0 && (
        <Card className="flex items-center gap-3 p-4">
          <div className="flex -space-x-2">
            {data.myMentors.map((m) => (
              <Avatar key={m.id} name={m.name} role="mentor" />
            ))}
          </div>
          <div className="min-w-0 text-sm text-slate-600">
            <p>Your mentor{data.myMentors.length > 1 ? 's' : ''} - your point of contact:</p>
            <ul className="mt-1.5 space-y-1.5">
              {data.myMentors.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-700">{m.name}</span>
                  <MessageUserButton recipientId={m.id} className="btn btn-sm btn-soft">
                    Message
                  </MessageUserButton>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {data.canManage && (
        <Card id="tags" className="scroll-mt-20 space-y-3 p-4">
          <SectionLabel>Tags</SectionLabel>
          <p className="text-xs text-slate-600">
            Organise classes with labels - filter by them on the Classes list. Also available on documents.
          </p>
          <TagEditor type="class" entityId={course.id} tags={classTags} suggestions={allTags} />
        </Card>
      )}

      {data.isAdmin && (
        <Card id="settings" className="scroll-mt-20 space-y-3 p-4">
          <SectionLabel>Class settings</SectionLabel>
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
                  message={`"${course.name}" is hidden from active lists; records are kept and you can restore it.`}
                  confirmLabel="Archive"
                  pendingLabel="Archiving..."
                  aria-label={`Archive class ${course.name}`}
                >
                  Archive
                </ConfirmSubmit>
              </form>
            ) : (
              /* Confirms like its Archive counterpart - the two share a slot, so one
                 asking and the other firing on a single click is a trap. */
              <form action={restoreClassAction} className="ml-auto">
                <input type="hidden" name="id" value={course.id} />
                <ConfirmSubmit
                  className="btn btn-sm btn-success"
                  title="Restore this class?"
                  message={`"${course.name}" reappears in active lists and schedules.`}
                  confirmLabel="Restore"
                  pendingLabel="Restoring..."
                  variant="primary"
                  aria-label={`Restore class ${course.name}`}
                >
                  Restore
                </ConfirmSubmit>
              </form>
            )}
          </div>
        </Card>
      )}

      <section id="teachers" className="scroll-mt-20 space-y-3">
        <SectionLabel count={data.tutors.length}>Tutors</SectionLabel>
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
              showEmail={data.isAdmin}
              removeAction={data.isAdmin ? removeTutorAction : undefined}
              removeName="tutor_id"
            />
          ))}
          {data.tutors.length === 0 && <EmptyState as="li">No tutors assigned yet.</EmptyState>}
        </ul>
      </section>

      <section id="students" className="scroll-mt-20 space-y-3">
        <SectionLabel count={data.students.length}>Students</SectionLabel>
        {data.canManage && data.students.length > 0 && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            A class is one-to-one - it has a single student. To assign this student to another tutor, create a separate
            class; to change the student, remove the current one below first.
          </p>
        )}
        {data.canManage &&
          data.students.length === 0 &&
          (data.addableStudents.length > 0 || data.enrolSearch || data.studentsCapped) && (
            <div className={cx(CARD, 'space-y-3 p-3')}>
              {/* GET form: server-side search so the picker never ships the whole
                student roster. Narrows the enrol list below via ?enrolQ=. */}
              <FilterBar
                clearHref={`/classroom/${course.id}/people`}
                showClear={Boolean(data.enrolSearch)}
                applyLabel="Search"
              >
                <SearchFilterField
                  label="Find a student to enrol"
                  name="enrolQ"
                  defaultValue={data.enrolSearch}
                  placeholder="Search by name or email..."
                  className="sm:max-w-xs"
                />
              </FilterBar>
              {data.addableStudents.length > 0 ? (
                <form action={enrolStudentAction} className="flex flex-wrap items-end gap-2">
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
              ) : (
                <p className="text-sm text-slate-600">
                  {data.enrolSearch
                    ? `No students to enrol match "${data.enrolSearch}".`
                    : 'Every listed student is already enrolled - search to find others.'}
                </p>
              )}
              {data.studentsCapped && (
                <p className="text-xs text-slate-600">
                  More students exist than are shown here - search by name or email to find them.
                </p>
              )}
            </div>
          )}
        <ul className="space-y-2">
          {data.students.map((s) => (
            <MemberRow
              key={s.id}
              m={s}
              subtitle={s.subtitle}
              classId={course.id}
              showEmail={data.isAdmin}
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
