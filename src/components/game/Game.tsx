'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Hammer, Users, Play, X } from 'lucide-react'
import { useGameState, tapUpgradeCost, idleUpgradeCost } from '@/lib/game/useGameState'
import { getBricks } from '@/lib/game/blueprints'
import BannerAd from './BannerAd'
import RewardedAdButton from './RewardedAdButton'
import InterstitialAd from './InterstitialAd'

// three.js needs `window`/WebGL, so the scene only ever renders client-side.
const Scene = dynamic(() => import('@/components/game3d/Scene'), { ssr: false })

type FloatingHit = { id: number; amount: number; x: number; y: number }

function formatScrap(n: number) {
  const v = Math.floor(n)
  if (v < 10_000) return v.toLocaleString()
  const units = ['K', 'M', 'B', 'T']
  let unit = -1
  let x = v
  while (x >= 1000 && unit < units.length - 1) {
    x /= 1000
    unit++
  }
  return `${x.toFixed(x < 100 ? 1 : 0)}${units[unit]}`
}

function RoundButton({
  icon,
  label,
  cost,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  cost: number
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="pointer-events-auto flex flex-col items-center gap-1 disabled:opacity-60 disabled:grayscale-[60%]"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-white bg-[#2d7ff9] text-white shadow-[0_4px_0_#1b5bbd] active:translate-y-1 active:shadow-none">
        {icon}
      </span>
      <span className="font-display text-xs text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">{label}</span>
      <span className="rounded-full bg-black/60 px-2 py-0.5 font-display text-sm text-[#ffd34d]">🧱 {formatScrap(cost)}</span>
    </button>
  )
}

export default function Game() {
  const game = useGameState()
  const [hits, setHits] = useState<FloatingHit[]>([])

  const handleTap = (clientX: number, clientY: number) => {
    const id = Date.now() + Math.random()
    setHits((prev) => [...prev.slice(-12), { id, amount: game.tapPower, x: clientX, y: clientY }])
    setTimeout(() => setHits((prev) => prev.filter((h) => h.id !== id)), 800)
    game.tap()
  }

  if (!game.loaded) return <div className="fixed inset-0 bg-[#9fd4ef]" />

  const totalBricks = getBricks(game.structure.blueprint).length
  const bricksLeft = Math.ceil((totalBricks * Math.max(0, game.health)) / game.structure.maxHealth)
  const progress = 1 - bricksLeft / totalBricks
  const tapCost = tapUpgradeCost(game.tapUpgradesBought)
  const crewCost = idleUpgradeCost(game.idleUpgradesBought)
  const bonus = Math.max(game.idleRate * 60, 50)

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-[#9fd4ef]">
      <div className="absolute inset-0">
        <Scene
          blueprint={game.structure.blueprint}
          structureIndex={game.structureIndex}
          health={game.health}
          maxHealth={game.structure.maxHealth}
          crew={game.idleRate}
          onTap={handleTap}
        />
      </div>

      {hits.map((h) => (
        <span
          key={h.id}
          className="pointer-events-none fixed z-30 font-display text-2xl text-white animate-[float-up_0.8s_ease-out_forwards] [text-shadow:0_2px_0_#7a3a10,0_0_6px_rgba(0,0,0,0.4)]"
          style={{ left: h.x, top: h.y }}
        >
          +{h.amount}
        </span>
      ))}

      <div className="pointer-events-none absolute inset-0 flex flex-col pt-[max(env(safe-area-inset-top),12px)]">
        <div className="flex items-start justify-between gap-2 px-3">
          <div className="rounded-2xl bg-black/55 px-3 py-2 backdrop-blur-sm">
            <p className="font-display text-2xl leading-none text-white">🧱 {formatScrap(game.scrap)}</p>
            <p className="mt-1 font-display text-sm leading-none text-[#7dff7a]">+{game.idleRate}/s</p>
          </div>
          <div className="rounded-2xl bg-white px-3 py-2 shadow-[0_3px_0_rgba(0,0,0,0.15)] min-w-[160px]">
            <p className="font-display text-base leading-tight text-[#1d3a6e]">{game.structure.name}</p>
            <div className="mt-1.5 h-4 overflow-hidden rounded-full bg-[#1d3a6e]">
              <div className="h-full bg-[#2d7ff9] transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="mt-1 text-center font-display text-xs text-[#1d3a6e]">{bricksLeft} bricks left</p>
          </div>
        </div>

        {game.offlineEarnings > 0 && (
          <div className="pointer-events-auto mx-3 mt-3 flex items-center justify-between gap-2 rounded-2xl bg-white p-3 shadow-[0_3px_0_rgba(0,0,0,0.15)]">
            <p className="font-display text-sm text-[#1d3a6e]">
              Your crew kept smashing — <span className="text-[#e8701f]">+{formatScrap(game.offlineEarnings)} 🧱</span> while you were away!
            </p>
            <button onClick={game.clearOfflineEarnings} className="shrink-0">
              <X className="h-4 w-4 text-[#1d3a6e]" />
            </button>
          </div>
        )}

        <div className="flex-1" />

        <div className="flex items-end justify-between gap-2 px-4 pb-[max(env(safe-area-inset-bottom),12px)]">
          <RoundButton
            icon={<Hammer className="h-7 w-7" />}
            label={`Hammer Lv ${game.tapPower}`}
            cost={tapCost}
            disabled={game.scrap < tapCost}
            onClick={game.buyTapUpgrade}
          />

          <RewardedAdButton
            onReward={game.claimRewardedBonus}
            className="pointer-events-auto mb-8 flex h-16 items-center gap-2 rounded-2xl bg-white px-4 shadow-[0_4px_0_rgba(0,0,0,0.2)] active:translate-y-1 active:shadow-none disabled:opacity-70"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#2d7ff9]">
              <Play className="h-5 w-5 fill-white text-white" />
            </span>
            <span className="text-left font-display leading-tight text-[#1d3a6e]">
              <span className="block text-lg">+{formatScrap(bonus)} 🧱</span>
              <span className="block text-xs">Free scrap!</span>
            </span>
          </RewardedAdButton>

          <RoundButton
            icon={<Users className="h-7 w-7" />}
            label={`Crew ${game.idleRate}`}
            cost={crewCost}
            disabled={game.scrap < crewCost}
            onClick={game.buyIdleUpgrade}
          />
        </div>

        <BannerAd />
      </div>

      <InterstitialAd trigger={game.structureIndex} />
    </div>
  )
}
