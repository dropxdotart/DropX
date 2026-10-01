'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { LOT_HALF, ROAD_Z } from '@/lib/game/engine'
import Prop from './Prop'
import { Billboard } from './SiteProps'

const ROAD_TILE = 3
const ROAD_OFFSET = ROAD_Z

// Deterministic pseudo-random so the neighborhood looks the same each load.
function seeded(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

const TREES: [number, number, number][] = []
for (let i = 0; i < 46; i++) {
  const x = -30 + seeded(i) * 52
  const z = -30 + seeded(i + 100) * 52
  const inLot = Math.abs(x) < LOT_HALF + 1.5 && Math.abs(z) < LOT_HALF + 1.5
  const onRoad = Math.abs(z - ROAD_OFFSET) < 2.6 || Math.abs(x - ROAD_OFFSET) < 2.6
  const nearBuildings = (x < -LOT_HALF - 1 && Math.abs(z) < 14) || (z < -LOT_HALF - 1 && Math.abs(x) < 14)
  if (!inLot && !onRoad && !nearBuildings) TREES.push([x, z, 1.6 + seeded(i + 200) * 1.4])
}

const FENCE_SEGMENTS: { pos: [number, number, number]; rot: number }[] = []
for (let t = -LOT_HALF + 1; t <= LOT_HALF - 1; t += 2) {
  FENCE_SEGMENTS.push({ pos: [t, 0, -LOT_HALF], rot: Math.PI / 2 })
  FENCE_SEGMENTS.push({ pos: [-LOT_HALF, 0, t], rot: 0 })
  // Leave an entrance gap on the front side for trucks.
  if (Math.abs(t) > 2.5) FENCE_SEGMENTS.push({ pos: [t, 0, LOT_HALF], rot: Math.PI / 2 })
  FENCE_SEGMENTS.push({ pos: [LOT_HALF, 0, t], rot: 0 })
}

// Background cars looping along the two roads. The truck owns the near lane
// of the front road (heading +x), so front-road traffic uses the far lane.
const TRAFFIC_LIMIT = 36
const CARS: { url: string; lane: 'front' | 'sideIn' | 'sideOut'; offset: number; speed: number }[] = [
  { url: '/models/vehicles/taxi.glb', lane: 'front', offset: 0, speed: 5 },
  { url: '/models/vehicles/van.glb', lane: 'front', offset: 38, speed: 4.2 },
  { url: '/models/vehicles/sedan.glb', lane: 'sideIn', offset: 10, speed: 5.5 },
  { url: '/models/vehicles/suv.glb', lane: 'sideIn', offset: 46, speed: 4.6 },
  { url: '/models/vehicles/sedan.glb', lane: 'sideOut', offset: 25, speed: 5 },
  { url: '/models/vehicles/taxi.glb', lane: 'sideOut', offset: 60, speed: 4.4 },
]

function Traffic() {
  const refs = useRef<(THREE.Group | null)[]>([])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    CARS.forEach((car, i) => {
      const g = refs.current[i]
      if (!g) return
      const span = TRAFFIC_LIMIT * 2
      const d = ((t * car.speed + car.offset) % span) - TRAFFIC_LIMIT
      if (car.lane === 'front') g.position.set(-d, 0.02, ROAD_OFFSET + 0.65)
      else if (car.lane === 'sideIn') g.position.set(ROAD_OFFSET - 0.65, 0.02, d)
      else g.position.set(ROAD_OFFSET + 0.65, 0.02, -d)
    })
  })

  // Models face +z: front-road cars head -x, side-road lanes head ±z.
  const headings = { front: -Math.PI / 2, sideIn: 0, sideOut: Math.PI }

  return (
    <>
      {CARS.map((car, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          <Prop url={car.url} size={1.45} rotationY={headings[car.lane]} />
        </group>
      ))}
    </>
  )
}

export default function World() {
  const roads: { pos: [number, number, number]; rot: number; url: string }[] = []
  for (let t = -36; t <= 36; t += ROAD_TILE) {
    if (Math.abs(t - ROAD_OFFSET) > 0.1) {
      roads.push({ pos: [t, 0.02, ROAD_OFFSET], rot: Math.PI / 2, url: '/models/roads/road-straight.glb' })
      roads.push({ pos: [ROAD_OFFSET, 0.02, t], rot: 0, url: '/models/roads/road-straight.glb' })
    }
  }
  roads.push({ pos: [ROAD_OFFSET, 0.02, ROAD_OFFSET], rot: 0, url: '/models/roads/road-crossroad.glb' })

  return (
    <group>
      {/* Grass */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.01, 0]}>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color="#86c56b" />
      </mesh>
      {/* Sidewalk ring and the dirt lot itself */}
      <mesh position={[0, 0.0, 0]} receiveShadow>
        <boxGeometry args={[LOT_HALF * 2 + 2.4, 0.06, LOT_HALF * 2 + 2.4]} />
        <meshStandardMaterial color="#d6d2c8" />
      </mesh>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[LOT_HALF * 2, 0.06, LOT_HALF * 2]} />
        <meshStandardMaterial color="#c8ab7e" />
      </mesh>

      {roads.map((r, i) => (
        <Prop key={i} url={r.url} size={ROAD_TILE} fit="width" position={r.pos} rotationY={r.rot} />
      ))}

      {FENCE_SEGMENTS.map((f, i) => (
        <Prop key={i} url="/models/roads/construction-fence.glb" size={0.9} position={f.pos} rotationY={f.rot} />
      ))}

      {/* Site dressing near the entrance */}
      <Prop url="/models/roads/construction-light.glb" size={1.3} position={[-2.8, 0, LOT_HALF + 0.6]} />
      <Prop url="/models/roads/construction-light.glb" size={1.3} position={[2.8, 0, LOT_HALF + 0.6]} />
      <Prop url="/models/roads/construction-cone.glb" size={0.5} position={[-1.6, 0, LOT_HALF + 1]} />
      <Prop url="/models/roads/construction-cone.glb" size={0.5} position={[1.6, 0, LOT_HALF + 1]} />

      {/* Ad billboards just behind the lot, angled toward the camera. */}
      <Billboard position={[-2, 0, -LOT_HALF - 2.6]} rotationY={Math.PI / 8} />
      <Billboard position={[-LOT_HALF - 2.6, 0, -1]} rotationY={Math.PI / 2 - Math.PI / 8} />

      {/* Neighborhood behind the lot */}
      <Prop url="/models/commercial/building-skyscraper-a.glb" size={11} position={[-17, 0, -17]} />
      <Prop url="/models/commercial/building-a.glb" size={7} position={[-17, 0, -7]} rotationY={Math.PI / 2} />
      <Prop url="/models/commercial/building-c.glb" size={5} position={[-17, 0, 3]} rotationY={Math.PI / 2} />
      <Prop url="/models/commercial/building-e.glb" size={5} position={[-7, 0, -17]} />
      <Prop url="/models/suburban/building-type-c.glb" size={4} position={[3, 0, -16]} />

      {/* Houses across the two roads — kept clear of the 3-unit road bands. */}
      <Prop url="/models/suburban/building-type-f.glb" size={4.5} position={[-12, 0, ROAD_OFFSET + 5.5]} rotationY={Math.PI} />
      <Prop url="/models/suburban/building-type-a.glb" size={3.5} position={[-4, 0, ROAD_OFFSET + 5]} rotationY={Math.PI} />
      <Prop url="/models/suburban/building-type-a.glb" size={3.5} position={[ROAD_OFFSET + 5, 0, -12]} rotationY={-Math.PI / 2} />
      <Prop url="/models/suburban/building-type-c.glb" size={4} position={[ROAD_OFFSET + 5.5, 0, -3]} rotationY={-Math.PI / 2} />

      <Traffic />

      {TREES.map(([x, z, h], i) => (
        <Prop
          key={i}
          url={i % 3 === 0 ? '/models/suburban/tree-small.glb' : '/models/suburban/tree-large.glb'}
          size={h}
          position={[x, 0, z]}
          rotationY={seeded(i + 300) * Math.PI * 2}
        />
      ))}
    </group>
  )
}

for (const url of [
  '/models/roads/road-straight.glb',
  '/models/roads/road-crossroad.glb',
  '/models/roads/construction-fence.glb',
  '/models/suburban/tree-large.glb',
  '/models/suburban/tree-small.glb',
]) {
  useGLTF.preload(url)
}
