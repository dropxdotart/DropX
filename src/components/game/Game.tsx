'use client'

import { Emo, IconText } from './Icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { ArrowBigUpDash, Map as MapIcon, X } from 'lucide-react'
import { useEngine } from '@/lib/game/useEngine'
import { getBuilding, xpForLevel } from '@/lib/game/buildings'
import BannerAd from './BannerAd'
import InterstitialAd from './InterstitialAd'
import RewardedAdButton from './RewardedAdButton'
import { BALL_HITS_MS, BOOST_SECONDS, DYNAMITE_BOOM_MS, HELPERS } from '@/lib/game/engine'
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
import ManagersSheet from './ManagersSheet'
import GoalsSheet from './GoalsSheet'
import BoostsSheet from './BoostsSheet'
import { CatchBricksGame, FixTruckGame } from './MiniGames'
import type { Need } from '@/components/game3d/NeedsYou'
import type { Slot } from '@/lib/game/managers'
import UsernameForm from './UsernameForm'
import type { StationFocus } from '@/components/game3d/Scene'
import { formatNumber } from './format'
import { PLOT_SLOTS, islandIndex } from '@/lib/game/plots'

// three.js needs `window`/WebGL, so the scene only ever renders client-side.
const Scene = dynamic(() => import('@/components/game3d/Scene'), { ssr: false })

type Pop = { id: number; text: string; x: number; y: number }

const NAME_PROMPT_KEY = 'rubble-name-prompted'

// Ids and a little left-right scatter for the floating pop-up texts.
let popSeq = 0
const jitter = (spread: number) => (((popSeq * 37) % 11) / 10 - 0.5) * spread

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
  // The Team sheet (managers and chests), optionally on one slot.
  const [team, setTeam] = useState<{ slot: Slot | null } | null>(null)
  const [goalsOpen, setGoalsOpen] = useState(false)
  const [boostsOpen, setBoostsOpen] = useState(false)
  const [toolShop, setToolShop] = useState<'ball' | 'dynamite' | null>(null)
  const [toolAim, setToolAim] = useState<'ball' | 'dynamite' | null>(null)
  const [mini, setMini] = useState<{ kind: 'truck'; id: number } | { kind: 'catch' } | null>(null)
  // Holding BREAK! is the jackhammer: a brick every beat until it overheats.
  const hammer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [heat, setHeat] = useState(0)
  const heatRef = useRef(0)
  const [overheated, setOverheated] = useState(false)
  // The jackhammer cools down when you let go.
  useEffect(() => {
    const t = setInterval(() => {
      if (hammer.current || heatRef.current <= 0) return
      heatRef.current = Math.max(0, heatRef.current - 6)
      setHeat(heatRef.current)
    }, 200)
    return () => clearInterval(t)
  }, [])
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
    const id = ++popSeq
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
    if (overheated || engine.breakTap(plot.id) === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    pop('CRACK!', rect.left + rect.width / 2 + jitter(60), rect.top)
    // Keep holding: the jackhammer takes over after a moment.
    stopHammer()
    const plotId = plot.id
    let n = 0
    hammer.current = setInterval(() => {
      if (++n < 3) return
      heatRef.current = Math.min(100, heatRef.current + 3)
      setHeat(heatRef.current)
      if (heatRef.current >= 100) {
        stopHammer()
        setOverheated(true)
        setTimeout(() => setOverheated(false), 4000)
        pop('TOO HOT!', rect.left + rect.width / 2, rect.top - 20)
        return
      }
      if (engine.breakTap(plotId) > 0) {
        engine.boost()
        if (n % 3 === 0) pop('BRRT', rect.left + rect.width / 2 + jitter(70), rect.top)
      }
    }, 110)
  }
  const stopHammer = () => {
    if (hammer.current) clearInterval(hammer.current)
    hammer.current = null
  }

  // Tools aim at a plot you pick (the camera flies there first).
  const fireTool = (kind: 'ball' | 'dynamite', target: number) => {
    setToolAim(null)
    setFlyTo((f) => ({ plot: target, nonce: f.nonce + 1 }))
    const n = kind === 'ball' ? engine.swingBall(target) : engine.blast(target)
    engine.notify()
    if (!n) return
    // The pop lands when the ball hits / the dynamite goes off.
    const at = { x: window.innerWidth / 2, y: window.innerHeight * 0.4 }
    if (kind === 'ball') for (const ms of BALL_HITS_MS) setTimeout(() => pop('SMASH!', at.x, at.y), ms)
    else setTimeout(() => pop('BOOM!', at.x, at.y), DYNAMITE_BOOM_MS)
  }

  const onNeed = (need: Need) => {
    if (need.kind === 'truck') setMini({ kind: 'truck', id: need.id })
    else {
      const got = need.kind === 'worker' ? engine.wakeWorker(need.id) : engine.clearJam()
      engine.notify()
      if (got) pop(need.kind === 'worker' ? 'Back to work!' : `+🧱${formatNumber(got)}`, window.innerWidth / 2, window.innerHeight / 2)
    }
  }
  const goalsReady =
    snap.goals.some((g) => !g.claimed && g.progress >= g.target) || snap.goalsBonusReady || (!!snap.contract && snap.contract.progress >= snap.contract.target)


  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-[#9fd4ef]">
      {/* Portrait only: a phone turned sideways gets asked to turn back */}
      <div className="rotate-lock fixed inset-0 z-[100] hidden flex-col items-center justify-center gap-3 bg-[#1d3a6e] text-center">
        <div className="rotate-phone h-16 w-10 rounded-lg border-4 border-white" />
        <p className="font-display text-2xl text-white">Turn your phone upright</p>
        <p className="font-display text-sm text-white/70">Rubble plays in portrait</p>
      </div>
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
          onSelectManager={(slot) => setTeam({ slot })}
          onNeed={onNeed}
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
          <IconText text={p.text} />
        </span>
      ))}

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col pt-[max(env(safe-area-inset-top),12px)]">
        {/* Top: the money capsule and level, the building card on the right */}
        <div className="flex items-start justify-between gap-2 px-3">
          <div className="flex items-center gap-1.5">
            <div className="rounded-2xl border-[3px] border-[#1d3a6e] bg-white px-2.5 py-1 shadow-[0_3px_0_#1d3a6e]">
              <p className="flex items-baseline gap-2 whitespace-nowrap font-display leading-none text-[#1d3a6e]">
                <span className="text-xl"><Emo e="🧱" /> {formatNumber(snap.scrap)}</span>
                <span className="text-sm text-[#1b6fa8]"><Emo e="💎" /> {formatNumber(snap.gems)}</span>
              </p>
              <p className="mt-0.5 font-display text-[11px] leading-none text-[#2a9a3a]">+{formatNumber(snap.incomePerMinute)} / min</p>
            </div>
            {/* Level: a ring that fills toward the next level (tap: profile) */}
            <button onClick={() => setProfileOpen(true)} aria-label={`Level ${snap.level} — profile and codes`} className="pointer-events-auto relative h-12 w-12 shrink-0 active:scale-95">
              <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full -rotate-90">
                <circle cx="24" cy="24" r="20" fill="#ffc93c" stroke="#1d3a6e" strokeWidth="5" />
                <circle cx="24" cy="24" r="20" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeDasharray={`${Math.min(1, levelProgress) * 125.7} 125.7`} strokeLinecap="round" />
              </svg>
              <span className="relative font-display text-base text-[#5a3d00]">{snap.level}</span>
            </button>
          </div>
          <div className="pointer-events-auto min-w-[150px] max-w-[48%] rounded-2xl border-[3px] border-[#1d3a6e] bg-white px-3 py-1.5 shadow-[0_3px_0_#1d3a6e]">
            {snap.plots.length > 1 && (
              <p className="font-display text-[10px] uppercase leading-none tracking-wider text-[#5b6f93]">{plotName(plot.id)}</p>
            )}
            {plot.phase === 'demolishing' ? (
              // Tap for the crew: who's working where.
              <button onClick={() => setCrewOpen(true)} className="block w-full text-left" aria-label="Crew">
                <p className="truncate font-display text-base leading-tight text-[#1d3a6e]">{building.name}</p>
                <div className="mt-1 h-3.5 overflow-hidden rounded-full bg-[#1d3a6e]">
                  <div className="h-full bg-[#2d7ff9] transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
                </div>
                <p className="mt-0.5 text-center font-display text-[11px] text-[#1d3a6e]">
                  {formatNumber(plot.bricksLeft)} left
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

        {/* Under the top: timers and offers on the left, the side rail on the right */}
        <div className="mt-2 flex items-start justify-between gap-2 px-3">
          <div className="flex min-w-0 flex-col items-start gap-1.5">
            {snap.boostLeft > BOOST_SECONDS && (
              <div className="inline-flex items-center gap-1 rounded-full border-2 border-white bg-[#ffd23c] px-2.5 py-0.5 font-display text-xs tabular-nums text-[#5a3d00]">
                <Emo e="⚡" /> 2× crew · {snap.boostLeft >= 60 ? `${Math.floor(snap.boostLeft / 60)}m ${String(snap.boostLeft % 60).padStart(2, '0')}s` : `${snap.boostLeft}s`}
              </div>
            )}
            {snap.helpersLeft > 0 && (
              <div className="inline-flex items-center gap-1 rounded-full border-2 border-white bg-[#2d7ff9] px-2.5 py-0.5 font-display text-xs tabular-nums text-white">
                <Emo e="👷" /> +{HELPERS} fast · {Math.floor(snap.helpersLeft / 60)}m {String(snap.helpersLeft % 60).padStart(2, '0')}s
              </div>
            )}
            {snap.catchOffer > 0 && !mini && (
              <button
                onClick={() => {
                  engine.takeCatchOffer()
                  setMini({ kind: 'catch' })
                }}
                className="needs-you pointer-events-auto block rounded-full border-2 border-white bg-[#c4553a] px-2.5 py-1 font-display text-xs text-white"
              >
                <Emo e="🧱" /> Bricks falling! Catch them · {snap.catchOffer}s
              </button>
            )}
          </div>
          <div className="relative flex flex-col items-end gap-2">
            {([
              ['Team', '👔', '#9b59d0', '#6c3a99', () => (setBoostsOpen(false), setTeam({ slot: null })), snap.freeChestIn === 0 || snap.chests.wood + snap.chests.iron + snap.chests.gold > 0],
              ['Goals', '🎯', '#3fbf4a', '#2a8a33', () => (setBoostsOpen(false), setGoalsOpen(true)), goalsReady],
              ['Boosts', '⚡', '#2d7ff9', '#1b5bbd', () => setBoostsOpen(true), snap.boostLeft <= BOOST_SECONDS || snap.helpersLeft === 0],
            ] as const).map(([label, emoji, bg, shade, onClick, dot]) => (
              <button
                key={label}
                onClick={onClick}
                aria-label={label}
                className="pointer-events-auto relative flex h-12 w-12 flex-col items-center justify-center rounded-2xl border-[3px] border-white active:translate-y-0.5"
                style={{ background: bg, boxShadow: `0 3px 0 ${shade}` }}
              >
                <Emo e={emoji} size={22} />
                <span className="font-display text-[9px] leading-none text-white">{label}</span>
                {dot && <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#ff6b1a]" />}
              </button>
            ))}
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
              <p className="font-display text-sm"><Emo e="📣" /> {b.title}</p>
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
            <span className="text-lg"><Emo e="⏳" /></span>
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
              Your crew kept hauling — <span className="text-[#e8701f]">+<Emo e="🧱" />{formatNumber(snap.offlineEarnings)}</span> while you were away!
            </p>
            <RewardedAdButton
              rewardBricks={snap.offlineEarnings}
              onReward={() => {
                engine.doubleOffline()
                engine.notify()
              }}
              className="shrink-0 rounded-xl bg-[#3fbf4a] px-3 py-2 font-display text-sm text-white shadow-[0_3px_0_#2a8a33] active:translate-y-[3px] active:shadow-none disabled:opacity-70"
            >
              <Emo e="▶" /> Double it
            </RewardedAdButton>
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

        {/* Bottom dock: Upgrades, BREAK! (raised, tools above it), Plots */}
        <div className="relative mt-16">
          <div className="pointer-events-auto relative flex items-end justify-between rounded-t-[28px] bg-[#1d3a6e] px-6 pb-[max(env(safe-area-inset-bottom),10px)] pt-2.5 shadow-[0_-3px_0_rgba(0,0,0,0.15)]">
            {/* A strip of hazard tape along the top edge */}
            <span className="hazard-tape absolute -top-1.5 left-10 right-10 h-2.5 rounded-full" aria-hidden />
            <button onClick={() => setMapOpen(true)} className="flex flex-col items-center gap-0.5">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-white bg-[#2d7ff9] text-white shadow-[0_4px_0_#0f2347] active:translate-y-1 active:shadow-none">
                <ArrowBigUpDash className="h-7 w-7" />
              </span>
              <span className="font-display text-xs text-white">Upgrades</span>
            </button>

            <div className="relative -mt-12">
              {/* Tools: the wrecking ball and dynamite, on cooldowns */}
              {snap.plots.some((p) => p.phase === 'demolishing') && (
                <div className="absolute -top-14 left-1/2 flex -translate-x-1/2 gap-12">
                  {([
                    ['ball', '🏗️', snap.tools.ballIn, snap.tools.ballCharges],
                    ['dynamite', '🧨', snap.tools.dynamiteIn, snap.tools.dynamiteCharges],
                  ] as const).map(([kind, emoji, wait, charges]) => (
                    <button
                      key={kind}
                      // On cooldown with no bought uses left: offer a pack.
                      onClick={() => {
                        setToolShop(null)
                        if (wait > 0 && charges === 0) setToolShop(toolShop === kind ? null : kind)
                        else setToolAim(toolAim === kind ? null : kind)
                      }}
                      aria-label={kind === 'ball' ? 'Wrecking ball' : 'Dynamite'}
                      className={`relative flex h-12 w-12 flex-col items-center justify-center rounded-full border-[3px] border-white text-xl shadow-[0_3px_0_#0f2347] active:translate-y-[3px] active:shadow-none ${wait > 0 && charges === 0 ? 'bg-[#5b6f93]' : 'bg-[#1d3a6e]'}`}
                    >
                      <Emo e={emoji} size={24} />
                      {wait > 0 && charges === 0 && <span className="font-display text-[10px] leading-none text-white">{wait >= 60 ? `${Math.ceil(wait / 60)}m` : `${wait}s`}</span>}
                      {charges > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 rounded-full border-2 border-white bg-[#ff6b1a] px-1.5 font-display text-[10px] leading-4 text-white">×{charges}</span>
                      )}
                    </button>
                  ))}
                  {toolAim && (
                    <div className="absolute bottom-16 left-1/2 w-64 -translate-x-1/2 rounded-2xl border-[3px] border-[#1d3a6e] bg-white p-2.5 shadow-[0_3px_0_#1d3a6e]">
                      <p className="mb-1.5 font-display text-sm text-[#1d3a6e]"><IconText text={toolAim === 'ball' ? '🏗️ Where should the crane go?' : '🧨 Where should the dynamite go?'} /></p>
                      <div className="max-h-48 space-y-1.5 overflow-y-auto">
                        {snap.plots
                          .filter((p) => p.phase === 'demolishing' && p.bricksLeft > 0)
                          .map((p) => (
                            <button
                              key={p.id}
                              onClick={() => fireTool(toolAim, p.id)}
                              className="flex w-full items-center justify-between gap-2 rounded-xl bg-[#eef2f8] px-2.5 py-2 text-left active:scale-[0.98]"
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-display text-sm leading-tight text-[#1d3a6e]">{getBuilding(p.buildingId).name}</span>
                                <span className="block text-[11px] leading-tight text-[#5b6f93]">{plotName(p.id)}</span>
                              </span>
                              <span className="shrink-0 font-display text-xs text-[#5b6f93]">{formatNumber(p.bricksLeft)} left</span>
                            </button>
                          ))}
                      </div>
                      <button onClick={() => setToolAim(null)} className="mt-1.5 w-full font-display text-xs text-[#5b6f93]">
                        Cancel
                      </button>
                    </div>
                  )}
                  {toolShop && (
                    <div className="absolute bottom-16 left-1/2 w-56 -translate-x-1/2 rounded-2xl border-[3px] border-[#1d3a6e] bg-white p-2.5 shadow-[0_3px_0_#1d3a6e]">
                      <p className="font-display text-sm text-[#1d3a6e]">
                        <IconText text={toolShop === 'ball' ? '🏗️ 3 more swings' : '🧨 3 more sticks'} />
                        <span className="text-xs text-[#5b6f93]"> · use them any time</span>
                      </p>
                      <div className="mt-1.5 flex gap-1.5">
                        {(['gems', 'bricks'] as const).map((pay) => {
                          const price = toolShop === 'ball' ? snap.tools.ballPack : snap.tools.dynamitePack
                          const afford = pay === 'gems' ? snap.gems >= price.gems : snap.scrap >= price.bricks
                          return (
                            <button
                              key={pay}
                              disabled={!afford}
                              onClick={() => {
                                engine.buyToolPack(toolShop, pay)
                                engine.notify()
                                setToolShop(null)
                              }}
                              className="flex-1 rounded-xl bg-[#3fbf4a] py-1.5 font-display text-xs text-white shadow-[0_3px_0_#2a8a33] active:translate-y-[3px] active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_3px_0_#97a1ae]"
                            >
                              <IconText text={pay === 'gems' ? `💎 ${price.gems}` : `🧱 ${formatNumber(price.bricks)}`} />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* Caution tape round the button */}
              <span className="caution-ring pointer-events-none absolute -inset-2 rounded-full" aria-hidden />
              <button
                onPointerDown={handleBreak}
                onPointerUp={stopHammer}
                onPointerLeave={stopHammer}
                onPointerCancel={stopHammer}
                disabled={plot.phase !== 'demolishing' || plot.bricksLeft === 0}
                className={`relative flex h-24 w-24 touch-none flex-col items-center justify-center rounded-full border-[5px] border-white font-display text-white shadow-[0_6px_0_#0f2347] active:translate-y-1.5 active:shadow-none disabled:bg-[#b9c2cf] ${overheated ? 'bg-[#e23f3f]' : 'bg-[#ff6b1a]'}`}
              >
                <span className="text-2xl leading-none">{overheated ? 'HOT!' : 'BREAK!'}</span>
                <span className="mt-0.5 text-[9px] leading-none opacity-80">hold to jackhammer</span>
                {/* Jackhammer heat */}
                {heat > 0 && (
                  <span className="absolute bottom-2 left-1/2 h-1.5 w-12 -translate-x-1/2 overflow-hidden rounded-full bg-white/30">
                    <span className="block h-full rounded-full bg-white" style={{ width: `${heat}%` }} />
                  </span>
                )}
              </button>
            </div>

            <button onClick={() => setPlotsOpen(true)} className="relative flex flex-col items-center gap-0.5">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-white bg-[#3fbf4a] text-white shadow-[0_4px_0_#0f2347] active:translate-y-1 active:shadow-none">
                <MapIcon className="h-6 w-6" />
              </span>
              {plotNeedsYou && <span className="absolute right-0 top-0 h-4 w-4 rounded-full border-2 border-white bg-[#ff6b1a]" />}
              <span className="font-display text-xs text-white">Plots</span>
            </button>
          </div>
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
      {boostsOpen && <BoostsSheet engine={engine} snap={snap} onClose={() => setBoostsOpen(false)} />}
      {goalsOpen && <GoalsSheet engine={engine} snap={snap} onClose={() => setGoalsOpen(false)} />}
      {mini?.kind === 'truck' && (
        <FixTruckGame
          onDone={() => {
            const got = engine.fixTruck(mini.id)
            engine.notify()
            setMini(null)
            if (got) pop(`Fixed! +🧱${formatNumber(got)}`, window.innerWidth / 2, window.innerHeight / 2)
          }}
          onCancel={() => setMini(null)}
        />
      )}
      {mini?.kind === 'catch' && (
        <CatchBricksGame
          unit={engine.catchUnit()}
          onDone={(caught) => {
            const got = engine.claimCatch(caught)
            engine.notify()
            setMini(null)
            if (got) pop(`+🧱${formatNumber(got)}`, window.innerWidth / 2, window.innerHeight / 2)
          }}
        />
      )}
      {team && <ManagersSheet engine={engine} snap={snap} focusSlot={team.slot} onClose={() => setTeam(null)} />}
      {loadingGone && snap.synced && !snap.username && !namePrompted && !snap.notice && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="w-full max-w-xs rounded-3xl bg-white p-5 shadow-[0_6px_0_rgba(0,0,0,0.15)]">
            <p className="text-center text-4xl"><Emo e="👷" /></p>
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
            <p className="flex justify-center text-5xl"><Emo e={snap.notice.emoji ?? '🎁'} size="1em" /></p>
            <p className="mt-2 font-display text-2xl leading-tight"><IconText text={snap.notice.title} /></p>
            {snap.notice.detail && <p className="mt-2 font-display text-xl"><IconText text={snap.notice.detail} /></p>}
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
      {/* After each cleared building and each plot bought. */}
      <InterstitialAd trigger={snap.sitesCleared + snap.plots.length} />
      {/* Banned by an admin: covers the whole game until the ban ends or is lifted */}
      {snap.ban && (
        <div className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-[#1d3a6e]/95 p-6">
          <div className="w-full max-w-xs rounded-3xl bg-white p-5 text-center shadow-[0_6px_0_rgba(0,0,0,0.25)]">
            <p className="text-5xl"><Emo e="🚫" /></p>
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
