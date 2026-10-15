'use client'

import { useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { Check, ExternalLink, Gift, RotateCcw, Volume2, VolumeX, X } from 'lucide-react'
import type { AdCreative } from '@/app/actions'
import { trackAd } from '@/lib/adTracking'
import { IconText } from './Icons'

// With no ad to show, a placeholder runs for this long instead.
const NO_AD_SECONDS = 3
const TICK_MS = 200
const noSubscribe = () => () => {}

export type AdPlayerHandle = {
  // Starts playback. Call it straight from a tap so the browser allows
  // sound; otherwise it starts muted with a "Tap for sound" button.
  start: (withSound: boolean) => void
}

// A full-screen ad in the style of the big ad networks: the creative fills
// the screen; on top, an Ad label with the advertiser, a progress bar and a
// countdown ring (or, for rewarded ads, what you'll get and when); at the
// bottom, the advertiser's card with its call-to-action button. A video
// ends on an end card (replay, CTA, claim/close). The countdown only runs
// while the ad is really playing on screen — leaving the app pauses it.
// Rewarded ads can be left early, after a "you'll lose the reward" check.
export default function AdPlayer({
  ref,
  ad,
  open,
  mode,
  reward,
  onClose,
}: {
  ref?: Ref<AdPlayerHandle>
  ad: AdCreative | null
  open: boolean
  mode: 'rewarded' | 'interstitial'
  // Rewarded only: what the player gets, e.g. "+1,200 🧱".
  reward?: string
  // `watched`: played for the whole required time (or to the end).
  // `seconds`: how long it actually played.
  onClose: (watched: boolean, seconds: number) => void
}) {
  // Portals need `document`: render only in the browser (false during SSR
  // and hydration, so server and client markup match).
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false)
  const video = useRef<HTMLVideoElement>(null)
  const [elapsed, setElapsed] = useState(0)
  const [ended, setEnded] = useState(false)
  const [muted, setMuted] = useState(true)
  const [progress, setProgress] = useState(0) // video position 0–1
  const [leaving, setLeaving] = useState(false) // "lose the reward?" check
  const isVideo = ad?.kind === 'video'
  const required = ad ? ad.unlockSeconds : NO_AD_SECONDS
  const unlocked = elapsed >= required || ended
  const left = Math.max(0, Math.ceil(required - elapsed))
  const rewarded = mode === 'rewarded'

  const playSafely = (v: HTMLVideoElement) =>
    v.play().catch(() => {
      // Sound blocked: play muted and offer the sound button.
      v.muted = true
      setMuted(true)
      v.play().catch(() => {})
    })

  useImperativeHandle(ref, () => ({
    start: (withSound: boolean) => {
      setElapsed(0)
      setEnded(false)
      setProgress(0)
      setLeaving(false)
      const v = video.current
      if (!v) return
      v.currentTime = 0
      v.muted = !withSound
      setMuted(!withSound)
      playSafely(v)
    },
  }))

  // Count only while it's visible and actually playing.
  useEffect(() => {
    if (!open || leaving) return
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      const v = video.current
      if (isVideo && (!v || v.paused || v.ended)) return
      setElapsed((e) => e + TICK_MS / 1000)
    }, TICK_MS)
    return () => clearInterval(id)
  }, [open, isVideo, leaving])

  // Leaving the app pauses the ad; coming back resumes it.
  useEffect(() => {
    if (!open) return
    const onVisibility = () => {
      const v = video.current
      if (!v || ended || leaving) return
      if (document.visibilityState === 'hidden') v.pause()
      else playSafely(v)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [open, ended, leaving])

  const toggleSound = () => {
    const v = video.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
    if (v.paused && !ended) v.play().catch(() => {})
  }

  const replay = () => {
    const v = video.current
    if (!v) return
    v.currentTime = 0
    setEnded(false)
    playSafely(v)
  }

  const close = (watched: boolean) => {
    video.current?.pause()
    setLeaving(false)
    onClose(watched, Math.round(elapsed * 10) / 10)
  }

  // X / Claim. Interstitial videos count as complete only when played out.
  const finish = () => close(rewarded ? true : isVideo ? ended : true)

  const askToLeave = () => {
    video.current?.pause()
    setLeaving(true)
  }
  const keepWatching = () => {
    setLeaving(false)
    const v = video.current
    if (v && !ended) playSafely(v)
  }

  const visit = () => {
    if (!ad?.click_url) return
    trackAd(ad, 'click')
    window.open(ad.click_url, '_blank', 'noopener,noreferrer')
  }

  if (!mounted) return null

  const name = ad ? ad.advertiser || ad.headline || 'Sponsored' : 'Rubble'
  const bar = isVideo ? (ended ? 1 : progress) : required > 0 ? Math.min(1, elapsed / required) : 1

  return createPortal(
    <div
      aria-hidden={!open}
      role="dialog"
      aria-label="Advertisement"
      className={`fixed inset-0 z-[100] select-none bg-black text-white transition-opacity duration-200 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      {isVideo ? (
        <video
          ref={video}
          src={ad.media_url}
          className={`absolute inset-0 h-full w-full object-contain transition duration-500 ${ended ? 'scale-105 opacity-40 blur-md' : ''}`}
          playsInline
          preload="auto"
          muted={muted}
          onTimeUpdate={(e) => {
            const v = e.currentTarget
            if (v.duration > 0) setProgress(v.currentTime / v.duration)
          }}
          onEnded={() => setEnded(true)}
        />
      ) : ad ? (
        // eslint-disable-next-line @next/next/no-img-element -- external Storage URL
        <img src={ad.media_url} alt={ad.headline} className="absolute inset-0 h-full w-full object-contain" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/50">
          <span className="font-display text-3xl text-white/80">Rubble</span>
          <span className="text-xs uppercase tracking-[0.2em]">Thanks for supporting the game</span>
        </div>
      )}

      {/* Shade under the top and bottom chrome so it reads on any creative */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/70 to-transparent" />

      {/* Progress along the very top */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-white/15">
        <div className="h-full bg-[#ffc93c] transition-[width] duration-200 ease-linear" style={{ width: `${bar * 100}%` }} />
      </div>

      {/* Top row: who it's from · reward · countdown / close */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),14px)]">
        <div className="flex min-w-0 items-center gap-2 rounded-full bg-black/45 py-1 pl-1 pr-3 backdrop-blur">
          <span className="rounded-full bg-[#ffc93c] px-2 py-0.5 text-[11px] font-bold leading-4 text-black">Ad</span>
          <span className="truncate text-xs font-medium text-white/90">{name}</span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {rewarded && (
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur transition-colors ${unlocked ? 'bg-[#2fae3d] text-white' : 'bg-black/45 text-white'}`}
            >
              {unlocked ? <Check className="h-3.5 w-3.5" /> : <Gift className="h-3.5 w-3.5 text-[#ffc93c]" />}
              {unlocked ? 'Reward earned' : `Reward in ${left}s`}
            </span>
          )}
          {unlocked ? (
            <button
              type="button"
              onClick={finish}
              aria-label={rewarded ? 'Close and claim reward' : 'Close ad'}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 backdrop-blur active:scale-95"
            >
              <X className="h-5 w-5" />
            </button>
          ) : rewarded ? (
            <button
              type="button"
              onClick={askToLeave}
              aria-label="Leave ad"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white/70 backdrop-blur active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <Countdown left={left} share={required > 0 ? elapsed / required : 1} />
          )}
        </div>
      </div>

      {/* Rewarded: what you get, then the Claim button once it's earned */}
      {rewarded && !ended && (
        <div className="absolute inset-x-0 top-[calc(max(env(safe-area-inset-top),14px)+48px)] flex justify-center px-4">
          {unlocked ? (
            <button
              type="button"
              onClick={finish}
              className="flex items-center gap-2 rounded-full bg-[#2fae3d] px-5 py-2.5 font-display text-base text-white shadow-[0_3px_0_#1f7a2a] active:translate-y-[3px] active:shadow-none"
            >
              Claim {reward ? <IconText text={reward} /> : 'reward'}
            </button>
          ) : (
            reward && (
              <span className="rounded-full bg-black/45 px-3 py-1 text-xs text-white/85 backdrop-blur">
                Watch to get <span className="font-semibold text-white"><IconText text={reward} /></span>
              </span>
            )
          )}
        </div>
      )}

      {/* Bottom: sound, then the advertiser card with its button */}
      {!ended && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          {isVideo && (
            <button
              type="button"
              onClick={toggleSound}
              className={`flex items-center gap-2 self-start rounded-full bg-black/45 backdrop-blur ${muted ? 'px-3.5 py-2 text-sm font-medium' : 'h-10 w-10 justify-center'}`}
              aria-label={muted ? 'Turn sound on' : 'Mute'}
            >
              {muted ? (
                <>
                  <VolumeX className="h-4 w-4" /> Tap for sound
                </>
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
          )}
          {ad && (ad.headline || ad.click_url) && <AdvertiserCard ad={ad} onVisit={visit} />}
        </div>
      )}

      {/* End card */}
      {ended && ad && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="w-full max-w-xs rounded-3xl bg-white p-5 text-center text-[#16202e] shadow-2xl">
            <Avatar name={name} big />
            <p className="mt-3 text-balance text-lg font-semibold leading-snug">{ad.headline || name}</p>
            {ad.headline && ad.advertiser && <p className="mt-0.5 text-sm text-[#5f6b7a]">{ad.advertiser}</p>}
            {ad.click_url && (
              <button
                type="button"
                onClick={visit}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#1a73e8] px-5 py-3 text-sm font-semibold text-white active:scale-[0.98]"
              >
                {ad.ctaText || 'Learn more'} <ExternalLink className="h-4 w-4" />
              </button>
            )}
            {rewarded && (
              <button
                type="button"
                onClick={finish}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-[#2fae3d] px-5 py-3 font-display text-base text-white active:scale-[0.98]"
              >
                Claim {reward ? <IconText text={reward} /> : 'reward'}
              </button>
            )}
            <div className="mt-3 flex items-center justify-center gap-5 text-sm text-[#5f6b7a]">
              <button type="button" onClick={replay} className="flex items-center gap-1.5 hover:text-[#16202e]">
                <RotateCcw className="h-4 w-4" /> Replay
              </button>
              {!rewarded && (
                <button type="button" onClick={finish} className="flex items-center gap-1.5 hover:text-[#16202e]">
                  <X className="h-4 w-4" /> Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Leaving a rewarded ad early */}
      {leaving && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-xs rounded-3xl bg-white p-5 text-center text-[#16202e] shadow-2xl">
            <p className="text-lg font-semibold">Leave without the reward?</p>
            <p className="mt-1 text-sm text-[#5f6b7a]">
              {left}s more and you get {reward ? <IconText text={reward} /> : 'the reward'}.
            </p>
            <button
              type="button"
              onClick={keepWatching}
              className="mt-4 w-full rounded-full bg-[#2fae3d] px-5 py-3 font-display text-base text-white active:scale-[0.98]"
            >
              Keep watching
            </button>
            <button type="button" onClick={() => close(false)} className="mt-2 w-full rounded-full px-5 py-2.5 text-sm font-medium text-[#5f6b7a]">
              Leave
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}

// Seconds left inside a ring that fills as it counts down.
function Countdown({ left, share }: { left: number; share: number }) {
  const r = 15
  const c = 2 * Math.PI * r
  return (
    <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-black/45 backdrop-blur" aria-label={`Skip in ${left} seconds`}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="#ffc93c"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, share))}
          className="transition-[stroke-dashoffset] duration-200 ease-linear"
        />
      </svg>
      <span className="relative font-mono text-xs font-semibold tabular-nums">{left}</span>
    </span>
  )
}

function Avatar({ name, big }: { name: string; big?: boolean }) {
  // A steady colour per advertiser.
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-2xl font-semibold text-white ${big ? 'h-14 w-14 text-2xl' : 'h-10 w-10 text-base'}`}
      style={{ background: `hsl(${h} 55% 45%)` }}
    >
      {name.trim().charAt(0).toUpperCase() || 'A'}
    </span>
  )
}

function AdvertiserCard({ ad, onVisit }: { ad: AdCreative; onVisit: () => void }) {
  const name = ad.advertiser || 'Sponsored'
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/95 p-2.5 pr-3 text-[#16202e] shadow-xl backdrop-blur">
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{ad.headline || name}</p>
        <p className="truncate text-xs text-[#5f6b7a]">{ad.headline ? name : 'Sponsored'}</p>
      </div>
      {ad.click_url && (
        <button
          type="button"
          onClick={onVisit}
          className="shrink-0 rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-semibold text-white active:scale-95"
        >
          {ad.ctaText || 'Learn more'}
        </button>
      )}
    </div>
  )
}
