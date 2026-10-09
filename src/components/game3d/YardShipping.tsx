'use client'

import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { stats, type Engine, type Fork } from '@/lib/game/engine'
import { yardBackZ } from '@/lib/game/roads'
import { Logo } from './SiteProps'
import { pointer } from './drag'

// A yard's shipping side (local to the yard's block): the brick pile by the
// unloading docks, forklifts carrying pallets out through the back gate,
// and the barge (or, at an inland yard, a freight semi on the back street)
// that loads up, leaves when full and comes back empty.

const PILE = { x: -4.9, z: 5.4 } // front-left, by the IN gate and clear of the parking bays
const GATE_X = -2.5

const mats = new Map<string, THREE.Material>()
function mat(color: string, emissive?: string) {
  const k = color + (emissive ?? '')
  let m = mats.get(k)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...(emissive ? { emissive, emissiveIntensity: 0.7 } : {}) })
    mats.set(k, m)
  }
  return m
}
function B({ s, p, c, e }: { s: [number, number, number]; p: [number, number, number]; c: string; e?: string }) {
  return (
    <mesh position={p} castShadow material={mat(c, e)}>
      <boxGeometry args={s} />
    </mesh>
  )
}

// Where the forklifts drop pallets, and where the vessel sits.
function dockGeometry(size: number, inland: boolean) {
  const back = yardBackZ(size)
  if (inland) return { back, drop: -10.2, vessel: -11.6 }
  const edge = Math.min(back - 0.5, -15)
  return { back, drop: edge + 0.6, vessel: edge - 2.4 }
}

// The forklift's way: pile → along the left side → out the back gate → dock.
function forkPath(size: number, inland: boolean) {
  const g = dockGeometry(size, inland)
  const pts = [
    new THREE.Vector3(PILE.x, 0, PILE.z - 1.8),
    new THREE.Vector3(-6.0, 0, PILE.z - 1.8),
    new THREE.Vector3(-6.0, 0, g.back + 1.2),
    new THREE.Vector3(GATE_X, 0, g.back + 1.2),
    new THREE.Vector3(GATE_X, 0, g.drop),
  ]
  const lens = pts.slice(1).map((p, i) => p.distanceTo(pts[i]))
  const total = lens.reduce((a, b) => a + b, 0)
  return (k: number) => {
    let d = Math.max(0, Math.min(1, k)) * total
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i] || i === lens.length - 1) {
        const a = pts[i]
        const b = pts[i + 1]
        const f = Math.min(1, d / lens[i])
        return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, heading: Math.atan2(b.x - a.x, b.z - a.z) }
      }
      d -= lens[i]
    }
    return { x: pts[0].x, z: pts[0].z, heading: 0 }
  }
}

// ── The brick pile ─────────────────────────────────────────────────────

const PILE_MAX = 140
const pileTmp = new THREE.Object3D()
const pileCol = new THREE.Color()
const BRICK_TONES = ['#c4553a', '#b4553c', '#d66e4f', '#9e3f2a']

function Pile({ engine, yard }: { engine: Engine; yard: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const shown = useRef(-1)
  // A heap: wider at the bottom, layer upon layer.
  const spots = useMemo(() => {
    let seed = 11
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    return Array.from({ length: PILE_MAX }, (_, i) => {
      const layer = Math.floor(Math.sqrt(i / 3))
      const r = (1.15 - layer * 0.2) * Math.sqrt(rand())
      const a = rand() * Math.PI * 2
      return { x: Math.cos(a) * r, y: 0.12 + layer * 0.22, z: Math.sin(a) * r * 0.8, rot: rand() * 3, c: BRICK_TONES[i % 4] }
    })
  }, [])
  useFrame(() => {
    const m = mesh.current
    if (!m) return
    // One brick shown per few in the pile, up to a big heap.
    const n = Math.min(PILE_MAX, Math.ceil(engine.yardOps[yard].pile / 4))
    if (n === shown.current) return
    shown.current = n
    for (let i = 0; i < n; i++) {
      const s = spots[i]
      pileTmp.position.set(s.x, s.y, s.z)
      pileTmp.rotation.set(0, s.rot, 0.15)
      pileTmp.updateMatrix()
      m.setMatrixAt(i, pileTmp.matrix)
      m.setColorAt(i, pileCol.set(s.c))
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })
  return (
    <group position={[PILE.x, 0, PILE.z]}>
      {/* A concrete bay for the pile, with a low back wall */}
      <B s={[2.9, 0.08, 2.6]} p={[0, 0.04, 0]} c="#9a958b" />
      <B s={[2.9, 0.6, 0.25]} p={[0, 0.3, 1.3]} c="#bdb9af" />
      <B s={[0.25, 0.6, 2.6]} p={[-1.45, 0.3, 0]} c="#bdb9af" />
      <instancedMesh ref={mesh} args={[undefined, undefined, PILE_MAX]} castShadow frustumCulled={false}>
        <boxGeometry args={[0.44, 0.2, 0.22]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      {/* Empty pallets stacked ready */}
      {[0, 1, 2, 3].map((k) => (
        <B key={k} s={[0.9, 0.1, 0.9]} p={[0.9, 0.06 + k * 0.13, -1.75]} c="#a0703f" />
      ))}
    </group>
  )
}

// ── Forklifts ──────────────────────────────────────────────────────────

function Forklift({ engine, yard, index, path }: { engine: Engine; yard: number; index: number; path: ReturnType<typeof forkPath> }) {
  const g = useRef<THREE.Group>(null)
  const carriage = useRef<THREE.Group>(null)
  const load = useRef<THREE.Group>(null)
  const beacon = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const f: Fork | undefined = engine.yardOps[yard].forks[index]
    if (!g.current) return
    g.current.visible = !!f
    if (!f) return
    // Along the path one way, back the other (reversing: it faces forward).
    const k = f.state === 'toDock' ? f.t : f.state === 'toPile' ? 1 - f.t : f.state === 'unloading' ? 1 : 0
    const p = path(k)
    g.current.position.set(p.x + index * 0.15, 0, p.z)
    g.current.rotation.y = p.heading + (f.state === 'toPile' ? Math.PI : 0)
    // The forks lift while picking up / setting down.
    const lifting = f.state === 'loading' || f.state === 'unloading'
    if (carriage.current) carriage.current.position.y = lifting ? 0.25 + Math.sin(f.t * Math.PI) * 0.7 : 0.25
    if (load.current) load.current.visible = f.carry > 0
    if (beacon.current) (beacon.current.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(clock.getElapsedTime() * 8) > 0 ? 1.2 : 0.2
  })
  const pallets = stats.palletsPerTrip(engine.yardU(yard))
  const beaconMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ff8a1a', emissive: '#ff6b1a', emissiveIntensity: 1 }), [])
  return (
    <group ref={g}>
      {/* Body, counterweight, wheels */}
      <B s={[0.9, 0.45, 1.3]} p={[0, 0.42, 0]} c="#f2c230" />
      <B s={[0.92, 0.5, 0.35]} p={[0, 0.45, -0.75]} c="#3a3f47" />
      {[0.42, -0.42].flatMap((z) =>
        [-0.5, 0.5].map((x) => (
          <mesh key={`${x}${z}`} position={[x, 0.22, z]} rotation={[0, 0, Math.PI / 2]} material={mat('#1d1d1f')}>
            <cylinderGeometry args={[0.22, 0.22, 0.18, 12]} />
          </mesh>
        ))
      )}
      {/* Seat, driver and the overhead guard */}
      <B s={[0.45, 0.25, 0.4]} p={[0, 0.78, -0.25]} c="#1d1d1f" />
      <B s={[0.32, 0.38, 0.24]} p={[0, 1.05, -0.2]} c="#ff7a1a" />
      <B s={[0.24, 0.24, 0.24]} p={[0, 1.36, -0.18]} c="#f0cfae" />
      <B s={[0.3, 0.1, 0.3]} p={[0, 1.52, -0.18]} c="#f2c230" />
      {[-0.4, 0.4].flatMap((x) => [0.3, -0.55].map((z) => <B key={`${x}${z}`} s={[0.06, 1.0, 0.06]} p={[x, 1.15, z]} c="#2b2b2e" />))}
      <B s={[0.9, 0.06, 0.95]} p={[0, 1.66, -0.12]} c="#2b2b2e" />
      <mesh ref={beacon} position={[0, 1.76, -0.4]} material={beaconMat}>
        <boxGeometry args={[0.14, 0.12, 0.14]} />
      </mesh>
      {/* Our logo on both sides */}
      <Logo size={0.34} position={[0.46, 0.45, 0.1]} rotationY={Math.PI / 2} />
      <Logo size={0.34} position={[-0.46, 0.45, 0.1]} rotationY={-Math.PI / 2} />
      {/* Mast and the carriage that slides up it, forks and the load */}
      {[-0.3, 0.3].map((x) => (
        <B key={x} s={[0.08, 1.8, 0.08]} p={[x, 0.95, 0.72]} c="#5b6470" />
      ))}
      <group ref={carriage} position={[0, 0.25, 0.78]}>
        <B s={[0.7, 0.25, 0.06]} p={[0, 0.1, 0]} c="#3a3a3e" />
        {[-0.2, 0.2].map((x) => (
          <B key={x} s={[0.08, 0.04, 0.9]} p={[x, -0.02, 0.45]} c="#3a3a3e" />
        ))}
        <group ref={load} position={[0, 0.05, 0.48]}>
          {Array.from({ length: pallets }, (_, k) => (
            <group key={k} position={[0, k * 0.36, 0]}>
              <B s={[0.85, 0.08, 0.85]} p={[0, 0, 0]} c="#a0703f" />
              <B s={[0.75, 0.24, 0.75]} p={[0, 0.16, 0]} c={BRICK_TONES[k % 4]} />
              <B s={[0.77, 0.04, 0.77]} p={[0, 0.2, 0]} c="#f2f0ea" />
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}

// ── The barge / freight semi ───────────────────────────────────────────

function Vessel({ engine, yard, inland, g }: { engine: Engine; yard: number; inland: boolean; g: ReturnType<typeof dockGeometry> }) {
  const group = useRef<THREE.Group>(null)
  const cargo = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const ops = engine.yardOps[yard]
    const total = stats.shipAwaySeconds(engine.yardU(yard))
    const away = ops.ship.away
    // Leaving for the first 3 s of a trip, arriving for the last 3 s.
    let off = 0
    if (away > 0) {
      const out = total - away
      off = out < 3 ? out / 3 : away < 3 ? away / 3 : 1
    }
    const k = off * off
    if (group.current) {
      if (inland) group.current.position.set(GATE_X + 1.5 + k * 40, 0, g.vessel)
      else {
        group.current.position.set(GATE_X + 0.5 + k * 8, -0.05 + Math.sin(clock.getElapsedTime() * 1.2) * 0.06, g.vessel - k * 40)
        group.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.9) * 0.02
      }
      group.current.visible = off < 0.999
    }
    // Pallets fill the deck as it loads.
    const cap = stats.shipCapacity(engine.yardU(yard))
    const n = away > 0 ? (off < 1 ? 12 : 0) : Math.min(12, Math.ceil((ops.ship.load / cap) * 12))
    cargo.current?.children.forEach((c, i) => (c.visible = i < n))
  })
  const slots = Array.from({ length: 12 }, (_, i) => ({ x: -1.8 + (i % 4) * 1.2, z: -0.5 + Math.floor(i / 4) * 0 , y: Math.floor(i / 4) * 0.36 }))
  if (inland)
    return (
      <group ref={group}>
        {/* Semi: cab and a flatbed trailer along the back street (facing +x) */}
        <group rotation={[0, Math.PI / 2, 0]}>
          <B s={[1.9, 1.4, 1.6]} p={[0, 1.2, 4.2]} c="#2d7ff9" />
          <B s={[1.86, 0.5, 0.05]} p={[0, 1.5, 5.03]} c="#8ec9e8" />
          <Logo size={0.6} position={[0.96, 1.15, 4.1]} rotationY={Math.PI / 2} />
          <Logo size={0.6} position={[-0.96, 1.15, 4.1]} rotationY={-Math.PI / 2} />
          <B s={[2, 0.3, 7]} p={[0, 0.75, 0]} c="#5b6470" />
          {[2.8, 1.8, -2.4, -3.2].flatMap((z) =>
            [-0.9, 0.9].map((x) => (
              <mesh key={`${x}${z}`} position={[x, 0.4, z]} rotation={[0, 0, Math.PI / 2]} material={mat('#1d1d1f')}>
                <cylinderGeometry args={[0.38, 0.38, 0.3, 12]} />
              </mesh>
            ))
          )}
          <group ref={cargo} position={[0, 0.95, 0]} rotation={[0, Math.PI / 2, 0]}>
            {slots.map((s, i) => (
              <group key={i} position={[s.x, s.y, 0]}>
                <B s={[0.85, 0.08, 0.85]} p={[0, 0, 0]} c="#a0703f" />
                <B s={[0.75, 0.26, 0.75]} p={[0, 0.17, 0]} c={BRICK_TONES[i % 4]} />
              </group>
            ))}
          </group>
        </group>
      </group>
    )
  return (
    <group ref={group}>
      {/* Hull with a red waterline stripe and our logo, a wheelhouse aft */}
      <B s={[6.2, 0.9, 2.6]} p={[0, 0.1, 0]} c="#24365a" />
      <B s={[6.24, 0.16, 2.64]} p={[0, -0.25, 0]} c="#d64545" />
      <B s={[6.0, 0.08, 2.4]} p={[0, 0.58, 0]} c="#8a5a30" />
      <Logo size={0.8} position={[0.6, 0.2, 1.31]} />
      <B s={[1.1, 1.0, 1.6]} p={[2.6, 1.1, 0]} c="#ffffff" />
      <B s={[0.05, 0.35, 1.3]} p={[2.03, 1.3, 0]} c="#8ec9e8" />
      <B s={[1.2, 0.1, 1.7]} p={[2.6, 1.65, 0]} c="#d64545" />
      <B s={[0.1, 0.7, 0.1]} p={[2.9, 2.0, 0.4]} c="#2b2b2e" />
      {/* Bollards and a life ring */}
      <mesh position={[-2.9, 0.75, 1.0]} rotation={[0, 0, Math.PI / 2]} material={mat('#ff6b1a')}>
        <torusGeometry args={[0.22, 0.07, 6, 14]} />
      </mesh>
      <group ref={cargo} position={[-0.6, 0.66, 0]}>
        {slots.map((s, i) => (
          <group key={i} position={[s.x * 0.85, s.y, (i % 2 ? 0.5 : -0.5)]}>
            <B s={[0.85, 0.08, 0.85]} p={[0, 0, 0]} c="#a0703f" />
            <B s={[0.75, 0.26, 0.75]} p={[0, 0.17, 0]} c={BRICK_TONES[i % 4]} />
          </group>
        ))}
      </group>
    </group>
  )
}

export default function YardShipping({ engine, yard, setting, size, onSelect }: { engine: Engine; yard: number; setting: 'shore' | 'inland'; size: number; onSelect: () => void }) {
  const inland = setting === 'inland'
  const g = useMemo(() => dockGeometry(size, inland), [size, inland])
  const path = useMemo(() => forkPath(size, inland), [size, inland])
  const tap = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (!pointer.dragged) onSelect()
  }
  return (
    <group onClick={tap}>
      <Pile engine={engine} yard={yard} />
      {Array.from({ length: 6 }, (_, i) => (
        <Forklift key={i} engine={engine} yard={yard} index={i} path={path} />
      ))}
      {/* The dock: a concrete apron past the gate with a sign */}
      {!inland && <B s={[3.4, 0.12, Math.max(1, g.back - g.drop + 1)]} p={[GATE_X, 0.02, (g.back + g.drop) / 2]} c="#b9b2a4" />}
      <group position={[GATE_X - 2.1, 0, g.drop + 0.6]}>
        <B s={[0.1, 1.6, 0.1]} p={[0, 0.8, 0]} c="#5b6470" />
        <B s={[1.4, 0.55, 0.08]} p={[0, 1.6, 0]} c="#1d3a6e" />
        <Logo size={0.4} position={[-0.35, 1.6, 0.05]} />
        <B s={[0.6, 0.12, 0.02]} p={[0.25, 1.6, 0.05]} c="#f2c230" />
      </group>
      <Vessel engine={engine} yard={yard} inland={inland} g={g} />
    </group>
  )
}
