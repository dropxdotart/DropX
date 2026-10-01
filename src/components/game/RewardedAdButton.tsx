'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { getAdByPlacement, type AdCreative } from '@/app/actions'
import { trackAd } from '@/lib/adTracking'

// With no ad to show, the reward unlocks after a short pause instead.
const NO_AD_SECONDS = 3

// Watch-to-claim: the ad can't be closed until it has played for the
// admin-set time (or until a shorter video ends). After that, closing it or
// tapping Claim both give the reward.
export default function RewardedAdButton({
  onReward,
  rewardBricks = 0,
  className,
  children,
}: {
  onReward: () => void
  // Recorded with the "watched" stat as bricks given out through this ad.
  rewardBricks?: number
  className?: string
  children: ReactNode
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'claim'>('idle')
  const [ad, setAd] = useState<AdCreative | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }
  useEffect(() => stopTimer, [])

  const unlock = () => {
    stopTimer()
    setState((s) => (s === 'playing' ? 'claim' : s))
  }

  const start = async () => {
    setState('loading')
    const creative = await getAdByPlacement('rewarded')
    setAd(creative)
    if (creative) trackAd(creative.id, 'view')
    let remaining = creative ? creative.unlockSeconds : NO_AD_SECONDS
    setSecondsLeft(remaining)
    setState(remaining > 0 ? 'playing' : 'claim')
    if (remaining <= 0) return
    timer.current = setInterval(() => {
      remaining -= 1
      setSecondsLeft(remaining)
      if (remaining <= 0) unlock()
    }, 1000)
  }

  const claim = () => {
    if (ad) trackAd(ad.id, 'complete', rewardBricks)
    onReward()
    setState('idle')
    setAd(null)
  }

  const clickThrough = () => {
    if (!ad?.click_url) return
    trackAd(ad.id, 'click')
    window.open(ad.click_url, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <button className={className} onClick={start} disabled={state !== 'idle'}>
        {state === 'loading' ? <Loader2 className="w-6 h-6 animate-spin" /> : children}
      </button>

      {/* Portaled so a transformed parent (like the sliding bonus tab) can't
          trap the full-screen overlay inside itself. */}
      {(state === 'playing' || state === 'claim') &&
        createPortal(
          <div className="pointer-events-auto fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-6">
            {state === 'claim' && (
              <button
                onClick={claim}
                className="absolute right-4 top-[max(env(safe-area-inset-top),16px)] flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white"
                aria-label="Close and claim reward"
              >
                <X className="h-5 w-5" />
              </button>
            )}
            <div
              onClick={clickThrough}
              className={`w-full max-w-xs aspect-video rounded-xl overflow-hidden bg-secondary flex items-center justify-center ${ad?.click_url ? 'cursor-pointer' : ''}`}
            >
              {ad ? (
                ad.kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external Storage URL
                  <img src={ad.media_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  // A video shorter than the timer unlocks when it ends.
                  <video src={ad.media_url} className="w-full h-full object-cover" autoPlay muted playsInline onEnded={unlock} />
                )
              ) : (
                <span className="text-sm text-muted-foreground">Ad</span>
              )}
            </div>

            {state === 'playing' ? (
              <p className="mt-4 text-sm text-white/70 font-mono">Reward in {secondsLeft}s</p>
            ) : (
              <button
                onClick={claim}
                className="mt-4 h-12 rounded-2xl px-8 bg-[#3fbf4a] text-white font-display text-xl shadow-[0_4px_0_#2a8a33] active:translate-y-1 active:shadow-none"
              >
                Claim reward
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  )
}
