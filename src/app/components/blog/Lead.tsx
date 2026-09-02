import type { ReactNode } from 'react'

/** The oversized opening paragraph of a blog post. A single markdown paragraph can't
 *  carry its own class, so the post marks its intro with <Lead>...</Lead>. Rendered as
 *  a block wrapper (not a <p>) so MDX wrapping the inner markdown in its own <p> can't
 *  produce invalid nested paragraphs; the font size is inherited by that inner <p>. */
export default function Lead({ children }: { children: ReactNode }) {
  return <div className="text-xl leading-relaxed text-gray-700 my-6 [&>p]:my-0">{children}</div>
}
