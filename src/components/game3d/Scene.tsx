'use client'

import { Suspense, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrthographicCamera, useProgress } from '@react-three/drei'
import * as THREE from 'three'
import { getBlueprintSize } from '@/lib/game/blueprints'
import { BRICK, LOT_HALF, type Engine } from '@/lib/game/engine'
import Building from './Building'
import Worker from './Worker'
import World from './World'
import { Dumpster, Truck } from './SiteProps'

const MAX_VISIBLE_WORKERS = 24
const CAMERA_DIR = new THREE.Vector3(1, 0.95, 1).normalize()

// Advances the simulation once per frame. Mounted first inside the canvas so
// its frame callback runs before anything that draws engine state.
function EngineTicker({ engine }: { engine: Engine }) {
  useFrame((_, delta) => engine.tick(delta))
  return null
}

function CameraRig({ blueprint }: { blueprint: number }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const size = useThree((s) => s.size)
  const [, h] = getBlueprintSize(blueprint)
  // Frame the whole lot (dumpster and truck stop included), pulling back a
  // little more for tall buildings.
  const span = Math.max(LOT_HALF * 2 + 6, h * BRICK * 1.3 + 10)
  const targetZoom = Math.min(size.width, size.height * 0.8) / span
  const lookAt = useMemo(() => new THREE.Vector3(0, Math.min(h * BRICK * 0.25, 3), 1.5), [h])

  useFrame((_, delta) => {
    camera.zoom = THREE.MathUtils.lerp(camera.zoom, targetZoom, Math.min(1, delta * 2.5))
    camera.position.copy(CAMERA_DIR).multiplyScalar(60).add(lookAt)
    camera.lookAt(lookAt)
    camera.updateProjectionMatrix()
  })
  return null
}

function LoadingOverlay() {
  const { active, progress } = useProgress()
  if (!active && progress >= 100) return null
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#9fd4ef]">
      <p className="font-display text-3xl text-white [text-shadow:0_3px_0_#1d3a6e]">Rubble</p>
      <div className="h-3 w-48 overflow-hidden rounded-full bg-[#1d3a6e]">
        <div className="h-full bg-[#ff6b1a] transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      <p className="font-display text-sm text-[#1d3a6e]">Setting up the site…</p>
    </div>
  )
}

export default function Scene({ engine, workerCount, blueprint }: { engine: Engine; workerCount: number; blueprint: number }) {
  const visibleWorkers = engine.workers.slice(0, Math.min(workerCount, MAX_VISIBLE_WORKERS))

  return (
    <>
      <LoadingOverlay />
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }} style={{ touchAction: 'none' }}>
        <EngineTicker engine={engine} />
        <color attach="background" args={['#9fd4ef']} />
        <OrthographicCamera makeDefault near={0.1} far={400} zoom={20} position={[40, 38, 40]} />
        <CameraRig blueprint={blueprint} />

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
          <Dumpster engine={engine} />
          <Truck engine={engine} />
          {visibleWorkers.map((w) => (
            <Worker key={w.id} sim={w} />
          ))}
        </Suspense>
      </Canvas>
    </>
  )
}
