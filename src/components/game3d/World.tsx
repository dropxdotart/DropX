'use client'

import { useGLTF } from '@react-three/drei'
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
      <Prop url="/models/vehicles/tractor-shovel.glb" size={1.6} position={[LOT_HALF - 1.4, 0, -LOT_HALF + 1.6]} rotationY={-Math.PI / 4} />

      {/* Ad billboards just behind the lot, angled toward the camera. */}
      <Billboard position={[-2, 0, -LOT_HALF - 2.6]} rotationY={Math.PI / 8} />
      <Billboard position={[-LOT_HALF - 2.6, 0, -1]} rotationY={Math.PI / 2 - Math.PI / 8} />

      {/* Neighborhood behind the lot */}
      <Prop url="/models/commercial/building-skyscraper-a.glb" size={11} position={[-17, 0, -17]} />
      <Prop url="/models/commercial/building-a.glb" size={7} position={[-17, 0, -7]} rotationY={Math.PI / 2} />
      <Prop url="/models/commercial/building-c.glb" size={5} position={[-17, 0, 3]} rotationY={Math.PI / 2} />
      <Prop url="/models/commercial/building-e.glb" size={5} position={[-7, 0, -17]} />
      <Prop url="/models/suburban/building-type-c.glb" size={4} position={[4, 0, -16]} />
      <Prop url="/models/suburban/building-type-f.glb" size={4.5} position={[-16, 0, 11]} rotationY={Math.PI / 2} />
      <Prop url="/models/suburban/building-type-a.glb" size={3.5} position={[11, 0, -16]} />

      {/* Parked cars along the front road */}
      <Prop url="/models/vehicles/taxi.glb" size={1.5} position={[-6, 0, ROAD_OFFSET + 0.7]} rotationY={Math.PI / 2} />
      <Prop url="/models/vehicles/sedan.glb" size={1.5} position={[ROAD_OFFSET - 0.7, 0, -9]} />

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
