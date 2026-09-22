import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FleXGames',
    short_name: 'FleX',
    description: 'Party games with your friends, right from your phones.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0e0f11',
    theme_color: '#0e0f11',
    icons: [
      { src: '/flex-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/flex-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
