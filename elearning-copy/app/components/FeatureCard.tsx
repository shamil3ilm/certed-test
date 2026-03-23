import { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
    icon: any;
    title: string;
    description: string;
}

const FeatureCard = ({ icon: Icon, title, description }: FeatureCardProps) => {
    return (
        <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-300">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Icon className="text-primary w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
            <p className="text-gray-600 leading-relaxed">{description}</p>
        </div>
    );
};

export default FeatureCard;
