import Link from 'next/link'
import type { BlogMeta } from '@/lib/content/blog-types'

/** The trailing call-to-action panel shared by every post. Its wording differs per
 *  post (meta.cta), but the layout is identical, so it lives here and is rendered by
 *  the [slug] route rather than repeated in each post body. */
export default function PostCta({ cta }: { cta: BlogMeta['cta'] }) {
  return (
    <div className="mt-16 rounded-2xl bg-gradient-to-br from-primary to-primary/85 p-8 text-center text-white shadow-xl md:p-12">
      <h2 className="text-3xl font-bold mb-4">{cta.heading}</h2>
      <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">{cta.body}</p>
      <Link
        href="/contact"
        className="inline-block bg-white text-primary font-bold px-8 py-4 rounded-full hover:bg-gray-100 transition-colors shadow-sm text-lg"
      >
        {cta.label}
      </Link>
    </div>
  )
}
