'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Engine, Snapshot } from '@/lib/game/engine'
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
