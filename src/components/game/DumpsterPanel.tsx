'use client'

import { X } from 'lucide-react'
import {
  DUMPSTER_UPGRADE,
  MAX_DUMPSTERS,
  dumpsterBuyCost,
  dumpsterUpgradeCost,
  stats,
  type Engine,
  type Snapshot,
} from '@/lib/game/engine'
import { dumpsterLevel, getStation, nextMilestone, tierFor } from '@/lib/game/stations'
import { formatNumber } from './format'
import { plotName } from './PlotsSheet'
import RewardedAdButton from './RewardedAdButton'

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

// One plot's dumpsters: a tab each, each sized up on its own (with its own
// look), and buying another one up to the max.
export default function DumpsterPanel({
  engine,
  snap,
  plot,
  index,
  onPick,
  onClose,
}: {
  engine: Engine
  snap: Snapshot
  plot: number
  index: number
  onPick: (index: number) => void
  onClose: () => void
}) {
  const p = snap.plots[plot]
  if (!p) return null
  const i = Math.min(index, p.dumpsters.length - 1)
  const d = p.dumpsters[i]
  const names = getStation('dumpster').tierNames
  const level = dumpsterLevel(d)
  const tier = tierFor(level)
  const milestone = nextMilestone(level)
  const prevMilestone = [1, 5, 10, 25][tier]
  const toNext = milestone ? (level - prevMilestone) / (milestone - prevMilestone) : 1
  const buyCost = dumpsterBuyCost(p.dumpsters.length)

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex justify-center">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-4 pb-[max(env(safe-area-inset-bottom),16px)] shadow-[0_-4px_0_rgba(0,0,0,0.1)]">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#eef2f8] text-2xl">🗑️</span>
            <div>
              <p className="font-display text-2xl leading-none text-[#1d3a6e]">Dumpster {i + 1}</p>
              <p className="mt-1 text-sm text-[#5b6f93]">
                {snap.plots.length > 1 ? `${plotName(plot)} · ` : ''}Lv {level} · {names[tier]}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full bg-[#eef2f8] p-2" aria-label="Close">
            <X className="h-5 w-5 text-[#1d3a6e]" />
          </button>
        </div>

        {p.dumpsters.length > 1 && (
          <div className="mt-3 flex gap-1.5">
            {p.dumpsters.map((_, n) => (
              <button
                key={n}
                onClick={() => onPick(n)}
                className={`rounded-full px-3 py-1 font-display text-sm ${n === i ? 'bg-[#1d3a6e] text-white' : 'bg-[#eef2f8] text-[#1d3a6e]'}`}
              >
                Dumpster {n + 1}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 rounded-2xl bg-[#eef2f8] p-3">
          <div className="flex items-center justify-between text-xs text-[#5b6f93]">
            <span>{d.load >= d.capacity ? 'Full — workers are lining up' : 'Filling up'}</span>
            <span className="font-display text-[#1d3a6e]">
              🧱 {d.load}/{d.capacity}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[#d5ddea]">
            <div className="h-full rounded-full bg-[#b4553c]" style={{ width: `${Math.min(100, (d.load / d.capacity) * 100)}%` }} />
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
          {snap.dumpsterValue > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#e3f6e5] p-3">
              <div className="min-w-0">
                <p className="font-display text-base leading-tight text-[#1d3a6e]">Empty all dumpsters now</p>
                <p className="text-xs leading-tight text-[#5b6f93]">
                  {snap.dumpsterAdIn > 0 ? (
                    `Ready again in ${Math.ceil(snap.dumpsterAdIn / 60)} min`
                  ) : (
                    <>
                      Every plot, paid straight away <span className="font-bold text-[#2a9a3a]">+🧱{formatNumber(snap.dumpsterValue)}</span>
                    </>
                  )}
                </p>
              </div>
              {snap.dumpsterAdIn === 0 && (
                <RewardedAdButton
                  rewardBricks={snap.dumpsterValue}
                  onReward={() => {
                    engine.emptyDumpstersByAd()
                    engine.notify()
                  }}
                  className="shrink-0 rounded-xl bg-[#3fbf4a] px-3 py-2 font-display text-sm text-white shadow-[0_3px_0_#2a8a33] active:translate-y-[3px] active:shadow-none disabled:opacity-70"
                >
                  ▶ Watch ad
                </RewardedAdButton>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#eef2f8] p-3">
            <div className="min-w-0">
              <p className="font-display text-base leading-tight text-[#1d3a6e]">{DUMPSTER_UPGRADE.label}</p>
              <p className="text-xs leading-tight text-[#5b6f93]">
                Holds: {d.capacity} bricks{' '}
                <span className="font-bold text-[#2a9a3a]">→ {stats.dumpsterCapacity(d.level + 1)} bricks</span>
              </p>
            </div>
            <BuyButton
              cost={dumpsterUpgradeCost(d.level)}
              scrap={snap.scrap}
              onBuy={() => {
                engine.upgradeDumpster(plot, i)
                engine.notify()
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-[#c9d3e3] p-3">
            <div className="min-w-0">
              <p className="font-display text-base leading-tight text-[#1d3a6e]">Buy a dumpster</p>
              <p className="text-xs leading-tight text-[#5b6f93]">
                {buyCost === null ? (
                  `This plot has the max of ${MAX_DUMPSTERS}`
                ) : (
                  <>
                    Dumpsters: {p.dumpsters.length} <span className="font-bold text-[#2a9a3a]">→ {p.dumpsters.length + 1}</span> · shorter
                    lines
                  </>
                )}
              </p>
            </div>
            {buyCost !== null && (
              <BuyButton
                cost={buyCost}
                scrap={snap.scrap}
                onBuy={() => {
                  if (engine.buyDumpster(plot)) onPick(p.dumpsters.length)
                  engine.notify()
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
