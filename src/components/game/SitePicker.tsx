'use client'

import { Emo, IconText } from './Icons'
import { useState } from 'react'
import { Lock, X } from 'lucide-react'
import { brickCount, pickableBuildings } from '@/lib/game/buildings'
import { timeLeft } from '@/lib/liveEvents'
import { PLOT_SLOTS } from '@/lib/game/plots'
import { buildPrice, PAY_RATE, type Engine, type Snapshot } from '@/lib/game/engine'
import { formatNumber } from './format'
import { plotName } from './PlotsSheet'

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

// Pick the next demolition job for an empty plot (opened right after you
// claim a cleared site, or by tapping an empty plot). A job needs the
// player level to unlock AND its contract price to start.
export default function SitePicker({
  engine,
  snap,
  plot,
  justCleared,
  onClose,
}: {
  engine: Engine
  snap: Snapshot
  plot: number
  justCleared: { name: string; bonus: number } | null
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(env(safe-area-inset-bottom),16px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-[#eef2f8] p-2" aria-label="Close">
          <X className="h-5 w-5 text-[#1d3a6e]" />
        </button>
        {justCleared ? (
          <>
            <p className="text-center font-display text-3xl text-[#1d3a6e]">Site cleared! <Emo e="🎉" /></p>
            <p className="mb-4 text-center text-sm text-[#5b6f93]">
              {justCleared.name} is gone — <span className="font-bold text-[#e8701f]">+<Emo e="🧱" />{formatNumber(justCleared.bonus)}</span>. Pick
              the next job for {plotName(plot)}:
            </p>
          </>
        ) : (
          <>
            <p className="text-center font-display text-3xl text-[#1d3a6e]">{plotName(plot)}</p>
            <p className="mb-4 text-center text-sm text-[#5b6f93]">Pick a building to demolish:</p>
          </>
        )}
        {error && <p className="mb-2 rounded-xl bg-[#ffe3e3] p-2 text-center text-sm text-[#c23030]">{error}</p>}
        <div className="space-y-2">
          {pickableBuildings()
            .filter((b) => (b.island ?? 'city') === (PLOT_SLOTS[plot]?.island ?? 'houses'))
            .map((b) => {
            const bricks = brickCount(b)
            const needsHarbour = !!b.harbour && !PLOT_SLOTS[plot]?.harbour
            const locked = snap.level < b.requiredLevel || needsHarbour
            const affordable = snap.scrap >= buildPrice(b.contractCost)
            const payout = Math.round((bricks * b.brickValue + b.bonus) * PAY_RATE)
            return (
              <div
                key={b.id}
                className={`flex items-center gap-3 rounded-2xl p-3 ${locked ? 'bg-[#eef0f3] opacity-70' : 'bg-[#eef2f8]'}`}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-2xl">
                  {locked ? <Lock className="h-5 w-5 text-[#8a94a6]" /> : (b.emoji ?? ICONS[b.id] ?? '🏢')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base leading-tight text-[#1d3a6e]">
                    {b.name}
                    {b.endsAt && (
                      <span className="ml-1.5 inline-block rounded-full bg-[#ff6b1a] px-2 py-0.5 align-middle font-display text-[11px] leading-none text-white">
                        <Emo e="⏳" /> {timeLeft(b.endsAt)} left
                      </span>
                    )}
                  </p>
                  <p className="text-xs leading-tight text-[#5b6f93]">
                    {formatNumber(bricks)} bricks · pays ~<Emo e="🧱" />{formatNumber(payout)}
                  </p>
                  {needsHarbour ? (
                    <p className="text-xs font-bold text-[#2d7ff9]"><Emo e="⚓" /> Too big for this plot — build on a harbour lot</p>
                  ) : (
                    locked && <p className="text-xs font-bold text-[#c2410c]">Unlocks at level {b.requiredLevel}</p>
                  )}
                </div>
                <button
                  disabled={locked || !affordable}
                  onClick={() => {
                    const err = engine.startBuilding(plot, b.id)
                    setError(err)
                    engine.notify()
                    if (!err) onClose()
                  }}
                  className="shrink-0 rounded-xl bg-[#ff6b1a] px-3 py-2 font-display text-sm text-white shadow-[0_3px_0_#c94e0a] active:translate-y-[3px] active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_3px_0_#97a1ae]"
                >
                  <IconText text={b.contractCost === 0 ? 'Free' : `🧱 ${formatNumber(buildPrice(b.contractCost))}`} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
