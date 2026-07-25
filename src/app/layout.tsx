import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'

const brandSans = localFont({
  src: '../lib/pdf/assets/louis-george-cafe.regular.ttf',
  variable: '--font-brand-sans',
  display: 'swap',
})

const brandDisplay = localFont({
  src: '../lib/pdf/assets/DAGGERSQUARE.otf',
  variable: '--font-brand-display',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://certedacademia.com'),
  title: 'Cert-Ed Academia',
  icons: {
    icon: [
      {
        url: '/icon/icon_color.svg?v=4',
        media: '(prefers-color-scheme: light)',
        type: 'image/svg+xml',
      },
      {
        url: '/icon/icon_white.png?v=4',
        media: '(prefers-color-scheme: dark)',
        type: 'image/png',
      },
      {
        url: '/favicon/favicon_96.png?v=4',
        sizes: '96x96',
        type: 'image/png',
        media: 'not all',
      },
    ],
    apple: '/favicon/favicon_152.png?v=4',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${brandSans.variable} ${brandDisplay.variable}`}>
      <body className={`${brandSans.className} antialiased`}>{children}</body>
    </html>
  )
}
