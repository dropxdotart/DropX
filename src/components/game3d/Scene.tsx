'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrthographicCamera, useProgress } from '@react-three/drei'
import * as THREE from 'three'
import { getBlueprintSize } from '@/lib/game/blueprints'
import { BRICK, LOT_HALF, upgradeCost, type Engine, type Upgrades } from '@/lib/game/engine'
import { STATIONS, getStation, tierFor, type StationId } from '@/lib/game/stations'
import Building from './Building'
import Worker from './Worker'
import World from './World'
import { CrewStation, DumpsterStation, ToolStation, TruckStation } from './Stations'

const MAX_VISIBLE_WORKERS = 24
const CAMERA_DIR = new THREE.Vector3(1, 0.95, 1).normalize()

// Advances the simulation once per frame. Mounted first inside the canvas so
// its frame callback runs before anything that draws engine state.
function EngineTicker({ engine }: { engine: Engine }) {
  useFrame((_, delta) => engine.tick(delta))
  return null
}

function CameraRig({ blueprint, focus }: { blueprint: number; focus: StationId | null }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const size = useThree((s) => s.size)
  const [, h] = getBlueprintSize(blueprint)
  // Frame the whole lot (dumpster and truck stop included), pulling back a
  // little more for tall buildings — or glide in close on a selected
  // station, nudged down so it sits above the upgrade panel.
  const span = Math.max(LOT_HALF * 2 + 6, h * BRICK * 1.3 + 10)
  const baseZoom = Math.min(size.width, size.height * 0.8) / span
  const target = useMemo(() => {
    if (!focus) return new THREE.Vector3(0, Math.min(h * BRICK * 0.25, 3), 1.5)
    const p = getStation(focus).position
    return new THREE.Vector3(p.x, -1.5, p.z)
  }, [focus, h])
  const lookAt = useRef(target.clone())

  useFrame((_, delta) => {
    const k = Math.min(1, delta * 3)
    lookAt.current.lerp(target, k)
    camera.zoom = THREE.MathUtils.lerp(camera.zoom, focus ? baseZoom * 2.4 : baseZoom, k)
    camera.position.copy(CAMERA_DIR).multiplyScalar(60).add(lookAt.current)
    camera.lookAt(lookAt.current)
    camera.updateProjectionMatrix()
  })
  return null
}

// Reports model-loading progress up to the HUD's loading screen. Says 100 a
// beat after the last model arrives, so first-frame shader compiles happen
// behind the screen instead of flashing an empty sky. Reads drei's store
// outside render: loads start while other components render, and the hook
// would set state mid-render.
function LoadReporter({ onProgress }: { onProgress: (progress: number) => void }) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = (s: { active: boolean; progress: number }) => {
      clearTimeout(timer)
      if (!s.active && s.progress >= 100) timer = setTimeout(() => onProgress(100), 500)
      else onProgress(Math.min(95, s.progress))
    }
    check(useProgress.getState())
    const unsubscribe = useProgress.subscribe(check)
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [onProgress])
  return null
}

export default function Scene({
  engine,
  workerCount,
  blueprint,
  upgrades,
  scrap,
  focus,
  onSelectStation,
  onLoadProgress,
}: {
  engine: Engine
  workerCount: number
  blueprint: number
  upgrades: Upgrades
  scrap: number
  focus: StationId | null
  onSelectStation: (id: StationId) => void
  onLoadProgress: (progress: number) => void
}) {
  const visibleWorkers = engine.workers.slice(0, Math.min(workerCount, MAX_VISIBLE_WORKERS))
  const station = Object.fromEntries(
    STATIONS.map((s) => [
      s.id,
      {
        tier: tierFor(s.level(upgrades)),
        affordable: s.upgrades.some((k) => scrap >= upgradeCost(k, upgrades[k])),
      },
    ])
  ) as Record<StationId, { tier: number; affordable: boolean }>

  return (
    <>
      <LoadReporter onProgress={onLoadProgress} />
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }} style={{ touchAction: 'none' }}>
        <EngineTicker engine={engine} />
        <color attach="background" args={['#9fd4ef']} />
        <OrthographicCamera makeDefault near={0.1} far={400} zoom={20} position={[40, 38, 40]} />
        <CameraRig blueprint={blueprint} focus={focus} />

        <hemisphereLight args={['#e8f4ff', '#6f8f4a', 0.9]} />
        <directionalLight
          position={[18, 30, 12]}
          intensity={2.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-22}
          shadow-camera-right={22}
          shadow-camera-top={22}
          shadow-camera-bottom={-22}
          shadow-bias={-0.0005}
        />

        <Suspense fallback={null}>
          <World />
          <Building engine={engine} />
          <DumpsterStation engine={engine} {...station.dumpster} onSelect={onSelectStation} />
          <TruckStation engine={engine} {...station.truck} onSelect={onSelectStation} />
          <CrewStation {...station.crew} onSelect={onSelectStation} />
          <ToolStation {...station.tools} onSelect={onSelectStation} />
          {visibleWorkers.map((w) => (
            <Worker key={w.id} sim={w} />
          ))}
        </Suspense>
      </Canvas>
    </>
  )
}
