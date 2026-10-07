'use client'

import { useState } from 'react'
import { ChevronRight, Lock, X } from 'lucide-react'
import { getBuilding } from '@/lib/game/buildings'
import { BRIDGE_AD_SHARE, buildPrice, type Engine, type PlotSnap, type Snapshot } from '@/lib/game/engine'
import { PLOT_SLOTS } from '@/lib/game/plots'
import { ISLANDS, type Island, type IslandId } from '@/lib/game/islands'
import RewardedAdButton from './RewardedAdButton'
import { formatNumber } from './format'

const SHORT: Record<IslandId, string> = { houses: 'Houses', city: 'City', industrial: 'Industrial' }

export function plotName(id: number) {
  const slot = PLOT_SLOTS[id]
  if (!slot) return `Plot ${id + 1}`
  if (slot.harbour) return `Harbour lot ${PLOT_SLOTS.filter((s) => s.harbour).findIndex((s) => s.id === id) + 1}`
  if (id === 0) return 'Home lot'
  const n = PLOT_SLOTS.filter((s) => s.island === slot.island && !s.harbour).findIndex((s) => s.id === id) + 1
  return `${SHORT[slot.island]} plot ${n}`
}

// 1h 5m · 14m · 40s
function duration(seconds: number) {
  const sec = Math.max(0, Math.round(seconds))
  if (sec < 60) return `${sec}s`
  const m = Math.ceil(sec / 60)
  return m < 60 ? `${m}m` : m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`
}

// Building the bridge that opens an island: cost and level, or (while it's
// going up) the time left with an ad to speed it along.
function BridgeCard({ engine, snap, island }: { engine: Engine; snap: Snapshot; island: Island }) {
  const [error, setError] = useState<string | null>(null)
  const unlock = island.unlock!
  const build = snap.bridgeBuild?.to === island.id ? snap.bridgeBuild : null
  if (build)
    return (
      <div className="rounded-2xl bg-[#fff4d6] p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-base leading-tight text-[#1d3a6e]">🌉 Building the bridge</p>
            <p className="text-xs text-[#5b6f93]">{duration(build.secondsLeft)} left</p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#f1dca0]">
              <div className="h-full rounded-full bg-[#ff6b1a]" style={{ width: `${Math.round((1 - build.secondsLeft / Math.max(1, build.totalSeconds)) * 100)}%` }} />
            </div>
          </div>
          <RewardedAdButton
            onReward={() => {
              engine.speedUpBridge()
              engine.notify()
            }}
            className="shrink-0 rounded-xl bg-[#3fbf4a] px-3 py-2 font-display text-sm text-white shadow-[0_3px_0_#2a8a33] active:translate-y-[3px] active:shadow-none disabled:opacity-70"
          >
            ▶ −{duration(build.totalSeconds * BRIDGE_AD_SHARE)}
          </RewardedAdButton>
        </div>
      </div>
    )
  const lock = engine.bridgeLock(island.id)
  const tooLow = snap.level < unlock.level
  return (
    <div className="rounded-2xl border-2 border-dashed border-[#c9d3e3] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-base leading-tight text-[#1d3a6e]">🌉 Build the bridge</p>
          <p className="text-xs text-[#5b6f93]">
            Opens the {island.name}: new plots, buildings and the {island.yard.name} · takes {duration(unlock.buildMinutes * 60)}
          </p>
          {tooLow && <p className="text-xs font-bold text-[#c2410c]">Unlocks at level {unlock.level}</p>}
        </div>
        <button
          disabled={!!lock}
          onClick={() => {
            const err = engine.buildBridge(island.id)
            setError(err)
            engine.notify()
          }}
          className="shrink-0 rounded-xl bg-[#ff6b1a] px-3 py-2 font-display text-sm text-white shadow-[0_3px_0_#c94e0a] active:translate-y-[3px] active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_3px_0_#97a1ae]"
        >
          🧱 {formatNumber(buildPrice(unlock.cost))}
        </button>
      </div>
      {error && <p className="mt-1 text-xs font-bold text-[#c23030]">{error}</p>}
    </div>
  )
}

function status(p: PlotSnap) {
  if (p.phase === 'cleared') return { text: 'Cleared — tap to claim', color: 'text-[#e8701f]' }
  if (p.phase === 'empty') return { text: 'Empty — pick a building', color: 'text-[#2d7ff9]' }
  const pct = Math.round((1 - p.bricksLeft / Math.max(1, p.bricksTotal)) * 100)
  return { text: `${getBuilding(p.buildingId).name} · ${pct}% · 👷 ${p.crew}`, color: 'text-[#5b6f93]' }
}

// The Plots button's sheet: every plot in the city. Owned ones fly the
// camera over; the next one up for sale can be bought here.
export default function PlotsSheet({
  engine,
  snap,
  onGo,
  onBought,
  onClose,
}: {
  engine: Engine
  snap: Snapshot
  onGo: (plot: number) => void
  onBought: (plot: number) => void
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(env(safe-area-inset-bottom),16px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-2xl text-[#1d3a6e]">Your plots</p>
          <button onClick={onClose} className="rounded-full bg-[#eef2f8] p-2" aria-label="Close">
            <X className="h-5 w-5 text-[#1d3a6e]" />
          </button>
        </div>
        {error && <p className="mb-2 rounded-xl bg-[#ffe3e3] p-2 text-center text-sm text-[#c23030]">{error}</p>}
        <div className="space-y-4">
          {ISLANDS.map((island) => {
            const open = snap.islands[island.index]?.open
            return (
              <div key={island.id} className="space-y-2">
                <p className="font-display text-sm uppercase tracking-wide text-[#5b6f93]">
                  {island.emoji} {island.name}
                </p>
                {!open && <BridgeCard engine={engine} snap={snap} island={island} />}
                {PLOT_SLOTS.filter((slot) => slot.island === island.id).map((slot) => {
            const owned = snap.plots[slot.id]
            if (owned) {
              const st = status(owned)
              return (
                <button
                  key={slot.id}
                  onClick={() => onGo(slot.id)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-[#eef2f8] p-3 text-left active:scale-[0.98]"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-2xl">
                    {slot.id === 0 ? '🏗️' : '🚧'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-base leading-tight text-[#1d3a6e]">{plotName(slot.id)}</span>
                    <span className={`block truncate text-xs ${st.color}`}>{st.text}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-[#5b6f93]" />
                </button>
              )
            }
            const next = slot.id === snap.plots.length
            const locked = snap.level < slot.requiredLevel
            return (
              <div
                key={slot.id}
                className={`flex items-center gap-3 rounded-2xl p-3 ${next ? 'bg-[#fff1ec]' : 'bg-[#eef0f3] opacity-60'}`}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-2xl">
                  {next && !locked ? '🪧' : <Lock className="h-5 w-5 text-[#8a94a6]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base leading-tight text-[#1d3a6e]">{plotName(slot.id)}</p>
                  <p className="text-xs text-[#5b6f93]">
                    {!open ? 'Build the bridge first' : next ? 'For sale' : 'Buy the plots before it first'}
                  </p>
                  {locked && <p className="text-xs font-bold text-[#c2410c]">Unlocks at level {slot.requiredLevel}</p>}
                </div>
                {next && open && (
                  <button
                    disabled={locked || snap.scrap < buildPrice(slot.cost)}
                    onClick={() => {
                      const err = engine.buyPlot()
                      setError(err)
                      engine.notify()
                      if (!err) onBought(slot.id)
                    }}
                    className="shrink-0 rounded-xl bg-[#3fbf4a] px-3 py-2 font-display text-sm text-white shadow-[0_3px_0_#2a8a33] active:translate-y-[3px] active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_3px_0_#97a1ae]"
                  >
                    🧱 {formatNumber(buildPrice(slot.cost))}
                  </button>
                )}
              </div>
            )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
