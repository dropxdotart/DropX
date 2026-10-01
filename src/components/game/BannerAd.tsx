'use client'

import { useEffect, useState } from 'react'
import { getAdByPlacement, type AdCreative } from '@/app/actions'
import { trackAd } from '@/lib/adTracking'

// Always-visible strip under the game controls — renders nothing if no
// banner creative is active, rather than reserving empty space.
export default function BannerAd() {
  const [ad, setAd] = useState<AdCreative | null>(null)

  useEffect(() => {
    getAdByPlacement('banner').then((creative) => {
      setAd(creative)
      if (creative) trackAd(creative.id, 'view')
    })
  }, [])

  if (!ad) return null

  const media =
    ad.kind === 'image' ? (
      // eslint-disable-next-line @next/next/no-img-element -- external Storage URL
      <img src={ad.media_url} alt="" className="w-full h-full object-cover" />
    ) : (
      <video src={ad.media_url} className="w-full h-full object-cover" autoPlay loop muted playsInline />
    )

  return (
    <div className="pointer-events-auto border-t border-black/10 bg-card">
      <div className="mx-auto max-w-sm h-14 relative">
        {ad.click_url ? (
          <a
            href={ad.click_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackAd(ad.id, 'click')}
            className="block w-full h-full"
          >
            {media}
          </a>
        ) : (
          media
        )}
        <span className="absolute top-1 left-1 text-[9px] font-mono uppercase tracking-wide bg-background/80 text-muted-foreground rounded px-1">
          Ad
        </span>
      </div>
    </div>
  )
}
