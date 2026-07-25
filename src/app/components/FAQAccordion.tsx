'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface FAQItem {
  question: string
  answer: string
}

interface FAQAccordionProps {
  items: FAQItem[]
}

const FAQAccordion = ({ items }: FAQAccordionProps) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <div className="space-y-4">
      {items.map((item, index) => {
        const open = openIndex === index
        return (
          <div key={item.question} className="border border-gray-200 rounded-2xl overflow-hidden">
            <button
              type="button"
              className="w-full flex justify-between items-center bg-white p-4 text-left hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
              onClick={() => toggle(index)}
              aria-expanded={open}
              aria-controls={`faq-panel-${index}`}
              id={`faq-trigger-${index}`}
            >
              <span className="font-semibold text-gray-900">{item.question}</span>
              {open ? (
                <ChevronUp className="text-primary w-5 h-5" aria-hidden="true" />
              ) : (
                <ChevronDown className="text-gray-500 w-5 h-5" aria-hidden="true" />
              )}
            </button>

            <div
              id={`faq-panel-${index}`}
              role="region"
              aria-labelledby={`faq-trigger-${index}`}
              aria-hidden={!open}
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="p-4 bg-gray-50 text-gray-700 border-t border-gray-100">{item.answer}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default FAQAccordion
