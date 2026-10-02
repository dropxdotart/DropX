'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Engine, Snapshot } from '@/lib/game/engine'
import RewardedAdButton from './RewardedAdButton'
import { formatNumber } from './format'

// How long the open card waits before a seagull steals it, and how long
// the steal takes (see .gull-* in globals.css).
const IGNORE_MS = 8000
const STEAL_MS = 1900

function Seagull() {
  return (
    <svg viewBox="0 0 64 40" className="h-12 w-16 drop-shadow" aria-hidden>
      <g className="gull-wing">
        <path d="M30 18 C22 6 10 4 2 8 C12 10 20 16 26 22 Z" fill="#c9d1db" stroke="#8a95a3" strokeWidth="1.2" />
      </g>
      <ellipse cx="34" cy="24" rx="15" ry="8" fill="#ffffff" stroke="#8a95a3" strokeWidth="1.2" />
      <circle cx="46" cy="19" r="6.5" fill="#ffffff" stroke="#8a95a3" strokeWidth="1.2" />
      <circle cx="48" cy="18" r="1.3" fill="#1d3a6e" />
      <path d="M52 19 L61 21 L52 23 Z" fill="#f2c230" stroke="#c99a10" strokeWidth="0.8" />
      <path d="M19 24 L10 21 L12 27 Z" fill="#3a3a3e" />
      <g className="gull-wing" style={{ animationDelay: '0.09s' }}>
        <path d="M38 20 C44 8 54 4 62 6 C54 10 46 16 42 24 Z" fill="#dfe5ec" stroke="#8a95a3" strokeWidth="1.2" />
      </g>
      <path d="M30 31 L28 37 M36 31 L37 37" stroke="#f2a630" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

// Slides out from the right edge while a trailer's dropped bricks are lying
// on the sidewalk. Tapping it (or the pile in the world) opens the claim
// card; watching the ad tips the bricks straight into the dumpster.
export default function BonusTab({
  engine,
  snap,
  open,
  onOpenChange,
}: {
  engine: Engine
  snap: Snapshot
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const drop = snap.bonusDrop
  const visible = !!drop
  // Left alone while open, a seagull steals it; tapping the card resets
  // the clock and starting the ad calls it off.
  const [stolen, setStolen] = useState(false)
  const [watching, setWatching] = useState(false)
  const [poke, setPoke] = useState(0)
  useEffect(() => {
    if (!open || !drop || watching || stolen) return
    const t = setTimeout(() => setStolen(true), IGNORE_MS)
    return () => clearTimeout(t)
  }, [open, !!drop, watching, stolen, poke]) // eslint-disable-line react-hooks/exhaustive-deps -- restart on the drop appearing, not its countdown
  useEffect(() => {
    if (!stolen) return
    const t = setTimeout(() => {
      engine.loseBonusDrop()
      engine.notify()
      onOpenChange(false)
      setStolen(false)
    }, STEAL_MS)
    return () => clearTimeout(t)
  }, [stolen, engine, onOpenChange])

  const setOpen = (next: boolean) => {
    if (next) setWatching(false)
    engine.holdBonusDrop(next)
    onOpenChange(next)
  }

  return (
    <div
      className={`pointer-events-auto fixed right-0 top-1/2 z-30 -translate-y-1/2 transition-transform duration-300 ease-out ${
        visible ? 'translate-x-0' : 'translate-x-[110%]'
      }`}
    >
      {open && drop ? (
        <div
          onPointerDown={() => setPoke((n) => n + 1)}
          className={`relative mr-2 w-60 rounded-3xl border-[3px] border-white bg-[#2f8fe8] p-3 text-white shadow-[0_5px_0_#1d5fa8] ${stolen ? 'gull-steal' : ''}`}
        >
          {stolen && (
            <>
              <div className="gull-swoop pointer-events-none absolute -top-10 right-6 z-10">
                <Seagull />
              </div>
              <p className="gull-caw pointer-events-none absolute -top-12 left-2 z-10 rounded-full bg-white px-2 py-0.5 font-display text-sm text-[#1d3a6e] shadow">
                MINE!
              </p>
            </>
          )}
          <div className="flex items-start justify-between">
            <p className="font-display text-xl leading-tight">A truck dropped its load!</p>
            <button onClick={() => setOpen(false)} className="-mr-1 -mt-1 rounded-full bg-white/20 p-1.5" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-sm text-white/85">Watch an ad and the crew tips them straight into your dumpster — even if it&apos;s full.</p>
          <p className="mt-2 text-center font-display text-3xl">+{formatNumber(drop.amount)} 🧱</p>
          <RewardedAdButton
            onStart={() => setWatching(true)}
            rewardBricks={drop.amount}
            onReward={() => {
              setWatching(false)
              engine.claimBonusDrop()
              engine.notify()
              onOpenChange(false)
            }}
            className="mt-2 w-full rounded-2xl bg-[#3fbf4a] py-2.5 font-display text-lg text-white shadow-[0_4px_0_#2a8a33] active:translate-y-1 active:shadow-none disabled:opacity-70"
          >
            ▶ Watch ad to claim
          </RewardedAdButton>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex flex-col items-center gap-0.5 rounded-l-2xl border-[3px] border-r-0 border-white bg-[#2f8fe8] py-2 pl-2.5 pr-2 text-white shadow-[0_5px_0_#1d5fa8] active:translate-x-1"
        >
          <span className="text-3xl leading-none">🧱</span>
          <span className="font-display text-base leading-none">+{formatNumber(drop?.amount ?? 0)}</span>
          <span className="mt-1 rounded-full bg-[#1d3a6e] px-1.5 font-display text-xs tabular-nums">{drop?.secondsLeft ?? 0}s</span>
        </button>
      )}
    </div>
  )
}
