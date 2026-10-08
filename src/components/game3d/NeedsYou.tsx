'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { BALL_FX_MS, DYNAMITE_FX_MS, LOT_HALF, ROAD_Z, type Engine, type Snapshot } from '@/lib/game/engine'
import { PLOT_SLOTS } from '@/lib/game/plots'
import { Emo } from '@/components/game/Icons'

// Bubbles over things that need you: a truck broken down at the roadside,
// a worker sat down on a break, a traffic jam. Tap one to sort it out.

export type Need = { kind: 'truck'; id: number } | { kind: 'worker'; id: number } | { kind: 'jam' }

function Bubble({ emoji, label, onTap, color }: { emoji: string; label: string; onTap: () => void; color: string }) {
  return (
    <Html center zIndexRange={[6, 0]} position={[0, 2.6, 0]}>
      <button
        onClick={onTap}
        className="needs-you flex flex-col items-center rounded-2xl border-[3px] border-white px-2.5 py-1 font-display text-white shadow-[0_4px_0_rgba(0,0,0,0.25)]"
        style={{ background: color }}
      >
        <Emo e={emoji} size={28} />
        <span className="whitespace-nowrap text-[11px] leading-tight">{label}</span>
      </button>
    </Html>
  )
}

function FollowTruck({ engine, id, children }: { engine: Engine; id: number; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null)
  const smoke = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const t = engine.trucks[id]
    if (!t || !g.current) return
    g.current.position.set(t.x, 0, t.z)
    if (smoke.current) {
      const k = (clock.getElapsedTime() * 0.8) % 1
      smoke.current.position.y = 1.4 + k * 2
      smoke.current.scale.setScalar(0.4 + k * 0.9)
      ;(smoke.current.material as THREE.MeshStandardMaterial).opacity = 0.6 * (1 - k)
    }
  })
  return (
    <group ref={g}>
      <mesh ref={smoke}>
        <sphereGeometry args={[0.6, 10, 8]} />
        <meshStandardMaterial color="#555b63" transparent opacity={0.5} depthWrite={false} />
      </mesh>
      {children}
    </group>
  )
}

function FollowWorker({ engine, id, children }: { engine: Engine; id: number; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    const w = engine.workers.find((x) => x.id === id)
    const slot = w && PLOT_SLOTS[w.plot]
    if (!w || !slot || !g.current) return
    g.current.position.set(slot.x + w.x, 0, slot.z + w.z)
  })
  return <group ref={g}>{children}</group>
}

export default function NeedsYou({ engine, snap, onNeed }: { engine: Engine; snap: Snapshot; onNeed: (need: Need) => void }) {
  const home = PLOT_SLOTS[0]
  const { brokenTruck, restingWorker, jam } = snap.needs
  return (
    <>
      {brokenTruck !== null && (
        <FollowTruck engine={engine} id={brokenTruck}>
          <Bubble emoji="🔧" label="Truck broke down!" color="#e23f3f" onTap={() => onNeed({ kind: 'truck', id: brokenTruck })} />
        </FollowTruck>
      )}
      {restingWorker !== null && (
        <FollowWorker engine={engine} id={restingWorker}>
          <Bubble emoji="☕" label="On a break" color="#8a5a30" onTap={() => onNeed({ kind: 'worker', id: restingWorker })} />
        </FollowWorker>
      )}
      {jam && (
        // At the crossroads by the home lot, with a queue of cars.
        <group position={[home.x + 11.5, 0, home.z + 11.5]}>
          {[0, 1, 2].map((k) => (
            <mesh key={k} position={[-2.5 - k * 2.2, 0.45, 0.65]} castShadow>
              <boxGeometry args={[1.6, 0.7, 0.8]} />
              <meshStandardMaterial color={['#d64545', '#2d7ff9', '#f2c230'][k]} />
            </mesh>
          ))}
          <Bubble emoji="🚦" label="Traffic jam!" color="#ef7d2d" onTap={() => onNeed({ kind: 'jam' })} />
        </group>
      )}
    </>
  )
}

// The tools, delivered by truck (positions local to the plot; the street
// runs along z = ROAD_Z in front of the lot):
//  - Wrecking ball: a crane truck drives up, raises its boom, winds the ball
//    back and swings it into the building twice, folds up and drives off.
//  - Dynamite: a delivery truck drops a crate of TNT and leaves; sticks go
//    on the building, the fuse fizzles along, then BOOM.
// Hit times match the engine's BALL_HITS_MS / DYNAMITE_BOOM_MS.

const ROAD = ROAD_Z - 0.6
const STOP_X = 5
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const ease = (v: number) => {
  const k = clamp01(v)
  return k * k * (3 - 2 * k)
}
// Where a delivery truck is along the street at `age` seconds.
function truckX(age: number, arrive: number, leaveAt: number, leave: number) {
  if (age < arrive) return 30 - (30 - STOP_X) * ease(age / arrive)
  if (age < leaveAt) return STOP_X
  return STOP_X - 30 * ease((age - leaveAt) / leave)
}

function Box({ size, position, color }: { size: [number, number, number]; position: [number, number, number]; color: string }) {
  return (
    <mesh position={position} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

// A chunky truck body, nose toward −x (the way it drives in).
function TruckBody({ color, bed }: { color: string; bed: string }) {
  return (
    <group>
      <Box size={[1.6, 1.3, 1.7]} position={[-1.9, 0.95, 0]} color={color} />
      <Box size={[0.1, 0.6, 1.4]} position={[-2.71, 1.2, 0]} color="#8ec9e8" />
      <Box size={[3.4, 0.5, 1.8]} position={[0.6, 0.55, 0]} color={bed} />
      {[-1.9, 0.2, 1.6].map((x) =>
        [-0.85, 0.85].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.32, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.32, 0.32, 0.25, 12]} />
            <meshStandardMaterial color="#1d1d1f" />
          </mesh>
        ))
      )}
    </group>
  )
}

function BallFx({ at }: { at: number }) {
  const truck = useRef<THREE.Group>(null)
  const boom = useRef<THREE.Group>(null)
  const pendulum = useRef<THREE.Group>(null)
  const L = 11 // boom length
  const CHAIN = 6.5
  useFrame(() => {
    const age = (Date.now() - at) / 1000
    if (truck.current) truck.current.position.x = truckX(age, 1.5, 6.0, 1.5)
    // Boom up 1.5–2.5 s, down 5.2–6.0 s.
    const up = age < 5.2 ? ease((age - 1.5) / 1.0) : 1 - ease((age - 5.2) / 0.8)
    const tilt = 0.12 + up * 0.95 // radians above flat, leaning over the lot
    if (boom.current) boom.current.rotation.x = tilt
    // The ball swings on its chain: back, in (hit 3.5 s), back, in (hit 4.7 s), settle.
    let swing = 0
    if (age >= 2.5 && age < 3.1) swing = -0.7 * ease((age - 2.5) / 0.6)
    else if (age >= 3.1 && age < 3.5) swing = -0.7 + 1.25 * ease((age - 3.1) / 0.4)
    else if (age >= 3.5 && age < 4.2) swing = 0.55 - 1.25 * ease((age - 3.5) / 0.7)
    else if (age >= 4.2 && age < 4.7) swing = -0.7 + 1.25 * ease((age - 4.2) / 0.5)
    else if (age >= 4.7 && age < 5.2) swing = 0.55 * (1 - ease((age - 4.7) / 0.5))
    if (pendulum.current) {
      pendulum.current.rotation.x = -tilt + swing // keep the chain hanging down, then swing
      pendulum.current.visible = up > 0.2
    }
  })
  return (
    <group ref={truck} position={[30, 0, ROAD]}>
      <TruckBody color="#f2c230" bed="#5b6470" />
      {/* The boom pivots at the back of the truck and leans toward the lot (−z) */}
      <group position={[0.8, 1.2, 0]} rotation={[0, 0, 0]}>
        <group ref={boom} rotation={[0.12, 0, 0]}>
          <Box size={[0.45, 0.45, L]} position={[0, 0, -L / 2]} color="#e0b020" />
          <group ref={pendulum} position={[0, 0, -L]}>
            <Box size={[0.08, CHAIN, 0.08]} position={[0, -CHAIN / 2, 0]} color="#3a3a3e" />
            <mesh position={[0, -CHAIN - 0.9, 0]} castShadow>
              <sphereGeometry args={[1.0, 16, 12]} />
              <meshStandardMaterial color="#2b2b2e" metalness={0.4} roughness={0.5} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}

function DynamiteFx({ at }: { at: number }) {
  const truck = useRef<THREE.Group>(null)
  const crate = useRef<THREE.Group>(null)
  const spark = useRef<THREE.Mesh>(null)
  const sticks = useRef<THREE.Group>(null)
  const boom = useRef<THREE.Mesh>(null)
  const smoke = useRef<THREE.Group>(null)
  const BOOM = 4.5
  const crateAt = new THREE.Vector3(STOP_X - 1, 0.35, LOT_HALF - 0.6)
  const sticksAt = new THREE.Vector3(0, 0.9, 2.5)
  useFrame(() => {
    const age = (Date.now() - at) / 1000
    if (truck.current) truck.current.position.x = truckX(age, 1.5, 2.1, 1.4)
    // The crate slides off the back 1.5–2.0 s, then sits until the blast.
    if (crate.current) {
      crate.current.visible = age >= 1.5 && age < BOOM
      const k = ease((age - 1.5) / 0.5)
      crate.current.position.set(crateAt.x, crateAt.y + (1 - k) * 0.6, ROAD - (ROAD - crateAt.z) * k)
    }
    if (sticks.current) sticks.current.visible = age >= 2.0 && age < BOOM
    // The fuse fizzles from the crate to the sticks, 2.0–4.5 s.
    if (spark.current) {
      const k = clamp01((age - 2.0) / (BOOM - 2.0))
      spark.current.visible = age >= 2.0 && age < BOOM
      spark.current.position.lerpVectors(crateAt, sticksAt, k)
      spark.current.scale.setScalar(0.8 + Math.sin(age * 40) * 0.35)
    }
    // BOOM: a fireball, then smoke drifting up.
    const b = age - BOOM
    if (boom.current) {
      boom.current.visible = b >= 0 && b < 1.4
      boom.current.scale.setScalar(0.5 + ease(b / 0.5) * 7)
      ;(boom.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - b / 1.4))
    }
    if (smoke.current) {
      smoke.current.visible = b >= 0.2 && b < 3.5
      smoke.current.children.forEach((c, i) => {
        const k = clamp01((b - 0.2) / 3.3)
        c.position.y = 2 + k * (5 + i)
        c.scale.setScalar(1 + k * 2.5)
        ;((c as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.7 * (1 - k)
      })
    }
  })
  return (
    <group>
      <group ref={truck} position={[30, 0, ROAD]}>
        <TruckBody color="#d64545" bed="#8a5a30" />
      </group>
      <group ref={crate}>
        <Box size={[1.1, 0.7, 0.8]} position={[0, 0, 0]} color="#a0703f" />
        <Box size={[1.12, 0.18, 0.82]} position={[0, 0.1, 0]} color="#d64545" />
      </group>
      <group ref={sticks} position={[sticksAt.x, sticksAt.y, sticksAt.z]}>
        {[-0.3, 0, 0.3].map((x) => (
          <mesh key={x} position={[x, 0, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.12, 0.9, 10]} />
            <meshStandardMaterial color="#d64545" />
          </mesh>
        ))}
      </group>
      <mesh ref={spark}>
        <sphereGeometry args={[0.18, 10, 8]} />
        <meshBasicMaterial color="#fff2a8" />
      </mesh>
      <mesh ref={boom} position={[0, 2.5, 1]}>
        <sphereGeometry args={[1, 20, 16]} />
        <meshBasicMaterial color="#ffb02e" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <group ref={smoke}>
        {[-2, 0, 2, -1, 1].map((x, i) => (
          <mesh key={i} position={[x, 2, (i % 2) - 0.5]}>
            <sphereGeometry args={[1.2, 12, 10]} />
            <meshStandardMaterial color="#6b6f75" transparent opacity={0.6} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

export function ToolFx({ fx }: { fx: Snapshot['toolFx'] }) {
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!group.current || !fx) return
    const age = Date.now() - fx.at
    group.current.visible = age < (fx.kind === 'ball' ? BALL_FX_MS : DYNAMITE_FX_MS)
  })
  if (!fx) return null
  return <group ref={group}>{fx.kind === 'ball' ? <BallFx at={fx.at} /> : <DynamiteFx at={fx.at} />}</group>
}
