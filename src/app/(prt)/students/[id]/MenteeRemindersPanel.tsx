import { Panel } from '@/lib/ui'
import { AssignReminderForm } from '../../AssignReminderForm'

/**
 * A mentor sets a reminder for their mentee - something to do by a time - from the mentee's own page.
 * Offered for the classes the reader may open (the service re-checks the authority to act in the one
 * chosen), and absent when there are none.
 */
export function MenteeRemindersPanel({
  studentId,
  studentName,
  classes,
  openableClassIds,
}: {
  studentId: string
  studentName: string
  classes: Array<{ id: string; name: string }>
  openableClassIds: string[]
}) {
  const openable = new Set(openableClassIds)
  const mine = classes.filter((c) => openable.has(c.id))
  if (mine.length === 0) return null

  return (
    <section id="reminders" className="mt-4 scroll-mt-20">
      <Panel title="Reminders">
        <p className="text-sm text-slate-600">
          Set something for {studentName} to do by a time. It appears on their dashboard and they are told straight
          away.
        </p>
        <AssignReminderForm studentId={studentId} studentName={studentName} classes={mine} />
      </Panel>
    </section>
  )
}
