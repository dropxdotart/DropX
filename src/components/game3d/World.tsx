'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { LOT_HALF } from '@/lib/game/engine'
import { BLOCK, BRIDGES, HARBOUR, HARBOUR_X, ISLANDS, ROADS, islandRect, type Island, type IslandId, type Segment } from '@/lib/game/islands'
import { PLOT_SLOTS, isReservedBlock } from '@/lib/game/plots'
import Prop from './Prop'
import { Billboard } from './SiteProps'

// The world: islands on one grid of blocks, roads between the blocks and
// bridges between the islands. Owned plots get a construction lot, plots
// still for sale a fenced grass lot, and every other block is filler —
// suburbs on the Houses island, downtown on the City, works and sheds on
// the Industrial island.

const ROAD_WIDTH = 3
const QUAY = 2.7 // land past the outer roads
const BEACH_WIDTH = 6

// Deterministic pseudo-random so the world looks the same each load.
function seeded(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

// An island's land, edge to edge (north edge is the beach).
function landRect(s: Island) {
  return {
    x0: (s.i0 - 0.5) * BLOCK - QUAY,
    x1: (s.i1 + 0.5) * BLOCK + QUAY,
    z0: (s.j0 - 0.5) * BLOCK - 1.2,
    z1: (s.j1 + 0.5) * BLOCK + QUAY,
  }
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

function Roads({ built }: { built: (s: Segment) => boolean }) {
  const segs = ROADS.filter((r) => !r.bridge && built(r))
  const dashes = useRef<THREE.InstancedMesh>(null)

  // Centre dashes, skipping crossings.
  const dashPositions = useMemo(() => {
    const out: { x: number; z: number; alongX: boolean }[] = []
    for (const seg of segs) {
      for (let t = seg.from + 1; t <= seg.until - 1; t += 2) {
        const crossing = ROADS.some((o) => o.axis !== seg.axis && Math.abs(o.line - t) < ROAD_WIDTH && seg.line >= o.from - 1 && seg.line <= o.until + 1)
        if (crossing) continue
        out.push(seg.axis === 'z' ? { x: t, z: seg.line, alongX: true } : { x: seg.line, z: t, alongX: false })
      }
    }
    return out
  }, [segs])

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
      {segs.map((seg, i) => {
        const len = seg.until - seg.from + ROAD_WIDTH
        const mid = (seg.from + seg.until) / 2
        return (
          <mesh
            key={i}
            material={asphalt}
            position={seg.axis === 'z' ? [mid, 0.02, seg.line] : [seg.line, 0.021, mid]}
            receiveShadow
          >
            <boxGeometry args={seg.axis === 'z' ? [len, 0.04, ROAD_WIDTH] : [ROAD_WIDTH, 0.04, len]} />
          </mesh>
        )
      })}
      <instancedMesh key={dashPositions.length} ref={dashes} args={[undefined, paint, dashPositions.length]} frustumCulled={false} receiveShadow>
        <boxGeometry args={[0.9, 0.012, 0.12]} />
      </instancedMesh>
    </group>
  )
}

// ── Bridges ──────────────────────────────────────────────────────────────

// A built bridge: a deck over the water with railings and piers. While it's
// being built: piers going up, a crane and the deck half done.
function Bridge({ b, state }: { b: (typeof BRIDGES)[number]; state: 'built' | 'building' | 'none' }) {
  if (state === 'none') return null
  const len = b.until - b.from
  const mid = (b.from + b.until) / 2
  const alongX = b.axis === 'z'
  const done = state === 'built'
  const deckLen = done ? len + ROAD_WIDTH : len * 0.45
  const deckMid = done ? mid : b.from + deckLen / 2
  const at = (t: number, off: number, y: number): [number, number, number] => (alongX ? [t, y, b.line + off] : [b.line + off, y, t])
  const box = (t: number, off: number, y: number, l: number, w: number, h: number, color: string, key: string) => (
    <mesh key={key} position={at(t, off, y)} castShadow receiveShadow>
      <boxGeometry args={alongX ? [l, h, w] : [w, h, l]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
  return (
    <group>
      {box(deckMid, 0, 0.0, deckLen, ROAD_WIDTH + 1.4, 0.3, '#9aa0a8', 'deck')}
      {done && box(deckMid, 0, 0.17, deckLen, ROAD_WIDTH, 0.04, '#646b76', 'road')}
      {done && [-1, 1].map((sd) => box(mid, sd * (ROAD_WIDTH / 2 + 0.55), 0.55, len + ROAD_WIDTH, 0.15, 0.5, '#f4f1ea', `rail${sd}`))}
      {/* Piers down into the water */}
      {Array.from({ length: Math.max(2, Math.floor(len / 6)) }, (_, k) => b.from + ((k + 1) * len) / (Math.floor(len / 6) + 1)).map((t, k) =>
        done || t < b.from + deckLen + 3 ? box(t, 0, -1.4, 1, ROAD_WIDTH, 2.6, '#7d8794', `pier${k}`) : null
      )}
      {!done && (
        <>
          {/* Construction: a crane on the deck end and cones */}
          {box(b.from + deckLen, 1.8, 3.5, 0.4, 0.4, 7, '#e0b020', 'mast')}
          {box(b.from + deckLen + 2.5, 1.8, 7, 6, 0.6, 0.4, '#f2c230', 'jib')}
          {[-1, 1].map((sd) => box(b.from + deckLen - 0.4, sd * 1.2, 0.45, 0.3, 0.3, 0.5, '#ef7d2d', `cone${sd}`))}
        </>
      )}
    </group>
  )
}

// ── Shorelines ───────────────────────────────────────────────────────────

const UMBRELLA_COLORS = ['#ff6b1a', '#2d7ff9', '#f2c230', '#3fbf4a']

function Umbrella({ x, z, i }: { x: number; z: number; i: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 1.8, 6]} />
        <meshStandardMaterial color="#f4f1ea" />
      </mesh>
      <mesh position={[0, 1.75, 0]} castShadow>
        <coneGeometry args={[1, 0.45, 8]} />
        <meshStandardMaterial color={UMBRELLA_COLORS[i % 4]} />
      </mesh>
      <mesh position={[0.9, 0.02, 0.3]} rotation={[0, 0.3, 0]}>
        <boxGeometry args={[0.7, 0.03, 1.5]} />
        <meshStandardMaterial color={['#f4f1ea', '#e23f3f', '#2d7ff9', '#ffc93c'][i % 4]} />
      </mesh>
    </group>
  )
}

// Little sailboats bobbing offshore.
function Boats({ spots }: { spots: [number, number, number][] }) {
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const t = clock.getElapsedTime()
    g.children.forEach((b, i) => {
      b.position.y = Math.sin(t * 1.2 + i * 1.7) * 0.12
      b.rotation.z = Math.sin(t * 0.9 + i) * 0.06
    })
  })
  return (
    <group ref={group}>
      {spots.map(([x, z, rot], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, rot, 0]}>
          <mesh position={[0, 0.1, 0]} castShadow>
            <boxGeometry args={[1.1, 0.45, 3]} />
            <meshStandardMaterial color={i % 2 ? '#f4f1ea' : '#2d7ff9'} />
          </mesh>
          <mesh position={[0, 1.6, 0.2]}>
            <boxGeometry args={[0.08, 2.8, 0.08]} />
            <meshStandardMaterial color="#8a5a30" />
          </mesh>
          <mesh position={[0, 1.6, -0.45]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[1.3, 2.4]} />
            <meshStandardMaterial color={i % 3 ? '#ffffff' : '#ff6b1a'} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// An island's grass and its shores. The Houses island is a beach town with
// sand and umbrellas all the way round; the others have a beach on the
// north shore and stone quays on their other sides.
function IslandLand({ s }: { s: Island }) {
  const r = landRect(s)
  const grass = s.id === 'industrial' ? '#a9b39a' : s.id === 'houses' ? '#8fcf72' : '#86c56b'
  const quay = '#b9b2a4'
  const sand = s.id === 'industrial' ? '#cfc6ad' : '#ecd9a6'
  const beachTown = s.id === 'houses'
  const w = r.x1 - r.x0
  const d = r.z1 - r.z0
  const cx = (r.x0 + r.x1) / 2
  const cz = (r.z0 + r.z1) / 2
  const B = BEACH_WIDTH
  // Umbrellas along the beaches, away from the yard and the bridge.
  const umbrellas = useMemo(() => {
    const out: [number, number][] = []
    const clear = (x: number, z: number) => Math.hypot(x - s.yard.x, z - s.yard.z) > 16 && !BRIDGES.some((b) => (b.axis === 'x' ? Math.abs(x - b.line) < 6 : Math.abs(z - b.line) < 6))
    for (let x = r.x0 + 8; x < r.x1 - 6; x += 12) {
      if (clear(x, r.z0)) out.push([x, r.z0 - 2.2 - (out.length % 2) * 1.6])
      if (beachTown && clear(x, r.z1)) out.push([x, r.z1 + 2.2 + (out.length % 2) * 1.6])
    }
    if (beachTown)
      for (let z = r.z0 + 8; z < r.z1 - 6; z += 12) {
        out.push([r.x0 - 2.2 - (out.length % 2) * 1.6, z])
        out.push([r.x1 + 2.2 + (out.length % 2) * 1.6, z])
      }
    return out
  }, [r.x0, r.x1, r.z0, r.z1, s.yard.x, s.yard.z, beachTown])
  const boats = useMemo<[number, number, number][]>(
    () =>
      beachTown
        ? [
            [r.x0 - 14, cz - 20, 0.4],
            [r.x0 - 12, cz + 25, -0.3],
            [r.x1 + 13, cz - 10, 1.2],
            [r.x1 + 15, cz + 30, 0.2],
            [cx - 30, r.z1 + 14, 1.5],
            [cx + 20, r.z1 + 16, 1.7],
          ]
        : [],
    [beachTown, r.x0, r.x1, r.z1, cx, cz]
  )
  const strip = (pos: [number, number], size: [number, number], color: string, y: number, key: string) => (
    <mesh key={key} rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[pos[0], y, pos[1]]}>
      <planeGeometry args={size} />
      <meshStandardMaterial color={color} roughness={color === sand ? 1 : 0.4} />
    </mesh>
  )
  return (
    <group>
      {strip([cx, cz], [w, d], grass, -0.01, 'grass')}
      {/* North shore: beach sloping into shallow water */}
      {strip([cx, r.z0 - B / 2], [w + (beachTown ? 2 * B : 0), B], sand, -0.02, 'nb')}
      {strip([cx, r.z0 - B - 2], [w + (beachTown ? 2 * B + 8 : 0), 4], '#7fcbe8', -0.04, 'nw')}
      {beachTown ? (
        <>
          {strip([cx, r.z1 + B / 2], [w + 2 * B, B], sand, -0.02, 'sb')}
          {strip([cx, r.z1 + B + 2], [w + 2 * B + 8, 4], '#7fcbe8', -0.04, 'sw')}
          {strip([r.x0 - B / 2, cz], [B, d], sand, -0.02, 'wb')}
          {strip([r.x0 - B - 2, cz], [4, d + 2 * B], '#7fcbe8', -0.04, 'ww')}
          {strip([r.x1 + B / 2, cz], [B, d], sand, -0.02, 'eb')}
          {strip([r.x1 + B + 2, cz], [4, d + 2 * B], '#7fcbe8', -0.04, 'ew')}
        </>
      ) : (
        <>
          {/* Quays: south, west, east */}
          <mesh position={[cx, 0.03, r.z1 - 0.7]} receiveShadow>
            <boxGeometry args={[w, 0.16, 1.4]} />
            <meshStandardMaterial color={quay} roughness={0.9} />
          </mesh>
          {[r.x0 + 0.7, r.x1 - 0.7].map((x) => (
            <mesh key={x} position={[x, 0.03, cz]} receiveShadow>
              <boxGeometry args={[1.4, 0.16, d]} />
              <meshStandardMaterial color={quay} roughness={0.9} />
            </mesh>
          ))}
        </>
      )}
      {s.id !== 'industrial' && umbrellas.map(([x, z], i) => <Umbrella key={`${x},${z}`} x={x} z={z} i={i} />)}
      <Boats spots={boats} />
    </group>
  )
}

// ── Harbour district ─────────────────────────────────────────────────────

// Big lots on a concrete quay off the City's east side, for the biggest
// buildings: cranes lean over the water and containers are stacked along
// the edge. (Its streets are part of the road network.)
const HARBOUR_Z0 = (HARBOUR.j0 - 0.5) * BLOCK - 13
const HARBOUR_Z1 = (HARBOUR.j1 + 0.5) * BLOCK + 13
const HARBOUR_X0 = (HARBOUR.i - 0.5) * BLOCK - 1.5
const HARBOUR_EDGE_X = HARBOUR_X + BLOCK / 2 + 3.5
const CONTAINER_COLORS = ['#d64545', '#2f5f9e', '#ef7d2d', '#3fa064', '#f2c230']

function Harbour() {
  const depth = HARBOUR_Z1 - HARBOUR_Z0
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[(HARBOUR_X0 + HARBOUR_EDGE_X) / 2, -0.005, (HARBOUR_Z0 + HARBOUR_Z1) / 2]}>
        <planeGeometry args={[HARBOUR_EDGE_X - HARBOUR_X0, depth]} />
        <meshStandardMaterial color="#c4c0b6" roughness={0.95} />
      </mesh>
      <mesh position={[HARBOUR_EDGE_X - 0.5, 0.03, (HARBOUR_Z0 + HARBOUR_Z1) / 2]} receiveShadow>
        <boxGeometry args={[1, 0.2, depth]} />
        <meshStandardMaterial color="#9a958b" />
      </mesh>
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
        </group>
      ))}
      {Array.from({ length: 9 }, (_, i) => {
        const z = HARBOUR_Z0 + 4 + i * ((depth - 8) / 8)
        const h = 1 + ((i * 7) % 3)
        return Array.from({ length: h }, (_, k) => (
          <mesh key={`${i}-${k}`} position={[HARBOUR_EDGE_X - 2.4, 0.55 + k * 1.05, z]} castShadow>
            <boxGeometry args={[1.1, 1, 3]} />
            <meshStandardMaterial color={CONTAINER_COLORS[(i + k * 2) % CONTAINER_COLORS.length]} roughness={0.7} />
          </mesh>
        ))
      })}
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

// Industrial filler: sheds with sawtooth roofs, silos, tanks and stacks.
function IndustrialBlock({ bx, bz, seed }: { bx: number; bz: number; seed: number }) {
  const parts = useMemo(() => {
    const out: { pos: [number, number, number]; size: [number, number, number]; color: string; round?: boolean }[] = []
    SPOTS.forEach(([sx, sz], n) => {
      const r = seeded(seed * 7 + n)
      if (r < 0.4) {
        // Shed with a sawtooth roof.
        out.push({ pos: [sx, 1.4, sz], size: [7, 2.8, 6], color: ['#9aa5b1', '#b9b2a4', '#7d8794'][n % 3] })
        for (let k = 0; k < 3; k++) out.push({ pos: [sx - 2.3 + k * 2.3, 3.2, sz], size: [2, 0.8, 6], color: '#5b6470' })
      } else if (r < 0.65) {
        // Silos.
        for (let k = 0; k < 3; k++) out.push({ pos: [sx - 2 + k * 2, 2.5, sz], size: [0.9, 5, 0.9], color: '#d6d2c8', round: true })
      } else if (r < 0.85) {
        // Tank and a smokestack.
        out.push({ pos: [sx - 1, 1.2, sz], size: [1.8, 2.4, 1.8], color: '#e3b33c', round: true })
        out.push({ pos: [sx + 2.2, 4.5, sz + 1], size: [0.5, 9, 0.5], color: '#9e3f2a', round: true })
      } else {
        // Stacked crates.
        for (let k = 0; k < 4; k++) out.push({ pos: [sx - 1.5 + (k % 2) * 3, 0.6 + Math.floor(k / 2) * 1.2, sz], size: [2.6, 1.2, 2.6], color: '#8a5a30' })
      }
    })
    return out
  }, [seed])
  return (
    <group position={[bx, 0, bz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
        <planeGeometry args={[BLOCK - 4, BLOCK - 4]} />
        <meshStandardMaterial color="#9b9c94" />
      </mesh>
      {parts.map((p, i) => (
        <mesh key={i} position={p.pos} castShadow>
          {p.round ? <cylinderGeometry args={[p.size[0], p.size[0], p.size[1], 12]} /> : <boxGeometry args={p.size} />}
          <meshStandardMaterial color={p.color} />
        </mesh>
      ))}
    </group>
  )
}

const SHOPS = DOWNTOWN.filter((m) => !m.url.includes('skyscraper'))

function FillerBlock({ bx, bz, seed, island }: { bx: number; bz: number; seed: number; island: IslandId }) {
  // City blocks are mostly downtown. The Houses island is suburbs and parks,
  // with a little shopping corner on the blocks next to the home lot.
  const home = PLOT_SLOTS[0]
  const byHome = island === 'houses' && Math.abs(bx - home.x) <= BLOCK && Math.abs(bz - home.z) <= BLOCK && bz <= home.z
  const kind = byHome ? 'shops' : island === 'city' && seeded(seed) < 0.7 ? 'downtown' : seeded(seed + 1) < 0.78 ? 'suburb' : 'park'
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
      } else if (kind === 'shops' && r < 0.9) {
        const m = SHOPS[Math.floor(seeded(seed + n * 13) * SHOPS.length)]
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

// Background cars driving to and fro along the islands' streets. Trucks own
// the near lane, so cars use the far one.
type Car = { url: string; seg: Segment; dir: 1 | -1; offset: number; speed: number }
const CAR_MODELS = ['/models/vehicles/taxi.glb', '/models/vehicles/van.glb', '/models/vehicles/sedan.glb', '/models/vehicles/suv.glb']

function Traffic({ segs }: { segs: Segment[] }) {
  const cars: Car[] = useMemo(() => {
    const roads = segs.filter((r) => !r.bridge && r.until - r.from > 30)
    return Array.from({ length: Math.min(26, roads.length) }, (_, i) => ({
      url: CAR_MODELS[i % CAR_MODELS.length],
      seg: roads[Math.floor(seeded(i + 80) * roads.length)],
      dir: (seeded(i + 90) < 0.5 ? 1 : -1) as 1 | -1,
      offset: seeded(i + 40) * 100,
      speed: 4 + seeded(i + 60) * 1.8,
    }))
  }, [segs])
  const refs = useRef<(THREE.Group | null)[]>([])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    cars.forEach((car, i) => {
      const g = refs.current[i]
      if (!g) return
      const span = car.seg.until - car.seg.from
      const k = (t * car.speed + car.offset) % span
      const d = car.dir > 0 ? car.seg.from + k : car.seg.until - k
      if (car.seg.axis === 'z') g.position.set(d, 0.02, car.seg.line + (car.dir > 0 ? -0.6 : 0.65))
      else g.position.set(car.seg.line + (car.dir > 0 ? -0.65 : 0.65), 0.02, d)
    })
  })

  return (
    <>
      {cars.map((car, i) => (
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
            rotationY={car.seg.axis === 'z' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : car.dir > 0 ? 0 : Math.PI}
          />
        </group>
      ))}
    </>
  )
}

// A cloud bank over an island you haven't reached yet, with a sign saying
// what opens it. Fades away when the island opens.
function FogBank({ s, show }: { s: Island; show: boolean }) {
  const r = islandRect(s)
  const group = useRef<THREE.Group>(null)
  const fade = useRef(show ? 1 : 0)
  const puffs = useMemo(() => {
    const out: { x: number; z: number; r: number; y: number; phase: number }[] = []
    let n = 0
    for (let x = r.x0 + 6; x <= r.x1 - 4; x += 11)
      for (let z = r.z0 + 6; z <= r.z1 - 4; z += 11) {
        out.push({ x: x + (seeded(n * 3) - 0.5) * 5, z: z + (seeded(n * 5) - 0.5) * 5, r: 7 + seeded(n * 7) * 4, y: 2 + seeded(n * 11) * 3, phase: seeded(n * 13) * 6 })
        n++
      }
    return out
  }, [r.x0, r.x1, r.z0, r.z1])
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f4f7fb', transparent: true, opacity: 0.94, roughness: 1, depthWrite: false }), [])
  useFrame(({ clock }, dt) => {
    fade.current = show ? Math.min(1, fade.current + dt) : Math.max(0, fade.current - dt / 2)
    material.opacity = 0.94 * fade.current
    const g = group.current
    if (!g) return
    g.visible = fade.current > 0.01
    const t = clock.getElapsedTime()
    g.children.forEach((c, i) => {
      const p = puffs[i]
      if (p) c.position.y = p.y + Math.sin(t * 0.4 + p.phase) * 0.6 + (1 - fade.current) * 6
    })
  })
  return (
    <group ref={group}>
      {puffs.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]} scale={[1, 0.45, 1]} material={material}>
          <sphereGeometry args={[p.r, 14, 10]} />
        </mesh>
      ))}
      {show && s.unlock && (
        <Html position={[(r.x0 + r.x1) / 2, 9, (r.z0 + r.z1) / 2]} center zIndexRange={[5, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-2xl bg-white/90 px-3 py-1.5 text-center font-display text-sm text-[#1d3a6e] shadow">
            🔒 {s.emoji} {s.name}
            <div className="text-xs text-[#5b6f93]">Lv {s.unlock.level} · build the bridge in Plots</div>
          </div>
        </Html>
      )}
    </group>
  )
}

// An island's contents. Open at load: just there. Opened while playing: it
// rises out of the sea over a few seconds.
function IslandReveal({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [openAtStart] = useState(open)
  const rise = useRef(openAtStart ? 1 : 0)
  const group = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (!open || rise.current >= 1) return
    rise.current = Math.min(1, rise.current + dt / 3)
    const k = 1 - Math.pow(1 - rise.current, 3)
    if (group.current) group.current.position.y = -12 * (1 - k)
  })
  if (!open) return null
  return (
    <group ref={group} position={[0, openAtStart ? 0 : -12, 0]}>
      {children}
    </group>
  )
}

export default function World({
  ownedPlots,
  openIslands,
  bridgeBuilding,
}: {
  ownedPlots: number
  openIslands: IslandId[]
  bridgeBuilding: IslandId | null
}) {
  const blocks = useMemo(() => {
    const out: { x: number; z: number; seed: number; island: IslandId }[] = []
    for (const s of ISLANDS)
      for (let i = s.i0; i <= s.i1; i++)
        for (let j = s.j0; j <= s.j1; j++) {
          const x = i * BLOCK
          const z = j * BLOCK
          if (!isReservedBlock(x, z)) out.push({ x, z, seed: (i + 20) * 31 + (j + 20), island: s.id })
        }
    return out
  }, [])
  const open = useMemo(() => new Set(openIslands), [openIslands])
  const segs = useMemo(() => ROADS.filter((r) => !r.bridge && r.island && open.has(r.island)), [open])

  return (
    <group>
      {ISLANDS.map((s) => (
        <group key={s.id}>
          <IslandReveal open={open.has(s.id)}>
            <IslandLand s={s} />
            {s.id === 'city' && <Harbour />}
            <Roads built={(r) => r.island === s.id} />
            {PLOT_SLOTS.filter((slot) => slot.island === s.id).map((slot) => (
              <group key={slot.id} position={[slot.x, 0, slot.z]}>
                {slot.id < ownedPlots ? <ConstructionLot /> : <ForSaleLot />}
              </group>
            ))}
            {blocks
              .filter((b) => b.island === s.id)
              .map((b) =>
                b.island === 'industrial' ? (
                  <IndustrialBlock key={`${b.x},${b.z}`} bx={b.x} bz={b.z} seed={b.seed} />
                ) : (
                  <FillerBlock key={`${b.x},${b.z}`} bx={b.x} bz={b.z} seed={b.seed} island={b.island} />
                )
              )}
          </IslandReveal>
          {s.unlock && <FogBank s={s} show={!open.has(s.id)} />}
        </group>
      ))}
      {BRIDGES.map((b) => (
        <Bridge key={b.to} b={b} state={open.has(b.to) ? 'built' : bridgeBuilding === b.to ? 'building' : 'none'} />
      ))}

      {/* Ad billboards by the home lot, angled toward the camera. */}
      <Billboard position={[PLOT_SLOTS[0].x - 6, 0, PLOT_SLOTS[0].z - 11.5 - 2.2]} rotationY={Math.PI / 8} />
      <Billboard position={[PLOT_SLOTS[0].x - 11.5 - 2.2, 0, PLOT_SLOTS[0].z - 1]} rotationY={Math.PI / 2 - Math.PI / 8} />

      <Traffic segs={segs} />
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
