'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { ArrowBigUpDash, Play, X } from 'lucide-react'
import { useEngine } from '@/lib/game/useEngine'
import { getBuilding, xpForLevel } from '@/lib/game/buildings'
import { stats, BREAK_COOLDOWN_SECONDS } from '@/lib/game/engine'
import BannerAd from './BannerAd'
import RewardedAdButton from './RewardedAdButton'
import InterstitialAd from './InterstitialAd'
import StationPanel from './StationPanel'
import StationsMap from './StationsMap'
import type { StationId } from '@/lib/game/stations'
import SitePicker from './SitePicker'
import LoadingScreen from './LoadingScreen'
import { formatNumber } from './format'

// three.js needs `window`/WebGL, so the scene only ever renders client-side.
const Scene = dynamic(() => import('@/components/game3d/Scene'), { ssr: false })

type Pop = { id: number; text: string; x: number; y: number }

export default function Game() {
  const game = useEngine()
  const [mapOpen, setMapOpen] = useState(false)
  const [selected, setSelected] = useState<StationId | null>(null)
  const [pops, setPops] = useState<Pop[]>([])
  // Bumped on every successful BREAK so the cooldown ring's CSS animation
  // restarts; `cooling` dims the button until the cooldown has passed.
  const [cooldownRun, setCooldownRun] = useState(0)
  const [cooling, setCooling] = useState(false)
  // null until the 3D scene's JS has arrived and starts reporting; the
  // loading screen fades out at 100 (or after a safety timeout).
  const [loadProgress, setLoadProgress] = useState<number | null>(null)
  const [loadingGone, setLoadingGone] = useState(false)
  const loaded = loadProgress === 100
  const onLoadProgress = useCallback((p: number) => setLoadProgress((prev) => (prev === 100 ? 100 : p)), [])
  useEffect(() => {
    const t = setTimeout(() => setLoadProgress(100), 20000)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    if (!loaded) return
    const t = setTimeout(() => setLoadingGone(true), 600)
    return () => clearTimeout(t)
  }, [loaded])

  if (!game) return <LoadingScreen progress={null} leaving={false} />
  const { engine, snap } = game

  const building = getBuilding(snap.buildingId)
  const progress = 1 - snap.bricksLeft / Math.max(1, snap.bricksTotal)
  const levelStart = xpForLevel(snap.level)
  const levelEnd = xpForLevel(snap.level + 1)
  const levelProgress = (snap.xp - levelStart) / (levelEnd - levelStart)
  const bonus = Math.max(snap.incomePerMinute * 2, 50)

  const handleBreak = (e: React.PointerEvent<HTMLButtonElement>) => {
    const broke = engine.breakTap()
    if (broke === 0) return
    setCooldownRun((n) => n + 1)
    setCooling(true)
    setTimeout(() => setCooling(false), BREAK_COOLDOWN_SECONDS * 1000)
    const id = Date.now() + Math.random()
    const rect = e.currentTarget.getBoundingClientRect()
    setPops((prev) => [
      ...prev.slice(-8),
      { id, text: broke > 1 ? `CRACK ×${broke}!` : 'CRACK!', x: rect.left + rect.width / 2 + (Math.random() - 0.5) * 60, y: rect.top },
    ])
    setTimeout(() => setPops((prev) => prev.filter((p) => p.id !== id)), 800)
  }

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-[#9fd4ef]">
      <div className="absolute inset-0">
        <Scene
          engine={engine}
          workerCount={stats.workerCount(snap.upgrades)}
          blueprint={building.blueprint}
          upgrades={snap.upgrades}
          scrap={snap.scrap}
          focus={selected}
          onLoadProgress={onLoadProgress}
          onSelectStation={(id) => {
            setMapOpen(false)
            setSelected(id)
          }}
        />
      </div>

      {pops.map((p) => (
        <span
          key={p.id}
          className="pointer-events-none fixed z-30 -translate-x-1/2 font-display text-2xl text-white animate-[float-up_0.8s_ease-out_forwards] [text-shadow:0_2px_0_#7a3a10,0_0_6px_rgba(0,0,0,0.4)]"
          style={{ left: p.x, top: p.y }}
        >
          {p.text}
        </span>
      ))}

      <div className="pointer-events-none absolute inset-0 flex flex-col pt-[max(env(safe-area-inset-top),12px)]">
        <div className="flex items-start justify-between gap-2 px-3">
          <div className="space-y-1.5">
            <div className="rounded-2xl bg-black/55 px-3 py-2 backdrop-blur-sm">
              <p className="font-display text-2xl leading-none text-white">🧱 {formatNumber(snap.scrap)}</p>
              <p className="mt-1 font-display text-sm leading-none text-[#7dff7a]">+{formatNumber(snap.incomePerMinute)} / min</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-black/55 py-1 pl-1 pr-2.5 backdrop-blur-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ffc93c] font-display text-xs text-[#5a3d00]">
                {snap.level}
              </span>
              <div className="h-2 w-20 overflow-hidden rounded-full bg-white/25">
                <div className="h-full bg-[#ffc93c]" style={{ width: `${Math.min(100, levelProgress * 100)}%` }} />
              </div>
            </div>
          </div>
          <div className="min-w-[165px] rounded-2xl bg-white px-3 py-2 shadow-[0_3px_0_rgba(0,0,0,0.15)]">
            <p className="font-display text-base leading-tight text-[#1d3a6e]">{building.name}</p>
            <div className="mt-1.5 h-4 overflow-hidden rounded-full bg-[#1d3a6e]">
              <div className="h-full bg-[#2d7ff9] transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="mt-1 text-center font-display text-xs text-[#1d3a6e]">
              {formatNumber(snap.bricksLeft)} bricks left
              {snap.rubbleLeft > 0 && ` · ${formatNumber(snap.rubbleLeft)} on ground`}
            </p>
          </div>
        </div>

        {snap.offlineEarnings > 0 && (
          <div className="pointer-events-auto mx-3 mt-3 flex items-center justify-between gap-2 rounded-2xl bg-white p-3 shadow-[0_3px_0_rgba(0,0,0,0.15)]">
            <p className="font-display text-sm text-[#1d3a6e]">
              Your crew kept hauling — <span className="text-[#e8701f]">+🧱{formatNumber(snap.offlineEarnings)}</span> while you were away!
            </p>
            <button
              onClick={() => {
                engine.dismissOffline()
                engine.notify()
              }}
              className="shrink-0"
            >
              <X className="h-4 w-4 text-[#1d3a6e]" />
            </button>
          </div>
        )}

        <div className="flex-1" />

        <div className="flex items-end justify-between gap-2 px-4 pb-[max(env(safe-area-inset-bottom),12px)]">
          <button onClick={() => setMapOpen(true)} className="pointer-events-auto flex flex-col items-center gap-1">
            <span className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-white bg-[#2d7ff9] text-white shadow-[0_4px_0_#1b5bbd] active:translate-y-1 active:shadow-none">
              <ArrowBigUpDash className="h-8 w-8" />
            </span>
            <span className="font-display text-xs text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">Upgrades</span>
          </button>

          <button
            onPointerDown={handleBreak}
            disabled={snap.phase !== 'demolishing' || snap.bricksLeft === 0}
            className={`pointer-events-auto relative mb-1 flex h-24 w-24 flex-col items-center justify-center rounded-full border-4 border-white bg-[#ff6b1a] font-display text-white shadow-[0_6px_0_#c94e0a] transition-[filter] active:translate-y-1.5 active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_6px_0_#97a1ae] ${cooling ? 'brightness-75' : ''}`}
          >
            <span className="text-2xl leading-none">BREAK!</span>
            <span className="text-xs opacity-90">×{stats.bricksPerTap(snap.upgrades)}</span>
            {cooling && (
              <svg key={cooldownRun} className="pointer-events-none absolute -inset-[7px] -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="47"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="6"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray="100"
                  className="animate-[cooldown-ring_linear_forwards]"
                  style={{ animationDuration: `${BREAK_COOLDOWN_SECONDS}s` }}
                />
              </svg>
            )}
          </button>

          <RewardedAdButton
            onReward={() => {
              engine.claimBonus(bonus)
              engine.notify()
            }}
            className="pointer-events-auto flex flex-col items-center gap-1 disabled:opacity-70"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-white bg-[#3fbf4a] text-white shadow-[0_4px_0_#2a8a33] active:translate-y-1 active:shadow-none">
              <Play className="h-7 w-7 fill-white" />
            </span>
            <span className="font-display text-xs text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">+🧱{formatNumber(bonus)}</span>
          </RewardedAdButton>
        </div>

        <BannerAd />
      </div>

      {mapOpen && (
        <StationsMap
          snap={snap}
          onPick={(id) => {
            setMapOpen(false)
            setSelected(id)
          }}
          onClose={() => setMapOpen(false)}
        />
      )}
      {selected && <StationPanel engine={engine} snap={snap} id={selected} onClose={() => setSelected(null)} />}
      {snap.phase === 'picking' && <SitePicker engine={engine} snap={snap} justCleared={building.name} />}
      <InterstitialAd trigger={snap.sitesCleared} />
      {!loadingGone && <LoadingScreen progress={loadProgress} leaving={loaded} />}
    </div>
  )
}
