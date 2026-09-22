'use client'

import { useEffect, useState } from 'react'
import { getRandomAd, type AdCreative } from '@/app/room/actions'

// Shown once a round's results are revealed, above the "Next round"
// control — the natural break point in the flow. Fetches its own ad on
// mount rather than the parent server component doing it, so a page with
// no ads configured yet (schema exists, table's empty) just renders
// nothing instead of adding a data dependency everywhere the round screen
// is used.
export default function AdSlot() {
  const [ad, setAd] = useState<AdCreative | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    getRandomAd().then((a) => {
      if (!cancelled) setAd(a)
    })
    return () => {
      cancelled = true
    }
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
    <div className="rounded-xl border border-border overflow-hidden">
      <p className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-muted">Ad</p>
      {ad.click_url ? (
        <a href={ad.click_url} target="_blank" rel="noopener noreferrer" className="block aspect-video bg-black">
          {media}
        </a>
      ) : (
        <div className="aspect-video bg-black">{media}</div>
      )}
    </div>
  )
}
