'use client'

import { Hammer, Footprints, Users, Truck, X } from 'lucide-react'
import { stats, upgradeCost, UPGRADE_INFO, type Engine, type Snapshot, type UpgradeKey } from '@/lib/game/engine'
import { formatNumber } from './format'

const ROWS: { key: UpgradeKey; icon: React.ReactNode; describe: (s: Snapshot) => [string, string] }[] = [
  {
    key: 'hammer',
    icon: <Hammer className="h-6 w-6" />,
    describe: (s) => {
      const now = stats.bricksPerTap(s.upgrades)
      return [`${now} brick${now === 1 ? '' : 's'} per BREAK`, `→ ${now + 1}`]
    },
  },
  {
    key: 'speed',
    icon: <Footprints className="h-6 w-6" />,
    describe: (s) => {
      const now = stats.walkSpeed(s.upgrades)
      const next = stats.walkSpeed({ ...s.upgrades, speed: s.upgrades.speed + 1 })
      return [`Workers move ${now.toFixed(1)} m/s`, `→ ${next.toFixed(1)}`]
    },
  },
  {
    key: 'workers',
    icon: <Users className="h-6 w-6" />,
    describe: (s) => {
      const now = stats.workerCount(s.upgrades)
      return [`${now} worker${now === 1 ? '' : 's'} on site`, `→ ${now + 1}`]
    },
  },
  {
    key: 'truck',
    icon: <Truck className="h-6 w-6" />,
    describe: (s) => {
      const cap = stats.truckCapacity(s.upgrades)
      const next = stats.truckCapacity({ ...s.upgrades, truck: s.upgrades.truck + 1 })
      return [`Hauls ${cap} bricks a trip, faster`, `→ ${next}`]
    },
  },
]

export default function UpgradesSheet({ engine, snap, onClose }: { engine: Engine; snap: Snapshot; onClose: () => void }) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-4 pb-[max(env(safe-area-inset-bottom),16px)] shadow-[0_-4px_0_rgba(0,0,0,0.1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-2xl text-[#1d3a6e]">Upgrades</p>
          <button onClick={onClose} className="rounded-full bg-[#eef2f8] p-2">
            <X className="h-5 w-5 text-[#1d3a6e]" />
          </button>
        </div>
        <div className="space-y-2">
          {ROWS.map(({ key, icon, describe }) => {
            const level = snap.upgrades[key]
            const cost = upgradeCost(key, level)
            const [now, next] = describe(snap)
            const affordable = snap.scrap >= cost
            return (
              <div key={key} className="flex items-center gap-3 rounded-2xl bg-[#eef2f8] p-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#2d7ff9] text-white">{icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base leading-tight text-[#1d3a6e]">
                    {UPGRADE_INFO[key].label} <span className="text-sm text-[#5b6f93]">Lv {level + 1}</span>
                  </p>
                  <p className="text-xs leading-tight text-[#5b6f93]">
                    {now} <span className="font-bold text-[#2a9a3a]">{next}</span>
                  </p>
                </div>
                <button
                  disabled={!affordable}
                  onClick={() => {
                    engine.buyUpgrade(key)
                    engine.notify()
                  }}
                  className="shrink-0 rounded-xl bg-[#3fbf4a] px-3 py-2 font-display text-sm text-white shadow-[0_3px_0_#2a8a33] active:translate-y-[3px] active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_3px_0_#97a1ae]"
                >
                  🧱 {formatNumber(cost)}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
