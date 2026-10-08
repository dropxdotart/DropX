'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Look } from '@/lib/game/managers'

// A chunky block person in the same style as the crew: managers and the
// Boss (the player's own character). Everything is plain boxes so outfits
// are just colours and a few extra pieces — hats, payos, a robe, glasses.

const mats = new Map<string, THREE.MeshStandardMaterial>()
function mat(color: string) {
  let m = mats.get(color)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.75 })
    mats.set(color, m)
  }
  return m
}

// A windowpane check for the plaid suit, drawn once per colour.
const plaidMats = new Map<string, THREE.MeshStandardMaterial>()
function plaid(color: string) {
  let m = plaidMats.get(color)
  if (!m && typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const g = c.getContext('2d')!
    g.fillStyle = color
    g.fillRect(0, 0, 32, 32)
    g.fillStyle = 'rgba(200,210,235,0.55)'
    g.fillRect(0, 15, 32, 1)
    g.fillRect(15, 0, 1, 32)
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(2, 2)
    tex.magFilter = THREE.NearestFilter
    tex.colorSpace = THREE.SRGBColorSpace
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 })
    plaidMats.set(color, m)
  }
  return m ?? mat(color)
}

function Box({ size, position, color, material }: { size: [number, number, number]; position: [number, number, number]; color?: string; material?: THREE.Material }) {
  return (
    <mesh position={position} castShadow material={material ?? mat(color ?? '#ff00ff')}>
      <boxGeometry args={size} />
    </mesh>
  )
}

function Hat({ look }: { look: Look }) {
  const c = look.hatColor
  switch (look.hat) {
    case 'kippah':
      return (
        <mesh position={[0, 0.18, -0.03]} material={mat(c)} castShadow>
          <sphereGeometry args={[0.12, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
        </mesh>
      )
    case 'fedora':
      return (
        <group position={[0, 0.16, 0]}>
          <mesh position={[0, 0.0, 0]} material={mat(c)} castShadow>
            <cylinderGeometry args={[0.23, 0.23, 0.02, 18]} />
          </mesh>
          <mesh position={[0, 0.07, 0]} material={mat(c)} castShadow>
            <cylinderGeometry args={[0.13, 0.15, 0.13, 14]} />
          </mesh>
          <mesh position={[0, 0.03, 0]} material={mat('#2e2e2e')}>
            <cylinderGeometry args={[0.152, 0.152, 0.035, 14]} />
          </mesh>
        </group>
      )
    case 'flatcap':
      // A flat cap with a short peak.
      return (
        <group position={[0, 0.16, 0.01]}>
          <Box size={[0.33, 0.06, 0.34]} position={[0, 0.01, 0]} color={c} />
          <Box size={[0.3, 0.04, 0.12]} position={[0, -0.01, 0.2]} color={c} />
        </group>
      )
    case 'wizard':
      // A tall pointed hat with a brim and a couple of stars.
      return (
        <group position={[0, 0.17, 0]}>
          <mesh material={mat(c)} castShadow>
            <cylinderGeometry args={[0.26, 0.26, 0.03, 16]} />
          </mesh>
          <mesh position={[0, 0.24, -0.02]} rotation={[-0.15, 0, 0]} material={mat(c)} castShadow>
            <coneGeometry args={[0.15, 0.48, 14]} />
          </mesh>
          <Box size={[0.05, 0.05, 0.02]} position={[0.06, 0.16, 0.12]} color="#e3b33c" />
          <Box size={[0.04, 0.04, 0.02]} position={[-0.05, 0.3, 0.08]} color="#e3b33c" />
        </group>
      )
    case 'hood':
      return (
        <group>
          <Box size={[0.36, 0.08, 0.36]} position={[0, 0.17, -0.01]} color={c} />
          <Box size={[0.36, 0.34, 0.06]} position={[0, 0.0, -0.17]} color={c} />
          <Box size={[0.05, 0.34, 0.3]} position={[0.175, 0.0, -0.02]} color={c} />
          <Box size={[0.05, 0.34, 0.3]} position={[-0.175, 0.0, -0.02]} color={c} />
        </group>
      )
    case 'hardhat':
      return (
        <group position={[0, 0.15, 0]}>
          <mesh material={mat(c)} castShadow>
            <sphereGeometry args={[0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[0, 0.0, 0.03]} material={mat(c)}>
            <cylinderGeometry args={[0.2, 0.2, 0.02, 16]} />
          </mesh>
        </group>
      )
    case 'cap':
      return (
        <group position={[0, 0.16, 0]}>
          <Box size={[0.31, 0.07, 0.31]} position={[0, 0.0, 0]} color={c} />
          <Box size={[0.24, 0.02, 0.12]} position={[0, -0.03, 0.2]} color={c} />
        </group>
      )
    default:
      return null
  }
}

export default function Person({ look, walking = false, scale = 1, seed = 0 }: { look: Look; walking?: boolean; scale?: number; seed?: number }) {
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 7 + seed
    const swing = walking ? Math.sin(t) * 0.6 : Math.sin(t * 0.15) * 0.04
    if (legL.current) legL.current.rotation.x = swing
    if (legR.current) legR.current.rotation.x = -swing
    if (armL.current) armL.current.rotation.x = -swing * 0.8
    if (armR.current) armR.current.rotation.x = look.item && look.item !== 'none' ? -0.9 : swing * 0.8
    if (body.current) body.current.position.y = walking ? Math.abs(Math.sin(t)) * 0.025 : 0
  })
  const top = look.topPattern === 'plaid' ? plaid(look.top) : mat(look.top)
  const legsMat = look.topPattern === 'plaid' ? plaid(look.legs) : mat(look.legs)
  const hairUnder = look.hat === 'hood' || look.hat === 'hardhat' || look.hat === 'fedora' || look.hat === 'flatcap' || look.hat === 'wizard'
  const face = useMemo(() => look.skin, [look.skin])

  return (
    <group scale={scale}>
      <group ref={body}>
        {/* Legs (pivot at the hip) */}
        {([
          [legL, -0.085],
          [legR, 0.085],
        ] as const).map(([ref, x]) => (
          <group key={x} ref={ref} position={[x, 0.37, 0]}>
            <Box size={[0.14, 0.32, 0.16]} position={[0, -0.17, 0]} material={legsMat} />
            <Box size={[0.15, 0.06, 0.2]} position={[0, -0.34, 0.02]} color={look.shoes} />
          </group>
        ))}
        {/* Torso, collar, vest, tie */}
        <Box size={[0.38, 0.4, 0.22]} position={[0, 0.57, 0]} material={top} />
        {look.under && <Box size={[0.14, 0.1, 0.02]} position={[0, 0.72, 0.112]} color={look.under} />}
        {look.vest && (
          <group>
            <Box size={[0.4, 0.3, 0.24]} position={[0, 0.6, 0]} color={look.vest} />
            <Box size={[0.41, 0.03, 0.25]} position={[0, 0.55, 0]} color="#e8eef2" />
          </group>
        )}
        {look.tie && (
          <group>
            {[0, 1, 2, 3].map((k) => (
              <Box key={k} size={[0.05, 0.06, 0.02]} position={[0, 0.68 - k * 0.06, 0.122]} color={k % 2 ? look.tie![1] : look.tie![0]} />
            ))}
          </group>
        )}
        {look.robe && (
          <group>
            <Box size={[0.42, 0.62, 0.26]} position={[-0.0, 0.45, -0.01]} color={look.robe} />
            <Box size={[0.12, 0.6, 0.02]} position={[-0.15, 0.46, 0.13]} color={look.robe} />
            <Box size={[0.12, 0.6, 0.02]} position={[0.15, 0.46, 0.13]} color={look.robe} />
            <Box size={[0.36, 0.05, 0.05]} position={[0, 0.76, -0.12]} color="#8a1c2b" />
          </group>
        )}
        {/* Arms (pivot at the shoulder) */}
        {([
          [armL, -0.245],
          [armR, 0.245],
        ] as const).map(([ref, x]) => (
          <group key={x} ref={ref} position={[x, 0.74, 0]}>
            <Box size={[0.11, 0.34, 0.13]} position={[0, -0.16, 0]} material={look.robe ? mat(look.robe) : top} />
            <Box size={[0.1, 0.07, 0.11]} position={[0, -0.35, 0]} color={look.skin} />
            {x > 0 && look.item === 'clipboard' && <Box size={[0.03, 0.18, 0.13]} position={[0.06, -0.36, 0.08]} color="#8a5a30" />}
            {x > 0 && look.item === 'radio' && <Box size={[0.05, 0.12, 0.05]} position={[0.03, -0.38, 0.06]} color="#1d1d1d" />}
            {x > 0 && look.item === 'wrench' && <Box size={[0.03, 0.22, 0.05]} position={[0.03, -0.42, 0.06]} color="#9aa5b1" />}
          </group>
        ))}
        {/* Head */}
        <group position={[0, 0.93, 0]}>
          <Box size={[0.3, 0.3, 0.3]} position={[0, 0, 0]} color={face} />
          {/* Face: eyes, brows, smile */}
          {[-0.065, 0.065].map((x) => (
            <group key={x}>
              <Box size={[0.04, 0.05, 0.01]} position={[x, 0.02, 0.151]} color="#2a1d14" />
              <Box size={[0.07, 0.015, 0.01]} position={[x, 0.07, 0.151]} color={look.hair} />
            </group>
          ))}
          <Box size={[0.1, 0.02, 0.01]} position={[0, -0.07, 0.151]} color="#9a4a3a" />
          {look.glasses && (
            <group>
              {[-0.065, 0.065].map((x) => (
                <mesh key={x} position={[x, 0.02, 0.158]} material={mat('#141414')}>
                  <torusGeometry args={[0.045, 0.01, 6, 16]} />
                </mesh>
              ))}
              <Box size={[0.04, 0.01, 0.01]} position={[0, 0.025, 0.158]} color="#141414" />
            </group>
          )}
          {/* Hair: top and back (under a hat it barely shows) */}
          {!hairUnder && <Box size={[0.31, 0.06, 0.31]} position={[0, 0.15, -0.005]} color={look.hair} />}
          <Box size={[0.31, 0.22, 0.04]} position={[0, 0.04, -0.15]} color={look.hair} />
          <Box size={[0.31, 0.05, 0.05]} position={[0, 0.135, 0.13]} color={look.hair} />
          {/* Payos: curls hanging in front of each ear */}
          {look.payos &&
            [-1, 1].map((sd) => (
              <group key={sd} position={[sd * 0.165, -0.02, 0.06]}>
                <Box size={[0.04, 0.08, 0.045]} position={[0, 0.03, 0]} color={look.hair} />
                <Box size={[0.04, 0.07, 0.045]} position={[sd * 0.018, -0.04, 0.02]} color={look.hair} />
                <Box size={[0.04, 0.07, 0.045]} position={[0, -0.11, 0.0]} color={look.hair} />
                <Box size={[0.04, 0.06, 0.045]} position={[sd * 0.018, -0.17, 0.02]} color={look.hair} />
              </group>
            ))}
          <Hat look={look} />
          {/* Under a fedora, the kippah's still there (just hidden) */}
        </group>
      </group>
    </group>
  )
}
