'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import * as THREE from 'three'
import { BRICK_COLORS, getBricks, type Brick } from '@/lib/game/blueprints'

export const BRICK = 0.5

const MAX_FALLING = 700
const MAX_RUBBLE = 1200
const MAX_DUST = 160
const GRAVITY = -22
const HIDDEN_Y = -1000
const BUILD_IN_SECONDS = 1.1

const brickGeometry = new RoundedBoxGeometry(BRICK * 0.95, BRICK * 0.95, BRICK * 0.95, 2, 0.05)
const dustGeometry = new THREE.BoxGeometry(0.16, 0.16, 0.16)
const brickMaterial = new THREE.MeshStandardMaterial({ roughness: 0.85 })
const dustMaterial = new THREE.MeshStandardMaterial({ color: '#d8cbb2', roughness: 1 })

const tmp = new THREE.Object3D()
const tmpColor = new THREE.Color()

function brickWorld(b: Brick, out: THREE.Vector3) {
  return out.set(b.x * BRICK, b.y * BRICK + BRICK / 2, b.z * BRICK)
}

type Falling = {
  alive: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  rot: THREE.Euler
  spin: THREE.Vector3
  color: THREE.Color
}

type Dust = { alive: boolean; pos: THREE.Vector3; vel: THREE.Vector3; age: number }

export type BuildingHandle = {
  // Where the next brick(s) should come off from — set by a tap just before
  // the damage lands, otherwise a random crew member's position is used.
  hitPoint: THREE.Vector3 | null
}

export default function Building({
  blueprint,
  structureKey,
  health,
  maxHealth,
  crewPositions,
  handle,
  onTap,
}: {
  blueprint: number
  structureKey: number
  health: number
  maxHealth: number
  crewPositions: THREE.Vector3[]
  handle: React.RefObject<BuildingHandle>
  onTap: (e: ThreeEvent<PointerEvent>) => void
}) {
  const bricks = useMemo(() => getBricks(blueprint), [blueprint])
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const fallRef = useRef<THREE.InstancedMesh>(null)
  const rubbleRef = useRef<THREE.InstancedMesh>(null)
  const dustRef = useRef<THREE.InstancedMesh>(null)
  const groupRef = useRef<THREE.Group>(null)

  const removed = useRef<Uint8Array>(new Uint8Array(0))
  const visibleCount = useRef(0)
  const columns = useRef<Map<string, number[]>>(new Map())
  const buildStart = useRef(0)
  const buildSettled = useRef(false)
  const shake = useRef(0)

  const falling = useRef<Falling[]>(
    Array.from({ length: MAX_FALLING }, () => ({
      alive: false,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      rot: new THREE.Euler(),
      spin: new THREE.Vector3(),
      color: new THREE.Color(),
    }))
  )
  const fallCursor = useRef(0)
  const rubbleCursor = useRef(0)
  const rubbleFade = useRef(1)
  const dust = useRef<Dust[]>(
    Array.from({ length: MAX_DUST }, () => ({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0 }))
  )
  const dustCursor = useRef(0)

  const prevBricks = useRef<Brick[]>([])
  const prevStructureKey = useRef(structureKey)
  const rubbleFadeAt = useRef(0)

  // Fresh structure: collapse whatever was left of the previous one, reset
  // every brick, index columns for "top brick" lookups, and schedule the
  // drop-in animation for after the collapse has played out.
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const isNextStructure = structureKey !== prevStructureKey.current
    prevStructureKey.current = structureKey
    if (isNextStructure) {
      const pos = new THREE.Vector3()
      prevBricks.current.forEach((b, i) => {
        if (removed.current[i]) return
        brickWorld(b, pos)
        tmpColor.set(BRICK_COLORS[b.color])
        if (i % 3 === 0) spawnDust(pos)
        spawnFalling(pos, tmpColor)
      })
      shake.current = 0.6
      rubbleFadeAt.current = performance.now() + 1400
    }

    prevBricks.current = bricks
    removed.current = new Uint8Array(bricks.length)
    visibleCount.current = bricks.length
    tmp.rotation.set(0, 0, 0)
    tmp.scale.setScalar(0.0001)
    const hidePos = new THREE.Vector3()
    bricks.forEach((b, i) => {
      tmp.position.copy(brickWorld(b, hidePos))
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true

    const cols = new Map<string, number[]>()
    bricks.forEach((b, i) => {
      const key = `${b.x},${b.z}`
      const list = cols.get(key)
      if (list) list.push(i)
      else cols.set(key, [i])
      // Small per-brick shade variation so walls read as individual bricks.
      tmpColor.set(BRICK_COLORS[b.color]).offsetHSL(0, 0, (Math.sin(i * 12.9898) * 43758.5453) % 1 * 0.04)
      mesh.setColorAt(i, tmpColor)
    })
    for (const list of cols.values()) list.sort((a, b) => bricks[a].y - bricks[b].y)
    columns.current = cols

    buildStart.current = performance.now() + (isNextStructure ? 2200 : 0)
    buildSettled.current = false
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spawn helpers are stable refs-in-closure
  }, [bricks, structureKey])

  // Health dropped → knock off however many bricks that damage is worth.
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh || bricks.length === 0) return
    const target = Math.ceil((bricks.length * Math.max(0, health)) / maxHealth)
    let toRemove = visibleCount.current - target
    if (toRemove <= 0) return

    const origin =
      handle.current.hitPoint ??
      (crewPositions.length > 0 ? crewPositions[Math.floor(Math.random() * crewPositions.length)] : new THREE.Vector3())
    handle.current.hitPoint = null
    shake.current = Math.min(0.25, shake.current + 0.06)

    const pos = new THREE.Vector3()
    while (toRemove > 0) {
      let best = -1
      let bestDist = Infinity
      for (const list of columns.current.values()) {
        for (let k = list.length - 1; k >= 0; k--) {
          const i = list[k]
          if (removed.current[i]) continue
          const d = brickWorld(bricks[i], pos).distanceToSquared(origin)
          if (d < bestDist) {
            bestDist = d
            best = i
          }
          break
        }
      }
      if (best < 0) break

      removed.current[best] = 1
      visibleCount.current--
      toRemove--

      brickWorld(bricks[best], pos)
      tmp.position.set(0, HIDDEN_Y, 0)
      tmp.updateMatrix()
      mesh.setMatrixAt(best, tmp.matrix)
      // Crew damage that lands while the next building is still dropping in
      // just thins it out; spawning debris there would look like bricks
      // raining from an empty lot.
      if (performance.now() >= buildStart.current) {
        mesh.getColorAt(best, tmpColor)
        spawnFalling(pos, tmpColor)
        spawnDust(pos)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to damage only
  }, [health])

  function spawnFalling(at: THREE.Vector3, color: THREE.Color) {
    const f = falling.current[fallCursor.current]
    fallCursor.current = (fallCursor.current + 1) % MAX_FALLING
    if (f.alive) settle(f)
    const outward = new THREE.Vector3(at.x, 0, at.z)
    if (outward.lengthSq() < 0.01) outward.set(Math.random() - 0.5, 0, Math.random() - 0.5)
    outward.normalize().multiplyScalar(1.5 + Math.random() * 2.5)
    f.alive = true
    f.pos.copy(at)
    f.vel.set(outward.x + (Math.random() - 0.5), 2 + Math.random() * 3, outward.z + (Math.random() - 0.5))
    f.rot.set(0, 0, 0)
    f.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12)
    f.color.copy(color)
  }

  function spawnDust(at: THREE.Vector3) {
    for (let n = 0; n < 3; n++) {
      const d = dust.current[dustCursor.current]
      dustCursor.current = (dustCursor.current + 1) % MAX_DUST
      d.alive = true
      d.age = 0
      d.pos.copy(at)
      d.vel.set((Math.random() - 0.5) * 2, 0.5 + Math.random() * 1.2, (Math.random() - 0.5) * 2)
    }
  }

  function settle(f: Falling) {
    f.alive = false
    const rubble = rubbleRef.current
    if (!rubble) return
    const i = rubbleCursor.current
    rubbleCursor.current = (rubbleCursor.current + 1) % MAX_RUBBLE
    tmp.position.set(f.pos.x, BRICK * 0.4, f.pos.z)
    tmp.rotation.set(0, f.rot.y, (Math.random() - 0.5) * 0.4)
    tmp.scale.setScalar(0.85)
    tmp.updateMatrix()
    rubble.setMatrixAt(i, tmp.matrix)
    rubble.setColorAt(i, f.color)
    rubble.instanceMatrix.needsUpdate = true
    if (rubble.instanceColor) rubble.instanceColor.needsUpdate = true
  }

  // Hide every pool instance up front so unused slots don't render at origin.
  useEffect(() => {
    tmp.position.set(0, HIDDEN_Y, 0)
    tmp.rotation.set(0, 0, 0)
    tmp.scale.setScalar(1)
    tmp.updateMatrix()
    for (const ref of [fallRef, rubbleRef, dustRef]) {
      const m = ref.current
      if (!m) continue
      for (let i = 0; i < m.count; i++) m.setMatrixAt(i, tmp.matrix)
      m.instanceMatrix.needsUpdate = true
    }
    const rubble = rubbleRef.current
    if (rubble) {
      for (let i = 0; i < MAX_RUBBLE; i++) rubble.setColorAt(i, tmpColor.set('#999'))
    }
  }, [])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const mesh = meshRef.current
    const pos = new THREE.Vector3()

    // Drop-in build animation, one layer after another. It keeps running for
    // one frame past the end so bricks always land in their final spot even
    // if frames were skipped (e.g. the tab was hidden mid-animation).
    const elapsed = (performance.now() - buildStart.current) / 1000
    const animating = elapsed < BUILD_IN_SECONDS + 0.3
    if (mesh && (animating || !buildSettled.current)) {
      if (!animating) buildSettled.current = true
      const maxY = bricks.reduce((m, b) => Math.max(m, b.y), 0) || 1
      bricks.forEach((b, i) => {
        if (removed.current[i]) return
        const t = THREE.MathUtils.clamp((elapsed - (b.y / maxY) * BUILD_IN_SECONDS * 0.7) / 0.3, 0, 1)
        const ease = 1 - Math.pow(1 - t, 3)
        brickWorld(b, pos)
        tmp.position.set(pos.x, pos.y + (1 - ease) * 3, pos.z)
        tmp.rotation.set(0, 0, 0)
        tmp.scale.setScalar(Math.max(0.0001, ease))
        tmp.updateMatrix()
        mesh.setMatrixAt(i, tmp.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
    }

    if (groupRef.current) {
      shake.current = Math.max(0, shake.current - dt * 1.2)
      const s = shake.current * 0.35
      groupRef.current.position.set((Math.random() - 0.5) * s, 0, (Math.random() - 0.5) * s)
    }

    const fall = fallRef.current
    if (fall) {
      falling.current.forEach((f, i) => {
        if (!f.alive) {
          return
        }
        f.vel.y += GRAVITY * dt
        f.pos.addScaledVector(f.vel, dt)
        f.rot.x += f.spin.x * dt
        f.rot.y += f.spin.y * dt
        f.rot.z += f.spin.z * dt
        if (f.pos.y <= BRICK * 0.45) {
          f.pos.y = BRICK * 0.45
          if (f.vel.y < -3) {
            f.vel.y *= -0.3
            f.vel.x *= 0.5
            f.vel.z *= 0.5
            f.spin.multiplyScalar(0.5)
          } else {
            settle(f)
            tmp.position.set(0, HIDDEN_Y, 0)
            tmp.updateMatrix()
            fall.setMatrixAt(i, tmp.matrix)
            return
          }
        }
        tmp.position.copy(f.pos)
        tmp.rotation.copy(f.rot)
        tmp.scale.setScalar(0.95)
        tmp.updateMatrix()
        fall.setMatrixAt(i, tmp.matrix)
        fall.setColorAt(i, f.color)
      })
      fall.instanceMatrix.needsUpdate = true
      if (fall.instanceColor) fall.instanceColor.needsUpdate = true
    }

    const dustMesh = dustRef.current
    if (dustMesh) {
      dust.current.forEach((d, i) => {
        if (!d.alive) return
        d.age += dt
        if (d.age > 0.7) {
          d.alive = false
          tmp.position.set(0, HIDDEN_Y, 0)
          tmp.scale.setScalar(1)
        } else {
          d.pos.addScaledVector(d.vel, dt)
          d.vel.multiplyScalar(0.94)
          tmp.position.copy(d.pos)
          tmp.scale.setScalar(Math.sin((d.age / 0.7) * Math.PI) * 2.2)
        }
        tmp.rotation.set(d.age * 3, d.age * 2, 0)
        tmp.updateMatrix()
        dustMesh.setMatrixAt(i, tmp.matrix)
      })
      dustMesh.instanceMatrix.needsUpdate = true
    }

    // Sink the previous structure's rubble into the ground once its collapse
    // has landed, clearing the lot for the next one.
    const rubble = rubbleRef.current
    if (rubbleFadeAt.current && performance.now() >= rubbleFadeAt.current) {
      rubbleFadeAt.current = 0
      rubbleFade.current = 0.999
    }
    if (rubble && rubbleFade.current < 1) {
      rubbleFade.current -= dt * 1.5
      rubble.position.y = -BRICK * (1 - Math.max(0, rubbleFade.current)) * 1.2
      if (rubbleFade.current <= 0) {
        tmp.position.set(0, HIDDEN_Y, 0)
        tmp.rotation.set(0, 0, 0)
        tmp.scale.setScalar(1)
        tmp.updateMatrix()
        for (let i = 0; i < MAX_RUBBLE; i++) rubble.setMatrixAt(i, tmp.matrix)
        rubble.instanceMatrix.needsUpdate = true
        rubble.position.y = 0
        rubbleCursor.current = 0
        rubbleFade.current = 1
      }
    }
  })

  return (
    <group>
      <group ref={groupRef}>
        <instancedMesh
          key={`${blueprint}-${structureKey}`}
          ref={meshRef}
          args={[brickGeometry, brickMaterial, bricks.length]}
          castShadow
          receiveShadow
          onPointerDown={onTap}
        />
      </group>
      <instancedMesh ref={fallRef} args={[brickGeometry, brickMaterial, MAX_FALLING]} castShadow frustumCulled={false} />
      <instancedMesh ref={rubbleRef} args={[brickGeometry, brickMaterial, MAX_RUBBLE]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={dustRef} args={[dustGeometry, dustMaterial, MAX_DUST]} frustumCulled={false} />
    </group>
  )
}
