'use client'

import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { BRICK, DUMPSTER_SLOTS, LOT_HALF, stats, type Engine, type Site } from '@/lib/game/engine'
import { dumpsterLevel, getStation, tierFor, type StationId } from '@/lib/game/stations'
import Prop from './Prop'
import { pointer } from './drag'
import { Logo } from './SiteProps'
import { brickGeometry, brickMaterial } from './Building'

// Each station is built from simple shapes (plus a few Kenney models) and
// swaps to a fancier look at milestone levels — see MILESTONES.

function Box({
  size,
  position,
  color,
  rotation,
}: {
  size: [number, number, number]
  position: [number, number, number]
  color: string
  rotation?: [number, number, number]
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.75} />
    </mesh>
  )
}

// A bobbing green arrow over a station you can afford to upgrade.
function UpgradeArrow({ height }: { height: number }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = height + Math.sin(clock.getElapsedTime() * 4) * 0.15
  })
  return (
    <group ref={ref}>
      <mesh position={[0, 0.35, 0]}>
        <coneGeometry args={[0.35, 0.45, 4]} />
        <meshStandardMaterial color="#3fdc4f" emissive="#1f8a28" emissiveIntensity={0.4} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.2, 0.35, 0.2]} />
        <meshStandardMaterial color="#3fdc4f" emissive="#1f8a28" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

// Wraps a station: makes the whole thing tappable (via an invisible hit
// box so small parts are easy to hit on a phone) and shows the arrow.
function Hotspot({
  id,
  position,
  hitSize,
  arrowHeight,
  affordable,
  onSelect,
  children,
}: {
  id: StationId
  position: [number, number, number]
  hitSize: [number, number, number]
  arrowHeight: number
  affordable: boolean
  onSelect: (id: StationId) => void
  children: ReactNode
}) {
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (pointer.dragged) return
    onSelect(id)
  }
  return (
    <group position={position}>
      {children}
      <mesh
        position={[0, hitSize[1] / 2, 0]}
        onClick={click}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <boxGeometry args={hitSize} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {affordable && <UpgradeArrow height={arrowHeight} />}
    </group>
  )
}

// ── Dumpster ─────────────────────────────────────────────────────────────

const DUMPSTER_TIERS = [
  { w: 1.35, h: 0.75, d: 1.15, y0: 0.25 },
  { w: 2.2, h: 0.85, d: 1.25, y0: 0.15 },
  { w: 3.0, h: 1.1, d: 1.45, y0: 0.15 },
  { w: 3.0, h: 1.1, d: 1.45, y0: 0.15 },
]

function DumpsterLook({ tier }: { tier: number }) {
  if (tier === 0) return <Prop url="/models/roads/dumpster.glb" size={1.7} fit="width" />
  if (tier === 1) {
    return (
      <group>
        <Box size={[2.4, 0.15, 1.4]} position={[0, 0.08, 0]} color="#3a3a3e" />
        <Box size={[2.4, 0.9, 0.12]} position={[0, 0.55, 0.69]} color="#f2c230" />
        <Box size={[2.4, 0.9, 0.12]} position={[0, 0.55, -0.69]} color="#f2c230" />
        <Box size={[0.12, 0.9, 1.4]} position={[1.14, 0.55, 0]} color="#d9a400" rotation={[0, 0, -0.25]} />
        <Box size={[0.12, 0.9, 1.4]} position={[-1.14, 0.55, 0]} color="#d9a400" rotation={[0, 0, 0.25]} />
        <Box size={[2.5, 0.1, 1.5]} position={[0, 1.02, 0]} color="#3a3a3e" />
        <Logo size={0.6} position={[0, 0.55, 0.76]} />
      </group>
    )
  }
  const ribs = [-1.3, -0.65, 0, 0.65, 1.3]
  return (
    <group>
      <Box size={[3.2, 0.15, 1.6]} position={[0, 0.1, 0]} color="#3a3a3e" />
      <Box size={[3.2, 1.25, 0.1]} position={[0, 0.8, 0.78]} color="#ff6b1a" />
      <Box size={[3.2, 1.25, 0.1]} position={[0, 0.8, -0.78]} color="#ff6b1a" />
      <Box size={[0.1, 1.25, 1.6]} position={[1.55, 0.8, 0]} color="#e85d10" />
      <Box size={[0.1, 1.25, 1.6]} position={[-1.55, 0.8, 0]} color="#e85d10" />
      {ribs.map((x) => (
        <Box key={x} size={[0.08, 1.25, 0.06]} position={[x, 0.8, 0.84]} color="#c94e0a" />
      ))}
      <Logo size={0.85} position={[-0.32, 0.8, 0.88]} />
      {tier === 3 && (
        // Compactor unit on the closed end; workers line up off the other.
        <group position={[-2.2, 0, 0]}>
          <Box size={[1.1, 1.7, 1.6]} position={[0, 0.85, 0]} color="#7d8794" />
          <Box size={[1.12, 0.25, 1.62]} position={[0, 0.3, 0]} color="#f2c230" />
          <Box size={[0.4, 0.3, 0.3]} position={[0, 1.85, 0]} color="#e23f3f" />
          <Box size={[0.35, 0.35, 0.05]} position={[0.2, 1.1, 0.82]} color="#3fdc4f" />
        </group>
      )}
    </group>
  )
}

// One of a plot's dumpsters, standing in its slot (see DUMPSTER_SLOTS),
// filling up as workers tip bricks in.
export function DumpsterStation({
  site,
  index,
  affordable,
  onSelect,
}: {
  site: Site
  index: number
  affordable: boolean
  onSelect: (id: StationId) => void
}) {
  const fill = useRef<THREE.Mesh>(null)
  const dumpster = site.dumpsters[index]
  const tier = tierFor(dumpsterLevel(dumpster))
  const dims = DUMPSTER_TIERS[tier]
  const slot = DUMPSTER_SLOTS[index]

  useFrame(() => {
    const d = site.dumpsters[index]
    if (!d || !fill.current) return
    const ratio = Math.min(1, d.load / stats.dumpsterCapacity(d.level))
    fill.current.visible = ratio > 0
    fill.current.scale.y = Math.max(0.01, ratio)
    fill.current.position.y = dims.y0 + (dims.h * ratio) / 2
  })

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      <Hotspot
        id="dumpster"
        position={[0, 0, 0]}
        hitSize={[tier >= 2 ? 3.4 : 2.6, 1.6, 1.8]}
        arrowHeight={2}
        affordable={affordable}
        onSelect={onSelect}
      >
        <DumpsterLook tier={tier} />
        <mesh ref={fill} position={[0, dims.y0, 0]}>
          <boxGeometry args={[dims.w, dims.h, dims.d]} />
          <meshStandardMaterial color="#b4553c" roughness={0.9} />
        </mesh>
      </Hotspot>
    </group>
  )
}

// ── Trucks ───────────────────────────────────────────────────────────────

// `cargo` is where the load heap sits on each look (local, truck facing
// +z): the Flatbed's open bed, and the top of the closed bodies.
const TRUCK_TIERS = [
  { url: '/models/vehicles/truck-flat.glb', size: 1.5, half: 0.78, logo: 0.6, cargo: { y: 0.72, z: -0.45, w: 0.85, d: 1.0 } },
  { url: '/models/vehicles/truck.glb', size: 1.75, half: 0.9, logo: 0.75, cargo: { y: 1.75, z: -0.4, w: 0.9, d: 1.3 } },
  { url: '/models/vehicles/garbage-truck.glb', size: 1.9, half: 0.87, logo: 0.8, cargo: { y: 1.9, z: -0.5, w: 0.9, d: 1.2 } },
  { url: '/models/vehicles/garbage-truck.glb', size: 2.45, half: 1.11, logo: 1.05, cargo: { y: 2.45, z: -0.6, w: 1.1, d: 1.6 } },
]

// How many bricks show for each step of fullness: empty, a little,
// medium, a lot, full (heaped over the top).
const LOAD_STEPS = [0, 3, 7, 12, 18]
const HEAP_BRICK = BRICK * 0.85

function loadStep(cargo: number, capacity: number) {
  if (cargo <= 0) return 0
  const f = cargo / capacity
  return f >= 1 ? 4 : f >= 0.6 ? 3 : f >= 0.25 ? 2 : 1
}

// Brick spots for a heap filling a w×d area: a wide bottom layer first,
// then narrower layers on top, so a little load still covers the bed.
function heapLayout(w: number, d: number): [number, number, number][] {
  const out: [number, number, number][] = []
  for (let layer = 0; layer < 4 && out.length < LOAD_STEPS[4]; layer++) {
    const cols = Math.max(1, Math.floor(w / HEAP_BRICK) - layer)
    const rows = Math.max(1, Math.floor(d / HEAP_BRICK) - layer)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        out.push([(c - (cols - 1) / 2) * HEAP_BRICK, HEAP_BRICK * (0.5 + layer * 0.9), (r - (rows - 1) / 2) * HEAP_BRICK])
      }
    }
  }
  // Spread the first few across the area instead of filling one corner.
  return out.sort((a, b) => a[1] - b[1] || (Math.abs(a[0]) + Math.abs(a[2]) > Math.abs(b[0]) + Math.abs(b[2]) ? 1 : -1)).slice(0, LOAD_STEPS[4])
}

const heapTmp = new THREE.Object3D()
const heapColor = new THREE.Color('#b4553c')

// One truck of the fleet, in world space, driven by the engine each frame.
// Tapping it opens that truck's own upgrades.
function FleetTruck({
  engine,
  id,
  tier,
  onSelect,
}: {
  engine: Engine
  id: number
  tier: number
  onSelect: (truck: number) => void
}) {
  const group = useRef<THREE.Group>(null)
  const heap = useRef<THREE.InstancedMesh>(null)
  const shownStep = useRef(-1)
  const drawnMesh = useRef<THREE.InstancedMesh | null>(null)
  const look = TRUCK_TIERS[tier]
  const spots = useMemo(() => heapLayout(look.cargo.w, look.cargo.d), [look])

  useFrame(() => {
    const g = group.current
    const t = engine.trucks[id]
    if (!g || !t) return
    // Show the load in steps, re-laying the heap only when the step changes.
    const step = loadStep(t.cargo, stats.truckCargo(t.load))
    const mesh = heap.current
    // A new look means a new heap mesh: draw it from scratch.
    if (mesh !== drawnMesh.current) {
      drawnMesh.current = mesh
      shownStep.current = -1
    }
    if (mesh && step !== shownStep.current) {
      shownStep.current = step
      const n = Math.min(LOAD_STEPS[step], spots.length)
      for (let i = 0; i < n; i++) {
        const [x, y, z] = spots[i]
        heapTmp.position.set(x, y, z)
        heapTmp.rotation.set(0, (i % 3) * 0.3, 0)
        heapTmp.scale.setScalar(0.85)
        heapTmp.updateMatrix()
        mesh.setMatrixAt(i, heapTmp.matrix)
        mesh.setColorAt(i, heapColor)
      }
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    g.position.set(t.x, 0.02, t.z)
    // Ease the turn so corners don't snap.
    let d = t.heading - g.rotation.y
    d = Math.atan2(Math.sin(d), Math.cos(d))
    g.rotation.y += d * 0.25
  })

  const select = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (pointer.dragged) return
    onSelect(id)
  }

  return (
    <group ref={group} onClick={select}>
      {/* Models face +z; logos on both sides. */}
      <Prop url={look.url} size={look.size} />
      <Logo size={look.logo} position={[look.half, look.size * 0.55, -0.3]} rotationY={Math.PI / 2} />
      <Logo size={look.logo} position={[-look.half, look.size * 0.55, -0.3]} rotationY={-Math.PI / 2} />
      <instancedMesh
        key={tier}
        ref={heap}
        args={[brickGeometry, brickMaterial, LOAD_STEPS[4]]}
        position={[0, look.cargo.y, look.cargo.z]}
        castShadow
        frustumCulled={false}
      />
    </group>
  )
}

export function Fleet({
  engine,
  tiers,
  onSelect,
}: {
  engine: Engine
  tiers: number[]
  onSelect: (truck: number) => void
}) {
  return (
    <>
      {tiers.map((tier, id) => (
        <FleetTruck key={id} engine={engine} id={id} tier={tier} onSelect={onSelect} />
      ))}
    </>
  )
}

// The truck depot sign by the Brick Yard's parking bays (local to the yard
// block) — always there to tap, since trucks are usually off driving.
export function TruckDepot({
  affordable,
  onSelect,
}: {
  affordable: boolean
  onSelect: (id: StationId) => void
}) {
  return (
    <Hotspot
      id="truck"
      position={[-7.1, 0, -0.5]}
      hitSize={[1.2, 2.2, 0.8]}
      arrowHeight={2.4}
      affordable={affordable}
      onSelect={onSelect}
    >
      <Box size={[0.12, 1.6, 0.12]} position={[0, 0.8, 0]} color="#5b6470" />
      <Box size={[1.0, 0.7, 0.08]} position={[0, 1.6, 0]} color="#1d3a6e" />
      <Logo size={0.55} position={[0, 1.6, 0.05]} />
    </Hotspot>
  )
}

// ── Brick Yard ───────────────────────────────────────────────────────────

// Where trucks unload and you get paid. Grows from a scrap heap into a
// recycling plant at milestones. Local to YARD_BLOCK: the front (+z) faces
// the road with an IN gate (x −3) and an OUT gate (x +3); trucks unload at
// the dock just inside IN, idle ones park in the painted bays, and the back
// looks out over the water.
const YARD_GATES = [-3, 3]
const YARD_FENCE: { pos: [number, number, number]; rot: number }[] = []
for (let t = -LOT_HALF + 1; t <= LOT_HALF - 1; t += 2) {
  YARD_FENCE.push({ pos: [t, 0, -LOT_HALF], rot: Math.PI / 2 })
  YARD_FENCE.push({ pos: [-LOT_HALF, 0, t], rot: 0 })
  YARD_FENCE.push({ pos: [LOT_HALF, 0, t], rot: 0 })
  if (YARD_GATES.every((g) => Math.abs(t - g) > 1.6)) YARD_FENCE.push({ pos: [t, 0, LOT_HALF], rot: Math.PI / 2 })
}

function YardLook({ tier }: { tier: number }) {
  const piles: [number, number][] = [
    [6, 1.5],
    [6.2, 4.3],
    [-6.4, 2.6],
  ]
  return (
    <group>
      {/* Yard surface */}
      <Box size={[16, 0.06, 16]} position={[0, 0.02, 0]} color={tier >= 2 ? '#b7bcc4' : '#c8ab7e'} />
      {YARD_FENCE.map((f, i) => (
        <Prop key={i} url="/models/roads/construction-fence.glb" size={0.9} position={f.pos} rotationY={f.rot} />
      ))}
      {/* Gate posts: green light IN, orange light OUT */}
      {YARD_GATES.map((x, i) => (
        <group key={x} position={[x, 0, LOT_HALF]}>
          <Box size={[0.2, 1.6, 0.2]} position={[-1.3, 0.8, 0]} color="#5b6470" />
          <Box size={[0.2, 1.6, 0.2]} position={[1.3, 0.8, 0]} color="#5b6470" />
          <Box size={[2.8, 0.25, 0.2]} position={[0, 1.65, 0]} color="#1d3a6e" />
          <mesh position={[0, 1.9, 0]}>
            <sphereGeometry args={[0.18, 12, 8]} />
            <meshStandardMaterial
              color={i === 0 ? '#3fdc4f' : '#ff8a1a'}
              emissive={i === 0 ? '#1f8a28' : '#c95a00'}
              emissiveIntensity={0.7}
            />
          </mesh>
        </group>
      ))}
      {/* Unload dock + hopper behind the bay (trucks stop at z 3.5) */}
      <Box size={[3.2, 0.9, 1.4]} position={[-3, 0.45, 1.6]} color="#7d8794" />
      <Box size={[2.2, 1.1, 1.2]} position={[-3, 1.45, 1.5]} color="#f2c230" />
      <Box size={[2.6, 0.12, 1.5]} position={[-3, 2.05, 1.5]} color="#3a3a3e" />
      {/* Parking bays */}
      {[0, 1, 2, 3, 4].map((n) => (
        <Box key={n} size={[0.1, 0.02, 2.4]} position={[-6.3 + n * 2.6, 0.06, -0.5]} color="#f4f1ea" />
      ))}
      {piles.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.45, z]} castShadow>
          <coneGeometry args={[1.1, 0.9 + tier * 0.3, 7]} />
          <meshStandardMaterial color="#b4553c" roughness={0.95} />
        </mesh>
      ))}
      {tier === 0 ? (
        <>
          {/* Scrap heap: a shed and a weigh station */}
          <Box size={[5, 2.4, 3.5]} position={[2, 1.2, -5]} color="#8d6e4c" />
          <Box size={[5.4, 0.25, 3.9]} position={[2, 2.5, -5]} color="#5a5f6b" />
        </>
      ) : (
        <>
          {/* Plant hall */}
          <Box size={[8, 3 + tier, 5]} position={[1.5, (3 + tier) / 2, -4.8]} color={tier >= 3 ? '#e8edf3' : '#cfd5dd'} />
          <Box size={[8.4, 0.3, 5.4]} position={[1.5, 3 + tier + 0.15, -4.8]} color="#ff6b1a" />
          <Box size={[3, 2.2, 0.15]} position={[1.5, 1.1, -2.25]} color="#3a3a3e" />
          <Logo size={1.6} position={[-1.4, 2 + tier * 0.5, -2.25]} />
          {tier >= 2 && (
            <>
              {/* Chimney + dockside crane */}
              <Box size={[0.9, 6 + tier, 0.9]} position={[5, (6 + tier) / 2, -6.5]} color="#7d8794" />
              <Box size={[0.9, 0.3, 0.9]} position={[5, 6 + tier, -6.5]} color="#e23f3f" />
              <Box size={[0.5, 5, 0.5]} position={[-6, 2.5, -7]} color="#f2c230" />
              <Box size={[0.4, 0.4, 6]} position={[-6, 5, -9.5]} color="#f2c230" />
            </>
          )}
        </>
      )}
      {/* A barge moored on the water behind the yard, loaded with bricks */}
      <group position={[0, 0, -15.5]}>
        <Box size={[9, 0.9, 3.2]} position={[0, 0.2, 0]} color="#5b6470" />
        <Box size={[9.2, 0.15, 3.4]} position={[0, 0.7, 0]} color="#ff6b1a" />
        {tier >= 1 && (
          <mesh position={[0.5, 1.1, 0]} castShadow>
            <coneGeometry args={[1.3, 0.8, 7]} />
            <meshStandardMaterial color="#b4553c" roughness={0.95} />
          </mesh>
        )}
      </group>
      {/* Brick Yard sign by the road */}
      <Box size={[0.15, 2, 0.15]} position={[6.4, 1, 6.6]} color="#5b6470" />
      <Box size={[2.4, 0.8, 0.1]} position={[6.4, 2.1, 6.6]} color="#1d3a6e" />
      <Logo size={0.6} position={[5.6, 2.1, 6.66]} />
    </group>
  )
}

export function BrickYard({
  tier,
  affordable,
  onSelect,
}: {
  tier: number
  affordable: boolean
  onSelect: (id: StationId) => void
}) {
  return (
    <>
      <YardLook tier={tier} />
      {/* Tap the plant itself (not the open yard, where trucks drive). */}
      <Hotspot id="yard" position={[1.5, 0, -4.8]} hitSize={[9, 5, 6]} arrowHeight={5 + tier} affordable={affordable} onSelect={onSelect}>
        {null}
      </Hotspot>
    </>
  )
}

// ── Crew trailer ─────────────────────────────────────────────────────────

function Cabin({ position, width = 2.2 }: { position: [number, number, number]; width?: number }) {
  return (
    <group position={position}>
      <Box size={[width, 1.1, 1.1]} position={[0, 0.55, 0]} color="#f2f0ea" />
      <Box size={[width + 0.04, 0.16, 1.14]} position={[0, 0.75, 0]} color="#2d7ff9" />
      <Box size={[width + 0.1, 0.08, 1.2]} position={[0, 1.14, 0]} color="#8a96a3" />
      <Box size={[0.35, 0.75, 0.04]} position={[width / 2 - 0.35, 0.38, 0.56]} color="#6b4423" />
      <Box size={[0.5, 0.32, 0.04]} position={[-width / 2 + 0.45, 0.55, 0.56]} color="#8ec9e8" />
      <Box size={[0.04, 0.32, 0.5]} position={[width / 2 + 0.01, 0.55, 0]} color="#8ec9e8" />
    </group>
  )
}

function CrewLook({ tier }: { tier: number }) {
  if (tier === 0) {
    return (
      <group>
        <mesh position={[0, 0.65, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[1, 1.3, 4]} />
          <meshStandardMaterial color="#ff7a1a" roughness={0.9} />
        </mesh>
        <Box size={[0.5, 0.6, 0.06]} position={[0, 0.3, 0.72]} color="#7a3a10" rotation={[0, 0, 0]} />
        <Box size={[0.7, 0.05, 0.45]} position={[1.1, 0.45, 0.4]} color="#b07b45" />
        <Box size={[0.06, 0.45, 0.06]} position={[1.1, 0.22, 0.4]} color="#8a5a30" />
      </group>
    )
  }
  if (tier === 1) {
    return (
      <group>
        <Cabin position={[0, 0, 0]} />
        <Logo size={0.45} position={[0.15, 0.55, 0.56]} />
      </group>
    )
  }
  return (
    <group>
      <Cabin position={[0, 0, 0]} />
      <Cabin position={[0, 1.18, 0]} />
      <Logo size={0.5} position={[0.15, 1.72, 0.56]} />
      {/* External stairs up the right side */}
      {[0, 1, 2, 3, 4].map((i) => (
        <Box key={i} size={[0.5, 0.08, 0.45]} position={[1.4 - i * 0.02, 0.2 + i * 0.22, 0.45 - i * 0.22]} color="#5b6470" />
      ))}
      {tier === 3 && (
        <>
          <Cabin position={[-0.3, 0, -1.25]} width={2.8} />
          <Box size={[0.06, 3.4, 0.06]} position={[-1.4, 1.7, 0.6]} color="#c9ced6" />
          <Box size={[0.7, 0.45, 0.03]} position={[-1.05, 3.1, 0.6]} color="#ff6b1a" />
        </>
      )}
    </group>
  )
}

export function CrewStation({
  tier,
  affordable,
  onSelect,
}: {
  tier: number
  affordable: boolean
  onSelect: (id: StationId) => void
}) {
  const s = getStation('crew')
  return (
    <Hotspot
      id="crew"
      position={[s.position.x, 0, s.position.z]}
      hitSize={[2.6, tier >= 2 ? 2.4 : 1.4, 1.6]}
      arrowHeight={tier >= 2 ? 3 : 1.9}
      affordable={affordable}
      onSelect={onSelect}
    >
      <group rotation={[0, Math.PI / 4, 0]}>
        <CrewLook tier={tier} />
      </group>
    </Hotspot>
  )
}

// ── Tool rack ────────────────────────────────────────────────────────────

function Hammer({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0.25]} rotation={[-0.25, 0, 0]}>
      <Box size={[0.07, 1.0, 0.07]} position={[0, 0.5, 0]} color="#8a5a30" />
      <Box size={[0.32, 0.18, 0.18]} position={[0, 1.02, 0]} color="#5b6470" />
    </group>
  )
}

function Excavator() {
  return (
    <group>
      <Box size={[1.6, 0.35, 0.35]} position={[0, 0.18, 0.55]} color="#2b2b2e" />
      <Box size={[1.6, 0.35, 0.35]} position={[0, 0.18, -0.55]} color="#2b2b2e" />
      <Box size={[1.5, 0.55, 1.3]} position={[0, 0.65, 0]} color="#f2c230" />
      <Box size={[0.65, 0.65, 0.7]} position={[-0.35, 1.25, 0.25]} color="#f2c230" />
      <Box size={[0.66, 0.42, 0.5]} position={[-0.35, 1.33, 0.36]} color="#8ec9e8" />
      <Box size={[1.5, 0.22, 0.22]} position={[0.95, 1.45, -0.2]} color="#e0b020" rotation={[0, 0, 0.55]} />
      <Box size={[1.1, 0.2, 0.2]} position={[1.9, 1.35, -0.2]} color="#e0b020" rotation={[0, 0, -0.9]} />
      <Box size={[0.45, 0.4, 0.55]} position={[2.2, 0.75, -0.2]} color="#5b6470" />
    </group>
  )
}

function ToolLook({ tier }: { tier: number }) {
  return (
    <group>
      {/* Wooden rack with hammers — always there */}
      <Box size={[0.1, 1.2, 0.1]} position={[-0.6, 0.6, 0]} color="#8a5a30" />
      <Box size={[0.1, 1.2, 0.1]} position={[0.6, 0.6, 0]} color="#8a5a30" />
      <Box size={[1.4, 0.1, 0.12]} position={[0, 1.1, 0]} color="#b07b45" />
      <Hammer x={-0.35} />
      <Hammer x={0} />
      <Hammer x={0.35} />
      {tier >= 1 && (
        <group position={[0, 0, 1.0]}>
          <Box size={[0.9, 0.55, 0.55]} position={[0, 0.4, 0]} color="#f2c230" />
          <Box size={[0.2, 0.2, 0.6]} position={[-0.35, 0.12, 0]} color="#2b2b2e" />
          <Box size={[0.2, 0.2, 0.6]} position={[0.35, 0.12, 0]} color="#2b2b2e" />
          <Box size={[0.16, 0.7, 0.16]} position={[0.7, 0.35, 0.1]} color="#5b6470" />
          <Box size={[0.45, 0.08, 0.08]} position={[0.7, 0.72, 0.1]} color="#2b2b2e" />
        </group>
      )}
      {tier === 2 && (
        <group position={[-1.8, 0, 0.3]}>
          <Prop url="/models/vehicles/tractor-shovel.glb" size={1.6} rotationY={Math.PI / 4} />
        </group>
      )}
      {tier === 3 && (
        <group position={[-2.3, 0, 0.4]} rotation={[0, Math.PI / 5, 0]}>
          <Excavator />
        </group>
      )}
    </group>
  )
}

export function ToolStation({
  tier,
  affordable,
  onSelect,
}: {
  tier: number
  affordable: boolean
  onSelect: (id: StationId) => void
}) {
  const s = getStation('tools')
  return (
    <Hotspot
      id="tools"
      position={[s.position.x, 0, s.position.z]}
      hitSize={[tier >= 2 ? 4 : 2, 1.8, 2.2]}
      arrowHeight={tier >= 3 ? 2.6 : 2}
      affordable={affordable}
      onSelect={onSelect}
    >
      <group rotation={[0, -Math.PI / 4, 0]}>
        <ToolLook tier={tier} />
      </group>
    </Hotspot>
  )
}

