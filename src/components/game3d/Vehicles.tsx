'use client'

import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { env } from './Scenery'
import { Logo } from './SiteProps'
import { AdFace } from './WorldAds'

// Street traffic made from parts (nose toward +z), so the town has more
// than a handful of car models: a city bus, a delivery van carrying an
// ad, and our own Rubble pickup. Headlights glow at night.

const mats = new Map<string, THREE.MeshStandardMaterial>()
function mat(color: string) {
  let m = mats.get(color)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
    mats.set(color, m)
  }
  return m
}
const headlight = new THREE.MeshStandardMaterial({ color: '#fff6c8', emissive: '#ffe08a', emissiveIntensity: 0.3 })
const taillight = new THREE.MeshStandardMaterial({ color: '#e23f3f', emissive: '#a01010', emissiveIntensity: 0.4 })

// Lights brighten as night falls (one shared material each).
export function VehicleLights() {
  useFrame(() => {
    headlight.emissiveIntensity = 0.3 + env.night * 2
    taillight.emissiveIntensity = 0.4 + env.night * 1.5
  })
  return null
}

function B({ s, p, c, m }: { s: [number, number, number]; p: [number, number, number]; c?: string; m?: THREE.Material }) {
  return (
    <mesh position={p} castShadow material={m ?? mat(c ?? '#ff00ff')}>
      <boxGeometry args={s} />
    </mesh>
  )
}

function Wheels({ zs, x, r = 0.28 }: { zs: number[]; x: number; r?: number }) {
  return (
    <>
      {zs.flatMap((z) =>
        [-x, x].map((xx) => (
          <mesh key={`${xx}${z}`} position={[xx, r, z]} rotation={[0, 0, Math.PI / 2]} material={mat('#1d1d1f')}>
            <cylinderGeometry args={[r, r, 0.22, 12]} />
          </mesh>
        ))
      )}
    </>
  )
}

function Lights({ w, front, back, y }: { w: number; front: number; back: number; y: number }) {
  return (
    <>
      {[-1, 1].map((sd) => (
        <group key={sd}>
          <B s={[0.22, 0.14, 0.04]} p={[(sd * w) / 2 - sd * 0.18, y, front]} m={headlight} />
          <B s={[0.2, 0.12, 0.04]} p={[(sd * w) / 2 - sd * 0.16, y, back]} m={taillight} />
        </group>
      ))}
    </>
  )
}

// A city bus: long, windows down both sides, doors, a route sign.
export function Bus({ color = '#2d7ff9' }: { color?: string }) {
  const L = 4.6
  return (
    <group>
      <B s={[1.25, 1.1, L]} p={[0, 0.85, 0]} c={color} />
      <B s={[1.27, 0.12, L + 0.02]} p={[0, 0.42, 0]} c="#ffffff" />
      <B s={[1.2, 0.1, L - 0.2]} p={[0, 1.45, 0]} c="#e9edf2" />
      {/* Windows: a band down each side, the windscreen and rear */}
      {[-1, 1].map((sd) => (
        <B key={sd} s={[0.02, 0.42, L - 0.6]} p={[sd * 0.63, 1.05, 0.05]} c="#4f7fa3" />
      ))}
      {[-1.3, -0.4, 0.5, 1.4].map((z) => [-1, 1].map((sd) => <B key={`${z}${sd}`} s={[0.03, 0.44, 0.06]} p={[sd * 0.64, 1.05, z]} c={color} />))}
      <B s={[1.1, 0.55, 0.03]} p={[0, 1.0, L / 2 + 0.01]} c="#8ec9e8" />
      <B s={[1.0, 0.4, 0.03]} p={[0, 1.1, -L / 2 - 0.01]} c="#4f7fa3" />
      {/* Route sign and doors on the kerb side */}
      <B s={[0.8, 0.16, 0.03]} p={[0, 1.33, L / 2 + 0.02]} c="#1d1d1f" />
      <B s={[0.5, 0.08, 0.02]} p={[0, 1.33, L / 2 + 0.04]} m={headlight} />
      <B s={[0.02, 0.8, 0.5]} p={[0.64, 0.75, 1.5]} c="#2b2b2e" />
      <B s={[0.02, 0.8, 0.5]} p={[0.64, 0.75, -0.3]} c="#2b2b2e" />
      <Lights w={1.25} front={L / 2 + 0.02} back={-L / 2 - 0.02} y={0.6} />
      <Wheels zs={[1.5, -1.5]} x={0.56} r={0.3} />
    </group>
  )
}

// A delivery van with an ad down each side.
export function DeliveryVan({ seed }: { seed: number }) {
  return (
    <group>
      <B s={[1.1, 1.1, 1.9]} p={[0, 0.85, -0.25]} c="#f4f1ea" />
      <B s={[1.05, 0.7, 0.8]} p={[0, 0.65, 1.05]} c="#f4f1ea" />
      <B s={[1.0, 0.35, 0.03]} p={[0, 0.9, 1.46]} c="#8ec9e8" />
      <B s={[0.7, 0.18, 0.04]} p={[0, 0.48, 1.46]} c="#3a3f47" />
      {[-1, 1].map((sd) => (
        <AdFace key={sd} seed={seed + (sd > 0 ? 0 : 1)} width={1.6} height={0.85} position={[sd * 0.56, 0.9, -0.25]} rotation={[0, (sd * Math.PI) / 2, 0]} />
      ))}
      <Lights w={1.05} front={1.46} back={-1.21} y={0.55} />
      <Wheels zs={[0.95, -0.75]} x={0.5} />
    </group>
  )
}

// Our own pickup: Rubble orange, the logo on the doors, a toolbox and
// cones in the back and a beacon on the roof.
export function RubblePickup() {
  return (
    <group>
      <B s={[1.05, 0.45, 2.4]} p={[0, 0.55, 0]} c="#ff6b1a" />
      <B s={[1.0, 0.5, 0.95]} p={[0, 1.0, 0.35]} c="#ff6b1a" />
      <B s={[0.96, 0.32, 0.03]} p={[0, 1.02, 0.83]} c="#8ec9e8" />
      {[-1, 1].map((sd) => (
        <group key={sd}>
          <B s={[0.03, 0.3, 0.6]} p={[sd * 0.505, 1.02, 0.35]} c="#8ec9e8" />
          <Logo size={0.34} position={[sd * 0.53, 0.58, 0.35]} rotationY={(sd * Math.PI) / 2} />
        </group>
      ))}
      <B s={[0.5, 0.1, 0.25]} p={[0, 1.3, 0.35]} c="#ff8a1a" m={headlight} />
      <B s={[0.85, 0.25, 0.35]} p={[0, 0.9, -0.3]} c="#5b6470" />
      {[-0.2, 0.2].map((x) => (
        <mesh key={x} position={[x, 0.95, -0.85]} material={mat('#ef7d2d')}>
          <coneGeometry args={[0.1, 0.3, 8]} />
        </mesh>
      ))}
      <Lights w={1.05} front={1.21} back={-1.21} y={0.6} />
      <Wheels zs={[0.75, -0.75]} x={0.48} />
    </group>
  )
}
