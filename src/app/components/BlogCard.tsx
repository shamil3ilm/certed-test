import Link from 'next/link';

interface BlogCardProps {
    title: string;
    excerpt: string;
    image: string;
    date: string;
    category: string;
    slug?: string;
}

const BlogCard = ({ title, excerpt, image, date, category, slug }: BlogCardProps) => {
    const href = slug ? `/blogs/${slug}` : '#';

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col h-full group">
            <div className="relative h-48 w-full bg-gray-200">
                <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-gray-100">
                    {/* Using a placeholder text if main image fails or just as style */}
                    <span className="text-sm font-semibold tracking-wider uppercase">{category} Image</span>
                </div>
                {/* In a real app, we would use Next/Image with a real src. For now, we use a colored div or the placeholder logic above.*/}
                <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${image})` }}
                />
            </div>
            <div className="p-6 flex flex-col flex-grow">
                <div className="flex items-center text-xs text-gray-500 mb-3 space-x-2">
                    <span className="font-semibold text-secondary uppercase tracking-wide">{category}</span>
                    <span>•</span>
                    <span>{date}</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3 leading-tight group-hover:text-primary transition-colors">
                    <Link href={href} className="hover:underline">{title}</Link>
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed mb-4 flex-grow">
                    {excerpt}
                </p>
                <Link href={href} className="inline-flex items-center text-primary font-semibold text-sm hover:underline mt-auto">
                    Read more &rarr;
                </Link>
            </div>
        </div>
    );
};

export default BlogCard;
