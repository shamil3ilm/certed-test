'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Testimonial {
    quote: string;
    author: string;
    role?: string;
}

interface TestimonialSliderProps {
    testimonials: Testimonial[];
}

export default function TestimonialSlider({ testimonials }: TestimonialSliderProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFading, setIsFading] = useState(false);

    if (!testimonials || testimonials.length === 0) return null;

    const nextTestimonial = () => {
        if (isFading) return;
        setIsFading(true);
        setTimeout(() => {
            setCurrentIndex((prev) => (prev === testimonials.length - 1 ? 0 : prev + 1));
            setIsFading(false);
        }, 300);
    };

    const prevTestimonial = () => {
        if (isFading) return;
        setIsFading(true);
        setTimeout(() => {
            setCurrentIndex((prev) => (prev === 0 ? testimonials.length - 1 : prev - 1));
            setIsFading(false);
        }, 300);
    };

    const goToTestimonial = (index: number) => {
        if (isFading || index === currentIndex) return;
        setIsFading(true);
        setTimeout(() => {
            setCurrentIndex(index);
            setIsFading(false);
        }, 300);
    };

    const currentT = testimonials[currentIndex];

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-12 relative w-full">
            {/* Desktop Navigation Arrows */}
            <button
                onClick={prevTestimonial}
                className="absolute left-[-16px] md:left-0 top-1/2 -translate-y-1/2 z-10 bg-white p-3 rounded-full shadow-md hover:bg-gray-50 text-primary transition-all border border-gray-100 hidden sm:flex items-center justify-center cursor-pointer"
                aria-label="Previous testimonial"
            >
                <ChevronLeft size={24} />
            </button>

            <button
                onClick={nextTestimonial}
                className="absolute right-[-16px] md:right-0 top-1/2 -translate-y-1/2 z-10 bg-white p-3 rounded-full shadow-md hover:bg-gray-50 text-primary transition-all border border-gray-100 hidden sm:flex items-center justify-center cursor-pointer"
                aria-label="Next testimonial"
            >
                <ChevronRight size={24} />
            </button>

            {/* Card Container */}
            <div className="bg-gray-50 p-8 sm:p-12 md:p-16 rounded-[2rem] border border-gray-100 relative shadow-sm min-h-[350px] flex flex-col justify-center transition-all duration-300">
                <div className="text-primary text-6xl font-serif absolute top-6 left-8 opacity-10">"</div>

                <div className={`transition-opacity duration-300 ${isFading ? 'opacity-0' : 'opacity-100'} relative z-10 flex flex-col items-center text-center w-full`}>
                    <p className="text-gray-600 text-base md:text-lg italic mb-10 pt-4 leading-relaxed font-medium max-w-4xl mx-auto">
                        "{currentT.quote}"
                    </p>

                    <div className="flex flex-col items-center">
                        <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center text-white font-bold text-xl mb-4 shadow-sm">
                            {currentT.author.charAt(0)}
                        </div>
                        <p className="font-bold text-gray-900 text-lg">— {currentT.author}</p>
                        {currentT.role && (
                            <p className="text-sm md:text-sm text-gray-600 font-medium whitespace-pre-wrap mt-2 leading-relaxed">
                                {currentT.role}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Mobile Arrows & Dots */}
            <div className="flex flex-col items-center mt-8 gap-6">
                <div className="flex sm:hidden gap-6">
                    <button
                        onClick={prevTestimonial}
                        className="bg-white p-3 rounded-full shadow-md border border-gray-200 text-primary active:scale-95 transition-transform"
                        aria-label="Previous testimonial"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <button
                        onClick={nextTestimonial}
                        className="bg-white p-3 rounded-full shadow-md border border-gray-200 text-primary active:scale-95 transition-transform"
                        aria-label="Next testimonial"
                    >
                        <ChevronRight size={24} />
                    </button>
                </div>

                {/* Dots */}
                <div className="flex flex-wrap justify-center gap-2 max-w-full px-4">
                    {testimonials.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => goToTestimonial(idx)}
                            className={`h-2.5 rounded-full transition-all duration-300 ${
                                idx === currentIndex ? 'bg-primary w-8' : 'bg-gray-300 w-2.5 hover:bg-gray-400'
                            }`}
                            aria-label={`Go to testimonial ${idx + 1}`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
