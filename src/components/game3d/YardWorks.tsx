'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Engine } from '@/lib/game/engine'
import type { YardTheme } from '@/lib/game/islands'
import { dockLocalX } from '@/lib/game/roads'
import { Logo } from './SiteProps'

// The working parts of the three yards, local to the yard's block (+z faces
// the road; trucks come in at x −3, unload along z 3.5 and leave at x +3).
// Everything here stays clear of the truck lanes and parking bays.

function Box({ size, position, color, rotation }: { size: [number, number, number]; position: [number, number, number]; color: string; rotation?: [number, number, number] }) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.75} />
    </mesh>
  )
}

const THEME_COLOR: Record<YardTheme, { sign: string; trim: string; load: string[] }> = {
  timber: { sign: '#2f6b3a', trim: '#3fa064', load: ['#8a5a30', '#a06a3a', '#c08550'] },
  brick: { sign: '#1d3a6e', trim: '#ff6b1a', load: ['#c4553a', '#9e3f2a', '#d66e4f'] },
  smelter: { sign: '#3a3a3e', trim: '#ff8a1a', load: ['#6f7b88', '#4f5761', '#9aa5b1'] },
}

// ── Shared: lanes, stains, pallets, barrels, office, lights, forklift ───

export function YardGround({ theme }: { theme: YardTheme }) {
  const c = THEME_COLOR[theme]
  const dashes = useMemo(() => {
    const out: { p: [number, number, number]; r: number }[] = []
    for (let z = 7.4; z > 4; z -= 1) out.push({ p: [-3, 0.065, z], r: 0 }, { p: [3, 0.065, z], r: 0 })
    for (let x = -2.4; x < 2.6; x += 1) out.push({ p: [x, 0.065, 4.9], r: Math.PI / 2 })
    return out
  }, [])
  return (
    <group>
      {/* Painted lanes: in, across and out */}
      {dashes.map((d, i) => (
        <Box key={i} size={[0.12, 0.01, 0.55]} position={d.p} rotation={[0, d.r, 0]} color="#f2c230" />
      ))}
      {/* Oil stains under the docks */}
      {[-3, -0.4, 2.2].map((x, i) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x + (i - 1) * 0.3, 0.062, 3.3]}>
          <circleGeometry args={[0.55 + i * 0.12, 16]} />
          <meshStandardMaterial color="#3a3a3e" transparent opacity={0.35} />
        </mesh>
      ))}
      {/* Front-left: pallets and barrels */}
      <group position={[-5.6, 0, 6.3]}>
        {[0, 1].map((k) => (
          <group key={k} position={[0, k * 0.32, 0]}>
            <Box size={[1.2, 0.12, 1]} position={[0, 0.06, 0]} color="#a06a3a" />
            <Box size={[1, 0.18, 0.85]} position={[0, 0.21, 0]} color={c.load[k]} />
          </group>
        ))}
        {[
          [0.9, -1.1, '#2d7ff9'],
          [0.3, -1.4, '#d64545'],
          [0.95, -1.75, '#3fa064'],
        ].map(([x, z, col]) => (
          <mesh key={`${x},${z}`} position={[x as number, 0.35, z as number]} castShadow>
            <cylinderGeometry args={[0.24, 0.24, 0.7, 10]} />
            <meshStandardMaterial color={col as string} roughness={0.5} />
          </mesh>
        ))}
      </group>
      {/* Front-right: the site office, in the yard's colours */}
      <group position={[5.4, 0, 6.5]}>
        <Box size={[1.8, 1.3, 2.1]} position={[0, 0.65, 0]} color="#f2f0ea" />
        <Box size={[2, 0.15, 2.3]} position={[0, 1.38, 0]} color={c.sign} />
        <Box size={[0.05, 0.45, 0.9]} position={[-0.93, 0.8, 0]} color="#8ec9e8" />
        <Box size={[1.6, 0.5, 0.08]} position={[0, 1.75, 1]} color={c.sign} />
        <Logo size={0.35} position={[-0.45, 1.75, 1.05]} />
        <Box size={[0.6, 0.06, 0.06]} position={[0.25, 1.75, 1.05]} color={c.trim} />
      </group>
      {/* Floodlights at the back corners */}
      {[-6, 6].map((x) => (
        <group key={x} position={[x, 0, -7.6]}>
          <Box size={[0.12, 4.2, 0.12]} position={[0, 2.1, 0]} color="#5b6470" />
          <mesh position={[0, 4.25, 0.15]}>
            <boxGeometry args={[0.6, 0.25, 0.3]} />
            <meshStandardMaterial color="#fffbe6" emissive="#fff1b8" emissiveIntensity={0.9} />
          </mesh>
        </group>
      ))}
      <Forklift color={c.trim} />
    </group>
  )
}

// A forklift shuttling a pallet up and down the left side.
function Forklift({ color }: { color: string }) {
  const g = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!g.current) return
    const t = clock.getElapsedTime() * 0.35
    const k = (Math.sin(t) + 1) / 2
    g.current.position.z = -6.8 + k * 4.4
    g.current.rotation.y = Math.cos(t) > 0 ? 0 : Math.PI
  })
  return (
    <group ref={g} position={[-6.65, 0, -4]}>
      <Box size={[0.7, 0.45, 1.1]} position={[0, 0.35, 0]} color={color} />
      <Box size={[0.6, 0.55, 0.5]} position={[0, 0.85, -0.2]} color="#3a3a3e" />
      <Box size={[0.08, 1.2, 0.08]} position={[-0.2, 0.75, 0.6]} color="#2b2b2e" />
      <Box size={[0.08, 1.2, 0.08]} position={[0.2, 0.75, 0.6]} color="#2b2b2e" />
      <Box size={[0.6, 0.1, 0.6]} position={[0, 0.25, 0.9]} color="#a06a3a" />
      <Box size={[0.5, 0.3, 0.5]} position={[0, 0.45, 0.9]} color="#c4553a" />
    </group>
  )
}

// ── Trucks tipping their loads ───────────────────────────────────────────

// While a truck is unloading at a dock, its load tumbles off the back of
// the bed into the hopper / chute in front of it.
export function UnloadFX({ engine, yard, theme }: { engine: Engine; yard: number; theme: YardTheme }) {
  const PER = 7
  const docks = [0, 1, 2, 3]
  const group = useRef<THREE.Group>(null)
  const colors = THEME_COLOR[theme].load
  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const t = clock.getElapsedTime()
    docks.forEach((k) => {
      const busy = engine.trucks.some((tr) => tr.state === 'unloading' && tr.yard === yard && tr.inYard === 'bay' && tr.dock === k)
      for (let n = 0; n < PER; n++) {
        const m = g.children[k * PER + n]
        if (!m) continue
        m.visible = busy
        if (!busy) continue
        const p = (t * 1.6 + n / PER) % 1
        const x = dockLocalX(k) + Math.sin(n * 2.1) * 0.35
        m.position.set(x, 1.9 - p * p * 1.5 + p * 0.4, 3.0 - p * 1.3)
        m.rotation.set(p * 6 + n, p * 4, 0)
      }
    })
  })
  return (
    <group ref={group}>
      {docks.flatMap((k) =>
        Array.from({ length: PER }, (_, n) => (
          <mesh key={`${k}-${n}`} visible={false}>
            {theme === 'timber' ? <cylinderGeometry args={[0.1, 0.1, 0.5, 6]} /> : theme === 'smelter' ? <dodecahedronGeometry args={[0.16, 0]} /> : <boxGeometry args={[0.3, 0.16, 0.18]} />}
            <meshStandardMaterial color={colors[n % colors.length]} />
          </mesh>
        ))
      )}
    </group>
  )
}

// ── Brick & Concrete Yard (City) ─────────────────────────────────────────

export function BrickWorks({ tier }: { tier: number }) {
  const jaw = useRef<THREE.Mesh>(null)
  const belt = useRef<THREE.Group>(null)
  const crane = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (jaw.current) jaw.current.rotation.x = -0.25 + Math.sin(t * 5) * 0.18
    if (belt.current) belt.current.children.forEach((c, i) => (c.position.z = ((t * 0.8 + i / 4) % 1) * 2.6 - 1.3))
    if (crane.current) crane.current.rotation.y = Math.sin(t * 0.3) * 0.9
  })
  return (
    <>
      {/* Gravel piles and the jaw crusher feeding a conveyor */}
      {[
        [-5.6, -3.2, '#94908a'],
        [-4.2, -6.6, '#bdb9af'],
      ].map(([x, z, col]) => (
        <mesh key={`${x}`} position={[x as number, 0.5, z as number]} castShadow>
          <coneGeometry args={[1.1, 1 + tier * 0.25, 8]} />
          <meshStandardMaterial color={col as string} roughness={1} />
        </mesh>
      ))}
      <group position={[-1.6, 0, -1.9]}>
        <Box size={[1.4, 1, 1]} position={[0, 0.5, 0]} color="#f2c230" />
        <mesh ref={jaw} position={[0, 1.15, 0.35]}>
          <boxGeometry args={[1.2, 0.5, 0.18]} />
          <meshStandardMaterial color="#5b6470" />
        </mesh>
      </group>
      <group position={[-4.3, 0.9, -4.7]} rotation={[0, -0.6, 0.3]}>
        <Box size={[0.6, 0.12, 2.8]} position={[0, 0, 0]} color="#3a3a3e" />
        <group ref={belt}>
          {[0, 1, 2, 3].map((k) => (
            <Box key={k} size={[0.3, 0.16, 0.2]} position={[0, 0.14, 0]} color="#c4553a" />
          ))}
        </group>
      </group>
      {tier === 0 ? (
        <>
          <Box size={[5, 2.4, 3.5]} position={[2, 1.2, -5]} color="#8d6e4c" />
          <Box size={[5.4, 0.25, 3.9]} position={[2, 2.5, -5]} color="#5a5f6b" />
        </>
      ) : (
        <>
          {/* Plant hall with roller door and the company logo */}
          <Box size={[8, 3 + tier, 5]} position={[1.5, (3 + tier) / 2, -4.8]} color={tier >= 3 ? '#e8edf3' : '#cfd5dd'} />
          <Box size={[8.4, 0.3, 5.4]} position={[1.5, 3 + tier + 0.15, -4.8]} color="#ff6b1a" />
          <Box size={[3, 2.2, 0.15]} position={[1.5, 1.1, -2.25]} color="#3a3a3e" />
          {[0, 1, 2].map((k) => (
            <Box key={k} size={[0.9, 0.5, 0.06]} position={[-1.2 + k * 1.3 + (k > 0 ? 2.6 : 0), 2.2, -2.25]} color="#8ec9e8" />
          ))}
          <Logo size={1.6} position={[-1.4, 2.6 + tier * 0.5, -2.25]} />
          {tier >= 2 && <Box size={[0.9, 6 + tier, 0.9]} position={[5, (6 + tier) / 2, -6.5]} color="#7d8794" />}
        </>
      )}
      {/* Dockside crane, swinging */}
      {tier >= 1 && (
        <group position={[-6, 0, -7]}>
          <Box size={[0.5, 5, 0.5]} position={[0, 2.5, 0]} color="#f2c230" />
          <group ref={crane} position={[0, 5, 0]}>
            <Box size={[0.4, 0.4, 6]} position={[0, 0, -2.5]} color="#f2c230" />
            <Box size={[0.05, 1.8, 0.05]} position={[0, -0.9, -5]} color="#2b2b2e" />
            <Box size={[0.7, 0.5, 0.7]} position={[0, -2, -5]} color="#c4553a" />
          </group>
        </group>
      )}
    </>
  )
}

// ── Timber & Recycling Yard (Houses) ─────────────────────────────────────

export function TimberWorks({ tier }: { tier: number }) {
  const drum = useRef<THREE.Mesh>(null)
  const chips = useRef<THREE.Group>(null)
  const piston = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (drum.current) drum.current.rotation.x = t * 6
    if (piston.current) piston.current.position.y = 1.5 + Math.abs(Math.sin(t * 1.2)) * 0.6
    chips.current?.children.forEach((c, i) => {
      const p = (t * 1.4 + i / 8) % 1
      c.position.set(0.5 + p * 1.6, 1.9 + Math.sin(p * Math.PI) * 0.9, (i % 3) * 0.12 - 0.12)
    })
  })
  const logs = (x: number, z: number, rows: number, key: string) =>
    Array.from({ length: rows }, (_, r) =>
      Array.from({ length: 3 - (r % 2) }, (_, k) => (
        <mesh key={`${key}-${r}-${k}`} position={[x - 0.7 + k * 0.7 + (r % 2) * 0.35, 0.3 + r * 0.55, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 2.4, 8]} />
          <meshStandardMaterial color={k % 2 ? '#8a5a30' : '#a06a3a'} />
        </mesh>
      ))
    )
  return (
    <>
      {logs(-5.6, -3.4, 2 + Math.min(2, tier), 'a')}
      {/* Compactor with a pumping ram */}
      <group position={[-4.4, 0, -6.4]}>
        <Box size={[1.6, 1.2, 1.4]} position={[0, 0.6, 0]} color="#5b6470" />
        <mesh ref={piston} position={[0, 1.5, 0]}>
          <boxGeometry args={[1.3, 0.3, 1.1]} />
          <meshStandardMaterial color="#f2c230" />
        </mesh>
      </group>
      {/* Wooden sheds */}
      <Box size={[4.5, 2.4, 3.4]} position={[0, 1.2, -5]} color="#a06a3a" />
      <Box size={[5, 0.25, 3.9]} position={[0, 2.5, -5]} color="#2f6b3a" />
      {tier >= 1 && (
        <>
          <Box size={[3.6, 2.8, 3.4]} position={[4.3, 1.4, -5.2]} color="#8a5a30" />
          <Box size={[4, 0.25, 3.8]} position={[4.3, 2.9, -5.2]} color="#2f6b3a" />
        </>
      )}
      {/* Recycling bins along the back fence */}
      {['#2d7ff9', '#3fa064', '#f2c230', '#5b6470', '#2d7ff9'].map((col, k) => (
        <group key={k} position={[-1.6 + k * 1.15, 0, -7.4]}>
          <Box size={[0.9, 1, 0.8]} position={[0, 0.5, 0]} color={col} />
          <Box size={[0.95, 0.1, 0.85]} position={[0, 1.05, 0]} color="#2b2b2e" />
        </group>
      ))}
      {/* The wood chipper: spinning drum, chips arcing onto a pile */}
      <group position={[-1.8, 0, -1.9]}>
        <Box size={[1.6, 1.1, 1.2]} position={[0, 0.55, 0]} color="#3fa064" />
        <mesh ref={drum} position={[-0.2, 1.25, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.35, 0.35, 0.9, 8]} />
          <meshStandardMaterial color="#5b6470" />
        </mesh>
        <Box size={[0.5, 0.25, 0.4]} position={[0.55, 1.6, 0]} rotation={[0, 0, 0.5]} color="#ef7d2d" />
        <group ref={chips}>
          {Array.from({ length: 8 }, (_, i) => (
            <mesh key={i}>
              <boxGeometry args={[0.1, 0.06, 0.08]} />
              <meshStandardMaterial color="#c9a46a" />
            </mesh>
          ))}
        </group>
        <mesh position={[2.3, 0.3, 0]} castShadow>
          <coneGeometry args={[0.7, 0.6, 7]} />
          <meshStandardMaterial color="#c9a46a" />
        </mesh>
      </group>
      {tier >= 2 && (
        <>
          {/* Sawmill hall with a saw-tooth roof */}
          <Box size={[8, 3 + tier, 2.2]} position={[1.5, (3 + tier) / 2, -7.2]} color="#c08550" />
          {[0, 1, 2, 3].map((k) => (
            <Box key={k} size={[1.8, 0.8, 2.4]} position={[-1.2 + k * 2, 3.4 + tier, -7.2]} color="#2f6b3a" />
          ))}
        </>
      )}
    </>
  )
}

// ── Steel Smelter (Industrial) ───────────────────────────────────────────

export function SmelterWorks({ tier }: { tier: number }) {
  const smoke = useRef<THREE.Group>(null)
  const sparks = useRef<THREE.Group>(null)
  const glow = useRef<THREE.MeshStandardMaterial>(null)
  const car = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (glow.current) glow.current.emissiveIntensity = 1 + Math.sin(t * 3) * 0.5
    if (car.current) car.current.position.x = Math.sin(t * 0.4) * 4
    smoke.current?.children.forEach((c, i) => {
      const k = (t * 0.35 + i / 4) % 1
      c.position.set(Math.sin(t + i) * 0.3 + k * 0.8, k * 4, 0)
      c.scale.setScalar(0.5 + k * 1.3)
    })
    sparks.current?.children.forEach((c, i) => {
      const k = (t * 1.3 + i / 10) % 1
      const a = i * 2.4
      c.position.set(Math.cos(a) * k * 1.6, k * 3 - k * k * 2.2, Math.sin(a) * k * 1.6)
      c.visible = k < 0.9
    })
  })
  return (
    <>
      {/* Scrap metal piles */}
      {[
        [-5.6, -3.2],
        [-4.4, -6.2],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.45, z]} castShadow>
          <dodecahedronGeometry args={[1 + tier * 0.15, 0]} />
          <meshStandardMaterial color={i % 2 ? '#6f7b88' : '#4f5761'} roughness={0.6} metalness={0.4} />
        </mesh>
      ))}
      {/* Blast furnace with a pulsing glow and sparks */}
      <mesh position={[1.5, (4 + tier) / 2, -5]} castShadow>
        <cylinderGeometry args={[1.8, 2.2, 4 + tier, 14]} />
        <meshStandardMaterial color="#5b6470" metalness={0.3} />
      </mesh>
      <mesh position={[1.5, 1.6, -5]}>
        <cylinderGeometry args={[2.25, 2.25, 0.5, 14]} />
        <meshStandardMaterial ref={glow} color="#ff8a1a" emissive="#ff5a00" emissiveIntensity={1.2} />
      </mesh>
      <group ref={sparks} position={[1.5, 1.8, -2.8]}>
        {Array.from({ length: 10 }, (_, i) => (
          <mesh key={i}>
            <boxGeometry args={[0.07, 0.07, 0.07]} />
            <meshStandardMaterial color="#ffd23c" emissive="#ffb000" emissiveIntensity={1.5} />
          </mesh>
        ))}
      </group>
      {/* Rails along the back with an ore car */}
      {[-7.25, -7.95].map((z) => (
        <Box key={z} size={[12, 0.06, 0.08]} position={[0, 0.07, z]} color="#5b6470" />
      ))}
      <group ref={car} position={[0, 0, -7.6]}>
        <Box size={[1.6, 0.7, 1]} position={[0, 0.5, 0]} color="#9e3f2a" />
        <mesh position={[0, 0.95, 0]}>
          <dodecahedronGeometry args={[0.45, 0]} />
          <meshStandardMaterial color="#4f5761" />
        </mesh>
      </group>
      {/* Conveyor up to the furnace */}
      <mesh position={[-1.6, 2.2, -3.6]} rotation={[0, 0.9, 0.45]} castShadow>
        <boxGeometry args={[4, 0.25, 0.8]} />
        <meshStandardMaterial color="#3a3a3e" />
      </mesh>
      {/* Smokestacks */}
      {[4.8, 6.2].slice(0, 1 + Math.min(1, tier)).map((x, k) => (
        <group key={x} position={[x, 0, -6.6]}>
          <Box size={[0.8, 7 + tier + k, 0.8]} position={[0, (7 + tier + k) / 2, 0]} color="#7d8794" />
          <Box size={[0.85, 0.35, 0.85]} position={[0, 7 + tier + k - 0.6, 0]} color="#e23f3f" />
        </group>
      ))}
      <group ref={smoke} position={[4.8, 7.4 + tier, -6.6]}>
        {[0, 1, 2, 3].map((k) => (
          <mesh key={k}>
            <sphereGeometry args={[0.45, 8, 6]} />
            <meshStandardMaterial color="#9aa0a8" transparent opacity={0.55} />
          </mesh>
        ))}
      </group>
    </>
  )
}
