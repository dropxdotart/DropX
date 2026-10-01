'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { BUILDINGS, brickCount } from '@/lib/game/buildings'
import type { Engine, Snapshot } from '@/lib/game/engine'
import { formatNumber } from './format'

const ICONS: Record<string, string> = {
  shed: '🛖',
  house: '🏠',
  warehouse: '🏭',
  tower: '🏢',
  mall: '🏬',
  stadium: '🏟️',
  ship: '🚢',
  station: '🛰️',
}

// Shown when a site is cleared: pick the next demolition job. A job needs
// the player level to unlock AND its contract price to start.
export default function SitePicker({ engine, snap, justCleared }: { engine: Engine; snap: Snapshot; justCleared: string }) {
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-black/50">
      <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <p className="text-center font-display text-3xl text-[#1d3a6e]">Site cleared! 🎉</p>
        <p className="mb-4 text-center text-sm text-[#5b6f93]">
          {justCleared} is gone. Pick your next job:
        </p>
        {error && <p className="mb-2 rounded-xl bg-[#ffe3e3] p-2 text-center text-sm text-[#c23030]">{error}</p>}
        <div className="space-y-2">
          {BUILDINGS.map((b) => {
            const bricks = brickCount(b)
            const locked = snap.level < b.requiredLevel
            const affordable = snap.scrap >= b.contractCost
            const payout = bricks * b.brickValue + b.bonus
            return (
              <div
                key={b.id}
                className={`flex items-center gap-3 rounded-2xl p-3 ${locked ? 'bg-[#eef0f3] opacity-70' : 'bg-[#eef2f8]'}`}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-2xl">
                  {locked ? <Lock className="h-5 w-5 text-[#8a94a6]" /> : ICONS[b.id]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base leading-tight text-[#1d3a6e]">{b.name}</p>
                  <p className="text-xs leading-tight text-[#5b6f93]">
                    {formatNumber(bricks)} bricks · pays ~🧱{formatNumber(payout)}
                  </p>
                  {locked && <p className="text-xs font-bold text-[#c2410c]">Unlocks at level {b.requiredLevel}</p>}
                </div>
                <button
                  disabled={locked || !affordable}
                  onClick={() => {
                    const err = engine.startBuilding(b.id)
                    setError(err)
                    engine.notify()
                  }}
                  className="shrink-0 rounded-xl bg-[#ff6b1a] px-3 py-2 font-display text-sm text-white shadow-[0_3px_0_#c94e0a] active:translate-y-[3px] active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_3px_0_#97a1ae]"
                >
                  {b.contractCost === 0 ? 'Free' : `🧱 ${formatNumber(b.contractCost)}`}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
