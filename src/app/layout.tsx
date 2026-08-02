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
      // Theme-aware marks first; a browser that supports icon `media` picks one.
      {
        url: '/icon/icon_color.svg?v=5',
        media: '(prefers-color-scheme: light)',
        type: 'image/svg+xml',
      },
      {
        url: '/icon/icon_white.png?v=5',
        media: '(prefers-color-scheme: dark)',
        type: 'image/png',
      },
      // Unconditional PNG fallbacks - clients that ignore a media-scoped icon (and
      // the previously-dead `media: 'not all'` 96px entry) now get a real icon.
      { url: '/favicon/favicon_16.png?v=5', sizes: '16x16', type: 'image/png' },
      { url: '/favicon/favicon_32.png?v=5', sizes: '32x32', type: 'image/png' },
      { url: '/favicon/favicon_96.png?v=5', sizes: '96x96', type: 'image/png' },
    ],
    apple: '/favicon/favicon_152.png?v=5',
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
