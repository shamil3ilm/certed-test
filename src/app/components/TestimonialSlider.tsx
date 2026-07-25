'use client'

import { useCallback, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Testimonial {
  quote: string
  author: string
  role?: string
}

interface TestimonialSliderProps {
  testimonials: Testimonial[]
}

export default function TestimonialSlider({ testimonials }: TestimonialSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFading, setIsFading] = useState(false)
  const [pendingIndex, setPendingIndex] = useState<number | null>(null)

  const transitionTo = useCallback(
    (nextIndex: (current: number) => number) => {
      if (isFading) return

      const targetIndex = nextIndex(currentIndex)
      if (targetIndex === currentIndex) return

      setPendingIndex(targetIndex)
      setIsFading(true)
    },
    [currentIndex, isFading],
  )

  if (!testimonials || testimonials.length === 0) return null

  const nextTestimonial = () => transitionTo((prev) => (prev === testimonials.length - 1 ? 0 : prev + 1))
  const prevTestimonial = () => transitionTo((prev) => (prev === 0 ? testimonials.length - 1 : prev - 1))
  const goToTestimonial = (index: number) => {
    if (index === currentIndex) return
    transitionTo(() => index)
  }

  const handleTransitionEnd = () => {
    if (!isFading || pendingIndex === null) return

    setCurrentIndex(pendingIndex)
    setPendingIndex(null)
    setIsFading(false)
  }

  const currentT = testimonials[currentIndex]
  const testimonialKey = (testimonial: Testimonial) => `${testimonial.author}:${testimonial.role ?? testimonial.quote}`

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-12 relative w-full">
      {/* Desktop Navigation Arrows */}
      <button
        type="button"
        onClick={prevTestimonial}
        className="absolute left-[-16px] top-1/2 z-10 hidden -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-gray-100 bg-white p-3 text-primary shadow-md transition-all hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:left-0 sm:flex"
        aria-label="Previous testimonial"
      >
        <ChevronLeft size={24} />
      </button>

      <button
        type="button"
        onClick={nextTestimonial}
        className="absolute right-[-16px] top-1/2 z-10 hidden -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-gray-100 bg-white p-3 text-primary shadow-md transition-all hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:right-0 sm:flex"
        aria-label="Next testimonial"
      >
        <ChevronRight size={24} />
      </button>

      {/* Card Container */}
      <div className="bg-gray-50 p-8 sm:p-12 md:p-16 rounded-[2rem] border border-gray-100 relative shadow-sm min-h-[350px] flex flex-col justify-center transition-all duration-300">
        <div className="text-primary text-6xl font-serif absolute top-6 left-8 opacity-10">&ldquo;</div>

        <div
          className={`transition-opacity duration-300 ${isFading ? 'opacity-0' : 'opacity-100'} relative z-10 flex flex-col items-center text-center w-full`}
          onTransitionEnd={handleTransitionEnd}
          aria-live="polite"
          aria-atomic="true"
        >
          <p className="text-gray-600 text-base md:text-lg italic mb-10 pt-4 leading-relaxed font-medium max-w-4xl mx-auto">
            &ldquo;{currentT.quote}&rdquo;
          </p>

          <div className="flex flex-col items-center">
            <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center text-white font-bold text-xl mb-4 shadow-sm">
              {currentT.author.charAt(0)}
            </div>
            <p className="font-bold text-gray-900 text-lg">{currentT.author}</p>
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
            type="button"
            onClick={prevTestimonial}
            className="rounded-full border border-gray-200 bg-white p-3 text-primary shadow-md transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label="Previous testimonial"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            type="button"
            onClick={nextTestimonial}
            className="rounded-full border border-gray-200 bg-white p-3 text-primary shadow-md transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label="Next testimonial"
          >
            <ChevronRight size={24} />
          </button>
        </div>

        {/* Dots */}
        <div className="flex flex-wrap justify-center gap-2 max-w-full px-4">
          {testimonials.map((testimonial, idx) => (
            <button
              key={testimonialKey(testimonial)}
              type="button"
              onClick={() => goToTestimonial(idx)}
              className={`flex min-h-11 min-w-11 items-center justify-center rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                idx === currentIndex ? 'text-primary' : 'text-gray-300 hover:text-gray-400'
              }`}
              aria-label={`Go to testimonial ${idx + 1}`}
              aria-current={idx === currentIndex ? 'true' : undefined}
            >
              <span
                aria-hidden="true"
                className={`rounded-full transition-all duration-300 ${
                  idx === currentIndex ? 'h-2.5 w-8 bg-primary' : 'h-2.5 w-2.5 bg-current'
                }`}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
