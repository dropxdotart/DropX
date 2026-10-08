'use client'

import { useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { Snapshot } from '@/lib/game/engine'
import { ISLANDS } from '@/lib/game/islands'
import { RARITY, manager, outfitLook, type Slot } from '@/lib/game/managers'
import { PLOT_SLOTS } from '@/lib/game/plots'
import { getStation } from '@/lib/game/stations'
import Person from './Person'
import { pointer } from './drag'

// Each hired manager walks a slow loop around their station. Tapping one
// opens the Managers sheet on their slot.

function anchor(slot: Slot): { x: number; z: number } {
  const home = PLOT_SLOTS[0]
  if (slot === 'crew' || slot === 'tools') {
    const p = getStation(slot).position
    return { x: home.x + p.x + (slot === 'crew' ? 2 : -1.5), z: home.z + p.z + (slot === 'crew' ? -1 : 1.5) }
  }
  if (slot === 'dumpster') return { x: home.x + 3.4, z: home.z + 5.6 }
  const y = slot === 'truck' ? 0 : Number(slot.slice(4))
  const yard = ISLANDS[y]?.yard ?? ISLANDS[0].yard
  return slot === 'truck' ? { x: yard.x - 6, z: yard.z + 5.5 } : { x: yard.x + 2, z: yard.z + 3 }
}

function Walker({ slot, look, ring, onTap, seed }: { slot: Slot; look: ReturnType<typeof outfitLook>; ring: string; onTap: (slot: Slot) => void; seed: number }) {
  const g = useRef<THREE.Group>(null)
  const a = anchor(slot)
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 0.35 + seed
    // A stretched loop: walk, turn, walk back.
    const x = a.x + Math.sin(t) * 1.6
    const z = a.z + Math.sin(t * 2) * 0.5
    if (g.current) {
      g.current.position.set(x, 0.02, z)
      g.current.rotation.y = Math.atan2(Math.cos(t) * 1.6, Math.cos(t * 2))
    }
  })
  return (
    <group
      ref={g}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        if (!pointer.dragged) onTap(slot)
      }}
    >
      {/* A ring in the manager's rarity colour marks them out from the crew. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.32, 0.42, 24]} />
        <meshBasicMaterial color={ring} transparent opacity={0.85} />
      </mesh>
      <Person look={look} walking seed={seed} scale={1.15} />
    </group>
  )
}

export default function ManagerWalkers({ snap, onTap }: { snap: Snapshot; onTap: (slot: Slot) => void }) {
  return (
    <>
      {(Object.entries(snap.assigned) as [Slot, string][]).map(([slot, id], i) => {
        const m = manager(id)
        if (!m) return null
        const look = m.id === 'boss' ? outfitLook(snap.outfit) : m.look
        return <Walker key={slot} slot={slot} look={look} ring={RARITY[m.rarity].color} onTap={onTap} seed={i * 1.7} />
      })}
    </>
  )
}
