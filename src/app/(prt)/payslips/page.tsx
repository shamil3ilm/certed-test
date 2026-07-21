import { FinanceDocList } from '../FinanceDocList'

export default function PayslipsPage() {
  return (
    <FinanceDocList
      kind="payslip"
      capability="viewPayslips"
      title="My pay slips"
      description="Your pay slips, newest first."
      statLabel="Pay slips"
      emptyText="No pay slips yet."
    />
  )
}
