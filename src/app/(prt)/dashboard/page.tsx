import type { ReactNode } from 'react'
import { requireRole } from '@/lib/auth/requireRole'
import { formatMoney, totalByCurrency } from '@/lib/money'
import { LocalTime } from '../LocalTime'
import { todayInDisplayZone } from '@/lib/time/format'
import { listProfiles, getProfileNamesByIds } from '@/lib/repos/users'
import { listClasses } from '@/lib/repos/classes'
import { listEnrollments } from '@/lib/repos/enrollments'
import { listClassTeachers } from '@/lib/repos/classTeachers'
import { listAssignments } from '@/lib/repos/assignments'
import { listMyActiveSubmissions, listUngradedSubmissions } from '@/lib/repos/submissions'
import { listEvents, type CalendarEvent } from '@/lib/repos/calendarEvents'
import { financeTotals, listRecentDocs, listMyDocs, type FinanceTotal } from '@/lib/repos/financeDocs'
import { listMyReminders, type Reminder } from '@/lib/repos/reminders'
import { mentorsByStudent } from '@/lib/repos/classes'
import { Panel, MiniBars, Donut, Card, Avatar, roleLabel } from '../ui'
import { StatModalCard } from '../StatModalCard'
import { ReminderPanel } from './ReminderPanel'

// Accurate per-currency totals from the SQL aggregate (already excludes voided).
const fmtTotals = (totals: FinanceTotal[], fallback = 'INR'): string =>
  totals.length ? totals.map((t) => formatMoney(t.live_total, t.currency)).join(' + ') : formatMoney(0, fallback)

type TodayItem = { href: string; primary: string; secondary: ReactNode; urgent?: boolean }

/**
 * The "Today" list — the one thing each role opens the portal to see: a student's
 * work due across every class, a tutor's queue of submissions to mark. A direct,
 * clickable list (not a stat behind a modal), so acting on it is one tap.
 */
function TodayCard({ title, items, empty }: { title: string; items: TodayItem[]; empty: string }) {
  return (
    <Card className="mt-6 p-4 sm:p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="mt-1 divide-y divide-slate-100">
          {items.map((it, i) => (
            <li key={i}>
              <a href={it.href} className="flex items-center justify-between gap-3 py-2.5 text-sm transition hover:text-primary">
                <span className="min-w-0 truncate font-medium text-slate-800">{it.primary}</span>
                <span className={`shrink-0 text-xs ${it.urgent ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                  {it.secondary}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export default async function Dashboard() {
  // sub_admin is included so /dashboard renders for every active role — it's the
  // universal redirect target for requireRole, so a role missing here would be
  // bounced back to /dashboard forever (the Sub Admin blank-page lock-out).
  const me = await requireRole(['admin', 'sub_admin', 'teacher', 'student'])
  const today = todayInDisplayZone() // institute-local day, not UTC
  // A sub_admin only manages users — it has no class/event RLS reach, so skip the
  // upcoming/reminders reads (which would return empty at best) and show a
  // users-focused panel instead.
  const [upcoming, reminders]: [CalendarEvent[], Reminder[]] =
    me.role === 'sub_admin'
      ? [[], []]
      : await Promise.all([listEvents({ from: today, limit: 6 }), listMyReminders(me.id)])

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-gradient-to-br from-primary to-secondary p-5 text-white shadow-sm sm:p-6 lg:p-8">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">Welcome, {me.full_name ?? me.email}</h1>
        <p className="mt-1 text-sm text-white/80">{roleLabel(me.role)} · Cert-Ed Academia portal</p>
      </div>

      {me.role === 'admin' && <AdminDashboard upcoming={upcoming} reminders={reminders} />}
      {me.role === 'sub_admin' && <SubAdminDashboard />}
      {me.role === 'teacher' && <TeacherDashboard meId={me.id} upcoming={upcoming} reminders={reminders} />}
      {me.role === 'student' && <StudentDashboard meId={me.id} upcoming={upcoming} reminders={reminders} />}
    </main>
  )
}

/**
 * Sub Admins manage people, not classes/finance. Their dashboard is a real
 * landing page — Students / Teachers / Pending counts (from the same service-role
 * read the Users hub uses, so no RLS surprises) plus a direct link to manage them.
 */
async function SubAdminDashboard() {
  const profiles = await listProfiles()
  const students = profiles.filter((p) => p.role === 'student')
  const teachers = profiles.filter((p) => p.role === 'teacher')
  const pending = profiles.filter((p) => p.status === 'pending')

  return (
    <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatModalCard
          label="Students" value={students.length} title="Students"
          items={students.map((p) => ({ primary: p.full_name ?? p.email, secondary: p.class_level ?? p.email }))}
          empty="No students yet."
        />
        <StatModalCard
          label="Teachers" value={teachers.length} title="Teachers"
          items={teachers.map((p) => ({ primary: p.full_name ?? p.email, secondary: p.email }))}
          empty="No teachers yet."
        />
        <StatModalCard
          label="Pending access" value={pending.length} title="Pending access" tone={pending.length > 0 ? 'primary' : undefined}
          items={pending.map((p) => ({ primary: p.full_name ?? p.email, secondary: p.email }))}
          empty="Nobody waiting for access."
        />
      </section>
      <Card className="mt-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">User management</h2>
          <p className="mt-1 text-sm text-slate-500">Add, edit or revoke students and tutors, and assign mentors.</p>
        </div>
        <a href="/admin/users" className="btn btn-primary shrink-0">Manage users</a>
      </Card>
    </>
  )
}

async function AdminDashboard({ upcoming, reminders }: { upcoming: CalendarEvent[]; reminders: Reminder[] }) {
  const [profiles, classes, enrollments, receiptTotals, payslipTotals, recentReceipts, recentPayslips] = await Promise.all([
    listProfiles(),
    listClasses(),
    listEnrollments(),
    financeTotals('receipt'),
    financeTotals('payslip'),
    listRecentDocs('receipt', 100),
    listRecentDocs('payslip', 100),
  ])
  const studentList = profiles.filter((p) => p.role === 'student')
  const teacherList = profiles.filter((p) => p.role === 'teacher')
  const activeClassList = classes.filter((c) => c.status === 'active')
  const liveReceipts = recentReceipts.filter((r) => !r.voided)
  const livePayslips = recentPayslips.filter((p) => !p.voided)
  const perClass = activeClassList
    .map((c) => ({ label: c.name, value: enrollments.filter((e) => e.class_id === c.id).length }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  return (
    <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatModalCard
          label="Students" value={studentList.length} title="Students"
          items={studentList.map((p) => ({ primary: p.full_name ?? p.email, secondary: p.class_level ?? p.email }))}
        />
        <StatModalCard
          label="Teachers" value={teacherList.length} title="Teachers"
          items={teacherList.map((p) => ({ primary: p.full_name ?? p.email, secondary: p.email }))}
        />
        <StatModalCard
          label="Active classes" value={activeClassList.length} title="Active classes"
          items={activeClassList.map((c) => ({ primary: c.name, secondary: `${enrollments.filter((e) => e.class_id === c.id).length} students`, href: `/classroom/${c.id}` }))}
        />
        <StatModalCard
          label="Revenue" value={fmtTotals(receiptTotals)} sub={`Payouts ${fmtTotals(payslipTotals)}`} tone="primary"
          title="Finance"
          sections={[
            { heading: 'Revenue · receipts', total: fmtTotals(receiptTotals), items: liveReceipts.map((r) => ({ primary: r.number, secondary: formatMoney(Number(r.total), r.currency) })) },
            { heading: 'Payouts · pay slips', total: fmtTotals(payslipTotals), items: livePayslips.map((p) => ({ primary: p.number, secondary: formatMoney(Number(p.total), p.currency) })) },
          ]}
          empty="None yet."
        />
      </section>
      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="Students per class"><MiniBars data={perClass} /></Panel>
        <Panel title="Upcoming"><Upcoming events={upcoming} /></Panel>
        <ReminderPanel initialReminders={reminders} />
      </section>
    </>
  )
}

async function TeacherDashboard({ meId, upcoming, reminders }: { meId: string; upcoming: CalendarEvent[]; reminders: Reminder[] }) {
  const [cts, classes, assignments, payslips] = await Promise.all([
    listClassTeachers(),
    listClasses(),
    listAssignments({ activeOnly: true }),
    listMyDocs('payslip', meId),
  ])
  const myClassIds = new Set(cts.filter((ct) => ct.teacher_id === meId).map((ct) => ct.class_id))
  const myClasses = classes.filter((c) => myClassIds.has(c.id))
  const myAssignments = assignments.filter((a) => myClassIds.has(a.class_id))
  const perClass = myClasses.map((c) => ({
    label: c.name,
    value: myAssignments.filter((a) => a.class_id === c.id).length,
  }))

  // "To review": submissions on my assignments that still need a mark.
  const ungraded = await listUngradedSubmissions(myAssignments.map((a) => a.id))
  const reviewNames = await getProfileNamesByIds(ungraded.map((s) => s.student_id))
  const reviewItems: TodayItem[] = ungraded.slice(0, 6).map((s) => {
    const a = myAssignments.find((x) => x.id === s.assignment_id)
    return {
      href: `/assignments/${s.assignment_id}`,
      primary: `${reviewNames.get(s.student_id) ?? 'Student'} — ${a?.title ?? 'Assignment'}`,
      secondary: s.status === 'late' ? 'late' : 'to mark',
      urgent: s.status === 'late',
    }
  })

  return (
    <>
      <TodayCard title="To review" items={reviewItems} empty="Nothing waiting to be marked." />
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatModalCard label="My classes" value={myClasses.length} title="My classes"
          items={myClasses.map((c) => ({ primary: c.name, href: `/classroom/${c.id}` }))} empty="No classes assigned." />
        <StatModalCard label="Assignments" value={myAssignments.length} title="Assignments"
          items={myAssignments.map((a) => ({ primary: a.title, secondary: <LocalTime iso={a.due_date} mode="date" />, href: `/classroom/${a.class_id}/classwork#assignment-${a.id}` }))} empty="No assignments." />
        <StatModalCard label="Pay slips" value={payslips.length} title="Pay slips"
          items={payslips.map((p) => ({ primary: p.number, secondary: formatMoney(Number(p.total), p.currency) }))} empty="No pay slips." />
        <StatModalCard label="Total paid" value={totalByCurrency(payslips)} tone="primary" title="Pay slips"
          items={payslips.filter((p) => !p.voided).map((p) => ({ primary: p.number, secondary: formatMoney(Number(p.total), p.currency) }))} empty="No pay slips." />
      </section>
      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="Assignments per class"><MiniBars data={perClass} /></Panel>
        <Panel title="Upcoming"><Upcoming events={upcoming} /></Panel>
        <ReminderPanel initialReminders={reminders} />
      </section>
    </>
  )
}

async function StudentDashboard({ meId, upcoming, reminders }: { meId: string; upcoming: CalendarEvent[]; reminders: Reminder[] }) {
  const [enrollments, classes, assignments, subs, receipts, mentorMap] = await Promise.all([
    listEnrollments(),
    listClasses(),
    listAssignments({ activeOnly: true }),
    listMyActiveSubmissions(meId),
    listMyDocs('receipt', meId),
    mentorsByStudent([meId]),
  ])
  const myClassIds = new Set(enrollments.filter((e) => e.student_id === meId).map((e) => e.class_id))
  const myClasses = classes.filter((c) => myClassIds.has(c.id))
  const myAssignments = assignments.filter((a) => myClassIds.has(a.class_id) && a.status === 'active')
  const submittedIds = new Set(subs.map((s) => s.assignment_id))
  const onTimeIds = new Set(subs.filter((s) => s.status !== 'late').map((s) => s.assignment_id))
  const submitted = myAssignments.filter((a) => submittedIds.has(a.id)).length
  const onTime = myAssignments.filter((a) => onTimeIds.has(a.id)).length
  const pending = Math.max(0, myAssignments.length - submitted)
  const mentors = mentorMap.get(meId) ?? []
  // Server Component — renders once per request, so a request-time clock is safe.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  // "Due soon": work not yet submitted, across every class, most urgent first.
  const dueItems: TodayItem[] = myAssignments
    .filter((a) => !submittedIds.has(a.id))
    .sort((a, b) => (a.due_date < b.due_date ? -1 : 1))
    .slice(0, 6)
    .map((a) => {
      const overdue = Date.parse(a.due_date) < now
      return {
        href: `/classroom/${a.class_id}/classwork#assignment-${a.id}`,
        primary: a.title,
        secondary: overdue ? (
          <>overdue · <LocalTime iso={a.due_date} mode="date" /></>
        ) : (
          <>due <LocalTime iso={a.due_date} mode="date" /></>
        ),
        urgent: overdue,
      }
    })

  return (
    <>
      <TodayCard title="Due soon" items={dueItems} empty="You're all caught up 🎉" />
      {mentors.length > 0 && (
        <Card className="mt-6 flex items-center gap-3 p-4">
          <Avatar name={mentors[0].name} role="teacher" />
          <p className="text-sm text-slate-600">
            Your mentor:{' '}
            {mentors.map((m, i) => (
              <span key={m.email}>
                {i > 0 && ', '}
                <a href={`mailto:${m.email}`} className="font-semibold text-primary hover:underline">
                  {m.name}
                </a>
              </span>
            ))}
            <span className="block text-xs text-slate-400">Your point of contact — email them or ask in class.</span>
          </p>
        </Card>
      )}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatModalCard label="Classes" value={myClasses.length} title="My classes"
          items={myClasses.map((c) => ({ primary: c.name, href: `/classroom/${c.id}` }))} empty="Not enrolled in any class." />
        <StatModalCard label="Assignments" value={myAssignments.length} title="Assignments"
          items={myAssignments.map((a) => ({ primary: a.title, secondary: submittedIds.has(a.id) ? 'submitted' : 'pending', href: `/classroom/${a.class_id}/classwork#assignment-${a.id}` }))} empty="No assignments." />
        <StatModalCard label="Pending" value={pending} sub={`${submitted} submitted`} title="Pending assignments"
          items={myAssignments.filter((a) => !submittedIds.has(a.id)).map((a) => ({ primary: a.title, secondary: <LocalTime iso={a.due_date} mode="date" />, href: `/classroom/${a.class_id}/classwork#assignment-${a.id}` }))} empty="All caught up!" />
        <StatModalCard label="Fees paid" value={totalByCurrency(receipts)} tone="primary" title="Receipts"
          items={receipts.filter((r) => !r.voided).map((r) => ({ primary: r.number, secondary: formatMoney(Number(r.total), r.currency) }))} empty="No receipts." />
      </section>
      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="Assignment progress">
          <Donut value={onTime} total={myAssignments.length} label="submitted on time / total" />
        </Panel>
        <Panel title="Upcoming"><Upcoming events={upcoming} /></Panel>
        <ReminderPanel initialReminders={reminders} />
      </section>
    </>
  )
}

function Upcoming({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-slate-400">Nothing scheduled.</p>
  return (
    <ul className="space-y-2 text-sm">
      {events.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3">
          <span className="text-slate-700">{e.title}</span>
          <span className="shrink-0 text-xs text-slate-400">{e.event_date} · {e.kind}</span>
        </li>
      ))}
    </ul>
  )
}
