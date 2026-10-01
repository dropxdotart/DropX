'use client'

import { X } from 'lucide-react'
import {
  stats,
  TRUCK_UPGRADE_INFO,
  truckUpgradeCost,
  upgradeCost,
  type Engine,
  type Snapshot,
  type TruckSnap,
  type TruckUpgrade,
} from '@/lib/game/engine'
import { getStation, nextMilestone, tierFor, truckLevel } from '@/lib/game/stations'
import { formatNumber } from './format'

const STATE_TEXT: Record<TruckSnap['state'], string> = {
  away: 'On the road',
  driving: 'On the road',
  loading: 'Loading up',
  unloading: 'Unloading at the Brick Yard',
  parked: 'Parked — waiting for bricks',
}

function BuyButton({ cost, scrap, onBuy }: { cost: number; scrap: number; onBuy: () => void }) {
  return (
    <button
      disabled={scrap < cost}
      onClick={onBuy}
      className="shrink-0 rounded-xl bg-[#3fbf4a] px-3 py-2 font-display text-sm text-white shadow-[0_3px_0_#2a8a33] active:translate-y-[3px] active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_3px_0_#97a1ae]"
    >
      🧱 {formatNumber(cost)}
    </button>
  )
}

// One truck's own upgrades and look, with a tab per truck in the fleet and
// buying another truck at the bottom. The camera follows the selected truck.
export default function TruckPanel({
  engine,
  snap,
  truck,
  onPickTruck,
  onClose,
}: {
  engine: Engine
  snap: Snapshot
  truck: number
  onPickTruck: (truck: number) => void
  onClose: () => void
}) {
  const t = snap.trucks[truck] ?? snap.trucks[0]
  const names = getStation('truck').tierNames
  const level = truckLevel(t)
  const tier = tierFor(level)
  const milestone = nextMilestone(level)
  const prevMilestone = [1, 5, 10, 25][tier]
  const toNext = milestone ? (level - prevMilestone) / (milestone - prevMilestone) : 1
  const capacity = stats.truckCargo(t.load)

  const rows: { key: TruckUpgrade; effect: string; next: string }[] = [
    { key: 'load', effect: `Load: ${capacity} bricks`, next: `${stats.truckCargo(t.load + 1)} bricks` },
    {
      key: 'speed',
      effect: `Speed: ${stats.truckSpeed(t.speed).toFixed(1)} m/s`,
      next: `${stats.truckSpeed(t.speed + 1).toFixed(1)} m/s`,
    },
  ]
  const fleetCost = upgradeCost('fleet', snap.upgrades.fleet)

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex justify-center">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-4 pb-[max(env(safe-area-inset-bottom),16px)] shadow-[0_-4px_0_rgba(0,0,0,0.1)]">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#eef2f8] text-2xl">🚛</span>
            <div>
              <p className="font-display text-2xl leading-none text-[#1d3a6e]">Truck {t.id + 1}</p>
              <p className="mt-1 text-sm text-[#5b6f93]">
                Lv {level} · {names[tier]}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full bg-[#eef2f8] p-2" aria-label="Close">
            <X className="h-5 w-5 text-[#1d3a6e]" />
          </button>
        </div>

        {snap.trucks.length > 1 && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto">
            {snap.trucks.map((other) => (
              <button
                key={other.id}
                onClick={() => onPickTruck(other.id)}
                className={`shrink-0 rounded-full px-3 py-1 font-display text-sm ${
                  other.id === t.id ? 'bg-[#1d3a6e] text-white' : 'bg-[#eef2f8] text-[#1d3a6e]'
                }`}
              >
                Truck {other.id + 1}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 rounded-2xl bg-[#eef2f8] p-3">
          <div className="flex items-center justify-between text-xs text-[#5b6f93]">
            <span>{STATE_TEXT[t.state]}</span>
            <span className="font-display text-[#1d3a6e]">
              🧱 {t.cargo}/{capacity} aboard
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-[#5b6f93]">
            <span>{milestone ? `New look at Lv ${milestone}: ${names[tier + 1]}` : 'Max look unlocked!'}</span>
            {milestone && <span className="font-display text-[#1d3a6e]">{milestone - level} to go</span>}
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[#d5ddea]">
            <div className="h-full rounded-full bg-[#ffc93c]" style={{ width: `${Math.min(100, toNext * 100)}%` }} />
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3 rounded-2xl bg-[#eef2f8] p-3">
              <div className="min-w-0">
                <p className="font-display text-base leading-tight text-[#1d3a6e]">{TRUCK_UPGRADE_INFO[r.key].label}</p>
                <p className="text-xs leading-tight text-[#5b6f93]">
                  {r.effect} <span className="font-bold text-[#2a9a3a]">→ {r.next}</span>
                </p>
              </div>
              <BuyButton
                cost={truckUpgradeCost(r.key, t[r.key])}
                scrap={snap.scrap}
                onBuy={() => {
                  engine.buyTruckUpgrade(t.id, r.key)
                  engine.notify()
                }}
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-[#c9d3e3] p-3">
            <div className="min-w-0">
              <p className="font-display text-base leading-tight text-[#1d3a6e]">Buy a truck</p>
              <p className="text-xs leading-tight text-[#5b6f93]">
                Trucks: {snap.trucks.length} <span className="font-bold text-[#2a9a3a]">→ {snap.trucks.length + 1}</span> · starts as a
                Flatbed
              </p>
            </div>
            <BuyButton
              cost={fleetCost}
              scrap={snap.scrap}
              onBuy={() => {
                if (engine.buyUpgrade('fleet')) onPickTruck(snap.trucks.length)
                engine.notify()
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
