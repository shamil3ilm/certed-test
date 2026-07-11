import { FinanceDocList } from '../FinanceDocList'

export default function PayslipsPage() {
  return (
    <FinanceDocList
      kind="payslip"
      ownerRole="teacher"
      allowedRoles={['admin', 'teacher']}
      title="My pay slips"
      description="Your pay slips, newest first."
      statLabel="Pay slips"
      emptyText="No pay slips yet."
      notOwnerNote={
        <>
          Pay slips are issued to teachers. Admins manage them in{' '}
          <a href="/admin/finance" className="font-medium text-primary hover:underline">Finance</a>.
        </>
      }
    />
  )
}
