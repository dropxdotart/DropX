'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BALL_FX_MS, DYNAMITE_FX_MS, type Snapshot } from '@/lib/game/engine'
import { ISLANDS } from '@/lib/game/islands'
import { PLOT_SLOTS } from '@/lib/game/plots'
import { planRoute, plotStop, yardGateIn, yardGateOut, type Point } from '@/lib/game/roads'
import { Logo } from './SiteProps'

// The tools arrive by truck, driving in along the real streets from the
// island's yard, parking beside the lot (clear of the dump trucks' stop)
// and driving off again afterwards:
//  - the crane truck lowers its outriggers, raises the boom and swings the
//    wrecking ball into the building twice;
//  - the TNT truck drops a crate of dynamite and leaves; sticks go on the
//    building, the fuse fizzles along, then BOOM.
// Hit times match the engine's BALL_HITS_MS / DYNAMITE_BOOM_MS.

const ARRIVE = 2.5 // seconds of driving in
const LEAVE = 2.2 // seconds of driving off
const DRIVE_IN = 45 // how far along the streets they come from (world units)
const PARK_DX = 5 // park this far along from the dump trucks' stop

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const ease = (v: number) => {
  const k = clamp01(v)
  return k * k * (3 - 2 * k)
}
const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 2)

// A route as a walkable polyline: position and heading at a distance.
function polyline(points: Point[]) {
  const segs: { a: Point; b: Point; len: number; at: number }[] = []
  let total = 0
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]
    const b = points[i + 1]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    if (len < 0.01) continue
    segs.push({ a, b, len, at: total })
    total += len
  }
  const at = (d: number) => {
    const dd = Math.max(0, Math.min(total, d))
    const s = segs.find((g) => dd <= g.at + g.len) ?? segs[segs.length - 1]
    if (!s) return { x: points[0]?.x ?? 0, z: points[0]?.z ?? 0, heading: 0 }
    const k = (dd - s.at) / s.len
    return { x: s.a.x + (s.b.x - s.a.x) * k, z: s.a.z + (s.b.z - s.a.z) * k, heading: Math.atan2(s.b.x - s.a.x, s.b.z - s.a.z) }
  }
  return { total, at }
}

// Both legs for a plot: the last stretch of the way in, and the first
// stretch of the way back to the yard.
function useRoutes(plot: number) {
  return useMemo(() => {
    const slot = PLOT_SLOTS[plot]
    const y = Math.max(0, ISLANDS.findIndex((s) => s.id === slot.island))
    const stop = plotStop(plot)
    const park = { x: stop.x + PARK_DX, line: stop.line }
    const inRoute = polyline([{ x: yardGateOut(y).x, z: yardGateOut(y).line - 0.6 }, ...planRoute(yardGateOut(y), park)])
    const outRoute = polyline([{ x: park.x, z: park.line - 0.6 }, ...planRoute(park, yardGateIn(y))])
    return { inRoute, outRoute, park: { x: park.x, z: park.line - 0.6 } }
  }, [plot])
}

// Where a tool truck is at `age` seconds: driving in, parked, driving off.
function truckPose(age: number, r: ReturnType<typeof useRoutes>, leaveAt: number) {
  if (age < ARRIVE) {
    const start = Math.max(0, r.inRoute.total - DRIVE_IN)
    return { ...r.inRoute.at(start + (r.inRoute.total - start) * easeOut(age / ARRIVE)), moving: true }
  }
  if (age < leaveAt) {
    const end = r.inRoute.at(r.inRoute.total)
    return { x: r.park.x, z: r.park.z, heading: end.heading, moving: false }
  }
  const k = ease((age - leaveAt) / LEAVE)
  return { ...r.outRoute.at(Math.min(r.outRoute.total, DRIVE_IN) * k), moving: true }
}

// ── The trucks ─────────────────────────────────────────────────────────

const mats = new Map<string, THREE.Material>()
function mat(color: string, emissive?: string) {
  const k = color + (emissive ?? '')
  let m = mats.get(k)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...(emissive ? { emissive, emissiveIntensity: 0.8 } : {}) })
    mats.set(k, m)
  }
  return m
}

function B({ s, p, c, e, r }: { s: [number, number, number]; p: [number, number, number]; c: string; e?: string; r?: [number, number, number] }) {
  return (
    <mesh position={p} rotation={r} castShadow material={mat(c, e)}>
      <boxGeometry args={s} />
    </mesh>
  )
}

// A canvas sign (hazard stripes, the explosives diamond…), drawn once.
const signs = new Map<string, THREE.Texture>()
function sign(kind: 'stripes' | 'tnt') {
  let t = signs.get(kind)
  if (!t && typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 64
    const g = c.getContext('2d')!
    if (kind === 'stripes') {
      g.fillStyle = '#f2c230'
      g.fillRect(0, 0, 128, 64)
      g.fillStyle = '#1d1d1f'
      for (let x = -64; x < 128; x += 24) {
        g.beginPath()
        g.moveTo(x, 64)
        g.lineTo(x + 12, 64)
        g.lineTo(x + 76, 0)
        g.lineTo(x + 64, 0)
        g.fill()
      }
    } else {
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, 128, 64)
      g.save()
      g.translate(32, 32)
      g.rotate(Math.PI / 4)
      g.fillStyle = '#e23f3f'
      g.fillRect(-19, -19, 38, 38)
      g.restore()
      g.fillStyle = '#ffffff'
      g.font = 'bold 18px sans-serif'
      g.fillText('!', 28, 39)
      g.fillStyle = '#1d3a6e'
      g.font = 'bold 15px sans-serif'
      g.fillText('DANGER', 62, 28)
      g.fillText('BOOM!', 62, 46)
    }
    t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    signs.set(kind, t)
  }
  return t ?? null
}

function Decal({ kind, w, h, p, r }: { kind: 'stripes' | 'tnt'; w: number; h: number; p: [number, number, number]; r?: [number, number, number] }) {
  const tex = sign(kind)
  return (
    <mesh position={p} rotation={r}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex ?? undefined} />
    </mesh>
  )
}

// The cab and chassis both trucks share. Nose toward +z (the way `heading`
// points). Wheels spin while it's moving; the beacon always turns.
export function Cab({ color, spin }: { color: string; spin: React.RefObject<number> }) {
  const wheels = useRef<THREE.Group>(null)
  const beacon = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    wheels.current?.children.forEach((w) => (w.rotation.x += (spin.current ?? 0) * dt * 6))
    if (beacon.current) beacon.current.rotation.y += dt * 6
  })
  return (
    <group>
      {/* Chassis rails and bumpers */}
      <B s={[1.5, 0.25, 5.2]} p={[0, 0.55, 0]} c="#2b2b2e" />
      <B s={[1.9, 0.3, 0.25]} p={[0, 0.6, 2.75]} c="#9aa5b1" />
      <Decal kind="stripes" w={1.8} h={0.22} p={[0, 0.6, 2.885]} />
      <B s={[1.9, 0.3, 0.2]} p={[0, 0.6, -2.7]} c="#2b2b2e" />
      {/* Cab */}
      <B s={[1.9, 1.3, 1.5]} p={[0, 1.35, 1.85]} c={color} />
      <B s={[1.86, 0.55, 0.05]} p={[0, 1.65, 2.61]} c="#8ec9e8" />
      <B s={[0.05, 0.5, 0.8]} p={[0.96, 1.65, 1.9]} c="#8ec9e8" />
      <B s={[0.05, 0.5, 0.8]} p={[-0.96, 1.65, 1.9]} c="#8ec9e8" />
      <B s={[1.95, 0.12, 1.55]} p={[0, 2.05, 1.85]} c="#ffffff" />
      {/* Grille, headlights, indicators */}
      <B s={[1.2, 0.45, 0.06]} p={[0, 1.0, 2.62]} c="#3a3f47" />
      {[-0.55, -0.35, -0.15, 0.05, 0.25, 0.45].map((x) => (
        <B key={x} s={[0.06, 0.38, 0.03]} p={[x + 0.05, 1.0, 2.66]} c="#9aa5b1" />
      ))}
      {[-0.78, 0.78].map((x) => (
        <group key={x}>
          <B s={[0.32, 0.22, 0.06]} p={[x, 1.0, 2.62]} c="#fff6c8" e="#ffe08a" />
          <B s={[0.18, 0.12, 0.06]} p={[x, 0.78, 2.62]} c="#ff8a1a" e="#c95a00" />
          {/* Mirror on an arm */}
          <B s={[0.25, 0.05, 0.05]} p={[x * 1.35, 1.75, 2.35]} c="#2b2b2e" />
          <B s={[0.08, 0.32, 0.18]} p={[x * 1.55, 1.75, 2.35]} c="#2b2b2e" />
        </group>
      ))}
      {/* Our logo on both doors */}
      <Logo size={0.62} position={[0.965, 1.15, 1.75]} rotationY={Math.PI / 2} />
      <Logo size={0.62} position={[-0.965, 1.15, 1.75]} rotationY={-Math.PI / 2} />
      {/* Roof beacon */}
      <B s={[0.5, 0.1, 0.3]} p={[0, 2.16, 1.85]} c="#2b2b2e" />
      <group ref={beacon} position={[0, 2.32, 1.85]}>
        <B s={[0.24, 0.22, 0.24]} p={[0, 0, 0]} c="#ff8a1a" e="#ff6b1a" />
        <B s={[0.05, 0.18, 0.28]} p={[0.13, 0, 0]} c="#fff2a8" e="#ffd23c" />
      </group>
      {/* Exhaust stack */}
      <B s={[0.14, 1.1, 0.14]} p={[0.85, 2.0, 1.05]} c="#9aa5b1" />
      <B s={[0.18, 0.08, 0.18]} p={[0.85, 2.58, 1.05]} c="#2b2b2e" />
      {/* Fuel tank and steps */}
      <B s={[0.25, 0.4, 0.8]} p={[0.92, 0.75, 0.6]} c="#c0c8d2" />
      <B s={[0.3, 0.06, 0.5]} p={[-0.95, 0.55, 2.0]} c="#9aa5b1" />
      {/* Wheels with hubcaps */}
      <group ref={wheels}>
        {[1.9, -0.9, -1.9].flatMap((z) =>
          [-0.85, 0.85].map((x) => (
            <group key={`${x}${z}`} position={[x, 0.42, z]}>
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow material={mat('#1d1d1f')}>
                <cylinderGeometry args={[0.42, 0.42, 0.32, 16]} />
              </mesh>
              <mesh rotation={[0, 0, Math.PI / 2]} position={[x > 0 ? 0.17 : -0.17, 0, 0]} material={mat('#c0c8d2')}>
                <cylinderGeometry args={[0.2, 0.2, 0.04, 10]} />
              </mesh>
              <B s={[0.03, 0.06, 0.32]} p={[x > 0 ? 0.19 : -0.19, 0, 0]} c="#5b6470" />
            </group>
          ))
        )}
      </group>
    </group>
  )
}

// ── Wrecking ball ──────────────────────────────────────────────────────

function BallFx({ at, plot }: { at: number; plot: number }) {
  const r = useRoutes(plot)
  const truck = useRef<THREE.Group>(null)
  const spin = useRef(0)
  const legs = useRef<THREE.Group>(null)
  const turret = useRef<THREE.Group>(null)
  const boom = useRef<THREE.Group>(null)
  const pendulum = useRef<THREE.Group>(null)
  const slot = PLOT_SLOTS[plot]
  const L = 11
  const STOW = 4.2 // boom length folded in for the drive
  const CHAIN = 6
  const inner = useRef<THREE.Group>(null)
  useFrame(() => {
    const age = (Date.now() - at) / 1000
    const pose = truckPose(age, r, 7.0)
    spin.current = pose.moving ? 1 : 0
    if (truck.current) {
      truck.current.position.set(pose.x, 0, pose.z)
      truck.current.rotation.y = pose.heading
    }
    // Outriggers drop 2.5–3.0 s, come up 6.6–7.0 s.
    const down = age < 6.6 ? ease((age - 2.5) / 0.5) : 1 - ease((age - 6.6) / 0.4)
    legs.current?.children.forEach((l) => (l.scale.y = 0.15 + down * 0.85))
    // The turret turns the boom toward the building (world −z of the lot).
    if (turret.current && truck.current) {
      const toLot = Math.atan2(slot.x - pose.x, slot.z - pose.z) - truck.current.rotation.y
      const k = age < 6.2 ? ease((age - 2.8) / 0.7) : 1 - ease((age - 6.2) / 0.6)
      turret.current.rotation.y = toLot * k
    }
    const up = age < 6.2 ? ease((age - 3.0) / 1.0) : 1 - ease((age - 6.2) / 0.6)
    const tilt = 0.1 + up * 0.85
    // Euler XYZ with the boom turned round (y = π): negative x lifts it.
    if (boom.current) boom.current.rotation.x = -tilt
    // It telescopes out as it lifts (and back in before the drive home).
    const len = STOW + (L - STOW) * up
    if (inner.current) inner.current.position.z = (L - len) // the inner section slides along the base
    if (pendulum.current) pendulum.current.position.z = -len
    // The ball: back, in (hit 4.5 s), back, in (hit 5.7 s), settle.
    let swing = 0
    if (age >= 3.5 && age < 4.1) swing = -0.7 * ease((age - 3.5) / 0.6)
    else if (age >= 4.1 && age < 4.5) swing = -0.7 + 1.25 * ease((age - 4.1) / 0.4)
    else if (age >= 4.5 && age < 5.2) swing = 0.55 - 1.25 * ease((age - 4.5) / 0.7)
    else if (age >= 5.2 && age < 5.7) swing = -0.7 + 1.25 * ease((age - 5.2) / 0.5)
    else if (age >= 5.7 && age < 6.2) swing = 0.55 * (1 - ease((age - 5.7) / 0.5))
    if (pendulum.current) {
      pendulum.current.rotation.x = -tilt + swing
      pendulum.current.visible = up > 0.15
    }
  })
  return (
    <group ref={truck}>
      <Cab color="#f2c230" spin={spin} />
      {/* Bed with hazard stripes along the sides */}
      <B s={[1.9, 0.35, 3.4]} p={[0, 0.85, -0.8]} c="#5b6470" />
      <Decal kind="stripes" w={3.3} h={0.3} p={[0.96, 0.85, -0.8]} r={[0, Math.PI / 2, 0]} />
      <Decal kind="stripes" w={3.3} h={0.3} p={[-0.96, 0.85, -0.8]} r={[0, -Math.PI / 2, 0]} />
      {/* Outriggers */}
      <group ref={legs}>
        {[-1.1, 1.1].flatMap((x) =>
          [0.6, -2.2].map((z) => (
            <group key={`${x}${z}`} position={[x, 0.75, z]}>
              <B s={[0.18, 0.75, 0.18]} p={[0, -0.375, 0]} c="#e0b020" />
            </group>
          ))
        )}
      </group>
      {/* Turret, crane cab and boom */}
      <group ref={turret} position={[0, 1.05, -1.3]}>
        <mesh material={mat('#3a3f47')}>
          <cylinderGeometry args={[0.75, 0.8, 0.25, 16]} />
        </mesh>
        <B s={[0.8, 0.9, 1.0]} p={[-0.45, 0.6, 0.2]} c="#f2c230" />
        <B s={[0.05, 0.45, 0.6]} p={[-0.86, 0.7, 0.2]} c="#8ec9e8" />
        <B s={[1.0, 0.5, 0.6]} p={[0.25, 0.4, 0.7]} c="#3a3f47" />
        <group ref={boom} position={[0.25, 0.5, 0]} rotation={[-0.1, Math.PI, 0]}>
          {/* Telescopic: the base section, and the inner one that slides out */}
          <B s={[0.5, 0.5, STOW]} p={[0, 0, -STOW / 2]} c="#e0b020" />
          {Array.from({ length: 3 }, (_, k) => (
            <B key={k} s={[0.52, 0.05, 0.05]} p={[0, 0.26, -0.8 - k * 1.2]} c="#1d1d1f" />
          ))}
          <group ref={inner}>
            <B s={[0.38, 0.38, L - STOW]} p={[0, 0, -STOW - (L - STOW) / 2]} c="#f2c230" />
          </group>
          <group ref={pendulum} position={[0, 0, -STOW]}>
            <B s={[0.08, CHAIN, 0.08]} p={[0, -CHAIN / 2, 0]} c="#3a3a3e" />
            <mesh position={[0, -CHAIN - 0.9, 0]} castShadow material={mat('#2b2b2e')}>
              <sphereGeometry args={[1.0, 18, 14]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}

// ── Dynamite ───────────────────────────────────────────────────────────

function DynamiteFx({ at, plot }: { at: number; plot: number }) {
  const r = useRoutes(plot)
  const slot = PLOT_SLOTS[plot]
  const truck = useRef<THREE.Group>(null)
  const spin = useRef(0)
  const door = useRef<THREE.Group>(null)
  const crate = useRef<THREE.Group>(null)
  const spark = useRef<THREE.Mesh>(null)
  const sticks = useRef<THREE.Group>(null)
  const boom = useRef<THREE.Mesh>(null)
  const smoke = useRef<THREE.Group>(null)
  const BOOM = 5.5
  const crateAt = useMemo(() => new THREE.Vector3(r.park.x - 1, 0.35, r.park.z - 2.6), [r])
  const sticksAt = useMemo(() => new THREE.Vector3(slot.x, 0.9, slot.z + 2.5), [slot])
  useFrame(() => {
    const age = (Date.now() - at) / 1000
    const pose = truckPose(age, r, 3.2)
    spin.current = pose.moving ? 1 : 0
    if (truck.current) {
      truck.current.position.set(pose.x, 0, pose.z)
      truck.current.rotation.y = pose.heading
    }
    // The back door rolls up while it unloads.
    if (door.current) door.current.scale.y = age > 2.5 && age < 3.2 ? 0.2 : 1
    if (crate.current) {
      crate.current.visible = age >= 2.6 && age < BOOM
      const k = ease((age - 2.6) / 0.4)
      crate.current.position.set(crateAt.x, crateAt.y + (1 - k) * 0.8, r.park.z - (r.park.z - crateAt.z) * k)
    }
    if (sticks.current) sticks.current.visible = age >= 3.0 && age < BOOM
    if (spark.current) {
      const k = clamp01((age - 3.0) / (BOOM - 3.0))
      spark.current.visible = age >= 3.0 && age < BOOM
      spark.current.position.lerpVectors(crateAt, sticksAt, k)
      spark.current.scale.setScalar(0.8 + Math.sin(age * 40) * 0.35)
    }
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
      <group ref={truck}>
        <Cab color="#d64545" spin={spin} />
        {/* Box body with our logo and the explosives sign */}
        <B s={[1.95, 1.7, 3.3]} p={[0, 1.55, -0.85]} c="#f4f1ea" />
        <B s={[1.97, 0.15, 3.32]} p={[0, 2.43, -0.85]} c="#d64545" />
        <B s={[1.97, 0.15, 3.32]} p={[0, 0.72, -0.85]} c="#d64545" />
        {[1, -1].map((sd) => (
          <group key={sd}>
            <Logo size={1.1} position={[sd * 0.985, 1.6, -0.2]} rotationY={(sd * Math.PI) / 2} />
            <Decal kind="tnt" w={1.3} h={0.65} p={[sd * 0.985, 1.55, -1.7]} r={[0, (sd * Math.PI) / 2, 0]} />
          </group>
        ))}
        {/* Roll-up door at the back */}
        <group ref={door} position={[0, 2.35, -2.52]}>
          <B s={[1.7, 1.5, 0.05]} p={[0, -0.75, 0]} c="#c0c8d2" />
        </group>
        <B s={[0.25, 0.15, 0.06]} p={[0.75, 1.0, -2.53]} c="#e23f3f" e="#a01010" />
        <B s={[0.25, 0.15, 0.06]} p={[-0.75, 1.0, -2.53]} c="#e23f3f" e="#a01010" />
      </group>
      <group ref={crate}>
        <B s={[1.1, 0.7, 0.8]} p={[0, 0, 0]} c="#a0703f" />
        <B s={[1.12, 0.16, 0.82]} p={[0, 0.12, 0]} c="#d64545" />
        <B s={[0.02, 0.5, 0.6]} p={[0.56, 0, 0]} c="#8a5a30" />
      </group>
      <group ref={sticks} position={[sticksAt.x, sticksAt.y, sticksAt.z]}>
        {[-0.3, 0, 0.3].map((x) => (
          <mesh key={x} position={[x, 0, 0]} castShadow material={mat('#d64545')}>
            <cylinderGeometry args={[0.12, 0.12, 0.9, 10]} />
          </mesh>
        ))}
        <B s={[0.75, 0.08, 0.26]} p={[0, 0.15, 0]} c="#2b2b2e" />
      </group>
      <mesh ref={spark}>
        <sphereGeometry args={[0.18, 10, 8]} />
        <meshBasicMaterial color="#fff2a8" />
      </mesh>
      <mesh ref={boom} position={[slot.x, 2.5, slot.z + 1]}>
        <sphereGeometry args={[1, 20, 16]} />
        <meshBasicMaterial color="#ffb02e" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <group ref={smoke} position={[slot.x, 0, slot.z]}>
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

// Plays the latest tool use (world coordinates), for as long as it lasts.
export default function ToolFx({ fx }: { fx: Snapshot['toolFx'] }) {
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!group.current || !fx) return
    group.current.visible = Date.now() - fx.at < (fx.kind === 'ball' ? BALL_FX_MS : DYNAMITE_FX_MS)
  })
  if (!fx) return null
  return <group ref={group}>{fx.kind === 'ball' ? <BallFx at={fx.at} plot={fx.plot} /> : <DynamiteFx at={fx.at} plot={fx.plot} />}</group>
}
