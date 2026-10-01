'use client'

import { useRef, type ReactNode } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { DUMPSTER, TRUCK_STOP, stats, type Engine, type Site } from '@/lib/game/engine'
import { getStation, type StationId } from '@/lib/game/stations'
import Prop from './Prop'
import { pointer } from './drag'
import { Logo } from './SiteProps'

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
        <group position={[2.2, 0, 0]}>
          <Box size={[1.1, 1.7, 1.6]} position={[0, 0.85, 0]} color="#7d8794" />
          <Box size={[1.12, 0.25, 1.62]} position={[0, 0.3, 0]} color="#f2c230" />
          <Box size={[0.4, 0.3, 0.3]} position={[0, 1.85, 0]} color="#e23f3f" />
          <Box size={[0.35, 0.35, 0.05]} position={[0.2, 1.1, 0.82]} color="#3fdc4f" />
        </group>
      )}
    </group>
  )
}

export function DumpsterStation({
  engine,
  site,
  tier,
  affordable,
  onSelect,
}: {
  engine: Engine
  site: Site
  tier: number
  affordable: boolean
  onSelect: (id: StationId) => void
}) {
  const fill = useRef<THREE.Mesh>(null)
  const dims = DUMPSTER_TIERS[tier]

  useFrame(() => {
    const ratio = Math.min(1, site.dumpsterLoad / stats.dumpsterCapacity(engine.upgrades))
    if (fill.current) {
      fill.current.visible = ratio > 0
      fill.current.scale.y = Math.max(0.01, ratio)
      fill.current.position.y = dims.y0 + (dims.h * ratio) / 2
    }
  })

  return (
    <Hotspot
      id="dumpster"
      position={[DUMPSTER.x, 0, DUMPSTER.z]}
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
  )
}

// ── Trucks ───────────────────────────────────────────────────────────────

const TRUCK_TIERS = [
  { url: '/models/vehicles/truck-flat.glb', size: 1.5, half: 0.78, logo: 0.6 },
  { url: '/models/vehicles/truck.glb', size: 1.75, half: 0.9, logo: 0.75 },
  { url: '/models/vehicles/garbage-truck.glb', size: 1.9, half: 0.87, logo: 0.8 },
  { url: '/models/vehicles/garbage-truck.glb', size: 2.45, half: 1.11, logo: 1.05 },
]

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
  const look = TRUCK_TIERS[tier]

  useFrame(() => {
    const g = group.current
    const t = engine.trucks[id]
    if (!g || !t) return
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

// The pickup sign at each plot's truck stop — always there to tap, since
// the trucks are usually off driving.
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
      position={[TRUCK_STOP.x + 2.6, 0, TRUCK_STOP.z + 1.7]}
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
// recycling plant at milestones. Local to YARD_BLOCK; the unload bay faces
// the front road (+z).
function YardLook({ tier }: { tier: number }) {
  const piles = [
    [-5.5, 4],
    [-4, 5.2],
    [5.5, 5],
  ]
  return (
    <group>
      {/* Concrete yard */}
      <Box size={[16, 0.06, 16]} position={[0, 0.02, 0]} color={tier >= 2 ? '#b7bcc4' : '#c8ab7e'} />
      {piles.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.45, z]} castShadow>
          <coneGeometry args={[1.2, 0.9 + tier * 0.3, 7]} />
          <meshStandardMaterial color="#b4553c" roughness={0.95} />
        </mesh>
      ))}
      {tier === 0 ? (
        <>
          {/* Scrap heap: a shed and a weigh station */}
          <Box size={[5, 2.4, 3.5]} position={[1, 1.2, -2]} color="#8d6e4c" />
          <Box size={[5.4, 0.25, 3.9]} position={[1, 2.5, -2]} color="#5a5f6b" />
        </>
      ) : (
        <>
          {/* Plant hall */}
          <Box size={[8, 3 + tier, 5]} position={[1, (3 + tier) / 2, -2.5]} color={tier >= 3 ? '#e8edf3' : '#cfd5dd'} />
          <Box size={[8.4, 0.3, 5.4]} position={[1, 3 + tier + 0.15, -2.5]} color="#ff6b1a" />
          <Box size={[3, 2.2, 0.15]} position={[1, 1.1, 0.05]} color="#3a3a3e" />
          <Logo size={1.6} position={[-1.9, 2 + tier * 0.5, 0.05]} />
          {tier >= 2 && (
            <>
              {/* Chimney + conveyor */}
              <Box size={[0.9, 6 + tier, 0.9]} position={[4, (6 + tier) / 2, -4]} color="#7d8794" />
              <Box size={[0.9, 0.3, 0.9]} position={[4, 6 + tier, -4]} color="#e23f3f" />
              <Box size={[1, 0.25, 5]} position={[-4.5, 1.6, 0]} color="#3a3a3e" rotation={[0.35, 0, 0]} />
            </>
          )}
        </>
      )}
      {/* Unload bay sign by the road */}
      <Box size={[0.15, 2, 0.15]} position={[3.5, 1, 6.6]} color="#5b6470" />
      <Box size={[2.4, 0.8, 0.1]} position={[3.5, 2.1, 6.6]} color="#1d3a6e" />
      <Logo size={0.6} position={[2.7, 2.1, 6.66]} />
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
    <Hotspot id="yard" position={[0, 0, 0]} hitSize={[11, 5, 9]} arrowHeight={5 + tier} affordable={affordable} onSelect={onSelect}>
      <YardLook tier={tier} />
    </Hotspot>
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

