import { requireRole } from '@/lib/auth/requireRole'
import { formatMoney } from '@/lib/money'
import { listProfiles } from '@/lib/repos/users'
import { listCourses } from '@/lib/repos/courses'
import { listEnrollments } from '@/lib/repos/enrollments'
import { listCourseTeachers } from '@/lib/repos/courseTeachers'
import { listAssignments } from '@/lib/repos/assignments'
import { listMyActiveSubmissions } from '@/lib/repos/submissions'
import { listEvents, type CalendarEvent } from '@/lib/repos/calendarEvents'
import { listAllReceipts, listMyReceipts } from '@/lib/repos/receipts'
import { listAllPayslips, listMyPayslips } from '@/lib/repos/payslips'
import { Panel, MiniBars, Donut } from '../ui'
import { StatModalCard } from '../StatModalCard'

const sum = (rows: { total: number; voided: boolean }[]) =>
  rows.filter((r) => !r.voided).reduce((s, r) => s + Number(r.total), 0)

// Multi-currency safe: groups by currency and shows each total (e.g. "₹50,000 + AED 1,200")
// because summing different currencies into one number would be wrong.
const moneyByCurrency = (
  rows: { total: number; currency: string; voided: boolean }[],
  fallback = 'INR',
): string => {
  const m = new Map<string, number>()
  rows.filter((r) => !r.voided).forEach((r) => m.set(r.currency, (m.get(r.currency) ?? 0) + Number(r.total)))
  const groups = [...m.entries()]
  return groups.length ? groups.map(([c, t]) => formatMoney(t, c)).join(' + ') : formatMoney(0, fallback)
}

export default async function Dashboard() {
  const me = await requireRole(['admin', 'teacher', 'student'])
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = (await listEvents({ from: today })).slice(0, 6)

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-gradient-to-br from-primary to-secondary p-6 text-white shadow-sm">
        <h1 className="text-2xl font-semibold">Welcome, {me.full_name ?? me.email}</h1>
        <p className="mt-1 text-sm capitalize text-white/80">{me.role} · Cert-Ed Academia portal</p>
      </div>

      {me.role === 'admin' && <AdminDashboard upcoming={upcoming} />}
      {me.role === 'teacher' && <TeacherDashboard meId={me.id} upcoming={upcoming} />}
      {me.role === 'student' && <StudentDashboard meId={me.id} upcoming={upcoming} />}
    </main>
  )
}

async function AdminDashboard({ upcoming }: { upcoming: CalendarEvent[] }) {
  const [profiles, courses, enrollments, receipts, payslips] = await Promise.all([
    listProfiles(),
    listCourses(),
    listEnrollments(),
    listAllReceipts(),
    listAllPayslips(),
  ])
  const studentList = profiles.filter((p) => p.role === 'student')
  const teacherList = profiles.filter((p) => p.role === 'teacher')
  const activeCourseList = courses.filter((c) => c.status === 'active')
  const liveReceipts = receipts.filter((r) => !r.voided)
  const livePayslips = payslips.filter((p) => !p.voided)
  const currency = receipts[0]?.currency ?? 'INR'
  const revenue = sum(receipts)
  const payout = sum(payslips)
  const perCourse = courses
    .map((c) => ({ label: c.name, value: enrollments.filter((e) => e.course_id === c.id).length }))
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
          label="Active courses" value={activeCourseList.length} title="Active courses"
          items={activeCourseList.map((c) => ({ primary: c.name, secondary: `${enrollments.filter((e) => e.course_id === c.id).length} students` }))}
        />
        <StatModalCard
          label="Revenue" value={moneyByCurrency(receipts)} sub={`Payouts ${moneyByCurrency(payslips)}`} tone="primary"
          title="Finance"
          sections={[
            { heading: 'Revenue · receipts', total: moneyByCurrency(receipts), items: liveReceipts.map((r) => ({ primary: r.number, secondary: formatMoney(Number(r.total), r.currency) })) },
            { heading: 'Payouts · pay slips', total: moneyByCurrency(payslips), items: livePayslips.map((p) => ({ primary: p.number, secondary: formatMoney(Number(p.total), p.currency) })) },
          ]}
          empty="None yet."
        />
      </section>
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Students per course"><MiniBars data={perCourse} /></Panel>
        <Panel title="Upcoming"><Upcoming events={upcoming} /></Panel>
      </section>
    </>
  )
}

async function TeacherDashboard({ meId, upcoming }: { meId: string; upcoming: CalendarEvent[] }) {
  const [cts, courses, assignments, payslips] = await Promise.all([
    listCourseTeachers(),
    listCourses(),
    listAssignments(),
    listMyPayslips(meId),
  ])
  const myCourseIds = new Set(cts.filter((ct) => ct.teacher_id === meId).map((ct) => ct.course_id))
  const myCourses = courses.filter((c) => myCourseIds.has(c.id))
  const myAssignments = assignments.filter((a) => myCourseIds.has(a.course_id))
  const currency = payslips[0]?.currency ?? 'INR'
  const payTotal = sum(payslips)
  const perCourse = myCourses.map((c) => ({
    label: c.name,
    value: myAssignments.filter((a) => a.course_id === c.id).length,
  }))

  return (
    <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatModalCard label="My courses" value={myCourses.length} title="My courses"
          items={myCourses.map((c) => ({ primary: c.name }))} empty="No courses assigned." />
        <StatModalCard label="Assignments" value={myAssignments.length} title="Assignments"
          items={myAssignments.map((a) => ({ primary: a.title, secondary: new Date(a.due_date).toLocaleDateString() }))} empty="No assignments." />
        <StatModalCard label="Pay slips" value={payslips.length} title="Pay slips"
          items={payslips.map((p) => ({ primary: p.number, secondary: formatMoney(Number(p.total), p.currency) }))} empty="No pay slips." />
        <StatModalCard label="Total paid" value={moneyByCurrency(payslips)} tone="primary" title="Pay slips"
          items={payslips.filter((p) => !p.voided).map((p) => ({ primary: p.number, secondary: formatMoney(Number(p.total), p.currency) }))} empty="No pay slips." />
      </section>
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Assignments per course"><MiniBars data={perCourse} /></Panel>
        <Panel title="Upcoming"><Upcoming events={upcoming} /></Panel>
      </section>
    </>
  )
}

async function StudentDashboard({ meId, upcoming }: { meId: string; upcoming: CalendarEvent[] }) {
  const [enrollments, courses, assignments, subs, receipts] = await Promise.all([
    listEnrollments(),
    listCourses(),
    listAssignments(),
    listMyActiveSubmissions(meId),
    listMyReceipts(meId),
  ])
  const myCourseIds = new Set(enrollments.filter((e) => e.student_id === meId).map((e) => e.course_id))
  const myCourses = courses.filter((c) => myCourseIds.has(c.id))
  const myAssignments = assignments.filter((a) => myCourseIds.has(a.course_id) && a.status === 'active')
  const submittedIds = new Set(subs.map((s) => s.assignment_id))
  const submitted = myAssignments.filter((a) => submittedIds.has(a.id)).length
  const pending = Math.max(0, myAssignments.length - submitted)
  const currency = receipts[0]?.currency ?? 'INR'
  const paid = sum(receipts)

  return (
    <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatModalCard label="Courses" value={myCourses.length} title="My courses"
          items={myCourses.map((c) => ({ primary: c.name }))} empty="Not enrolled in any course." />
        <StatModalCard label="Assignments" value={myAssignments.length} title="Assignments"
          items={myAssignments.map((a) => ({ primary: a.title, secondary: submittedIds.has(a.id) ? 'submitted' : 'pending' }))} empty="No assignments." />
        <StatModalCard label="Pending" value={pending} sub={`${submitted} submitted`} title="Pending assignments"
          items={myAssignments.filter((a) => !submittedIds.has(a.id)).map((a) => ({ primary: a.title, secondary: new Date(a.due_date).toLocaleDateString() }))} empty="All caught up!" />
        <StatModalCard label="Fees paid" value={moneyByCurrency(receipts)} tone="primary" title="Receipts"
          items={receipts.filter((r) => !r.voided).map((r) => ({ primary: r.number, secondary: formatMoney(Number(r.total), r.currency) }))} empty="No receipts." />
      </section>
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Assignment progress">
          <Donut value={submitted} total={myAssignments.length} label="submitted on time / total" />
        </Panel>
        <Panel title="Upcoming"><Upcoming events={upcoming} /></Panel>
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
