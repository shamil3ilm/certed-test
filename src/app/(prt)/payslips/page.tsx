import { FinanceDocList } from '../FinanceDocList'

export default function PayslipsPage() {
  return (
    <FinanceDocList
      kind="payslip"
      ownerRole="tutor"
      allowedRoles={['admin', 'tutor']}
      title="My pay slips"
      description="Your pay slips, newest first."
      statLabel="Pay slips"
      emptyText="No pay slips yet."
      notOwnerNote={
        <>
          Pay slips are issued to tutors. Admins manage them in{' '}
          <a href="/admin/finance" className="font-medium text-primary hover:underline">Finance</a>.
        </>
      }
    />
  )
}
