'use client'

import { useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { Check, Volume2, VolumeX, X } from 'lucide-react'
import type { AdCreative } from '@/app/actions'
import { trackAd } from '@/lib/adTracking'

// With no ad to show, a placeholder runs for this long instead.
const NO_AD_SECONDS = 3
const TICK_MS = 200
const noSubscribe = () => () => {}

export type AdPlayerHandle = {
  // Starts playback. Call it straight from a tap so the browser allows
  // sound; otherwise it starts muted with a "Tap for sound" button.
  start: (withSound: boolean) => void
}

// A full-screen ad, like Google's: the video or image fills the screen with
// sound, a countdown, an X once it can be closed, an "Ad" label and a Learn
// more button. The countdown only runs while the ad is actually playing on
// screen — leaving the app pauses the video and the timer, and they pick up
// again on return. Reloading mid-ad gets nothing: rewards are only given by
// closing it after the countdown.
export default function AdPlayer({
  ref,
  ad,
  open,
  mode,
  onClose,
}: {
  ref?: Ref<AdPlayerHandle>
  ad: AdCreative | null
  open: boolean
  mode: 'rewarded' | 'interstitial'
  // `watched`: played to the end (or for the whole required time).
  onClose: (watched: boolean) => void
}) {
  // Portals need `document`: render only in the browser (false during SSR
  // and hydration, so server and client markup match).
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false)
  const video = useRef<HTMLVideoElement>(null)
  const [elapsed, setElapsed] = useState(0)
  const [ended, setEnded] = useState(false)
  const [muted, setMuted] = useState(true)
  const required = ad ? ad.unlockSeconds : NO_AD_SECONDS
  const unlocked = elapsed >= required || ended
  const left = Math.max(0, Math.ceil(required - elapsed))

  useImperativeHandle(ref, () => ({
    start: (withSound: boolean) => {
      setElapsed(0)
      setEnded(false)
      const v = video.current
      if (!v) return
      v.currentTime = 0
      v.muted = !withSound
      setMuted(!withSound)
      v.play().catch(() => {
        // Sound blocked: play muted and offer the sound button.
        v.muted = true
        setMuted(true)
        v.play().catch(() => {})
      })
    },
  }))

  // Count only while it's visible and actually playing.
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      const v = video.current
      if (ad?.kind === 'video' && (!v || v.paused || v.ended)) return
      setElapsed((e) => e + TICK_MS / 1000)
    }, TICK_MS)
    return () => clearInterval(id)
  }, [open, ad])

  // Leaving the app pauses the ad; coming back resumes it.
  useEffect(() => {
    if (!open) return
    const onVisibility = () => {
      const v = video.current
      if (!v || ended) return
      if (document.visibilityState === 'hidden') v.pause()
      else
        v.play().catch(() => {
          v.muted = true
          setMuted(true)
          v.play().catch(() => {})
        })
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [open, ended])

  const toggleSound = () => {
    const v = video.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
    if (v.paused && !ended) v.play().catch(() => {})
  }

  const close = () => {
    video.current?.pause()
    onClose(ad?.kind === 'video' ? ended || mode === 'rewarded' : true)
  }

  const learnMore = () => {
    if (!ad?.click_url) return
    trackAd(ad.id, 'click')
    window.open(ad.click_url, '_blank', 'noopener,noreferrer')
  }

  if (!mounted) return null

  return createPortal(
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-[100] bg-black transition-opacity duration-200 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      {ad?.kind === 'video' ? (
        <video
          ref={video}
          src={ad.media_url}
          className="absolute inset-0 h-full w-full object-contain"
          playsInline
          preload="auto"
          muted={muted}
          onEnded={() => setEnded(true)}
        />
      ) : ad ? (
        // eslint-disable-next-line @next/next/no-img-element -- external Storage URL
        <img src={ad.media_url} alt="" className="absolute inset-0 h-full w-full object-contain" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/50">Ad</div>
      )}

      {/* Top bar: Ad label, then countdown or close */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(env(safe-area-inset-top),16px)]">
        <span className="rounded bg-[#ffc93c] px-1.5 py-0.5 text-[11px] font-bold text-black">Ad</span>
        {unlocked ? (
          <div className="flex items-center gap-2">
            {mode === 'rewarded' && (
              <span className="flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white">
                <Check className="h-3.5 w-3.5 text-[#3fdc4f]" /> Reward earned
              </span>
            )}
            <button
              type="button"
              onClick={close}
              aria-label={mode === 'rewarded' ? 'Close and claim reward' : 'Close ad'}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <span className="rounded-full bg-black/60 px-3 py-1.5 font-mono text-xs text-white">
            {mode === 'rewarded' ? `Reward in ${left}s` : `Skip in ${left}s`}
          </span>
        )}
      </div>

      {/* Bottom bar: sound and Learn more */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-4 pb-[max(env(safe-area-inset-bottom),20px)]">
        {ad?.kind === 'video' ? (
          <button
            type="button"
            onClick={toggleSound}
            className={`flex items-center gap-2 rounded-full bg-black/60 text-white ${muted ? 'px-4 py-2.5 text-sm font-medium' : 'h-11 w-11 justify-center'}`}
            aria-label={muted ? 'Turn sound on' : 'Mute'}
          >
            {muted ? (
              <>
                <VolumeX className="h-5 w-5" /> Tap for sound
              </>
            ) : (
              <Volume2 className="h-5 w-5" />
            )}
          </button>
        ) : (
          <span />
        )}
        {ad?.click_url && (
          <button
            type="button"
            onClick={learnMore}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black"
          >
            Learn more ›
          </button>
        )}
      </div>
    </div>,
    document.body
  )
}
