import type { MetadataRoute } from 'next'

/**
 * Web app manifest (Next.js App Router serves this at /manifest.webmanifest and
 * links it automatically). Defines the Android/PWA "add to home screen" icons,
 * brand theme colour, and app name.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cert-Ed Academia',
    short_name: 'Cert-Ed',
    description: 'Cert-Ed Academia online tuition portal - classes, grading, attendance and messaging.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#124d7e',
    icons: [
      { src: '/favicon/favicon_96.png', sizes: '96x96', type: 'image/png' },
      { src: '/favicon/favicon_152.png', sizes: '152x152', type: 'image/png' },
      { src: '/favicon/favicon_full.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
