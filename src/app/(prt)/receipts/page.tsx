import { FinanceDocList } from '../FinanceDocList'

export default async function ReceiptsPage(props: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await props.searchParams
  return (
    <FinanceDocList
      kind="receipt"
      capability="viewReceipts"
      title="My receipts"
      description="Your fee receipts, newest first."
      statLabel="Receipts"
      totalLabel="Total paid"
      emptyText="No receipts yet."
      page={page}
    />
  )
}
