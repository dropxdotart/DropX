'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { getAdByPlacement, type AdCreative } from '@/app/actions'

const MIN_SECONDS_BEFORE_CLOSE = 3

// Shown once per `trigger` value change (the caller bumps this — e.g. on
// every structure destroyed) rather than on a timer, so it lands at a
// natural break instead of interrupting active tapping.
export default function InterstitialAd({ trigger }: { trigger: number }) {
  const [ad, setAd] = useState<AdCreative | null | undefined>(undefined)
  const [canClose, setCanClose] = useState(false)
  const initialTrigger = useRef(trigger)

  useEffect(() => {
    // Only show on a change after mount — not for the value a save loads with.
    if (trigger === initialTrigger.current) return
    let cancelled = false
    setCanClose(false)
    getAdByPlacement('interstitial').then((creative) => {
      if (!cancelled) setAd(creative)
    })
    const id = setTimeout(() => setCanClose(true), MIN_SECONDS_BEFORE_CLOSE * 1000)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires only when trigger changes
  }, [trigger])

  if (ad === undefined || ad === null) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-6">
      <div className="w-full max-w-xs aspect-video rounded-xl overflow-hidden bg-secondary">
        {ad.kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Storage URL
          <img src={ad.media_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <video src={ad.media_url} className="w-full h-full object-cover" autoPlay muted playsInline />
        )}
      </div>
      {canClose ? (
        <button
          onClick={() => setAd(null)}
          className="mt-4 flex items-center justify-center w-9 h-9 rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <X className="w-5 h-5" />
        </button>
      ) : (
        <p className="mt-4 text-sm text-white/70 font-mono">Ad</p>
      )}
    </div>
  )
}
