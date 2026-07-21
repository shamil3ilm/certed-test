import { FinanceDocList } from '../FinanceDocList'

export default function ReceiptsPage() {
  return (
    <FinanceDocList
      kind="receipt"
      capability="viewReceipts"
      title="My receipts"
      description="Your fee receipts, newest first."
      statLabel="Receipts"
      emptyText="No receipts yet."
    />
  )
}
