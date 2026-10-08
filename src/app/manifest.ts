import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Rubble',
    short_name: 'Rubble',
    description: 'Smash your way through an endless demolition site.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f3f1ea',
    theme_color: '#f3f1ea',
    icons: [
      { src: '/rubble-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/rubble-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
