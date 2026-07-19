import { FinanceDocList } from '../FinanceDocList'

export default function ReceiptsPage() {
  return (
    <FinanceDocList
      kind="receipt"
      ownerRole="student"
      allowedRoles={['admin', 'tutor', 'student']}
      title="My receipts"
      description="Your fee receipts, newest first."
      statLabel="Receipts"
      emptyText="No receipts yet."
      notOwnerNote={
        <>
          Receipts are issued to students. Admins manage them in{' '}
          <a href="/admin/finance" className="font-medium text-primary hover:underline">Finance</a>.
        </>
      }
    />
  )
}
