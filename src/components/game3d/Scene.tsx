'use client'

import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrthographicCamera, useProgress } from '@react-three/drei'
import * as THREE from 'three'
import { getBlueprintSize } from '@/lib/game/blueprints'
import Building, { BRICK, type BuildingHandle } from './Building'
import Worker from './Worker'
import World from './World'

const MAX_VISIBLE_CREW = 16
const CAMERA_DIR = new THREE.Vector3(1, 0.95, 1).normalize()

// Spots around the building footprint, front-facing sides first so the
// first few hires are always in view.
function crewSpots(width: number, depth: number, count: number) {
  const hx = (width * BRICK) / 2 + 1.25
  const hz = (depth * BRICK) / 2 + 1.25
  const spots: { pos: THREE.Vector3; rotY: number }[] = []
  const sides: [THREE.Vector3, THREE.Vector3][] = [
    [new THREE.Vector3(-hx, 0, hz), new THREE.Vector3(hx, 0, hz)],
    [new THREE.Vector3(hx, 0, hz), new THREE.Vector3(hx, 0, -hz)],
    [new THREE.Vector3(-hx, 0, -hz), new THREE.Vector3(-hx, 0, hz)],
    [new THREE.Vector3(hx, 0, -hz), new THREE.Vector3(-hx, 0, -hz)],
  ]
  const perSide = Math.ceil(count / 4)
  for (let n = 0; n < count; n++) {
    const side = sides[n % 4]
    const slot = Math.floor(n / 4)
    const t = (slot + 1) / (perSide + 1)
    const offset = slot % 2 === 0 ? 0 : 0.2
    const pos = side[0].clone().lerp(side[1], (t + offset) % 1 || 0.5)
    spots.push({ pos, rotY: Math.atan2(-pos.x, -pos.z) })
  }
  return spots
}

function CameraRig({ blueprint }: { blueprint: number }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const size = useThree((s) => s.size)
  const [w, h, d] = getBlueprintSize(blueprint)
  const span = Math.max(w, d, h * 1.1) * BRICK * 1.55 + 6
  const targetZoom = Math.min(size.width, size.height * 0.85) / span
  const lookAt = useMemo(() => new THREE.Vector3(0, h * BRICK * 0.3, 0), [h])

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

export default function Scene({
  blueprint,
  structureIndex,
  health,
  maxHealth,
  crew,
  onTap,
}: {
  blueprint: number
  structureIndex: number
  health: number
  maxHealth: number
  crew: number
  onTap: (clientX: number, clientY: number) => void
}) {
  const handle = useRef<BuildingHandle>({ hitPoint: null })
  const [w, , d] = getBlueprintSize(blueprint)
  const spots = useMemo(() => crewSpots(w, d, Math.min(crew, MAX_VISIBLE_CREW)), [w, d, crew])
  const crewPositions = useMemo(() => spots.map((s) => s.pos), [spots])

  const handleTap = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    handle.current.hitPoint = e.point.clone()
    onTap(e.nativeEvent.clientX, e.nativeEvent.clientY)
  }

  return (
    <>
    <LoadingOverlay />
    <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }} style={{ touchAction: 'none' }}>
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
        <Building
          blueprint={blueprint}
          structureKey={structureIndex}
          health={health}
          maxHealth={maxHealth}
          crewPositions={crewPositions}
          handle={handle}
          onTap={handleTap}
        />
        {spots.map((s, i) => (
          <Worker key={i} index={i} position={[s.pos.x, 0.04, s.pos.z]} rotationY={s.rotY} />
        ))}
      </Suspense>
    </Canvas>
    </>
  )
}
