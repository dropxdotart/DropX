'use client'

import { ChevronRight, X } from 'lucide-react'
import { upgradeCost, type Snapshot } from '@/lib/game/engine'
import { STATIONS, tierFor, type StationId } from '@/lib/game/stations'

// The Upgrades button's overview: every upgradable thing on the site.
// Picking one closes this and flies the camera over to it with its panel.
export default function StationsMap({
  snap,
  onPick,
  onClose,
}: {
  snap: Snapshot
  onPick: (id: StationId) => void
  onClose: () => void
}) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-4 pb-[max(env(safe-area-inset-bottom),16px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-2xl text-[#1d3a6e]">Your site</p>
          <button onClick={onClose} className="rounded-full bg-[#eef2f8] p-2">
            <X className="h-5 w-5 text-[#1d3a6e]" />
          </button>
        </div>
        <div className="space-y-2">
          {STATIONS.map((s) => {
            const level = s.level(snap.upgrades)
            const ready = s.upgrades.some((k) => snap.scrap >= upgradeCost(k, snap.upgrades[k]))
            return (
              <button
                key={s.id}
                onClick={() => onPick(s.id)}
                className="flex w-full items-center gap-3 rounded-2xl bg-[#eef2f8] p-3 text-left active:scale-[0.98]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-2xl">{s.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-base leading-tight text-[#1d3a6e]">{s.name}</span>
                  <span className="block text-xs text-[#5b6f93]">
                    Lv {level} · {s.tierNames[tierFor(level)]}
                  </span>
                </span>
                {ready && (
                  <span className="rounded-full bg-[#3fbf4a] px-2 py-0.5 font-display text-xs text-white">Upgrade!</span>
                )}
                <ChevronRight className="h-5 w-5 text-[#5b6f93]" />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
