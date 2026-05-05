'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface FAQItem {
    question: string;
    answer: string;
}

interface FAQAccordionProps {
    items: FAQItem[];
}

const FAQAccordion = ({ items }: FAQAccordionProps) => {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const toggle = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <div className="space-y-4">
            {items.map((item, index) => (
                <div key={index} className="border border-gray-200 rounded-2xl overflow-hidden">
                    <button
                        className="w-full flex justify-between items-center p-4 bg-white hover:bg-gray-50 text-left focus:outline-none"
                        onClick={() => toggle(index)}
                    >
                        <span className="font-semibold text-gray-900">{item.question}</span>
                        {openIndex === index ? (
                            <ChevronUp className="text-primary w-5 h-5" />
                        ) : (
                            <ChevronDown className="text-gray-500 w-5 h-5" />
                        )}
                    </button>

                    <div
                        className={`transition-all duration-300 ease-in-out overflow-hidden ${openIndex === index ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                            }`}
                    >
                        <div className="p-4 bg-gray-50 text-gray-700 border-t border-gray-100">
                            {item.answer}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default FAQAccordion;
