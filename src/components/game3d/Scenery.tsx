'use client'

import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { BLOCK, ISLANDS, islandRect, type Grown, type Segment } from '@/lib/game/islands'
import Prop from './Prop'

// Dressing for the world: street furniture, what's in the blocks, life on
// the water, and the sky — day and night follow the player's clock.

function seeded(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

// ── Sky: day, night and weather ──────────────────────────────────────────

// Shared with lamps and windows: 0 in full daylight, 1 at night.
export const env = { night: 0, rain: 0 }

const SKY_DAY = new THREE.Color('#9fd4ef')
const SKY_DUSK = new THREE.Color('#f0a878')
const SKY_NIGHT = new THREE.Color('#1c2a4a')
const SKY_RAIN = new THREE.Color('#8d9aa8')

// How dark it is at a local hour (0–24): day 7–18, dusk/dawn either side.
function nightAt(h: number) {
  if (h >= 7 && h <= 18) return 0
  if (h > 18 && h < 21) return (h - 18) / 3
  if (h >= 21 || h < 5) return 1
  return 1 - (h - 5) / 2
}


// `raining`: an admin made it rain (for everyone, or just this player).
export function Sky({ raining }: { raining: boolean }) {
  const hemi = useRef<THREE.HemisphereLight>(null)
  const sun = useRef<THREE.DirectionalLight>(null)
  const scene = useThree((s) => s.scene)
  const bg = useMemo(() => new THREE.Color(SKY_DAY), [])
  useLayoutEffect(() => {
    scene.background = bg
  }, [scene, bg])
  useFrame((_, dt) => {
    const d = new Date()
    const h = d.getHours() + d.getMinutes() / 60
    const night = nightAt(h)
    env.night += (night - env.night) * Math.min(1, dt * 2)
    env.rain += ((raining ? 1 : 0) - env.rain) * Math.min(1, dt * 0.5)
    const n = env.night
    const dusk = n > 0 && n < 1 ? Math.sin(n * Math.PI) : 0
    bg.copy(SKY_DAY).lerp(SKY_NIGHT, n).lerp(SKY_DUSK, dusk * 0.6).lerp(SKY_RAIN, env.rain * 0.55 * (1 - n))
    const dim = 1 - n * 0.55 - env.rain * 0.25
    if (hemi.current) hemi.current.intensity = 0.9 * dim + 0.15
    if (sun.current) {
      sun.current.intensity = 2.2 * Math.max(0.15, dim - n * 0.2)
      sun.current.color.setRGB(1, 1 - dusk * 0.25, 1 - dusk * 0.45 - n * 0.1)
    }
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#e8f4ff', '#6f8f4a', 0.9]} />
      <directionalLight
        ref={sun}
        position={[18, 30, 12]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-bias={-0.0005}
      />
      <Rain />
    </>
  )
}

// Rain streaks around wherever the camera is looking.
const CAM_DIR = new THREE.Vector3(40, 38, 40).normalize()
function Rain() {
  const COUNT = 500
  const mesh = useRef<THREE.InstancedMesh>(null)
  const camera = useThree((s) => s.camera)
  const drops = useMemo(
    () => Array.from({ length: COUNT }, (_, i) => ({ x: (seeded(i) - 0.5) * 70, z: (seeded(i + 1000) - 0.5) * 70, y: seeded(i + 2000) * 20, v: 18 + seeded(i + 3000) * 8 })),
    []
  )
  const o = useMemo(() => new THREE.Object3D(), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: '#dfe9f5', transparent: true, opacity: 0 }), [])
  useFrame((_, dt) => {
    const m = mesh.current
    if (!m) return
    material.opacity = env.rain * 0.55
    m.visible = env.rain > 0.02
    if (!m.visible) return
    const c = camera.position.clone().addScaledVector(CAM_DIR, -60)
    drops.forEach((d, i) => {
      d.y -= d.v * dt
      if (d.y < 0) d.y += 20
      o.position.set(c.x + d.x, d.y, c.z + d.z)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, material, COUNT]} frustumCulled={false}>
      <boxGeometry args={[0.04, 0.7, 0.04]} />
    </instancedMesh>
  )
}

// ── Streets: crosswalks, streetlights, traffic lights ────────────────────

// Every junction on the open roads, with the directions a street leaves
// it in (an L-bend on the outer ring has two, a crossroads four).
function junctions(segs: Segment[]) {
  const pts = new Map<string, { x: number; z: number }>()
  const add = (x: number, z: number) => pts.set(`${Math.round(x * 10)},${Math.round(z * 10)}`, { x, z })
  for (const a of segs) {
    if (a.axis === 'z') {
      add(a.from, a.line)
      add(a.until, a.line)
    } else {
      add(a.line, a.from)
      add(a.line, a.until)
    }
    for (const b of segs) {
      if (a.axis !== 'z' || b.axis !== 'x') continue
      if (b.line < a.from - 0.1 || b.line > a.until + 0.1 || a.line < b.from - 0.1 || a.line > b.until + 0.1) continue
      add(b.line, a.line)
    }
  }
  const covers = (x: number, z: number) =>
    segs.some((s) => (s.axis === 'z' ? Math.abs(z - s.line) < 0.1 && x >= s.from - 0.1 && x <= s.until + 0.1 : Math.abs(x - s.line) < 0.1 && z >= s.from - 0.1 && z <= s.until + 0.1))
  return [...pts.values()].map((p) => ({
    ...p,
    arms: ([[0, 2.4], [0, -2.4], [2.4, 0], [-2.4, 0]] as [number, number][]).filter(([dx, dz]) => covers(p.x + dx, p.z + dz)),
  }))
}

export function Streets({ segs }: { segs: Segment[] }) {
  const xs = useMemo(() => junctions(segs), [segs])
  const stripes = useRef<THREE.InstancedMesh>(null)
  const poles = useRef<THREE.InstancedMesh>(null)
  const heads = useRef<THREE.InstancedMesh>(null)
  const lampMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff6d8', emissive: '#ffd27a', emissiveIntensity: 0.2 }), [])
  const stripeData = useMemo(() => {
    const out: { x: number; z: number; r: number }[] = []
    // Zebra crossings on each arm of a real junction (not on bends).
    for (const p of xs.filter((j) => j.arms.length >= 3))
      for (const [dx, dz] of p.arms)
        for (let k = -2; k <= 2; k++) {
          const along = dz !== 0 // crossing the street that runs along x
          out.push({ x: p.x + dx + (along ? k * 0.55 : 0), z: p.z + dz + (along ? 0 : k * 0.55), r: along ? 0 : Math.PI / 2 })
        }
    return out
  }, [xs])
  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    stripeData.forEach((s, i) => {
      o.position.set(s.x, 0.05, s.z)
      o.rotation.set(0, s.r, 0)
      o.updateMatrix()
      stripes.current?.setMatrixAt(i, o.matrix)
    })
    if (stripes.current) stripes.current.instanceMatrix.needsUpdate = true
    xs.forEach((p, i) => {
      o.rotation.set(0, 0, 0)
      o.position.set(p.x + 2.1, 1.6, p.z - 2.1)
      o.updateMatrix()
      poles.current?.setMatrixAt(i, o.matrix)
      o.position.set(p.x + 1.7, 3.15, p.z - 2.1)
      o.updateMatrix()
      heads.current?.setMatrixAt(i, o.matrix)
    })
    if (poles.current) poles.current.instanceMatrix.needsUpdate = true
    if (heads.current) heads.current.instanceMatrix.needsUpdate = true
  }, [stripeData, xs])
  useFrame(() => {
    lampMat.emissiveIntensity = 0.2 + env.night * 2.2
  })
  // Traffic lights at every other crossroads.
  const signals = xs.filter((j) => j.arms.length === 4).filter((_, i) => i % 2 === 1)
  return (
    <group>
      <instancedMesh key={`s${stripeData.length}`} ref={stripes} args={[undefined, undefined, stripeData.length]} frustumCulled={false}>
        <boxGeometry args={[0.3, 0.012, 1.6]} />
        <meshStandardMaterial color="#f4f1ea" />
      </instancedMesh>
      <instancedMesh key={`p${xs.length}`} ref={poles} args={[undefined, undefined, xs.length]} frustumCulled={false}>
        <boxGeometry args={[0.1, 3.2, 0.1]} />
        <meshStandardMaterial color="#5b6470" />
      </instancedMesh>
      <instancedMesh key={`h${xs.length}`} ref={heads} args={[undefined, lampMat, xs.length]} frustumCulled={false}>
        <boxGeometry args={[0.8, 0.14, 0.3]} />
      </instancedMesh>
      {signals.map((p) => (
        <TrafficLight key={`${p.x},${p.z}`} x={p.x - 2.1} z={p.z + 2.1} seed={p.x + p.z} />
      ))}
    </group>
  )
}

function TrafficLight({ x, z, seed }: { x: number; z: number; seed: number }) {
  const lights = useRef<(THREE.MeshStandardMaterial | null)[]>([])
  useFrame(({ clock }) => {
    const phase = Math.floor((clock.getElapsedTime() + seed) / 3) % 3
    lights.current.forEach((m, i) => {
      if (m) m.emissiveIntensity = i === phase ? 1.6 : 0.05
    })
  })
  const colors = ['#3fdc4f', '#f2c230', '#e23f3f']
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[0.1, 2.8, 0.1]} />
        <meshStandardMaterial color="#3a3a3e" />
      </mesh>
      <mesh position={[0, 2.95, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.25]} />
        <meshStandardMaterial color="#2b2b2e" />
      </mesh>
      {colors.map((c, i) => (
        <mesh key={c} position={[0, 2.7 + i * 0.25, 0.13]}>
          <sphereGeometry args={[0.08, 8, 6]} />
          <meshStandardMaterial
            ref={(m) => {
              lights.current[i] = m
            }}
            color={c}
            emissive={c}
            emissiveIntensity={0.05}
          />
        </mesh>
      ))}
    </group>
  )
}

// ── Inside the blocks ────────────────────────────────────────────────────

const CAR_MODELS = ['/models/vehicles/taxi.glb', '/models/vehicles/van.glb', '/models/vehicles/sedan.glb', '/models/vehicles/suv.glb']
const PEOPLE = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((l) => `/models/characters/character-${l}.glb`)

// Pavement, then by kind: hedges and pools for suburbs; a fountain, pond,
// playground and flower beds for parks; benches for the shops. Parked cars
// along the kerb and a couple of people out walking.
export function BlockDressing({ kind, seed }: { kind: 'downtown' | 'suburb' | 'park' | 'shops'; seed: number }) {
  const green = kind === 'suburb' || kind === 'park'
  const walker = useRef<THREE.Group>(null)
  const spout = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (walker.current) {
      // Around the pavement ring.
      const k = ((t * 0.04 + seeded(seed)) % 1) * 4
      const side = Math.floor(k)
      const f = (k % 1) * 19 - 9.5
      const pos = [
        [f, 9.6],
        [9.6, -f],
        [-f, -9.6],
        [-9.6, f],
      ][side]
      walker.current.position.set(pos[0], Math.abs(Math.sin(t * 6)) * 0.04, pos[1])
      walker.current.rotation.y = [Math.PI / 2, Math.PI, -Math.PI / 2, 0][side]
    }
    if (spout.current) spout.current.scale.y = 0.8 + Math.sin(t * 4) * 0.2
  })
  const pool = kind === 'suburb' && seeded(seed + 7) < 0.4
  const cars = kind !== 'park' && seeded(seed + 9) < 0.7
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
        <planeGeometry args={[BLOCK - 2.8, BLOCK - 2.8]} />
        <meshStandardMaterial color="#d6d2c8" />
      </mesh>
      {green && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} receiveShadow>
          <planeGeometry args={[BLOCK - 5, BLOCK - 5]} />
          <meshStandardMaterial color={kind === 'park' ? '#7cc463' : '#8fcf72'} />
        </mesh>
      )}
      {kind === 'suburb' &&
        [-1, 1].map((sd) => (
          <mesh key={sd} position={[sd * 8.6, 0.35, 0]} castShadow>
            <boxGeometry args={[0.6, 0.7, 15]} />
            <meshStandardMaterial color="#4f9a45" />
          </mesh>
        ))}
      {pool && (
        <group position={[0, 0, 0]}>
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[3.2, 0.1, 2.2]} />
            <meshStandardMaterial color="#f4f1ea" />
          </mesh>
          <mesh position={[0, 0.09, 0]}>
            <boxGeometry args={[2.8, 0.06, 1.8]} />
            <meshStandardMaterial color="#4fb7e6" emissive="#1c6fa0" emissiveIntensity={0.15} />
          </mesh>
        </group>
      )}
      {kind === 'park' && (
        <>
          {/* Fountain */}
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[1.6, 1.8, 0.5, 18]} />
            <meshStandardMaterial color="#bdb9af" />
          </mesh>
          <mesh position={[0, 0.48, 0]}>
            <cylinderGeometry args={[1.35, 1.35, 0.06, 18]} />
            <meshStandardMaterial color="#5fbde8" />
          </mesh>
          <mesh ref={spout} position={[0, 1.1, 0]}>
            <cylinderGeometry args={[0.08, 0.25, 1.2, 8]} />
            <meshStandardMaterial color="#cfeefb" transparent opacity={0.8} />
          </mesh>
          {/* Flower beds round it */}
          {Array.from({ length: 8 }, (_, k) => (
            <mesh key={k} position={[Math.cos((k / 8) * Math.PI * 2) * 2.5, 0.15, Math.sin((k / 8) * Math.PI * 2) * 2.5]}>
              <boxGeometry args={[0.6, 0.3, 0.6]} />
              <meshStandardMaterial color={['#e23f3f', '#f2c230', '#d66eb4', '#ffffff'][k % 4]} />
            </mesh>
          ))}
          {/* Pond */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -6.6]}>
            <circleGeometry args={[2, 20]} />
            <meshStandardMaterial color="#4f9fd0" />
          </mesh>
          {/* Playground: slide and swings */}
          <group position={[0, 0, 6.4]}>
            <mesh position={[-1.2, 0.7, 0]} rotation={[0, 0, 0.6]}>
              <boxGeometry args={[0.5, 1.8, 0.1]} />
              <meshStandardMaterial color="#ef7d2d" />
            </mesh>
            <mesh position={[-1.9, 0.6, 0]}>
              <boxGeometry args={[0.5, 1.2, 0.5]} />
              <meshStandardMaterial color="#2d7ff9" />
            </mesh>
            <mesh position={[1.4, 1.5, 0]}>
              <boxGeometry args={[2.2, 0.1, 0.1]} />
              <meshStandardMaterial color="#f2c230" />
            </mesh>
            {[0.6, 2.2].map((x) => (
              <mesh key={x} position={[x, 0.75, 0]}>
                <boxGeometry args={[0.1, 1.5, 0.1]} />
                <meshStandardMaterial color="#f2c230" />
              </mesh>
            ))}
          </group>
        </>
      )}
      {kind === 'shops' &&
        [-3, 3].map((x) => (
          <mesh key={x} position={[x, 0.25, 8.6]}>
            <boxGeometry args={[1.4, 0.5, 0.4]} />
            <meshStandardMaterial color="#8a5a30" />
          </mesh>
        ))}
      {cars && (
        <Prop url={CAR_MODELS[Math.floor(seeded(seed + 3) * CAR_MODELS.length)]} size={1.45} position={[-2 + seeded(seed + 4) * 4, 0, 9.4]} rotationY={Math.PI / 2} />
      )}
      <group ref={walker}>
        <Prop url={PEOPLE[Math.floor(seeded(seed + 5) * PEOPLE.length)]} size={0.9} />
      </group>
    </group>
  )
}

// ── Water and shores ─────────────────────────────────────────────────────

// The sea under everything, darkening with the sky at night.
const SEA_DAY = new THREE.Color('#3d9fd6')
const SEA_NIGHT = new THREE.Color('#163456')
export function Sea() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: SEA_DAY.clone(), roughness: 0.35, metalness: 0.05 }), [])
  useFrame(() => {
    mat.color.copy(SEA_DAY).lerp(SEA_NIGHT, env.night * 0.8)
  })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-30, -0.06, 50]} material={mat}>
      <planeGeometry args={[900, 900]} />
    </mesh>
  )
}

// Glints on the water, seagulls, a lighthouse and pier on the Houses
// island, rocks along the other islands' quays.
export function Waterside({ grown }: { grown: Grown }) {
  const glints = useRef<THREE.InstancedMesh>(null)
  const glintMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 }), [])
  const spots = useMemo(() => Array.from({ length: 360 }, (_, i) => ({ x: -190 + seeded(i) * 300, z: -100 + seeded(i + 500) * 300, p: seeded(i + 900) * 6 })), [])
  const gulls = useRef<THREE.Group>(null)
  const beam = useRef<THREE.Group>(null)
  const lampMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffe08a', emissiveIntensity: 0.4 }), [])
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const m = glints.current
    if (m) {
      const o = new THREE.Object3D()
      spots.forEach((s, i) => {
        const k = (Math.sin(t * 0.8 + s.p) + 1) / 2
        o.position.set(s.x + Math.sin(t * 0.2 + s.p) * 0.6, -0.045, s.z)
        o.scale.set(0.3 + k * 1.2, 1, 0.12)
        o.updateMatrix()
        m.setMatrixAt(i, o.matrix)
      })
      m.instanceMatrix.needsUpdate = true
      glintMat.opacity = 0.35 * (1 - env.night * 0.6)
    }
    gulls.current?.children.forEach((g, i) => {
      const a = t * 0.25 + i * 1.3
      g.position.set(Math.cos(a) * (14 + i * 3), 9 + Math.sin(t + i) * 0.6, Math.sin(a) * (10 + i * 2))
      g.rotation.y = -a
      const flap = Math.sin(t * 8 + i) * 0.5
      g.children[0].rotation.z = 0.3 + flap
      g.children[1].rotation.z = -0.3 - flap
    })
    if (beam.current) beam.current.rotation.y = t * 0.8
    lampMat.emissiveIntensity = 0.4 + env.night * 3
  })
  // Gulls over the town; the lighthouse and pier on the first bit of
  // beach (block (0, 7)'s south shore), so they're there from the start.
  const houses = islandRect(ISLANDS[0], Math.max(0, grown.houses))
  const beachZ = 7 * BLOCK + 11.5 + 2.7 + 3.5
  return (
    <group>
      <instancedMesh ref={glints} args={[undefined, glintMat, spots.length]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
      {/* Seagulls circling over the Houses island's beaches */}
      <group ref={gulls} position={[(houses.x0 + houses.x1) / 2, 0, (houses.z0 + houses.z1) / 2]}>
        {Array.from({ length: 5 }, (_, i) => (
          <group key={i}>
            <mesh position={[-0.35, 0, 0]}>
              <boxGeometry args={[0.7, 0.05, 0.25]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
            <mesh position={[0.35, 0, 0]}>
              <boxGeometry args={[0.7, 0.05, 0.25]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
          </group>
        ))}
      </group>
      {/* Lighthouse on the Houses island's south-west beach */}
      <group position={[-7, 0, beachZ]}>
        {Array.from({ length: 6 }, (_, k) => (
          <mesh key={k} position={[0, 0.6 + k * 1.2, 0]} castShadow>
            <cylinderGeometry args={[1.1 - k * 0.08, 1.2 - k * 0.08, 1.2, 14]} />
            <meshStandardMaterial color={k % 2 ? '#e23f3f' : '#f4f1ea'} />
          </mesh>
        ))}
        <mesh position={[0, 7.7, 0]} material={lampMat}>
          <cylinderGeometry args={[0.65, 0.65, 0.8, 12]} />
        </mesh>
        <mesh position={[0, 8.4, 0]}>
          <coneGeometry args={[0.85, 0.7, 12]} />
          <meshStandardMaterial color="#2b2b2e" />
        </mesh>
        <group ref={beam} position={[0, 7.7, 0]}>
          <mesh position={[3, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <coneGeometry args={[0.8, 6, 10, 1, true]} />
            <meshBasicMaterial color="#fff6c8" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </group>
      </group>
      {/* A wooden pier off the Houses island's south beach */}
      <group position={[7, 0, beachZ - 1]}>
        <mesh position={[0, 0.1, 6]}>
          <boxGeometry args={[2, 0.2, 14]} />
          <meshStandardMaterial color="#a07a52" />
        </mesh>
        {Array.from({ length: 6 }, (_, k) => [-1, 1].map((sd) => (
          <mesh key={`${k}${sd}`} position={[sd * 0.9, -0.5, k * 2.6]}>
            <boxGeometry args={[0.25, 1.4, 0.25]} />
            <meshStandardMaterial color="#6b5a44" />
          </mesh>
        )))}
      </group>
    </group>
  )
}
