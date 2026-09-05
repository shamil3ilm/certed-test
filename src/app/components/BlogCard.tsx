import Image from 'next/image'
import Link from 'next/link'

interface BlogCardProps {
  title: string
  excerpt: string
  image: string
  date: string
  category: string
  slug: string
}

const BlogCard = ({ title, excerpt, image, date, category, slug }: BlogCardProps) => {
  const href = `/blogs/${slug}`

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col h-full group">
      <div className="relative h-48 w-full bg-gray-100">
        <Image src={image} alt={title} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" />
      </div>
      <div className="p-6 flex flex-col flex-grow">
        <div className="flex items-center text-xs text-gray-600 mb-3 space-x-2">
          <span className="font-semibold text-secondary-ink uppercase tracking-wide">{category}</span>
          <span>&bull;</span>
          <span>{date}</span>
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-3 leading-tight group-hover:text-primary transition-colors">
          <Link href={href} className="hover:underline">
            {title}
          </Link>
        </h3>
        <p className="text-gray-600 text-sm leading-relaxed mb-4 flex-grow">{excerpt}</p>
        <Link
          href={href}
          className="inline-flex min-h-11 items-center text-primary font-semibold text-sm hover:underline mt-auto"
        >
          Read more
        </Link>
      </div>
    </div>
  )
}

export default BlogCard
