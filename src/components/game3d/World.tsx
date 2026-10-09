'use client'

import { Emo } from '@/components/game/Icons'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { LOT_HALF } from '@/lib/game/engine'
import {
  BLOCK,
  BRIDGES,
  ISLANDS,
  ROADS,
  coastline,
  islandRect,
  roadOpen,
  type Cell,
  type FillerKind,
  type Grown,
  type Island,
  type IslandId,
  type Point,
  type Segment,
} from '@/lib/game/islands'
import { PLOT_SLOTS } from '@/lib/game/plots'
import Prop from './Prop'
import { Billboard } from './SiteProps'
import { RoofBillboard } from './WorldAds'
import { Bus, DeliveryVan, RubblePickup, VehicleLights } from './Vehicles'
import { BlockDressing, Sea, Streets, Waterside } from './Scenery'

// The world: islands of blocks that grow a stage at a time (new land rises
// from the sea), ringed by streets, joined by bridges. Owned plots are
// construction lots, plots for sale tidy gravel lots, and every other block
// is filler — streets of houses, parks and shops on the Houses island,
// downtown on the City, works and sheds on the Industrial island.

const ROAD_WIDTH = 3
const GRASS_MARGIN = 2.7 // land past the outer roads

// Deterministic pseudo-random so the world looks the same each load.
function seeded(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

const parseGrown = (key: string): Grown => {
  const [houses, city, industrial] = key.split(',').map(Number)
  return { houses, city, industrial }
}

// Collinear, touching road pieces joined into whole streets.
function mergeSegments(segs: Segment[]): Segment[] {
  const groups = new Map<string, Segment[]>()
  for (const s of segs) {
    const k = `${s.axis}${s.line}`
    groups.set(k, [...(groups.get(k) ?? []), s])
  }
  const out: Segment[] = []
  for (const list of groups.values()) {
    list.sort((a, b) => a.from - b.from)
    let cur = { ...list[0] }
    for (const s of list.slice(1)) {
      if (s.from <= cur.until + 0.01) cur.until = Math.max(cur.until, s.until)
      else {
        out.push(cur)
        cur = { ...s }
      }
    }
    out.push(cur)
  }
  return out
}

// ── Roads ────────────────────────────────────────────────────────────────

const asphalt = new THREE.MeshStandardMaterial({ color: '#646b76', roughness: 0.95 })
const paint = new THREE.MeshStandardMaterial({ color: '#eef1f4', roughness: 0.8 })

function Roads({ segs, all }: { segs: Segment[]; all: Segment[] }) {
  const dashes = useRef<THREE.InstancedMesh>(null)

  // Centre dashes, skipping crossings.
  const dashPositions = useMemo(() => {
    const out: { x: number; z: number; alongX: boolean }[] = []
    for (const seg of segs) {
      for (let t = seg.from + 1; t <= seg.until - 1; t += 2) {
        const crossing = all.some((o) => o.axis !== seg.axis && Math.abs(o.line - t) < ROAD_WIDTH && seg.line >= o.from - 1 && seg.line <= o.until + 1)
        if (crossing) continue
        out.push(seg.axis === 'z' ? { x: t, z: seg.line, alongX: true } : { x: seg.line, z: t, alongX: false })
      }
    }
    return out
  }, [segs, all])

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
          <mesh key={i} material={asphalt} position={seg.axis === 'z' ? [mid, 0.02, seg.line] : [seg.line, 0.021, mid]} receiveShadow>
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

// ── Land ─────────────────────────────────────────────────────────────────

// A flat piece of ground in the shape of some coastline loops.
function Ground({ loops, color, y, rough = 0.9 }: { loops: Point[][]; color: string; y: number; rough?: number }) {
  const geometry = useMemo(() => {
    const shapes = loops.map((loop) => new THREE.Shape(loop.map((p) => new THREE.Vector2(p.x, -p.z))))
    return new THREE.ShapeGeometry(shapes, 4)
  }, [loops])
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow>
      <meshStandardMaterial color={color} roughness={rough} />
    </mesh>
  )
}

const LOOK: Record<IslandId, { grass: string; shore: string; shoreWidth: number }> = {
  // A beach town: sand all the way round.
  houses: { grass: '#8fcf72', shore: '#ecd9a6', shoreWidth: 6 },
  // A stone promenade along the water.
  city: { grass: '#86c56b', shore: '#cfc8b8', shoreWidth: 2.4 },
  // Concrete quays.
  industrial: { grass: '#a9b39a', shore: '#b9b2a4', shoreWidth: 2.4 },
}

// An island's land up to a stage: shallows, then the shore (beach or
// quay), then grass — each a rounded, organic outline of its blocks.
function Land({ s, cells }: { s: Island; cells: Cell[] }) {
  const look = LOOK[s.id]
  const shallows = useMemo(() => coastline(cells, GRASS_MARGIN + look.shoreWidth + 5, 14), [cells, look.shoreWidth])
  const shore = useMemo(() => coastline(cells, GRASS_MARGIN + look.shoreWidth, look.shoreWidth > 3 ? 9 : 4), [cells, look.shoreWidth])
  const grass = useMemo(() => coastline(cells, GRASS_MARGIN, 3), [cells])
  return (
    <group>
      <Ground loops={shallows} color="#7fcbe8" y={-0.045} rough={0.4} />
      <Ground loops={shore} color={look.shore} y={-0.025} rough={1} />
      <Ground loops={grass} color={look.grass} y={-0.01} />
    </group>
  )
}

// Beach umbrellas round the Houses island, and boats bobbing offshore.
function BeachLife({ cells }: { cells: Cell[] }) {
  const s = ISLANDS[0]
  const umbrellas = useMemo(() => {
    const ring = coastline(cells, GRASS_MARGIN + 3.2, 9)[0] ?? []
    const out: [number, number][] = []
    let walked = 0
    for (let n = 1; n < ring.length; n++) {
      walked += Math.hypot(ring[n].x - ring[n - 1].x, ring[n].z - ring[n - 1].z)
      if (walked < 13) continue
      walked = 0
      const p = ring[n]
      const nearYard = Math.hypot(p.x - s.yard.x, p.z - s.yard.z) < 18
      const nearBridge = BRIDGES.some((b) => (b.axis === 'x' ? Math.abs(p.x - b.line) < 7 : Math.abs(p.z - b.line) < 7))
      if (!nearYard && !nearBridge) out.push([p.x, p.z])
    }
    return out
  }, [cells, s.yard.x, s.yard.z])
  const boats = useMemo<[number, number, number][]>(() => {
    const ring = coastline(cells, GRASS_MARGIN + 22, 20)[0] ?? []
    const step = Math.max(1, Math.floor(ring.length / 6))
    return ring.filter((_, n) => n % step === 3).map((p, n) => [p.x, p.z, seeded(n + 40) * 3])
  }, [cells])
  return (
    <group>
      {umbrellas.map(([x, z], i) => (
        <Umbrella key={`${x},${z}`} x={x} z={z} i={i} />
      ))}
      <Boats spots={boats} />
    </group>
  )
}

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

// Land being raised: a sandbar just under the surface with cranes, piles
// and buoys, where the next stage's blocks will come up.
function LandWorks({ cells }: { cells: Cell[] }) {
  const bar = useMemo(() => coastline(cells, GRASS_MARGIN, 6), [cells])
  const crane = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    crane.current?.children.forEach((c, i) => {
      c.rotation.y = Math.sin(clock.getElapsedTime() * 0.3 + i * 2) * 1.2
    })
  })
  return (
    <group>
      <Ground loops={bar} color="#d9c48f" y={-0.035} rough={1} />
      <group ref={crane}>
        {cells.slice(0, 3).map((c) => (
          <group key={`${c.i},${c.j}`} position={[c.i * BLOCK, 0, c.j * BLOCK]}>
            <mesh position={[0, 4.5, 0]} castShadow>
              <boxGeometry args={[0.5, 9, 0.5]} />
              <meshStandardMaterial color="#e0b020" />
            </mesh>
            <mesh position={[3, 9, 0]} castShadow>
              <boxGeometry args={[8, 0.5, 0.6]} />
              <meshStandardMaterial color="#f2c230" />
            </mesh>
            <mesh position={[-1.4, 9.2, 0]}>
              <boxGeometry args={[1.6, 1, 1.4]} />
              <meshStandardMaterial color="#5b6470" />
            </mesh>
          </group>
        ))}
      </group>
      {cells.flatMap((c, n) =>
        [-1, 1].map((sd) => (
          <mesh key={`${n}${sd}`} position={[c.i * BLOCK + sd * 6, 0.3, c.j * BLOCK + 5 * sd]}>
            <cylinderGeometry args={[0.35, 0.35, 0.8, 10]} />
            <meshStandardMaterial color={sd > 0 ? '#ef7d2d' : '#f4f1ea'} />
          </mesh>
        ))
      )}
    </group>
  )
}

// ── Lots ─────────────────────────────────────────────────────────────────

const FENCE_SEGMENTS: { pos: [number, number, number]; rot: number }[] = []
for (let t = -LOT_HALF + 1; t <= LOT_HALF - 1; t += 2) {
  FENCE_SEGMENTS.push({ pos: [t, 0, -LOT_HALF], rot: Math.PI / 2 })
  FENCE_SEGMENTS.push({ pos: [-LOT_HALF, 0, t], rot: 0 })
  // Leave an entrance gap on the front side for trucks.
  if (Math.abs(t) > 2.5) FENCE_SEGMENTS.push({ pos: [t, 0, LOT_HALF], rot: Math.PI / 2 })
  FENCE_SEGMENTS.push({ pos: [LOT_HALF, 0, t], rot: 0 })
}

function Sidewalk({ dirt, harbour }: { dirt: boolean; harbour?: boolean }) {
  return (
    <>
      <mesh position={[0, 0.0, 0]} receiveShadow>
        <boxGeometry args={[LOT_HALF * 2 + 2.4, 0.06, LOT_HALF * 2 + 2.4]} />
        <meshStandardMaterial color={harbour ? '#c4c0b6' : '#d6d2c8'} />
      </mesh>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[LOT_HALF * 2, 0.06, LOT_HALF * 2]} />
        <meshStandardMaterial color={dirt ? '#c8ab7e' : '#b8b3a6'} />
      </mesh>
    </>
  )
}

// An owned plot: the fenced dirt construction site.
function ConstructionLot({ harbour }: { harbour?: boolean }) {
  return (
    <group>
      <Sidewalk dirt harbour={harbour} />
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

// A plot for sale: a neat gravel lot with a kerb, a few bollards at the
// front and a For Sale board (the price bubble is HTML, see PlotLabels).
function ForSaleLot({ harbour }: { harbour?: boolean }) {
  return (
    <group>
      <Sidewalk dirt={false} harbour={harbour} />
      {[-LOT_HALF + 0.6, -2.4, 2.4, LOT_HALF - 0.6].map((x) => (
        <mesh key={x} position={[x, 0.4, LOT_HALF - 0.4]} castShadow>
          <cylinderGeometry args={[0.16, 0.16, 0.8, 8]} />
          <meshStandardMaterial color="#f2c230" />
        </mesh>
      ))}
      <group position={[3.5, 0, LOT_HALF - 1.4]}>
        {[-0.9, 0.9].map((x) => (
          <mesh key={x} position={[x, 0.9, 0]} castShadow>
            <boxGeometry args={[0.14, 1.8, 0.14]} />
            <meshStandardMaterial color="#7a5a3a" />
          </mesh>
        ))}
        <mesh position={[0, 1.6, 0.05]} castShadow>
          <boxGeometry args={[2.4, 1.1, 0.1]} />
          <meshStandardMaterial color="#e23f3f" />
        </mesh>
        <mesh position={[0, 1.6, 0.11]}>
          <planeGeometry args={[2, 0.25]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      </group>
    </group>
  )
}

// ── Filler blocks ────────────────────────────────────────────────────────

const DOWNTOWN = [
  { url: '/models/commercial/building-skyscraper-a.glb', size: 11 },
  { url: '/models/commercial/building-a.glb', size: 7 },
  { url: '/models/commercial/building-c.glb', size: 5 },
  { url: '/models/commercial/building-e.glb', size: 5 },
]
const SHOPS = DOWNTOWN.filter((m) => !m.url.includes('skyscraper'))
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

// A tidy block: one style of building per block (a street of matching
// houses, a row of shops, a pair of towers), squared up and facing the
// nearest street, with trees in neat rows.
function FillerBlock({ bx, bz, seed, kind }: { bx: number; bz: number; seed: number; kind: 'suburb' | 'park' | 'shops' | 'downtown' }) {
  const items = useMemo(() => {
    const out: { url: string; size: number; pos: [number, number, number]; rot: number }[] = []
    const pick = <T,>(list: T[], k: number) => list[Math.floor(seeded(seed + k) * list.length)]
    const house = pick(SUBURB, 13)
    const shop = pick(SHOPS, 17)
    const tower = pick(DOWNTOWN, 19)
    SPOTS.forEach(([sx, sz], n) => {
      const pos: [number, number, number] = [sx, 0, sz]
      // Face the street on the block's front (+z) or right (+x) side.
      const rot = sz > 0 ? Math.PI : sx > 0 ? -Math.PI / 2 : 0
      if (kind === 'suburb') out.push({ ...house, pos, rot })
      else if (kind === 'shops') out.push({ ...shop, pos, rot })
      else if (kind === 'downtown') out.push({ ...(n % 3 === 0 ? tower : shop), pos, rot })
      else out.push({ url: n % 2 ? '/models/suburban/tree-large.glb' : '/models/suburban/tree-small.glb', size: 2.6, pos, rot: n })
    })
    // Trees in a row along the back edge.
    if (kind !== 'downtown')
      for (let n = 0; n < 4; n++) out.push({ url: '/models/suburban/tree-large.glb', size: 2 + seeded(seed * 11 + n) * 0.6, pos: [-7.5 + n * 5, 0, -9], rot: n })
    return out
  }, [kind, seed])
  // Downtown and shop blocks: an ad billboard on one flat roof, facing the
  // camera side (+z / +x) so it's readable.
  const roofAd = useMemo(() => {
    if ((kind !== 'downtown' && kind !== 'shops') || seeded(seed * 19) > 0.65) return null
    const it = items.find((m) => m.url.includes('/commercial/') && !m.url.includes('skyscraper'))
    if (!it) return null
    return { pos: [it.pos[0], it.size, it.pos[2]] as [number, number, number], rot: it.pos[2] > 0 ? 0 : Math.PI / 2 }
  }, [items, kind, seed])

  return (
    <group position={[bx, 0, bz]}>
      <BlockDressing kind={kind} seed={seed} />
      {items.map((it, i) => (
        <Prop key={i} url={it.url} size={it.size} position={it.pos} rotationY={it.rot} />
      ))}
      {roofAd && <RoofBillboard seed={seed} position={roofAd.pos} rotationY={roofAd.rot} width={3.6} />}
    </group>
  )
}

// The harbour quay's working block: cranes leaning over the water and
// stacked containers.
const CONTAINER_COLORS = ['#d64545', '#2f5f9e', '#ef7d2d', '#3fa064', '#f2c230']
function QuayBlock({ bx, bz }: { bx: number; bz: number }) {
  return (
    <group position={[bx, 0, bz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
        <planeGeometry args={[BLOCK - 2.8, BLOCK - 2.8]} />
        <meshStandardMaterial color="#c4c0b6" roughness={0.95} />
      </mesh>
      {[-4, 4].map((z) => (
        <group key={z} position={[6, 0, z]}>
          {[-1.2, 1.2].map((dz) => (
            <mesh key={dz} position={[0, 4, dz]} castShadow>
              <boxGeometry args={[0.4, 8, 0.4]} />
              <meshStandardMaterial color="#e0b020" />
            </mesh>
          ))}
          <mesh position={[2.6, 8.2, 0]} castShadow>
            <boxGeometry args={[9, 0.6, 3]} />
            <meshStandardMaterial color="#f2c230" />
          </mesh>
          <mesh position={[-1.4, 8.6, 0]} castShadow>
            <boxGeometry args={[1.8, 1.2, 2]} />
            <meshStandardMaterial color="#5b6470" />
          </mesh>
        </group>
      ))}
      {Array.from({ length: 4 }, (_, i) =>
        Array.from({ length: 1 + ((i * 7) % 3) }, (_, k) =>
          Array.from({ length: 2 }, (_, c) => (
            <mesh key={`${i}-${k}-${c}`} position={[-6 + c * 3.4, 0.55 + k * 1.05, -6 + i * 3.6]} castShadow>
              <boxGeometry args={[3, 1, 1.2]} />
              <meshStandardMaterial color={CONTAINER_COLORS[(i + k * 2 + c) % CONTAINER_COLORS.length]} roughness={0.7} />
            </mesh>
          ))
        )
      )}
    </group>
  )
}

function Filler({ c, s }: { c: Cell; s: Island }) {
  const bx = c.i * BLOCK
  const bz = c.j * BLOCK
  const seed = (c.i + 20) * 31 + (c.j + 20)
  const what = c.what as FillerKind
  if (what === 'industrial') return <IndustrialBlock bx={bx} bz={bz} seed={seed} />
  if (what === 'quay') return <QuayBlock bx={bx} bz={bz} />
  void s
  return <FillerBlock bx={bx} bz={bz} seed={seed} kind={what} />
}

// Background cars driving to and fro along the islands' streets. Trucks own
// the near lane, so cars use the far one.
type Car = { kind: string; seg: Segment; dir: 1 | -1; offset: number; speed: number }
// A mix: the car models plus our own built vehicles (see Vehicles.tsx).
const CAR_MODELS = ['/models/vehicles/taxi.glb', '/models/vehicles/van.glb', '/models/vehicles/sedan.glb', '/models/vehicles/suv.glb']
const TRAFFIC_KINDS = [...CAR_MODELS, 'bus', 'delivery', '/models/vehicles/sedan.glb', 'pickup', '/models/vehicles/taxi.glb', 'delivery', '/models/vehicles/garbage-truck.glb']

function Traffic({ segs }: { segs: Segment[] }) {
  const cars: Car[] = useMemo(() => {
    const roads = segs.filter((r) => !r.bridge && r.until - r.from > 30)
    return Array.from({ length: Math.min(26, roads.length) }, (_, i) => ({
      kind: TRAFFIC_KINDS[i % TRAFFIC_KINDS.length],
      seg: roads[Math.floor(seeded(i + 80) * roads.length)],
      dir: (seeded(i + 90) < 0.5 ? 1 : -1) as 1 | -1,
      offset: seeded(i + 40) * 100,
      speed: (TRAFFIC_KINDS[i % TRAFFIC_KINDS.length] === 'bus' ? 3.2 : 4) + seeded(i + 60) * 1.8,
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
          <group rotation={[0, car.seg.axis === 'z' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : car.dir > 0 ? 0 : Math.PI, 0]}>
            {car.kind === 'bus' ? (
              <Bus color={i % 2 ? '#2d7ff9' : '#3fa064'} />
            ) : car.kind === 'delivery' ? (
              <DeliveryVan seed={i * 2 + 7} />
            ) : car.kind === 'pickup' ? (
              <RubblePickup />
            ) : (
              <Prop url={car.kind} size={car.kind.includes('garbage') ? 1.8 : 1.45} />
            )}
          </group>
        </group>
      ))}
    </>
  )
}

// A cloud bank over an island you haven't reached yet, with a sign saying
// what opens it. Fades away when the island opens.
function FogBank({ s, show }: { s: Island; show: boolean }) {
  const r = islandRect(s, 0)
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
      {show && s.stages[0] && (
        <Html position={[(r.x0 + r.x1) / 2, 9, (r.z0 + r.z1) / 2]} center zIndexRange={[5, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-2xl bg-white/90 px-3 py-1.5 text-center font-display text-sm text-[#1d3a6e] shadow">
            <Emo e="🔒" /> {s.emoji} {s.name}
            <div className="text-xs text-[#5b6f93]">Lv {s.stages[0].level} · build the bridge in Plots</div>
          </div>
        </Html>
      )}
    </group>
  )
}

// A piece of the world that rises out of the sea if it appears while you
// play (it's simply there if it was already open at load).
function Rise({ children }: { children: React.ReactNode }) {
  const [atStart] = useState(() => performance.now() < 8000 || !riseArmed)
  const rise = useRef(atStart ? 1 : 0)
  const group = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (rise.current >= 1) return
    rise.current = Math.min(1, rise.current + dt / 3)
    const k = 1 - Math.pow(1 - rise.current, 3)
    if (group.current) group.current.position.y = -12 * (1 - k)
  })
  return (
    <group ref={group} position={[0, atStart ? 0 : -12, 0]}>
      {children}
    </group>
  )
}
// Set once the world has been drawn: anything mounting after that is new
// land, so it rises.
let riseArmed = false

// One island stage: its blocks and roads.
function StageContents({ s, stage, ownedPlots, allRoads }: { s: Island; stage: number; ownedPlots: number; allRoads: Segment[] }) {
  const cells = s.cells.filter((c) => c.stage === stage)
  const roads = useMemo(() => mergeSegments(ROADS.filter((r) => r.island === s.id && r.stage === stage)), [s.id, stage])
  return (
    <Rise>
      <Roads segs={roads} all={allRoads} />
      {cells.map((c) => {
        const key = `${c.i},${c.j}`
        if (c.what === 'yard') return null
        if (c.what === 'plot' || c.what === 'harbour') {
          const slot = PLOT_SLOTS.find((p) => p.x === c.i * BLOCK && p.z === c.j * BLOCK)!
          return (
            <group key={key} position={[slot.x, 0, slot.z]}>
              {slot.id < ownedPlots ? <ConstructionLot harbour={slot.harbour} /> : <ForSaleLot harbour={slot.harbour} />}
            </group>
          )
        }
        return <Filler key={key} c={c} s={s} />
      })}
    </Rise>
  )
}

// An island's land: the current outline, plus — for a few seconds after it
// grows — the old outline on top while the new land rises underneath.
function IslandGround({ s, stage }: { s: Island; stage: number }) {
  const [shown, setShown] = useState(stage)
  const [prev, setPrev] = useState<number | null>(null)
  if (stage !== shown) {
    setPrev(shown)
    setShown(stage)
  }
  const cellsAt = (k: number) => s.cells.filter((c) => c.stage <= k)
  const cells = useMemo(() => s.cells.filter((c) => c.stage <= stage), [s, stage])
  useFrame(() => {
    // Drop the old outline once the new land has come up.
    if (prev !== null && performance.now() - risenAt.current > 3200) setPrev(null)
  })
  const risenAt = useRef(0)
  useLayoutEffect(() => {
    risenAt.current = performance.now()
  }, [stage])
  return (
    <>
      {prev !== null && prev >= 0 && (
        <group position={[0, 0.006, 0]}>
          <Land s={s} cells={cellsAt(prev)} />
        </group>
      )}
      <Rise key={stage}>
        <Land s={s} cells={cells} />
        {s.id === 'houses' && <BeachLife cells={cells} />}
      </Rise>
    </>
  )
}

export default function World({ ownedPlots, grownKey, landBuild }: { ownedPlots: number; grownKey: string; landBuild: string | null }) {
  const grown = useMemo(() => parseGrown(grownKey), [grownKey])
  const allRoads = useMemo(() => ROADS.filter((r) => !r.bridge && roadOpen(r, grown)), [grown])
  const merged = useMemo(() => mergeSegments(allRoads), [allRoads])
  const [building, buildingStage] = landBuild ? [landBuild.split(':')[0] as IslandId, Number(landBuild.split(':')[1])] : [null, -1]
  useLayoutEffect(() => {
    // Give the first load a moment, then new land rises.
    const t = setTimeout(() => (riseArmed = true), 1500)
    return () => clearTimeout(t)
  }, [])

  return (
    <group>
      {ISLANDS.map((s) => {
        const stage = grown[s.id]
        const prev = ISLANDS[s.index - 1]
        const reachable = !prev || grown[prev.id] >= prev.stages.length - 1
        return (
          <group key={s.id}>
            {stage >= 0 && <IslandGround s={s} stage={stage} />}
            {Array.from({ length: stage + 1 }, (_, k) => (
              <StageContents key={k} s={s} stage={k} ownedPlots={ownedPlots} allRoads={allRoads} />
            ))}
            {building === s.id && buildingStage > 0 && <LandWorks cells={s.cells.filter((c) => c.stage === buildingStage)} />}
            {stage < 0 && <FogBank s={s} show={reachable} />}
          </group>
        )
      })}
      {BRIDGES.map((b) => (
        <Bridge key={b.to} b={b} state={grown[b.to] >= 0 ? 'built' : building === b.to && buildingStage === 0 ? 'building' : 'none'} />
      ))}

      {/* Ad billboards by the home lot, angled toward the camera. */}
      <Billboard position={[PLOT_SLOTS[0].x - 6, 0, PLOT_SLOTS[0].z - 11.5 - 2.2]} rotationY={Math.PI / 8} />
      <Billboard seed={1} position={[PLOT_SLOTS[0].x - 11.5 - 2.2, 0, PLOT_SLOTS[0].z - 1]} rotationY={Math.PI / 2 - Math.PI / 8} />

      <Sea />
      <Streets segs={merged} />
      <Waterside grown={grown} />
      <Traffic segs={merged} />
      <VehicleLights />
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
