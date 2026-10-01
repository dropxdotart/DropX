'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Hammer, Users, X } from 'lucide-react'
import { useGameState, tapUpgradeCost, idleUpgradeCost } from '@/lib/game/useGameState'
import BannerAd from './BannerAd'
import RewardedAdButton from './RewardedAdButton'
import InterstitialAd from './InterstitialAd'

type FloatingHit = { id: number; amount: number; x: number; y: number }

export default function Game() {
  const game = useGameState()
  const [hits, setHits] = useState<FloatingHit[]>([])

  const handleTap = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const id = Date.now() + Math.random()
    setHits((prev) => [
      ...prev,
      { id, amount: game.tapPower, x: e.clientX - rect.left, y: e.clientY - rect.top },
    ])
    setTimeout(() => setHits((prev) => prev.filter((h) => h.id !== id)), 700)
    game.tap()
  }

  useEffect(() => {
    if (hits.length === 0) return
    const id = setTimeout(() => setHits((prev) => prev.slice(1)), 2000)
    return () => clearTimeout(id)
  }, [hits])

  if (!game.loaded) return null

  const healthPct = Math.max(0, (game.health / game.structure.maxHealth) * 100)

  return (
    <div className="flex flex-1 flex-col items-center px-4 pt-8 pb-20 gap-6">
      <InterstitialAd trigger={game.structureIndex} />

      {game.offlineEarnings > 0 && (
        <div className="fixed top-16 inset-x-4 z-40 mx-auto max-w-xs rounded-xl bg-card border-2 border-foreground shadow-[0_3px_0_var(--foreground)] p-3 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            The crew kept smashing — <span className="font-bold text-primary">+{game.offlineEarnings} scrap</span> while you were away
          </p>
          <button onClick={game.clearOfflineEarnings} className="shrink-0">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      )}

      <div className="w-full max-w-sm flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold tabular-nums">{Math.floor(game.scrap).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-wide">Scrap</p>
        </div>
        {game.idleRate > 0 && (
          <div className="text-right">
            <p className="text-sm font-bold tabular-nums text-positive">+{game.idleRate}/s</p>
            <p className="text-xs text-muted-foreground font-mono uppercase tracking-wide">Idle crew</p>
          </div>
        )}
      </div>

      <div className="w-full max-w-sm text-center space-y-1">
        <p className="text-xs text-muted-foreground font-mono uppercase tracking-wide">{game.structure.name}</p>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${healthPct}%` }} />
        </div>
      </div>

      <button
        onClick={handleTap}
        className="relative w-56 h-56 rounded-full bg-card border-2 border-foreground shadow-[0_6px_0_var(--foreground)] active:!translate-y-[6px] active:shadow-none transition-all flex items-center justify-center text-8xl select-none"
      >
        {game.structure.icon}
        {hits.map((h) => (
          <span
            key={h.id}
            className="absolute pointer-events-none font-bold text-primary text-lg animate-[float-up_0.7s_ease-out_forwards]"
            style={{ left: h.x, top: h.y }}
          >
            +{h.amount}
          </span>
        ))}
      </button>

      <div className="w-full max-w-sm space-y-2">
        <Button
          variant="outline"
          className="w-full h-14 rounded-xl justify-between px-4"
          onClick={game.buyTapUpgrade}
          disabled={game.scrap < tapUpgradeCost(game.tapUpgradesBought)}
        >
          <span className="flex items-center gap-2">
            <Hammer className="w-5 h-5" />
            <span className="text-left">
              <span className="block font-bold">Bigger Hammer</span>
              <span className="block text-xs text-muted-foreground">+1 tap power ({game.tapPower} now)</span>
            </span>
          </span>
          <span className="font-mono font-bold">{tapUpgradeCost(game.tapUpgradesBought)}</span>
        </Button>

        <Button
          variant="outline"
          className="w-full h-14 rounded-xl justify-between px-4"
          onClick={game.buyIdleUpgrade}
          disabled={game.scrap < idleUpgradeCost(game.idleUpgradesBought)}
        >
          <span className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            <span className="text-left">
              <span className="block font-bold">Hire Crew</span>
              <span className="block text-xs text-muted-foreground">+1 scrap/sec ({game.idleRate}/s now)</span>
            </span>
          </span>
          <span className="font-mono font-bold">{idleUpgradeCost(game.idleUpgradesBought)}</span>
        </Button>

        <RewardedAdButton
          bonusLabel={`Watch ad for +${Math.max(game.idleRate * 60, 50)} scrap`}
          onReward={game.claimRewardedBonus}
        />
      </div>

      <BannerAd />
    </div>
  )
}
