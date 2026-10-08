'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Engine, Snapshot } from '@/lib/game/engine'
import { PLOT_SLOTS } from '@/lib/game/plots'

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
        <span className="text-2xl leading-none">{emoji}</span>
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

// The wrecking ball swinging into the building, or a dynamite blast —
// played for a moment after the tool is used (positions local to the plot).
export function ToolFx({ fx }: { fx: Snapshot['toolFx'] }) {
  const ball = useRef<THREE.Group>(null)
  const boom = useRef<THREE.Mesh>(null)
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    const age = fx ? (Date.now() - fx.at) / 1000 : 99
    const g = group.current
    if (!g) return
    g.visible = age < 2.2
    if (!g.visible || !fx) return
    if (fx.kind === 'ball' && ball.current) {
      // Swing in from the front-right, hit, swing back.
      const k = Math.min(1, age / 0.8)
      const swing = age < 0.8 ? -1.1 + k * 1.3 : 0.2 - (age - 0.8) * 0.6
      ball.current.rotation.z = swing
    }
    if (fx.kind === 'dynamite' && boom.current) {
      const k = Math.min(1, age / 0.6)
      boom.current.scale.setScalar(0.5 + k * 6)
      ;(boom.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * (1 - age / 1.2))
    }
  })
  if (!fx) return null
  return (
    <group ref={group}>
      {fx.kind === 'ball' ? (
        <group position={[9.5, 0, 6]}>
          {/* Crane: mast and jib, with the ball on a chain */}
          <mesh position={[0, 6, 0]} castShadow>
            <boxGeometry args={[0.5, 12, 0.5]} />
            <meshStandardMaterial color="#e0b020" />
          </mesh>
          <mesh position={[-3, 12, -2]} rotation={[0, Math.atan2(2, 3), 0]} castShadow>
            <boxGeometry args={[7.5, 0.4, 0.4]} />
            <meshStandardMaterial color="#f2c230" />
          </mesh>
          <group ref={ball} position={[-5.5, 12, -3.5]}>
            <mesh position={[0, -4, 0]}>
              <boxGeometry args={[0.08, 8, 0.08]} />
              <meshStandardMaterial color="#3a3a3e" />
            </mesh>
            <mesh position={[0, -8.4, 0]} castShadow>
              <sphereGeometry args={[1.1, 16, 12]} />
              <meshStandardMaterial color="#2b2b2e" metalness={0.4} roughness={0.5} />
            </mesh>
          </group>
        </group>
      ) : (
        <mesh ref={boom} position={[0, 3, 0]}>
          <sphereGeometry args={[1, 18, 14]} />
          <meshBasicMaterial color="#ffb02e" transparent opacity={0.8} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}
