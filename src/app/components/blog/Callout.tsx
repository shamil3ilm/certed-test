import type { ReactNode } from 'react'

/**
 * A tinted, bordered emphasis box for blog posts - the recurring "Important Tip",
 * "Rule", and highlight panels the posts used inline. Exposed globally to MDX (see
 * src/mdx-components.tsx), so a post writes <Callout tone="danger" title="Rule:">...
 * One place owns the styling instead of the markup being copy-pasted per post.
 */

type CalloutTone = 'primary' | 'muted' | 'success' | 'danger' | 'note'

const TONE_CLASSES: Record<CalloutTone, string> = {
  primary: 'bg-primary/5 border-l-4 border-primary p-6 rounded-r-lg',
  muted: 'bg-gray-50 p-6 rounded-xl border border-gray-100',
  success: 'bg-green-50 border-l-4 border-green-500 p-6 rounded-r-lg',
  danger: 'bg-red-50 border-l-4 border-red-500 p-6 rounded-r-lg',
  note: 'bg-gray-50 border-l-4 border-gray-400 p-4 italic',
}

interface CalloutProps {
  tone?: CalloutTone
  title?: string
  children: ReactNode
}

export default function Callout({ tone = 'primary', title, children }: CalloutProps) {
  return (
    <div className={`my-6 ${TONE_CLASSES[tone]}`}>
      {title ? <p className="font-bold text-gray-900 text-lg mb-2">{title}</p> : null}
      <div className="text-gray-700 [&>p]:my-0 [&>p+p]:mt-3">{children}</div>
    </div>
  )
}
