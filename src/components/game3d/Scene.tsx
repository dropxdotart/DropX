'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrthographicCamera, useProgress } from '@react-three/drei'
import * as THREE from 'three'
import { getBuilding, sizeFor } from '@/lib/game/buildings'
import { BRICK, DUMPSTER_SLOTS, LOT_HALF, upgradeCost, type Engine, type Snapshot } from '@/lib/game/engine'
import { BLOCK, MAP_BLOCKS, PLOT_SLOTS, YARD_BLOCK } from '@/lib/game/plots'
import { STATIONS, dumpstersAffordable, fleetAffordable, getStation, tierFor, truckLevel, type StationId } from '@/lib/game/stations'
import { formatNumber } from '@/components/game/format'
import Building from './Building'
import Worker, { vestMaterial } from './Worker'
import World from './World'
import BonusDrop from './BonusDrop'
import { BrickYard, CrewStation, DumpsterStation, Fleet, ToolStation, TruckDepot } from './Stations'
import { pointer } from './drag'

const MAX_VISIBLE_WORKERS = 24
const CAMERA_DIR = new THREE.Vector3(1, 0.95, 1).normalize()
// Screen-right and screen-up as directions on the ground, for drag-to-pan.
const GROUND_RIGHT = new THREE.Vector3(1, 0, -1).normalize()
const GROUND_FORWARD = new THREE.Vector3(-1, 0, -1).normalize()
const PAN_LIMIT = MAP_BLOCKS * BLOCK
const DRAG_THRESHOLD = 8
// How far pinch/wheel can zoom out (wider city view) and in.
const MIN_ZOOM = 0.55
const MAX_ZOOM = 2

// `truck` set = one specific truck (the camera follows it as it drives);
// `index` = which of the plot's dumpsters.
export type StationFocus = { id: StationId; plot: number; truck?: number; index?: number }

// Advances the simulation once per frame. Mounted first inside the canvas so
// its frame callback runs before anything that draws engine state.
function EngineTicker({ engine }: { engine: Engine }) {
  useFrame((_, delta) => engine.frameTick(delta))
  return null
}

// Crew boost: every worker's hi-vis vest pulses yellow while it's on.
function BoostGlow({ engine }: { engine: Engine }) {
  useFrame(({ clock }) => {
    if (engine.boostActive()) {
      vestMaterial.emissive.set('#ffd23c')
      vestMaterial.emissiveIntensity = 0.6 + Math.sin(clock.getElapsedTime() * 10) * 0.3
    } else {
      vestMaterial.emissiveIntensity = 0
    }
  })
  return null
}

// Where the camera looks: `center` is the free-panning point on the ground
// (moved by dragging or by flying to a plot); a selected station overrides
// it with a close-up. Reports whichever owned plot is nearest the middle of
// the screen, so the HUD and BREAK follow what you're looking at.
function CameraRig({
  engine,
  center,
  zoomRef,
  zoomMul,
  focus,
  snap,
  onFocusPlot,
}: {
  engine: Engine
  center: React.RefObject<THREE.Vector3>
  zoomRef: React.RefObject<number>
  zoomMul: React.RefObject<number>
  focus: StationFocus | null
  snap: Snapshot
  onFocusPlot: (plot: number) => void
}) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const size = useThree((s) => s.size)
  const lookAt = useRef(center.current.clone())
  const nearest = useRef(-1)

  // Frame a whole lot (dumpster and truck stop included), pulling back a
  // little more for the tallest building among your plots.
  const tallest = Math.max(
    0,
    ...snap.plots.map((p) => (p.phase === 'empty' ? 0 : sizeFor(getBuilding(p.buildingId))[1]))
  )
  const span = Math.max(LOT_HALF * 2 + 6, tallest * BRICK * 1.3 + 10)
  const baseZoom = Math.min(size.width, size.height * 0.8) / span

  const target = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    const followed = focus?.truck !== undefined ? engine.trucks[focus.truck] : null
    if (followed) {
      target.set(followed.x, -1.5, followed.z)
    } else if (focus) {
      // The yard and the truck depot sign sit on the Brick Yard's block.
      const base = focus.id === 'yard' || focus.id === 'truck' ? YARD_BLOCK : PLOT_SLOTS[focus.plot]
      const p = focus.id === 'dumpster' ? DUMPSTER_SLOTS[focus.index ?? 0] : getStation(focus.id).position
      target.set(base.x + p.x, -1.5, base.z + p.z)
    } else {
      target.copy(center.current)
    }
    const k = Math.min(1, delta * 3)
    // Follow the finger exactly while dragging; glide otherwise.
    if (pointer.dragged && !focus) lookAt.current.copy(target)
    else lookAt.current.lerp(target, k)
    camera.zoom = THREE.MathUtils.lerp(camera.zoom, focus ? baseZoom * 2.4 : baseZoom * zoomMul.current, k)
    zoomRef.current = camera.zoom
    camera.position.copy(CAMERA_DIR).multiplyScalar(60).add(lookAt.current)
    camera.lookAt(lookAt.current)
    camera.updateProjectionMatrix()

    let best = 0
    let bestD = Infinity
    snap.plots.forEach((p) => {
      const slot = PLOT_SLOTS[p.id]
      const d = (slot.x - lookAt.current.x) ** 2 + (slot.z - lookAt.current.z) ** 2
      if (d < bestD) {
        bestD = d
        best = p.id
      }
    })
    if (best !== nearest.current) {
      nearest.current = best
      onFocusPlot(best)
    }
  })
  return null
}

// Reports model-loading progress up to the HUD's loading screen (capped
// below 100). Reads drei's store outside render: loads start while other
// components render, and the hook would set state mid-render.
function LoadReporter({ onProgress }: { onProgress: (progress: number) => void }) {
  useEffect(
    () =>
      useProgress.subscribe((s) => {
        onProgress(Math.min(95, s.progress))
      }),
    [onProgress]
  )
  return null
}

// Mounted last inside the scene's Suspense boundary, so it only exists once
// every model has loaded; after a few drawn frames (first-frame shader
// compiles) it tells the loading screen to go.
function SceneReady({ onReady }: { onReady: () => void }) {
  const frames = useRef(0)
  useFrame(() => {
    if (frames.current++ === 3) onReady()
  })
  return null
}

// Floating bubbles over plots that need you: claim a cleared site, pick a
// building for an empty one, or buy the next plot for sale.
function PlotLabels({ snap, onPlotAction }: { snap: Snapshot; onPlotAction: (plot: number) => void }) {
  const tap = (plot: number) => () => {
    if (!pointer.dragged) onPlotAction(plot)
  }
  return (
    <>
      {PLOT_SLOTS.map((slot) => {
        const owned = snap.plots[slot.id]
        let label: React.ReactNode = null
        if (owned?.phase === 'cleared') {
          const bonus = getBuilding(owned.buildingId).bonus
          label = (
            <button onClick={tap(slot.id)} className="animate-bounce rounded-2xl border-[3px] border-white bg-[#ff6b1a] px-4 py-2 font-display text-white shadow-[0_4px_0_#c94e0a]">
              <span className="block text-xl leading-none">CLEARED!</span>
              <span className="block text-sm leading-tight">Tap to claim 🧱{formatNumber(bonus)}</span>
            </button>
          )
        } else if (owned?.phase === 'empty') {
          label = (
            <button onClick={tap(slot.id)} className="rounded-2xl border-[3px] border-white bg-[#2d7ff9] px-4 py-2 font-display text-white shadow-[0_4px_0_#1b5bbd]">
              <span className="block text-lg leading-none">Pick a building</span>
              <span className="block text-xs leading-tight opacity-90">Tap to start a demolition</span>
            </button>
          )
        } else if (slot.id === snap.plots.length) {
          // Only the next plot up for sale gets a bubble; later ones just
          // show their sign so the map stays clean.
          const locked = snap.level < slot.requiredLevel
          label = (
            <button onClick={tap(slot.id)} className="rounded-2xl border-[3px] border-white bg-[#e23f3f] px-3 py-1.5 font-display text-white shadow-[0_4px_0_#a82a2a]">
              <span className="block text-base leading-none">FOR SALE</span>
              <span className="block text-xs leading-tight">
                {locked ? `🔒 Level ${slot.requiredLevel}` : `🧱${formatNumber(slot.cost)}`}
              </span>
            </button>
          )
        }
        if (!label) return null
        return (
          <Html key={slot.id} position={[slot.x, owned ? 2.2 : 3.2, slot.z + (owned ? 0 : LOT_HALF - 1.1)]} center zIndexRange={[5, 0]} className="whitespace-nowrap">
            {label}
          </Html>
        )
      })}
    </>
  )
}

export default function Scene({
  engine,
  snap,
  focus,
  flyTo,
  onSelectStation,
  onSelectTruck,
  onBreakTap,
  onFocusPlot,
  onPlotAction,
  onLoadProgress,
  onOpenBonus,
}: {
  engine: Engine
  snap: Snapshot
  focus: StationFocus | null
  // Bump `nonce` to glide the camera over to a plot.
  flyTo: { plot: number; nonce: number }
  onSelectStation: (id: StationId, plot: number, index?: number) => void
  onSelectTruck: (truck: number) => void
  onBreakTap: (plot: number, x: number, y: number, brick?: number) => void
  onFocusPlot: (plot: number) => void
  onPlotAction: (plot: number) => void
  onLoadProgress: (progress: number) => void
  onOpenBonus: () => void
}) {
  const center = useRef(new THREE.Vector3(0, 0, 1.5))
  const zoomRef = useRef(20)
  // Pinch / wheel zoom on top of the automatic framing (1 = default).
  const zoomMul = useRef(1)
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)

  useEffect(() => {
    const slot = PLOT_SLOTS[flyTo.plot]
    if (slot) center.current.set(slot.x, 0, slot.z + 1.5)
  }, [flyTo])

  const station = Object.fromEntries(
    STATIONS.map((s) => [
      s.id,
      {
        tier: tierFor(s.level(snap.upgrades)),
        affordable: s.upgrades.some((k) => snap.scrap >= upgradeCost(k, snap.upgrades[k])),
      },
    ])
  ) as Record<StationId, { tier: number; affordable: boolean }>
  station.truck.affordable = fleetAffordable(snap)

  let shown = 0
  const visibleWorkers = engine.workers.filter(() => shown++ < MAX_VISIBLE_WORKERS)

  // One finger (or the mouse) drags to pan; two fingers pinch to zoom, and
  // the mouse wheel zooms on desktop. Taps still reach the scene: a pointer
  // that moved past the threshold, or any pinch, marks itself as a drag so
  // the click handlers ignore it.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchDist = useRef(0)

  const zoomBy = (factor: number) => {
    zoomMul.current = THREE.MathUtils.clamp(zoomMul.current * factor, MIN_ZOOM, MAX_ZOOM)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      // Second finger down: switch from panning to pinching.
      const [a, b] = [...pointers.current.values()]
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y)
      drag.current = null
      pointer.dragged = true
      return
    }
    if (!e.isPrimary) return
    pointer.dragged = false
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinchDist.current > 0 && !focus) zoomBy(dist / pinchDist.current)
      pinchDist.current = dist
      return
    }
    const d = drag.current
    if (!d || e.pointerId !== d.id || focus) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!pointer.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    pointer.dragged = true
    d.x = e.clientX
    d.y = e.clientY
    const zoom = zoomRef.current || 20
    const c = center.current
    c.addScaledVector(GROUND_RIGHT, -dx / zoom)
    c.addScaledVector(GROUND_FORWARD, dy / (zoom * CAMERA_DIR.y))
    c.x = THREE.MathUtils.clamp(c.x, -PAN_LIMIT, PAN_LIMIT)
    c.z = THREE.MathUtils.clamp(c.z, -PAN_LIMIT, PAN_LIMIT)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    pinchDist.current = 0
    if (pointers.current.size > 0) return
    drag.current = null
    // Leave `dragged` set until the click that follows this pointerup has
    // been seen, then clear it.
    setTimeout(() => (pointer.dragged = false), 0)
  }
  const onWheel = (e: React.WheelEvent) => {
    if (!focus) zoomBy(Math.exp(-e.deltaY * 0.0015))
  }

  return (
    <div
      className="absolute inset-0"
      style={{ touchAction: 'none' }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <LoadReporter onProgress={onLoadProgress} />
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }} style={{ touchAction: 'none' }}>
        <EngineTicker engine={engine} />
        <BoostGlow engine={engine} />
        <color attach="background" args={['#9fd4ef']} />
        <OrthographicCamera makeDefault near={0.1} far={400} zoom={20} position={[40, 38, 40]} />
        <CameraRig engine={engine} center={center} zoomRef={zoomRef} zoomMul={zoomMul} focus={focus} snap={snap} onFocusPlot={onFocusPlot} />

        <hemisphereLight args={['#e8f4ff', '#6f8f4a', 0.9]} />
        <directionalLight
          position={[18, 30, 12]}
          intensity={2.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-40}
          shadow-camera-right={40}
          shadow-camera-top={40}
          shadow-camera-bottom={-40}
          shadow-bias={-0.0005}
        />

        <Suspense fallback={null}>
          <World ownedPlots={snap.plots.length} />
          {engine.plots.map((site) => {
            const slot = PLOT_SLOTS[site.id]
            const select = (id: StationId) => onSelectStation(id, site.id)
            return (
              <group key={site.id} position={[slot.x, 0, slot.z]}>
                <Building engine={engine} site={site} onBreakTap={onBreakTap} />
                {site.dumpsters.map((_, i) => (
                  <DumpsterStation
                    key={i}
                    site={site}
                    index={i}
                    affordable={dumpstersAffordable(snap.plots[site.id], snap.scrap)}
                    onSelect={(id) => onSelectStation(id, site.id, i)}
                  />
                ))}
                {site.id === 0 && (
                  <>
                    <CrewStation {...station.crew} onSelect={select} />
                    <ToolStation {...station.tools} onSelect={select} />
                    <BonusDrop engine={engine} onOpen={onOpenBonus} />
                  </>
                )}
                {visibleWorkers
                  .filter((w) => w.plot === site.id)
                  .map((w) => (
                    <Worker key={w.id} sim={w} />
                  ))}
              </group>
            )
          })}
          <group position={[YARD_BLOCK.x, 0, YARD_BLOCK.z]}>
            <BrickYard {...station.yard} onSelect={(id) => onSelectStation(id, 0)} />
            {/* Truck upgrades live by the yard's parking bays */}
            <TruckDepot affordable={station.truck.affordable} onSelect={(id) => onSelectStation(id, 0)} />
          </group>
          <Fleet engine={engine} tiers={snap.trucks.map((t) => tierFor(truckLevel(t)))} onSelect={onSelectTruck} />
          <PlotLabels snap={snap} onPlotAction={onPlotAction} />
          <SceneReady onReady={() => onLoadProgress(100)} />
        </Suspense>
      </Canvas>
    </div>
  )
}
