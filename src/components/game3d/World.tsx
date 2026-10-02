'use client'

import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { LOT_HALF, ROAD_Z } from '@/lib/game/engine'
import { BLOCK, HARBOUR_X, MAP_BLOCKS, PLOT_SLOTS, SHORE_Z, isReservedBlock } from '@/lib/game/plots'
import { ROAD_LINES, ROAD_LINES_Z } from '@/lib/game/roads'
import Prop from './Prop'
import { Billboard } from './SiteProps'

// The city: a grid of blocks with roads between them. Owned plots get a
// construction lot, plots still for sale get a fenced grass lot, and every
// other block is filler neighborhood.

const ROAD_WIDTH = 3
const EXTENT = (MAP_BLOCKS + 0.5) * BLOCK

// Deterministic pseudo-random so the city looks the same each load.
function seeded(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

const FENCE_SEGMENTS: { pos: [number, number, number]; rot: number }[] = []
for (let t = -LOT_HALF + 1; t <= LOT_HALF - 1; t += 2) {
  FENCE_SEGMENTS.push({ pos: [t, 0, -LOT_HALF], rot: Math.PI / 2 })
  FENCE_SEGMENTS.push({ pos: [-LOT_HALF, 0, t], rot: 0 })
  // Leave an entrance gap on the front side for trucks.
  if (Math.abs(t) > 2.5) FENCE_SEGMENTS.push({ pos: [t, 0, LOT_HALF], rot: Math.PI / 2 })
  FENCE_SEGMENTS.push({ pos: [LOT_HALF, 0, t], rot: 0 })
}

// ── Roads ────────────────────────────────────────────────────────────────

const asphalt = new THREE.MeshStandardMaterial({ color: '#646b76', roughness: 0.95 })
const paint = new THREE.MeshStandardMaterial({ color: '#eef1f4', roughness: 0.8 })

function Roads() {
  // Streets along x stop at the waterfront; cross streets run from the
  // quay to the near edge of the map.
  const lengthX = EXTENT * 2 + ROAD_WIDTH
  const crossStart = SHORE_Z + 0.6
  const crossEnd = EXTENT + ROAD_WIDTH / 2
  const dashes = useRef<THREE.InstancedMesh>(null)

  // Centre dashes, skipping the crossings.
  const dashPositions = useMemo(() => {
    const out: { x: number; z: number; alongX: boolean }[] = []
    for (let t = -EXTENT; t <= EXTENT; t += 2) {
      for (const line of ROAD_LINES_Z) {
        if (!ROAD_LINES.some((c) => Math.abs(c - t) < ROAD_WIDTH)) out.push({ x: t, z: line, alongX: true })
      }
      for (const line of ROAD_LINES) {
        if (t > crossStart + 1 && !ROAD_LINES_Z.some((c) => Math.abs(c - t) < ROAD_WIDTH)) out.push({ x: line, z: t, alongX: false })
      }
    }
    return out
  }, [crossStart])

  useLayoutEffect(() => {
    const mesh = dashes.current
    if (!mesh) return
    const o = new THREE.Object3D()
    dashPositions.forEach((d, i) => {
      o.position.set(d.x, 0.045, d.z)
      o.rotation.set(0, d.alongX ? 0 : Math.PI / 2, 0)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [dashPositions])

  return (
    <group>
      {ROAD_LINES_Z.map((z) => (
        <mesh key={`z${z}`} material={asphalt} position={[0, 0.02, z]} receiveShadow>
          <boxGeometry args={[lengthX, 0.04, ROAD_WIDTH]} />
        </mesh>
      ))}
      {ROAD_LINES.map((x) => (
        <mesh key={`x${x}`} material={asphalt} position={[x, 0.021, (crossStart + crossEnd) / 2]} receiveShadow>
          <boxGeometry args={[ROAD_WIDTH, 0.04, crossEnd - crossStart]} />
        </mesh>
      ))}
      <instancedMesh
        ref={dashes}
        args={[undefined, paint, dashPositions.length]}
        frustumCulled={false}
        receiveShadow
      >
        <boxGeometry args={[0.9, 0.012, 0.12]} />
      </instancedMesh>
    </group>
  )
}

// ── Shoreline ────────────────────────────────────────────────────────────

// The city is an island. Land runs from the top shore (SHORE_Z, by the
// Brick Yard) to LAND_EDGE on the other three sides; water lies under
// everything around it. The top is a sandy beach; the bottom and left
// edges are a stone quay.
const LAND_EDGE = EXTENT + 2.7
const BEACH_WIDTH = 6
// None right behind the Brick Yard: it grows back onto a pier there.
const UMBRELLAS = [-44, -31, -19, 19, 33, 47]

function Shoreline() {
  const buoys = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const g = buoys.current
    if (!g) return
    const t = clock.getElapsedTime()
    g.children.forEach((b, i) => {
      b.position.y = 0.1 + Math.sin(t * 1.4 + i * 1.7) * 0.08
      b.rotation.z = Math.sin(t * 1.1 + i) * 0.12
    })
  })
  const span = LAND_EDGE * 2
  const quay = '#b9b2a4'
  return (
    <group>
      {/* Water under everything */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#3d9fd6" roughness={0.35} metalness={0.05} />
      </mesh>

      {/* Top: sandy beach sloping into shallow water */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, SHORE_Z - BEACH_WIDTH / 2]} receiveShadow>
        <planeGeometry args={[span, BEACH_WIDTH]} />
        <meshStandardMaterial color="#ecd9a6" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, SHORE_Z - BEACH_WIDTH - 2]}>
        <planeGeometry args={[span, 4]} />
        <meshStandardMaterial color="#7fcbe8" roughness={0.4} />
      </mesh>
      {UMBRELLAS.map((x, i) => (
        <group key={x} position={[x, 0, SHORE_Z - 2.2 - (i % 2) * 1.6]}>
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 1.8, 6]} />
            <meshStandardMaterial color="#f4f1ea" />
          </mesh>
          <mesh position={[0, 1.75, 0]} castShadow>
            <coneGeometry args={[1, 0.45, 8]} />
            <meshStandardMaterial color={['#ff6b1a', '#2d7ff9', '#f2c230', '#3fbf4a'][i % 4]} />
          </mesh>
          <mesh position={[0.9, 0.02, 0.3]} rotation={[0, 0.3, 0]}>
            <boxGeometry args={[0.7, 0.03, 1.5]} />
            <meshStandardMaterial color={['#f4f1ea', '#e23f3f', '#2d7ff9', '#ffc93c'][i % 4]} />
          </mesh>
        </group>
      ))}

      {/* Bottom and left: stone quay into plain water */}
      <mesh position={[0, 0.03, LAND_EDGE - 0.7]} receiveShadow>
        <boxGeometry args={[span, 0.16, 1.4]} />
        <meshStandardMaterial color={quay} roughness={0.9} />
      </mesh>
      {/* Right edge: quay, open in the middle where the harbour joins on */}
      {[
        [SHORE_Z, -HARBOUR_HALF_Z],
        [HARBOUR_HALF_Z, LAND_EDGE],
      ].map(([z0, z1]) => (
        <mesh key={z0} position={[LAND_EDGE - 0.7, 0.03, (z0 + z1) / 2]} receiveShadow>
          <boxGeometry args={[1.4, 0.16, z1 - z0]} />
          <meshStandardMaterial color={quay} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[-LAND_EDGE + 0.7, 0.03, (SHORE_Z + LAND_EDGE) / 2]} receiveShadow>
        <boxGeometry args={[1.4, 0.16, LAND_EDGE - SHORE_Z]} />
        <meshStandardMaterial color={quay} roughness={0.9} />
      </mesh>

      <group ref={buoys}>
        {[
          [-30, LAND_EDGE + 5],
          [-6, LAND_EDGE + 8],
          [19, LAND_EDGE + 5],
          [HARBOUR_EDGE_X + 6, 10],
          [HARBOUR_EDGE_X + 5, -25],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.1, z]} castShadow>
            <cylinderGeometry args={[0.35, 0.45, 0.6, 10]} />
            <meshStandardMaterial color={i % 2 ? '#ff6b1a' : '#f4f1ea'} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// ── Harbour district ─────────────────────────────────────────────────────

// Big lots on a concrete quay off the east edge of the city, for the
// biggest buildings: streets run out to it, cranes lean over the water
// and shipping containers are stacked along the edge.
const HARBOUR_HALF_Z = 1.5 * BLOCK + 1.5
const HARBOUR_EDGE_X = HARBOUR_X + BLOCK / 2 + 3.5
const CONTAINER_COLORS = ['#d64545', '#2f5f9e', '#ef7d2d', '#3fa064', '#f2c230']

function Harbour() {
  const deckX0 = EXTENT + ROAD_WIDTH / 2 - 0.5
  const lines = [-1.5 * BLOCK, -0.5 * BLOCK, 0.5 * BLOCK, 1.5 * BLOCK]
  const crossX = HARBOUR_X + BLOCK / 2
  return (
    <group>
      {/* Quay deck */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[(deckX0 + HARBOUR_EDGE_X) / 2, -0.005, 0]}>
        <planeGeometry args={[HARBOUR_EDGE_X - deckX0, HARBOUR_HALF_Z * 2]} />
        <meshStandardMaterial color="#c4c0b6" roughness={0.95} />
      </mesh>
      {/* Edge kerb all round */}
      {[
        { p: [HARBOUR_EDGE_X - 0.5, 0.03, 0], s: [1, 0.2, HARBOUR_HALF_Z * 2] },
        { p: [(deckX0 + HARBOUR_EDGE_X) / 2, 0.03, -HARBOUR_HALF_Z + 0.5], s: [HARBOUR_EDGE_X - deckX0, 0.2, 1] },
        { p: [(deckX0 + HARBOUR_EDGE_X) / 2, 0.03, HARBOUR_HALF_Z - 0.5], s: [HARBOUR_EDGE_X - deckX0, 0.2, 1] },
      ].map((k, i) => (
        <mesh key={i} position={k.p as [number, number, number]} receiveShadow>
          <boxGeometry args={k.s as [number, number, number]} />
          <meshStandardMaterial color="#9a958b" />
        </mesh>
      ))}
      {/* Streets out from the city, and one along the far side */}
      {lines.map((z) => (
        <mesh key={z} material={asphalt} position={[(deckX0 + crossX + ROAD_WIDTH / 2) / 2, 0.02, z]} receiveShadow>
          <boxGeometry args={[crossX + ROAD_WIDTH / 2 - deckX0, 0.04, ROAD_WIDTH]} />
        </mesh>
      ))}
      <mesh material={asphalt} position={[crossX, 0.021, 0]} receiveShadow>
        <boxGeometry args={[ROAD_WIDTH, 0.04, lines[3] - lines[0] + ROAD_WIDTH]} />
      </mesh>
      {/* Gantry cranes leaning out over the water */}
      {[-BLOCK, 0.35 * BLOCK].map((z) => (
        <group key={z} position={[HARBOUR_EDGE_X - 1.6, 0, z]}>
          {[-1.4, 1.4].map((dz) => (
            <mesh key={dz} position={[0, 4, dz]} castShadow>
              <boxGeometry args={[0.4, 8, 0.4]} />
              <meshStandardMaterial color="#e0b020" />
            </mesh>
          ))}
          <mesh position={[2.6, 8.2, 0]} castShadow>
            <boxGeometry args={[9, 0.6, 3.4]} />
            <meshStandardMaterial color="#f2c230" />
          </mesh>
          <mesh position={[-1.4, 8.6, 0]} castShadow>
            <boxGeometry args={[1.8, 1.2, 2]} />
            <meshStandardMaterial color="#5b6470" />
          </mesh>
          <mesh position={[5, 6.2, 0]}>
            <boxGeometry args={[0.06, 4, 0.06]} />
            <meshStandardMaterial color="#2b2b2e" />
          </mesh>
        </group>
      ))}
      {/* Shipping containers stacked along the water's edge */}
      {Array.from({ length: 9 }, (_, i) => {
        const z = -HARBOUR_HALF_Z + 3 + i * 7.6
        const h = 1 + ((i * 7) % 3)
        return Array.from({ length: h }, (_, k) => (
          <mesh key={`${i}-${k}`} position={[HARBOUR_EDGE_X - 2.4, 0.55 + k * 1.05, z]} castShadow>
            <boxGeometry args={[1.1, 1, 3]} />
            <meshStandardMaterial color={CONTAINER_COLORS[(i + k * 2) % CONTAINER_COLORS.length]} roughness={0.7} />
          </mesh>
        ))
      })}
      {/* Bollards */}
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} position={[HARBOUR_EDGE_X - 0.6, 0.3, -HARBOUR_HALF_Z + 2 + i * 6.2]}>
          <cylinderGeometry args={[0.18, 0.22, 0.4, 8]} />
          <meshStandardMaterial color="#2b2b2e" />
        </mesh>
      ))}
    </group>
  )
}

// ── Lots ─────────────────────────────────────────────────────────────────

function Sidewalk({ dirt }: { dirt: boolean }) {
  return (
    <>
      <mesh position={[0, 0.0, 0]} receiveShadow>
        <boxGeometry args={[LOT_HALF * 2 + 2.4, 0.06, LOT_HALF * 2 + 2.4]} />
        <meshStandardMaterial color="#d6d2c8" />
      </mesh>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[LOT_HALF * 2, 0.06, LOT_HALF * 2]} />
        <meshStandardMaterial color={dirt ? '#c8ab7e' : '#93cc76'} />
      </mesh>
    </>
  )
}

// An owned plot: the fenced dirt construction site.
function ConstructionLot() {
  return (
    <group>
      <Sidewalk dirt />
      {FENCE_SEGMENTS.map((f, i) => (
        <Prop key={i} url="/models/roads/construction-fence.glb" size={0.9} position={f.pos} rotationY={f.rot} />
      ))}
      <Prop url="/models/roads/construction-light.glb" size={1.3} position={[-2.8, 0, LOT_HALF + 0.6]} />
      <Prop url="/models/roads/construction-light.glb" size={1.3} position={[2.8, 0, LOT_HALF + 0.6]} />
      <Prop url="/models/roads/construction-cone.glb" size={0.5} position={[-1.6, 0, LOT_HALF + 1]} />
      <Prop url="/models/roads/construction-cone.glb" size={0.5} position={[1.6, 0, LOT_HALF + 1]} />
    </group>
  )
}

// A plot you don't own yet: grass behind a low fence, with a For Sale board
// (the price label itself is HTML, drawn by PlotLabels).
function ForSaleLot() {
  const e = LOT_HALF - 0.3
  const rails: { pos: [number, number, number]; size: [number, number, number] }[] = [
    { pos: [0, 0.45, e], size: [e * 2, 0.12, 0.12] },
    { pos: [0, 0.45, -e], size: [e * 2, 0.12, 0.12] },
    { pos: [e, 0.45, 0], size: [0.12, 0.12, e * 2] },
    { pos: [-e, 0.45, 0], size: [0.12, 0.12, e * 2] },
  ]
  const posts: [number, number, number][] = []
  for (let t = -e; t <= e + 0.01; t += (e * 2) / 6) {
    posts.push([t, 0.3, e], [t, 0.3, -e], [e, 0.3, t], [-e, 0.3, t])
  }
  return (
    <group>
      <Sidewalk dirt={false} />
      {rails.map((r, i) => (
        <mesh key={i} position={r.pos} castShadow>
          <boxGeometry args={r.size} />
          <meshStandardMaterial color="#f4f1ea" />
        </mesh>
      ))}
      {posts.map((p, i) => (
        <mesh key={i} position={p} castShadow>
          <boxGeometry args={[0.16, 0.6, 0.16]} />
          <meshStandardMaterial color="#f4f1ea" />
        </mesh>
      ))}
      <mesh position={[0, 0.9, LOT_HALF - 1.2]} castShadow>
        <boxGeometry args={[0.15, 1.8, 0.15]} />
        <meshStandardMaterial color="#7a5a3a" />
      </mesh>
      <mesh position={[0, 1.7, LOT_HALF - 1.1]} castShadow>
        <boxGeometry args={[2.2, 1.1, 0.1]} />
        <meshStandardMaterial color="#e23f3f" />
      </mesh>
    </group>
  )
}

// ── Filler neighbourhood ─────────────────────────────────────────────────

const DOWNTOWN = [
  { url: '/models/commercial/building-skyscraper-a.glb', size: 11 },
  { url: '/models/commercial/building-a.glb', size: 7 },
  { url: '/models/commercial/building-c.glb', size: 5 },
  { url: '/models/commercial/building-e.glb', size: 5 },
]
const SUBURB = [
  { url: '/models/suburban/building-type-a.glb', size: 3.5 },
  { url: '/models/suburban/building-type-c.glb', size: 4 },
  { url: '/models/suburban/building-type-f.glb', size: 4.5 },
]
const SPOTS: [number, number][] = [
  [-5, -5],
  [5, -5],
  [-5, 5],
  [5, 5],
]

function FillerBlock({ bx, bz, seed }: { bx: number; bz: number; seed: number }) {
  // Blocks behind home read as downtown; further out it's suburbs and parks.
  const behind = bx <= 0 && bz <= 0
  const kind = behind && seeded(seed) < 0.75 ? 'downtown' : seeded(seed + 1) < 0.8 ? 'suburb' : 'park'
  const items = useMemo(() => {
    const out: { url: string; size: number; pos: [number, number, number]; rot: number }[] = []
    SPOTS.forEach(([sx, sz], n) => {
      const r = seeded(seed * 7 + n)
      const pos: [number, number, number] = [sx + (r - 0.5) * 2, 0, sz + (seeded(seed * 3 + n) - 0.5) * 2]
      // Face the nearest road (front +z or right +x side of the block).
      const rot = sz > 0 ? Math.PI : sx > 0 ? -Math.PI / 2 : 0
      if (kind === 'downtown' && r < 0.85) {
        const m = DOWNTOWN[Math.floor(seeded(seed + n * 13) * DOWNTOWN.length)]
        out.push({ ...m, pos, rot })
      } else if (kind === 'suburb' && r < 0.8) {
        const m = SUBURB[Math.floor(seeded(seed + n * 17) * SUBURB.length)]
        out.push({ ...m, pos, rot })
      } else {
        out.push({ url: r < 0.5 ? '/models/suburban/tree-large.glb' : '/models/suburban/tree-small.glb', size: 2 + r * 1.4, pos, rot: r * 6 })
      }
    })
    // A few trees along the edges.
    for (let n = 0; n < 3; n++) {
      const a = seeded(seed * 11 + n)
      const b = seeded(seed * 5 + n)
      out.push({
        url: '/models/suburban/tree-large.glb',
        size: 1.6 + a * 1.2,
        pos: [(a - 0.5) * 16, 0, b < 0.5 ? -9 : 9],
        rot: b * 6,
      })
    }
    return out
  }, [kind, seed])

  return (
    <group position={[bx, 0, bz]}>
      {items.map((it, i) => (
        <Prop key={i} url={it.url} size={it.size} position={it.pos} rotationY={it.rot} />
      ))}
    </group>
  )
}

// ── Traffic ──────────────────────────────────────────────────────────────

// Background cars looping along the roads. Trucks own the near lane of each
// plot's front road (heading +x), so cross-town traffic uses the far lane.
type Car = { url: string; axis: 'x' | 'z'; line: number; dir: 1 | -1; offset: number; speed: number }
const CAR_MODELS = ['/models/vehicles/taxi.glb', '/models/vehicles/van.glb', '/models/vehicles/sedan.glb', '/models/vehicles/suv.glb']
const CARS: Car[] = [
  { axis: 'x', line: ROAD_Z, dir: -1 },
  { axis: 'x', line: ROAD_Z, dir: -1 },
  { axis: 'x', line: ROAD_Z - BLOCK, dir: -1 },
  { axis: 'x', line: ROAD_Z + BLOCK, dir: -1 },
  { axis: 'z', line: ROAD_Z, dir: 1 },
  { axis: 'z', line: ROAD_Z, dir: -1 },
  { axis: 'z', line: ROAD_Z - BLOCK, dir: 1 },
  { axis: 'z', line: ROAD_Z - BLOCK, dir: -1 },
  { axis: 'z', line: ROAD_Z + BLOCK, dir: -1 },
  { axis: 'x', line: ROAD_Z - 2 * BLOCK, dir: -1 },
].map((c, i) => ({
  ...c,
  axis: c.axis as 'x' | 'z',
  dir: c.dir as 1 | -1,
  url: CAR_MODELS[i % CAR_MODELS.length],
  offset: seeded(i + 40) * EXTENT * 2,
  speed: 4 + seeded(i + 60) * 1.8,
}))

function Traffic() {
  const refs = useRef<(THREE.Group | null)[]>([])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    CARS.forEach((car, i) => {
      const g = refs.current[i]
      if (!g) return
      const span = EXTENT * 2
      const d = (((t * car.speed + car.offset) % span) - EXTENT) * car.dir
      if (car.axis === 'x') g.position.set(d, 0.02, car.line + 0.65)
      else g.position.set(car.line - 0.65 * car.dir, 0.02, d)
    })
  })

  return (
    <>
      {CARS.map((car, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          {/* Models face +z. */}
          <Prop
            url={car.url}
            size={1.45}
            rotationY={car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : car.dir > 0 ? 0 : Math.PI}
          />
        </group>
      ))}
    </>
  )
}

export default function World({ ownedPlots }: { ownedPlots: number }) {
  const blocks = useMemo(() => {
    const out: { x: number; z: number; seed: number }[] = []
    for (let i = -MAP_BLOCKS; i <= MAP_BLOCKS; i++) {
      for (let j = -MAP_BLOCKS; j <= MAP_BLOCKS; j++) {
        const x = i * BLOCK
        const z = j * BLOCK
        if (!isReservedBlock(x, z)) out.push({ x, z, seed: (i + 10) * 31 + (j + 10) })
      }
    }
    return out
  }, [])

  return (
    <group>
      {/* The island's grass, from the beach to the quays */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.01, (SHORE_Z + LAND_EDGE) / 2]}>
        <planeGeometry args={[LAND_EDGE * 2, LAND_EDGE - SHORE_Z]} />
        <meshStandardMaterial color="#86c56b" />
      </mesh>
      <Shoreline />

      <Roads />
      <Harbour />

      {PLOT_SLOTS.map((slot) => (
        <group key={slot.id} position={[slot.x, 0, slot.z]}>
          {slot.id < ownedPlots ? <ConstructionLot /> : <ForSaleLot />}
        </group>
      ))}

      {/* Ad billboards across the roads behind the home lot, angled toward
          the camera. */}
      <Billboard position={[-6, 0, -ROAD_Z - 2.2]} rotationY={Math.PI / 8} />
      <Billboard position={[-ROAD_Z - 2.2, 0, -1]} rotationY={Math.PI / 2 - Math.PI / 8} />

      {blocks.map((b) => (
        <FillerBlock key={`${b.x},${b.z}`} bx={b.x} bz={b.z} seed={b.seed} />
      ))}

      <Traffic />
    </group>
  )
}

for (const url of [
  '/models/roads/construction-fence.glb',
  '/models/suburban/tree-large.glb',
  '/models/suburban/tree-small.glb',
  ...DOWNTOWN.map((m) => m.url),
  ...SUBURB.map((m) => m.url),
]) {
  useGLTF.preload(url)
}
