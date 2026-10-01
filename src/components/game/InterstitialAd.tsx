'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { getAdByPlacement, type AdCreative } from '@/app/actions'
import { trackAd } from '@/lib/adTracking'

// Shown once per `trigger` value change (the caller bumps this — e.g. on
// every site cleared) rather than on a timer, so it lands at a natural
// break instead of interrupting active tapping. It becomes skippable after
// the admin-set time, or as soon as a shorter video ends.
export default function InterstitialAd({ trigger }: { trigger: number }) {
  const [ad, setAd] = useState<AdCreative | null | undefined>(undefined)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const initialTrigger = useRef(trigger)
  const videoEnded = useRef(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }

  useEffect(() => {
    // Only show on a change after mount — not for the value a save loads with.
    if (trigger === initialTrigger.current) return
    let cancelled = false
    getAdByPlacement('interstitial').then((creative) => {
      if (cancelled) return
      setAd(creative)
      if (!creative) return
      trackAd(creative.id, 'view')
      videoEnded.current = false
      let remaining = creative.unlockSeconds
      setSecondsLeft(remaining)
      stopTimer()
      timer.current = setInterval(() => {
        remaining -= 1
        setSecondsLeft(Math.max(0, remaining))
        if (remaining <= 0) stopTimer()
      }, 1000)
    })
    return () => {
      cancelled = true
      stopTimer()
    }
  }, [trigger])

  if (ad === undefined || ad === null) return null

  // Watched to the end = a video that finished, or an image left up for
  // the whole required time (it can't be closed sooner). Closing a longer
  // video before it ends is a skip.
  const close = () => {
    stopTimer()
    trackAd(ad.id, ad.kind === 'image' || videoEnded.current ? 'complete' : 'skip')
    setAd(null)
  }

  const clickThrough = () => {
    if (!ad.click_url) return
    trackAd(ad.id, 'click')
    window.open(ad.click_url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-6">
      <div
        onClick={clickThrough}
        className={`w-full max-w-xs aspect-video rounded-xl overflow-hidden bg-secondary ${ad.click_url ? 'cursor-pointer' : ''}`}
      >
        {ad.kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Storage URL
          <img src={ad.media_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <video
            src={ad.media_url}
            className="w-full h-full object-cover"
            autoPlay
            muted
            playsInline
            onEnded={() => {
              videoEnded.current = true
              stopTimer()
              setSecondsLeft(0)
            }}
          />
        )}
      </div>
      {secondsLeft <= 0 ? (
        <button
          onClick={close}
          className="mt-4 flex items-center justify-center w-9 h-9 rounded-full bg-white/10 text-white hover:bg-white/20"
          aria-label="Close ad"
        >
          <X className="w-5 h-5" />
        </button>
      ) : (
        <p className="mt-4 text-sm text-white/70 font-mono">Skip in {secondsLeft}s</p>
      )}
    </div>
  )
}
