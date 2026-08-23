import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DropX',
    short_name: 'DropX',
    description: 'A new challenge drops every day.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0e0a14',
    theme_color: '#0e0a14',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
