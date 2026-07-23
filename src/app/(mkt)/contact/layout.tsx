import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact Us | Cert-Ed Academia',
  description: 'Get in touch for personalised online tuition. Enquire now for CBSE and ICSE classes.',
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
