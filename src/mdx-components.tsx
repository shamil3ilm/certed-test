import type { MDXComponents } from 'mdx/types'
import type { ComponentPropsWithoutRef } from 'react'
import Link from 'next/link'
import Callout from '@/app/components/blog/Callout'
import Lead from '@/app/components/blog/Lead'

/**
 * Global MDX component map - REQUIRED by `@next/mdx` in the App Router. Every `.mdx`
 * file renders through this, so it is where a post's markdown gets the site's
 * typography. The old blog posts styled each element inline because the `prose`
 * classes they wrapped were inert (no @tailwindcss/typography plugin is installed);
 * this reproduces that look once, centrally, from real markdown.
 *
 * `Callout` and `Lead` are exposed here too, so post bodies can use <Callout>/<Lead>
 * with no per-file import. Bespoke one-off layouts (grids, tables) stay as inline JSX
 * in the individual .mdx files.
 */

/** Internal links keep client-side navigation via next/link; external links open
 *  safely. Mirrors the original posts, which used <Link> for internal hrefs. */
function MdxAnchor({ href = '', children, ...rest }: ComponentPropsWithoutRef<'a'>) {
  const target = typeof href === 'string' ? href : ''
  if (target.startsWith('/')) {
    return (
      <Link href={target} className="text-primary font-medium hover:underline">
        {children}
      </Link>
    )
  }
  return (
    <a href={target} className="text-primary font-medium hover:underline" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  )
}

const components: MDXComponents = {
  h2: (props) => <h2 className="text-3xl font-bold mt-10 mb-6 text-primary" {...props} />,
  h3: (props) => <h3 className="text-2xl font-semibold mt-8 mb-4 text-gray-900" {...props} />,
  h4: (props) => <h4 className="text-xl font-semibold mt-6 mb-3 text-gray-900" {...props} />,
  p: (props) => <p className="text-gray-700 leading-relaxed my-4" {...props} />,
  ul: (props) => <ul className="list-disc pl-6 space-y-2 my-4 marker:text-primary text-gray-700" {...props} />,
  ol: (props) => <ol className="list-decimal pl-6 space-y-2 my-4 marker:text-primary text-gray-700" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  a: MdxAnchor,
  strong: (props) => <strong className="font-semibold text-gray-900" {...props} />,
  em: (props) => <em className="italic" {...props} />,
  hr: () => <hr className="my-10 border-gray-200" />,
  blockquote: (props) => (
    <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-600 my-6" {...props} />
  ),
  table: (props) => (
    <div className="overflow-x-auto my-6">
      <table className="min-w-full border-collapse border border-gray-200 bg-white" {...props} />
    </div>
  ),
  th: (props) => (
    <th className="border border-gray-200 px-6 py-3 text-left font-bold text-gray-900 bg-gray-50" {...props} />
  ),
  td: (props) => <td className="border border-gray-200 px-6 py-4 text-gray-700" {...props} />,
  Callout,
  Lead,
}

export function useMDXComponents(overrides?: MDXComponents): MDXComponents {
  return { ...components, ...overrides }
}
