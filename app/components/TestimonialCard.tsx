interface TestimonialCardProps {
    quote: string;
    author: string;
    role?: string;
}

const TestimonialCard = ({ quote, author, role }: TestimonialCardProps) => {
    return (
        <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 relative">
            <div className="text-primary text-4xl font-serif absolute top-4 left-4 opacity-20">"</div>
            <p className="text-gray-700 italic mb-6 pt-6 relative z-10 text-justify">{quote}</p>
            <div className="flex items-center">
                <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold text-sm mr-3">
                    {author.charAt(0)}
                </div>
                <div>
                    <p className="font-bold text-gray-900">— {author}</p>
                    {role && <p className="text-xs text-secondary font-semibold uppercase whitespace-pre-wrap mt-1">{role}</p>}
                </div>
            </div>
        </div>
    );
};

export default TestimonialCard;
