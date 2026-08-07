import { FinanceDocList } from '../FinanceDocList'

export default async function PayslipsPage(props: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await props.searchParams
  return (
    <FinanceDocList
      kind="payslip"
      capability="viewPayslips"
      title="My pay slips"
      description="Your pay slips, newest first."
      statLabel="Pay slips"
      totalLabel="Total received"
      emptyText="No pay slips yet."
      page={page}
    />
  )
}
