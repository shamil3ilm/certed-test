import { requireRole } from '@/lib/auth/requireRole'
import { formatMoney, totalByCurrency } from '@/lib/money'
import { LocalTime } from '../LocalTime'
import { listProfiles } from '@/lib/repos/users'
import { listClasses } from '@/lib/repos/classes'
import { listEnrollments } from '@/lib/repos/enrollments'
import { listClassTeachers } from '@/lib/repos/classTeachers'
import { listAssignments } from '@/lib/repos/assignments'
import { listMyActiveSubmissions } from '@/lib/repos/submissions'
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

export default async function Dashboard() {
  const me = await requireRole(['admin', 'teacher', 'student'])
  const today = new Date().toISOString().slice(0, 10)
  const [upcoming, reminders] = await Promise.all([
    listEvents({ from: today, limit: 6 }),
    listMyReminders(me.id),
  ])

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-gradient-to-br from-primary to-secondary p-5 text-white shadow-sm sm:p-6 lg:p-8">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">Welcome, {me.full_name ?? me.email}</h1>
        <p className="mt-1 text-sm text-white/80">{roleLabel(me.role)} · Cert-Ed Academia portal</p>
      </div>

      {me.role === 'admin' && <AdminDashboard upcoming={upcoming} reminders={reminders} meId={me.id} />}
      {me.role === 'teacher' && <TeacherDashboard meId={me.id} upcoming={upcoming} reminders={reminders} />}
      {me.role === 'student' && <StudentDashboard meId={me.id} upcoming={upcoming} reminders={reminders} />}
    </main>
  )
}

async function AdminDashboard({ upcoming, reminders, meId }: { upcoming: CalendarEvent[]; reminders: Reminder[]; meId: string }) {
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

  return (
    <>
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

  return (
    <>
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
