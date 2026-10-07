'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { ArrowBigUpDash, Map as MapIcon, UserRound, X } from 'lucide-react'
import { useEngine } from '@/lib/game/useEngine'
import { getBuilding, xpForLevel } from '@/lib/game/buildings'
import BannerAd from './BannerAd'
import InterstitialAd from './InterstitialAd'
import StationPanel from './StationPanel'
import CrewSheet from './CrewSheet'
import { eventInfo, eventTitle, timeLeft } from '@/lib/liveEvents'
import TruckPanel from './TruckPanel'
import DumpsterPanel from './DumpsterPanel'
import StationsMap from './StationsMap'
import SitePicker from './SitePicker'
import LoadingScreen from './LoadingScreen'
import BonusTab from './BonusTab'
import PlotsSheet, { plotName } from './PlotsSheet'
import ProfileSheet from './ProfileSheet'
import UsernameForm from './UsernameForm'
import type { StationFocus } from '@/components/game3d/Scene'
import { formatNumber } from './format'
import { PLOT_SLOTS, islandIndex } from '@/lib/game/plots'

// three.js needs `window`/WebGL, so the scene only ever renders client-side.
const Scene = dynamic(() => import('@/components/game3d/Scene'), { ssr: false })

type Pop = { id: number; text: string; x: number; y: number }

const NAME_PROMPT_KEY = 'rubble-name-prompted'

export default function Game() {
  const game = useEngine()
  const [mapOpen, setMapOpen] = useState(false)
  // A station opened from the Upgrades list goes back to the list on close.
  const [fromList, setFromList] = useState(false)
  const closeStation = () => {
    setSelected(null)
    if (fromList) setMapOpen(true)
    setFromList(false)
  }
  const [bonusOpen, setBonusOpen] = useState(false)
  const [plotsOpen, setPlotsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [crewOpen, setCrewOpen] = useState(false)
  // First play: ask for a username once (skippable; they can set it later
  // in Profile).
  const [namePrompted, setNamePrompted] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem(NAME_PROMPT_KEY) === '1'
    } catch {
      return true
    }
  })
  const dismissNamePrompt = () => {
    setNamePrompted(true)
    try {
      localStorage.setItem(NAME_PROMPT_KEY, '1')
    } catch {
      // fine — it may ask again next time
    }
  }
  const [selected, setSelected] = useState<StationFocus | null>(null)
  // The plot nearest the middle of the screen: BREAK and the building card
  // act on it. `flyTo` glides the camera to a plot when its nonce changes.
  const [focusPlot, setFocusPlot] = useState(0)
  const [flyTo, setFlyTo] = useState({ plot: 0, nonce: 0 })
  const [picker, setPicker] = useState<{ plot: number; cleared: { name: string; bonus: number } | null } | null>(null)
  const [pops, setPops] = useState<Pop[]>([])
  // Little bursts where you tap the building (instead of CRACK! text).
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([])
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

  // Tapping the building: break a brick with a small burst under the
  // finger (the BREAK button shows CRACK! text instead).
  const tapBuilding = (plotId: number, x: number, y: number, brick?: number) => {
    const broke = brick === undefined ? engine.breakTap(plotId) : engine.breakBrickAt(plotId, brick)
    if (broke === 0) return
    // Every tap on the building also tops the crew boost back up.
    engine.boost()
    engine.notify()
    const id = Date.now() + Math.random()
    setBursts((prev) => [...prev.slice(-10), { id, x, y }])
    setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== id)), 500)
  }

  const handleBreak = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (engine.breakTap(plot.id) === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    pop('CRACK!', rect.left + rect.width / 2 + (Math.random() - 0.5) * 60, rect.top)
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
            setFromList(false)
            // The depot sign opens the fleet, following truck 1.
            setSelected(id === 'truck' ? { id, plot: plotId, truck: 0 } : { id, plot: plotId, index })
          }}
          onBreakTap={tapBuilding}
          onSelectTruck={(truck) => {
            setMapOpen(false)
            setFromList(false)
            setSelected({ id: 'truck', plot: engine.trucks[truck]?.home ?? 0, truck })
          }}
        />
      </div>

      {bursts.map((b) => (
        <span key={b.id} className="pointer-events-none fixed z-30" style={{ left: b.x, top: b.y }} aria-hidden>
          <span className="tap-ring" />
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className="tap-shard"
              style={{ '--a': `${n * 60 + 15}deg`, '--d': `${22 + (n % 3) * 6}px` } as React.CSSProperties}
            />
          ))}
        </span>
      ))}
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
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1.5 rounded-full bg-black/55 py-1 pl-1 pr-2.5 backdrop-blur-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ffc93c] font-display text-xs text-[#5a3d00]">
                  {snap.level}
                </span>
                <div className="h-2 w-20 overflow-hidden rounded-full bg-white/25">
                  <div className="h-full bg-[#ffc93c]" style={{ width: `${Math.min(100, levelProgress * 100)}%` }} />
                </div>
              </div>
              {/* Profile: player ID and redeem codes */}
              <button
                onClick={() => setProfileOpen(true)}
                aria-label="Profile and codes"
                className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm active:scale-95"
              >
                <UserRound className="h-4.5 w-4.5 text-white" />
              </button>
            </div>
            {/* Crew boost timer (tapping the building tops it up). */}
            {snap.boostLeft > 0 ? (
              <div className="inline-flex items-center gap-1 rounded-full bg-[#ffd23c] px-2.5 py-1 font-display text-xs text-[#5a3d00] shadow-[0_2px_0_#c99a00]">
                ⚡ Crew boost · {snap.boostLeft}s
              </div>
            ) : null}
          </div>
          <div className="pointer-events-auto min-w-[165px] rounded-2xl bg-white px-3 py-2 shadow-[0_3px_0_rgba(0,0,0,0.15)]">
            {snap.plots.length > 1 && (
              <p className="font-display text-[10px] uppercase leading-none tracking-wider text-[#5b6f93]">{plotName(plot.id)}</p>
            )}
            {plot.phase === 'demolishing' ? (
              // Tap for the crew: who's working where.
              <button onClick={() => setCrewOpen(true)} className="block w-full text-left" aria-label="Crew">
                <p className="font-display text-base leading-tight text-[#1d3a6e]">{building.name}</p>
                <div className="mt-1.5 h-4 overflow-hidden rounded-full bg-[#1d3a6e]">
                  <div className="h-full bg-[#2d7ff9] transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
                </div>
                <p className="mt-1 text-center font-display text-xs text-[#1d3a6e]">
                  {formatNumber(plot.bricksLeft)} bricks left
                  {plot.rubbleLeft > 0 && ` · ${formatNumber(plot.rubbleLeft)} on ground`}
                </p>
              </button>
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
          </div>
        </div>

        {/* Live events: one pill each, with time left */}
        {snap.events.length > 0 && (
          <div className="mx-3 mt-2 flex flex-wrap gap-1.5">
            {snap.events.map((e) => (
              <span
                key={e.id}
                className="flex items-center gap-1 rounded-full bg-[#ff6b1a] px-3 py-1 font-display text-sm text-white shadow-[0_3px_0_#c24d0a]"
              >
                {eventInfo(e.kind).emoji} {eventTitle(e.kind, e.value)}
                <span className="text-white/80">· {timeLeft(e.endsAt)} left</span>
              </span>
            ))}
          </div>
        )}
        {/* Banner messages from the team */}
        {snap.banners.map((b) => (
          <div
            key={b.id}
            className="pointer-events-auto mx-3 mt-2 flex items-start justify-between gap-2 rounded-2xl bg-[#1d3a6e] p-3 text-white shadow-[0_3px_0_rgba(0,0,0,0.2)]"
          >
            <div className="min-w-0">
              <p className="font-display text-sm">📣 {b.title}</p>
              {b.body && <p className="mt-0.5 text-xs text-white/85">{b.body}</p>}
            </div>
            <button
              onClick={() => {
                engine.dismissBanner(b.id)
                engine.notify()
              }}
              className="shrink-0"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}

        {snap.catchUp !== null && (
          <div className="mx-3 mt-3 flex items-center gap-2 rounded-2xl bg-white p-3 shadow-[0_3px_0_rgba(0,0,0,0.15)]">
            <span className="text-lg">⏳</span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm text-[#1d3a6e]">Your crew worked while you were away…</p>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#d5ddea]">
                <div className="h-full rounded-full bg-[#ff6b1a]" style={{ width: `${Math.round(snap.catchUp * 100)}%` }} />
              </div>
            </div>
            <span className="font-display text-sm tabular-nums text-[#1d3a6e]">{Math.round(snap.catchUp * 100)}%</span>
          </div>
        )}
        {snap.catchUp === null && snap.offlineEarnings > 0 && (
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
            className={`pointer-events-auto relative mb-1 flex h-24 w-24 flex-col items-center justify-center rounded-full border-4 border-white bg-[#ff6b1a] font-display text-white shadow-[0_6px_0_#c94e0a] active:translate-y-1.5 active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_6px_0_#97a1ae]`}
          >
            <span className="text-2xl leading-none">BREAK!</span>
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
            setFromList(true)
            // Tool rack and crew trailer live on the home lot; dumpsters and
            // trucks are on every plot, so use the one you're looking at.
            // Yard and trucks: the yard on the island you're looking at.
            const island = islandIndex(PLOT_SLOTS[plot.id]?.island ?? 'houses')
            if (id === 'truck') setSelected({ id, plot: island, truck: 0 })
            else if (id === 'dumpster') setSelected({ id, plot: plot.id, index: 0 })
            else setSelected({ id, plot: id === 'yard' ? island : id === 'tools' || id === 'crew' ? 0 : plot.id })
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
          onClose={closeStation}
        />
      ) : selected?.id === 'truck' ? (
        <TruckPanel
          engine={engine}
          snap={snap}
          truck={selected.truck ?? 0}
          onPickTruck={(truck) => setSelected({ ...selected, truck })}
          onOpenYard={() => setSelected({ id: 'yard', plot: selected.plot })}
          onClose={closeStation}
        />
      ) : (
        selected && <StationPanel engine={engine} snap={snap} id={selected.id} yard={selected.plot} onClose={closeStation} />
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
      {crewOpen && <CrewSheet engine={engine} snap={snap} focus={plot.id} onClose={() => setCrewOpen(false)} />}
      {profileOpen && <ProfileSheet engine={engine} snap={snap} onClose={() => setProfileOpen(false)} />}
      {loadingGone && snap.synced && !snap.username && !namePrompted && !snap.notice && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="w-full max-w-xs rounded-3xl bg-white p-5 shadow-[0_6px_0_rgba(0,0,0,0.15)]">
            <p className="text-center text-4xl">👷</p>
            <p className="mt-1 text-center font-display text-2xl text-[#1d3a6e]">Pick a username</p>
            <p className="mb-3 text-center text-sm text-[#5b6f93]">What should the crew call you?</p>
            <UsernameForm engine={engine} initial="" submitLabel="Go!" onDone={dismissNamePrompt} />
            <button onClick={dismissNamePrompt} className="mt-3 w-full text-center text-sm text-[#5b6f93]">
              Maybe later
            </button>
          </div>
        </div>
      )}
      {/* Gifts, balance edits and redeemed codes, one at a time */}
      {snap.notice && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="w-full max-w-xs rounded-3xl border-4 border-white bg-[#2f8fe8] p-5 text-center text-white shadow-[0_6px_0_#1d5fa8]">
            <p className="text-5xl">{snap.notice.emoji ?? '🎁'}</p>
            <p className="mt-2 font-display text-2xl leading-tight">{snap.notice.title}</p>
            {snap.notice.detail && <p className="mt-2 font-display text-xl">{snap.notice.detail}</p>}
            {snap.notice.message && <p className="mt-2 text-sm text-white/90">“{snap.notice.message}”</p>}
            <button
              onClick={() => {
                engine.dismissNotice()
                engine.notify()
              }}
              className="mt-4 w-full rounded-2xl bg-[#3fbf4a] py-2.5 font-display text-lg shadow-[0_4px_0_#2a8a33] active:translate-y-1 active:shadow-none"
            >
              {snap.notice.button ?? 'Nice!'}
            </button>
          </div>
        </div>
      )}
      <BonusTab engine={engine} snap={snap} open={bonusOpen && !!snap.bonusDrop} onOpenChange={setBonusOpen} />
      <InterstitialAd trigger={snap.sitesCleared} />
      {/* Banned by an admin: covers the whole game until the ban ends or is lifted */}
      {snap.ban && (
        <div className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-[#1d3a6e]/95 p-6">
          <div className="w-full max-w-xs rounded-3xl bg-white p-5 text-center shadow-[0_6px_0_rgba(0,0,0,0.25)]">
            <p className="text-5xl">🚫</p>
            <p className="mt-2 font-display text-2xl leading-tight text-[#1d3a6e]">You&apos;re banned</p>
            <p className="mt-2 text-sm text-[#5b6f93]">
              {snap.ban.until
                ? `Until ${new Date(snap.ban.until).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                : 'This ban is permanent'}
            </p>
            {snap.ban.reason && <p className="mt-3 rounded-2xl bg-[#eef2f8] p-3 text-sm text-[#1d3a6e]">“{snap.ban.reason}”</p>}
            {snap.shortId && <p className="mt-3 text-xs text-[#5b6f93]">Your player ID: {snap.shortId}</p>}
          </div>
        </div>
      )}
      {!loadingGone && <LoadingScreen progress={loadProgress} leaving={loaded} />}
    </div>
  )
}
