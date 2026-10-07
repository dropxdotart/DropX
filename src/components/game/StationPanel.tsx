'use client'

import { X } from 'lucide-react'
import { upgradeCost, upgradeLock, UPGRADE_INFO, YARD_AD_SHARE, type Engine, type Snapshot } from '@/lib/game/engine'
import RewardedAdButton from './RewardedAdButton'
import { getStation, nextMilestone, tierFor, yardUpgrades, type StationId } from '@/lib/game/stations'
import { ISLANDS } from '@/lib/game/islands'
import { formatNumber } from './format'

// 1h 5m · 14m · 40s
function formatDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const m = Math.ceil(s / 60)
  if (m < 60) return `${m}m`
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`
}

// Upgrade panel for one station, opened by tapping it in the world (the
// camera glides in on it behind this sheet).
export default function StationPanel({
  engine,
  snap,
  id,
  yard = 0,
  onClose,
}: {
  engine: Engine
  snap: Snapshot
  id: StationId
  yard?: number // for the yard station: which island's yard
  onClose: () => void
}) {
  const station = getStation(id)
  const isYard = id === 'yard'
  const u = isYard ? yardUpgrades(snap, yard) : snap.upgrades
  const level = station.level(u)
  const tier = tierFor(level)
  const milestone = nextMilestone(level)
  const prevMilestone = tier === 0 ? 1 : [1, 5, 10, 25][tier]
  const toNext = milestone ? (level - prevMilestone) / (milestone - prevMilestone) : 1

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex justify-center">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-4 pb-[max(env(safe-area-inset-bottom),16px)] shadow-[0_-4px_0_rgba(0,0,0,0.1)]">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#eef2f8] text-2xl">{station.emoji}</span>
            <div>
              <p className="font-display text-2xl leading-none text-[#1d3a6e]">{isYard ? ISLANDS[yard].yard.name : station.name}</p>
              <p className="mt-1 text-sm text-[#5b6f93]">
                Lv {level} · {station.tierNames[tier]}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full bg-[#eef2f8] p-2">
            <X className="h-5 w-5 text-[#1d3a6e]" />
          </button>
        </div>

        <div className="mt-3 rounded-2xl bg-[#eef2f8] p-3">
          <div className="flex items-center justify-between text-xs text-[#5b6f93]">
            <span>{milestone ? `New look at Lv ${milestone}: ${station.tierNames[tier + 1]}` : 'Max look unlocked!'}</span>
            {milestone && <span className="font-display text-[#1d3a6e]">{milestone - level} to go</span>}
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[#d5ddea]">
            <div className="h-full rounded-full bg-[#ffc93c]" style={{ width: `${Math.min(100, toNext * 100)}%` }} />
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {station.upgrades.map((key) => {
            const cost = upgradeCost(key, u[key])
            const otherBuild = key === 'yardSize' && snap.yardBuild && snap.yardBuild.yard !== yard
            const lock = otherBuild ? 'Busy' : upgradeLock(key, u, snap.level, snap.truckCapacity)
            const affordable = snap.scrap >= cost && !lock
            const build = key === 'yardSize' && snap.yardBuild?.yard === yard ? snap.yardBuild : null
            if (build)
              return (
                <div key={key} className="rounded-2xl bg-[#fff4d6] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-base leading-tight text-[#1d3a6e]">🏗️ Expanding to size {build.toSize}</p>
                      <p className="text-xs leading-tight text-[#5b6f93]">{formatDuration(build.secondsLeft)} left · the crew is building</p>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#f1dca0]">
                        <div
                          className="h-full rounded-full bg-[#ff6b1a] transition-[width] duration-500"
                          style={{ width: `${Math.round((1 - build.secondsLeft / build.totalSeconds) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <RewardedAdButton
                      onReward={() => {
                        engine.speedUpYard()
                        engine.notify()
                      }}
                      className="shrink-0 rounded-xl bg-[#3fbf4a] px-3 py-2 font-display text-sm text-white shadow-[0_3px_0_#2a8a33] active:translate-y-[3px] active:shadow-none disabled:opacity-70"
                    >
                      ▶ −{formatDuration(build.totalSeconds * YARD_AD_SHARE)}
                    </RewardedAdButton>
                  </div>
                </div>
              )
            return (
              <div key={key} className="rounded-2xl bg-[#eef2f8] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-base leading-tight text-[#1d3a6e]">{UPGRADE_INFO[key].label}</p>
                    {(() => {
                      // Only what this upgrade changes (all of them if none
                      // move, e.g. at max or between milestones).
                      const all = station.effects(u)
                      const moving = all.filter((e) => e.next(key) !== e.now)
                      return moving.length ? moving : all
                    })().map((e) => {
                      const next = e.next(key)
                      return (
                        <p key={e.label} className="text-xs leading-tight text-[#5b6f93]">
                          {e.label}: {e.now}
                          {next !== e.now && <span className="font-bold text-[#2a9a3a]"> → {next}</span>}
                        </p>
                      )
                    })}
                  </div>
                  <button
                    disabled={!affordable}
                    onClick={() => {
                      engine.buyUpgrade(key, yard)
                      engine.notify()
                    }}
                    className="shrink-0 rounded-xl bg-[#3fbf4a] px-3 py-2 font-display text-sm text-white shadow-[0_3px_0_#2a8a33] active:translate-y-[3px] active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_3px_0_#97a1ae]"
                  >
                    {lock ? `🔒 ${lock}` : `🧱 ${formatNumber(cost)}`}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
