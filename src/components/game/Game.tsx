'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { ArrowBigUpDash, Map as MapIcon, Minus, Plus, X } from 'lucide-react'
import { useEngine } from '@/lib/game/useEngine'
import { getBuilding, xpForLevel } from '@/lib/game/buildings'
import { BREAK_COOLDOWN_SECONDS } from '@/lib/game/engine'
import BannerAd from './BannerAd'
import InterstitialAd from './InterstitialAd'
import StationPanel from './StationPanel'
import TruckPanel from './TruckPanel'
import DumpsterPanel from './DumpsterPanel'
import StationsMap from './StationsMap'
import SitePicker from './SitePicker'
import LoadingScreen from './LoadingScreen'
import BonusTab from './BonusTab'
import PlotsSheet, { plotName } from './PlotsSheet'
import type { StationFocus } from '@/components/game3d/Scene'
import { formatNumber } from './format'

// three.js needs `window`/WebGL, so the scene only ever renders client-side.
const Scene = dynamic(() => import('@/components/game3d/Scene'), { ssr: false })

type Pop = { id: number; text: string; x: number; y: number }

export default function Game() {
  const game = useEngine()
  const [mapOpen, setMapOpen] = useState(false)
  const [bonusOpen, setBonusOpen] = useState(false)
  const [plotsOpen, setPlotsOpen] = useState(false)
  const [selected, setSelected] = useState<StationFocus | null>(null)
  // The plot nearest the middle of the screen: BREAK and the building card
  // act on it. `flyTo` glides the camera to a plot when its nonce changes.
  const [focusPlot, setFocusPlot] = useState(0)
  const [flyTo, setFlyTo] = useState({ plot: 0, nonce: 0 })
  const [picker, setPicker] = useState<{ plot: number; cleared: { name: string; bonus: number } | null } | null>(null)
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

  const plot = snap.plots[focusPlot] ?? snap.plots[0]
  const building = getBuilding(plot.buildingId)
  const progress = 1 - plot.bricksLeft / Math.max(1, plot.bricksTotal)
  const levelStart = xpForLevel(snap.level)
  const levelEnd = xpForLevel(snap.level + 1)
  const levelProgress = (snap.xp - levelStart) / (levelEnd - levelStart)
  const activePlots = snap.plots.filter((p) => p.phase === 'demolishing').length
  const plotNeedsYou = snap.plots.some((p) => p.phase !== 'demolishing')

  const goToPlot = (id: number) => {
    setSelected(null)
    setFlyTo((f) => ({ plot: id, nonce: f.nonce + 1 }))
  }

  // Tapping a plot's bubble: claim a cleared site (then pick its next job),
  // pick a building for an empty one, or open the plots list to buy one.
  const onPlotAction = (id: number) => {
    const p = snap.plots[id]
    if (!p) {
      setPlotsOpen(true)
      return
    }
    goToPlot(id)
    if (p.phase === 'cleared') {
      const name = getBuilding(p.buildingId).name
      const bonus = engine.claimPlot(id)
      engine.notify()
      setPicker({ plot: id, cleared: { name, bonus } })
    } else if (p.phase === 'empty') {
      setPicker({ plot: id, cleared: null })
    }
  }

  const pop = (text: string, x: number, y: number) => {
    const id = Date.now() + Math.random()
    setPops((prev) => [...prev.slice(-8), { id, text, x, y }])
    setTimeout(() => setPops((prev) => prev.filter((p) => p.id !== id)), 800)
  }

  // BREAK button and tapping a building both land here (shared cooldown).
  const doBreak = (plotId: number, x: number, y: number) => {
    const broke = engine.breakTap(plotId)
    if (broke === 0) return
    setCooldownRun((n) => n + 1)
    setCooling(true)
    setTimeout(() => setCooling(false), BREAK_COOLDOWN_SECONDS * 1000)
    pop('CRACK!', x + (Math.random() - 0.5) * 40, y)
  }

  const handleBreak = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    doBreak(plot.id, rect.left + rect.width / 2 + (Math.random() - 0.5) * 20, rect.top)
  }

  const handleRubbleTap = (x: number, y: number) => {
    engine.boost()
    engine.notify()
    pop('⚡ BOOST!', x, y - 20)
  }

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-[#9fd4ef]">
      <div className="absolute inset-0">
        <Scene
          engine={engine}
          snap={snap}
          focus={selected}
          flyTo={flyTo}
          onFocusPlot={setFocusPlot}
          onPlotAction={onPlotAction}
          onLoadProgress={onLoadProgress}
          onOpenBonus={() => {
            engine.holdBonusDrop(true)
            setBonusOpen(true)
          }}
          onSelectStation={(id, plotId, index) => {
            setMapOpen(false)
            // The depot sign opens the fleet, following truck 1.
            setSelected(id === 'truck' ? { id, plot: plotId, truck: 0 } : { id, plot: plotId, index })
          }}
          onBreakTap={doBreak}
          onRubbleTap={handleRubbleTap}
          onSelectTruck={(truck) => {
            setMapOpen(false)
            setSelected({ id: 'truck', plot: plot.id, truck })
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

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col pt-[max(env(safe-area-inset-top),12px)]">
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
            {/* Crew boost: tap rubble on the ground to trigger it. */}
            {snap.boostLeft > 0 ? (
              <div className="inline-flex items-center gap-1 rounded-full bg-[#ffd23c] px-2.5 py-1 font-display text-xs text-[#5a3d00] shadow-[0_2px_0_#c99a00]">
                ⚡ Crew boost · {snap.boostLeft}s
              </div>
            ) : (
              <div className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 font-display text-xs text-[#ffd23c]">
                ⚡ Tap rubble to boost
              </div>
            )}
          </div>
          <div className="pointer-events-auto min-w-[165px] rounded-2xl bg-white px-3 py-2 shadow-[0_3px_0_rgba(0,0,0,0.15)]">
            {snap.plots.length > 1 && (
              <p className="font-display text-[10px] uppercase leading-none tracking-wider text-[#5b6f93]">{plotName(plot.id)}</p>
            )}
            {plot.phase === 'demolishing' ? (
              <>
                <p className="font-display text-base leading-tight text-[#1d3a6e]">{building.name}</p>
                <div className="mt-1.5 h-4 overflow-hidden rounded-full bg-[#1d3a6e]">
                  <div className="h-full bg-[#2d7ff9] transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
                </div>
                <p className="mt-1 text-center font-display text-xs text-[#1d3a6e]">
                  {formatNumber(plot.bricksLeft)} bricks left
                  {plot.rubbleLeft > 0 && ` · ${formatNumber(plot.rubbleLeft)} on ground`}
                </p>
              </>
            ) : (
              <button onClick={() => onPlotAction(plot.id)} className="block w-full text-left">
                <p className="font-display text-base leading-tight text-[#1d3a6e]">
                  {plot.phase === 'cleared' ? 'Site cleared!' : 'Empty plot'}
                </p>
                <p className="font-display text-xs text-[#e8701f]">
                  {plot.phase === 'cleared' ? 'Tap to claim your bonus' : 'Tap to pick a building'}
                </p>
              </button>
            )}
            {/* Crew split: only matters once two plots are being demolished. */}
            {activePlots > 1 && plot.phase === 'demolishing' && (
              <div className="mt-1.5 flex items-center justify-between gap-1 border-t border-[#e3e8f0] pt-1.5">
                <button
                  onClick={() => {
                    engine.adjustCrew(plot.id, -1)
                    engine.notify()
                  }}
                  className="rounded-lg bg-[#eef2f8] p-1"
                  aria-label="Move a worker away"
                >
                  <Minus className="h-3.5 w-3.5 text-[#1d3a6e]" />
                </button>
                <span className="font-display text-sm text-[#1d3a6e]">👷 {plot.crew}</span>
                <button
                  onClick={() => {
                    engine.adjustCrew(plot.id, 1)
                    engine.notify()
                  }}
                  className="rounded-lg bg-[#eef2f8] p-1"
                  aria-label="Bring a worker here"
                >
                  <Plus className="h-3.5 w-3.5 text-[#1d3a6e]" />
                </button>
                {!snap.crewAuto && (
                  <button
                    onClick={() => {
                      engine.setCrewAuto()
                      engine.notify()
                    }}
                    className="rounded-lg bg-[#2d7ff9] px-1.5 py-0.5 font-display text-[10px] text-white"
                  >
                    AUTO
                  </button>
                )}
              </div>
            )}
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
            disabled={plot.phase !== 'demolishing' || plot.bricksLeft === 0}
            className={`pointer-events-auto relative mb-1 flex h-24 w-24 flex-col items-center justify-center rounded-full border-4 border-white bg-[#ff6b1a] font-display text-white shadow-[0_6px_0_#c94e0a] transition-[filter] active:translate-y-1.5 active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_6px_0_#97a1ae] ${cooling ? 'brightness-75' : ''}`}
          >
            <span className="text-2xl leading-none">BREAK!</span>
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

          <button onClick={() => setPlotsOpen(true)} className="pointer-events-auto relative flex flex-col items-center gap-1">
            <span className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-white bg-[#3fbf4a] text-white shadow-[0_4px_0_#2a8a33] active:translate-y-1 active:shadow-none">
              <MapIcon className="h-7 w-7" />
            </span>
            {plotNeedsYou && <span className="absolute right-0 top-0 h-4 w-4 rounded-full border-2 border-white bg-[#ff6b1a]" />}
            <span className="font-display text-xs text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">Plots</span>
          </button>
        </div>

        <BannerAd />
      </div>

      {mapOpen && (
        <StationsMap
          snap={snap}
          plot={plot.id}
          onPick={(id) => {
            setMapOpen(false)
            // Tool rack and crew trailer live on the home lot; dumpsters and
            // trucks are on every plot, so use the one you're looking at.
            if (id === 'truck') setSelected({ id, plot: plot.id, truck: 0 })
            else if (id === 'dumpster') setSelected({ id, plot: plot.id, index: 0 })
            else setSelected({ id, plot: id === 'tools' || id === 'crew' || id === 'yard' ? 0 : plot.id })
          }}
          onClose={() => setMapOpen(false)}
        />
      )}
      {selected?.id === 'dumpster' ? (
        <DumpsterPanel
          engine={engine}
          snap={snap}
          plot={selected.plot}
          index={selected.index ?? 0}
          onPick={(index) => setSelected({ ...selected, index })}
          onClose={() => setSelected(null)}
        />
      ) : selected?.id === 'truck' ? (
        <TruckPanel
          engine={engine}
          snap={snap}
          truck={selected.truck ?? 0}
          onPickTruck={(truck) => setSelected({ ...selected, truck })}
          onClose={() => setSelected(null)}
        />
      ) : (
        selected && <StationPanel engine={engine} snap={snap} id={selected.id} onClose={() => setSelected(null)} />
      )}
      {plotsOpen && (
        <PlotsSheet
          engine={engine}
          snap={snap}
          onGo={(id) => {
            setPlotsOpen(false)
            goToPlot(id)
          }}
          onBought={(id) => {
            setPlotsOpen(false)
            goToPlot(id)
            setPicker({ plot: id, cleared: null })
          }}
          onClose={() => setPlotsOpen(false)}
        />
      )}
      {picker && (
        <SitePicker engine={engine} snap={snap} plot={picker.plot} justCleared={picker.cleared} onClose={() => setPicker(null)} />
      )}
      <BonusTab engine={engine} snap={snap} open={bonusOpen && !!snap.bonusDrop} onOpenChange={setBonusOpen} />
      <InterstitialAd trigger={snap.sitesCleared} />
      {!loadingGone && <LoadingScreen progress={loadProgress} leaving={loaded} />}
    </div>
  )
}
