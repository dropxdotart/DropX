'use client'

import { X } from 'lucide-react'
import type { Engine, Snapshot } from '@/lib/game/engine'
import RewardedAdButton from './RewardedAdButton'
import { formatNumber } from './format'

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

  const setOpen = (next: boolean) => {
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
        <div className="mr-2 w-60 rounded-3xl border-[3px] border-white bg-[#2f8fe8] p-3 text-white shadow-[0_5px_0_#1d5fa8]">
          <div className="flex items-start justify-between">
            <p className="font-display text-xl leading-tight">A truck dropped its load!</p>
            <button onClick={() => setOpen(false)} className="-mr-1 -mt-1 rounded-full bg-white/20 p-1.5" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-sm text-white/85">Watch an ad and the crew tips them straight into your dumpster — even if it&apos;s full.</p>
          <p className="mt-2 text-center font-display text-3xl">+{formatNumber(drop.amount)} 🧱</p>
          <RewardedAdButton
            rewardBricks={drop.amount}
            onReward={() => {
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
