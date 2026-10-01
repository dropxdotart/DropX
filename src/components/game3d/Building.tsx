'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import * as THREE from 'three'
import { BRICK_COLORS } from '@/lib/game/blueprints'
import { BRICK, type Engine, type Site } from '@/lib/game/engine'

const MAX_BRICKS = 2200
const MAX_FLYING = 300
const MAX_RUBBLE = 1500
const MAX_DUST = 160
const HIDDEN = new THREE.Matrix4().makeTranslation(0, -1000, 0)
const BUILD_IN_SECONDS = 1.2
const FALL_SECONDS = 0.7
const PULL_SECONDS = 0.35

export const brickGeometry = new RoundedBoxGeometry(BRICK * 0.94, BRICK * 0.94, BRICK * 0.94, 2, BRICK * 0.12)
export const brickMaterial = new THREE.MeshStandardMaterial({ roughness: 0.85 })
const dustGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.12)
const dustMaterial = new THREE.MeshStandardMaterial({ color: '#d8cbb2', roughness: 1 })

const tmp = new THREE.Object3D()
const tmpColor = new THREE.Color()

// A brick in flight: either knocked off by BREAK (arcs onto the ground where
// it becomes rubble) or pulled out by a worker (arcs into their hands).
type Flying = {
  alive: boolean
  from: THREE.Vector3
  to: THREE.Vector3
  arc: number
  t: number
  duration: number
  spin: THREE.Vector3
  color: THREE.Color
  workerId: number | null
}

type Dust = { alive: boolean; pos: THREE.Vector3; vel: THREE.Vector3; age: number }

function hash(n: number) {
  const x = Math.sin(n * 91.345 + 12.9898) * 43758.5453
  return x - Math.floor(x)
}

// Draws one plot's building, flying bricks, rubble and dust, in that plot's
// local coordinates (the parent group sits on the plot's block).
export default function Building({ engine, site }: { engine: Engine; site: Site }) {
  const brickMesh = useRef<THREE.InstancedMesh>(null)
  const flyMesh = useRef<THREE.InstancedMesh>(null)
  const rubbleMesh = useRef<THREE.InstancedMesh>(null)
  const dustMesh = useRef<THREE.InstancedMesh>(null)
  const shakeGroup = useRef<THREE.Group>(null)

  const buildStart = useRef(-1)
  const buildSettled = useRef(true)
  const needsSync = useRef(true)
  const shake = useRef(0)

  const flying = useMemo<Flying[]>(
    () =>
      Array.from({ length: MAX_FLYING }, () => ({
        alive: false,
        from: new THREE.Vector3(),
        to: new THREE.Vector3(),
        arc: 0,
        t: 0,
        duration: 1,
        spin: new THREE.Vector3(),
        color: new THREE.Color(),
        workerId: null,
      })),
    []
  )
  const flyCursor = useRef(0)
  const dust = useMemo<Dust[]>(
    () => Array.from({ length: MAX_DUST }, () => ({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0 })),
    []
  )
  const dustCursor = useRef(0)

  function launch(fromIndex: number, to: THREE.Vector3, duration: number, workerId: number | null, arc: number) {
    const f = flying[flyCursor.current]
    flyCursor.current = (flyCursor.current + 1) % MAX_FLYING
    const p = site.brickWorld(fromIndex)
    f.alive = true
    f.from.set(p.x, p.y, p.z)
    f.to.copy(to)
    f.arc = arc
    f.t = 0
    f.duration = duration
    f.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14)
    f.color.set(BRICK_COLORS[site.bricks[fromIndex].color])
    f.workerId = workerId
  }

  function puff(x: number, y: number, z: number, count: number) {
    for (let n = 0; n < count; n++) {
      const d = dust[dustCursor.current]
      dustCursor.current = (dustCursor.current + 1) % MAX_DUST
      d.alive = true
      d.age = 0
      d.pos.set(x, y, z)
      d.vel.set((Math.random() - 0.5) * 1.6, 0.4 + Math.random(), (Math.random() - 0.5) * 1.6)
    }
  }

  // Write every brick's matrix + colour from engine state (used on a new
  // site and after offline catch-up removed bricks in bulk).
  function syncBricks(animateIn: boolean) {
    const mesh = brickMesh.current
    if (!mesh) return
    mesh.count = site.bricks.length
    site.bricks.forEach((b, i) => {
      tmpColor.set(BRICK_COLORS[b.color]).offsetHSL(0, 0, (hash(i) - 0.5) * 0.05)
      mesh.setColorAt(i, tmpColor)
      if (site.removed[i]) {
        mesh.setMatrixAt(i, HIDDEN)
      } else {
        const p = site.brickWorld(i)
        tmp.position.set(p.x, p.y, p.z)
        tmp.rotation.set(0, 0, 0)
        tmp.scale.setScalar(animateIn ? 0.0001 : 1)
        tmp.updateMatrix()
        mesh.setMatrixAt(i, tmp.matrix)
      }
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    if (animateIn) {
      buildStart.current = performance.now()
      buildSettled.current = false
    }
  }

  function hideBrick(i: number) {
    const mesh = brickMesh.current
    if (!mesh) return
    mesh.setMatrixAt(i, HIDDEN)
    mesh.instanceMatrix.needsUpdate = true
  }

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)

    if (needsSync.current) {
      needsSync.current = false
      syncBricks(false)
    }

    for (const e of site.events.splice(0)) {
      if (e.type === 'siteStarted') {
        for (const f of flying) f.alive = false
        syncBricks(true)
      } else if (e.type === 'resync') {
        syncBricks(false)
      } else if (e.type === 'brickBroken') {
        hideBrick(e.index)
        launch(e.index, new THREE.Vector3(e.toX, BRICK / 2, e.toZ), FALL_SECONDS, null, 1.2)
        const p = site.brickWorld(e.index)
        puff(p.x, p.y, p.z, 3)
        shake.current = Math.min(0.2, shake.current + 0.05)
      } else if (e.type === 'brickPulled') {
        hideBrick(e.index)
        const w = engine.workers[e.workerId]
        launch(e.index, new THREE.Vector3(w.x, 0.55, w.z), PULL_SECONDS, e.workerId, 0.5)
        const p = site.brickWorld(e.index)
        puff(p.x, p.y, p.z, 2)
      }
    }

    // Drop-in, one layer after another; always finishes with a final frame
    // so bricks land in place even if frames were skipped mid-animation.
    const mesh = brickMesh.current
    if (mesh && !buildSettled.current) {
      const elapsed = (performance.now() - buildStart.current) / 1000
      const done = elapsed >= BUILD_IN_SECONDS + 0.3
      const maxY = site.bricks.reduce((m, b) => Math.max(m, b.y), 0) || 1
      site.bricks.forEach((b, i) => {
        if (site.removed[i]) return
        const t = done ? 1 : THREE.MathUtils.clamp((elapsed - (b.y / maxY) * BUILD_IN_SECONDS * 0.7) / 0.3, 0, 1)
        const ease = 1 - Math.pow(1 - t, 3)
        const p = site.brickWorld(i)
        tmp.position.set(p.x, p.y + (1 - ease) * 2, p.z)
        tmp.rotation.set(0, 0, 0)
        tmp.scale.setScalar(Math.max(0.0001, ease))
        tmp.updateMatrix()
        mesh.setMatrixAt(i, tmp.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
      if (done) buildSettled.current = true
    }

    if (shakeGroup.current) {
      shake.current = Math.max(0, shake.current - dt)
      const s = shake.current * 0.3
      shakeGroup.current.position.set((Math.random() - 0.5) * s, 0, (Math.random() - 0.5) * s)
    }

    const fly = flyMesh.current
    if (fly) {
      flying.forEach((f, i) => {
        if (!f.alive) {
          fly.setMatrixAt(i, HIDDEN)
          return
        }
        f.t += dt / f.duration
        if (f.t >= 1) {
          f.alive = false
          fly.setMatrixAt(i, HIDDEN)
          if (f.workerId === null) puff(f.to.x, f.to.y, f.to.z, 2)
          return
        }
        // Pulled bricks home in on where the worker is now, not where they were.
        if (f.workerId !== null) {
          const w = engine.workers[f.workerId]
          if (w) f.to.set(w.x, 0.55, w.z)
        }
        tmp.position.lerpVectors(f.from, f.to, f.t)
        tmp.position.y += Math.sin(f.t * Math.PI) * f.arc
        tmp.rotation.set(f.spin.x * f.t, f.spin.y * f.t, f.spin.z * f.t)
        tmp.scale.setScalar(1)
        tmp.updateMatrix()
        fly.setMatrixAt(i, tmp.matrix)
        fly.setColorAt(i, f.color)
      })
      fly.instanceMatrix.needsUpdate = true
      if (fly.instanceColor) fly.instanceColor.needsUpdate = true
    }

    // Rubble is drawn straight from the engine's list each frame — it's the
    // source of truth for what's on the ground and what workers can pick up.
    const rubble = rubbleMesh.current
    if (rubble) {
      let n = 0
      for (const r of site.rubble) {
        if (r.readyAt > engine.time || n >= MAX_RUBBLE) continue
        tmp.position.set(r.x, BRICK * 0.42, r.z)
        tmp.rotation.set(0, hash(r.id) * Math.PI, (hash(r.id + 7) - 0.5) * 0.5)
        tmp.scale.setScalar(0.9)
        tmp.updateMatrix()
        rubble.setMatrixAt(n, tmp.matrix)
        rubble.setColorAt(n, tmpColor.set(BRICK_COLORS[r.color]))
        n++
      }
      rubble.count = n
      rubble.instanceMatrix.needsUpdate = true
      if (rubble.instanceColor) rubble.instanceColor.needsUpdate = true
    }

    const dm = dustMesh.current
    if (dm) {
      dust.forEach((d, i) => {
        if (!d.alive) {
          dm.setMatrixAt(i, HIDDEN)
          return
        }
        d.age += dt
        if (d.age > 0.6) {
          d.alive = false
          dm.setMatrixAt(i, HIDDEN)
          return
        }
        d.pos.addScaledVector(d.vel, dt)
        d.vel.multiplyScalar(0.93)
        tmp.position.copy(d.pos)
        tmp.rotation.set(d.age * 3, d.age * 2, 0)
        tmp.scale.setScalar(Math.sin((d.age / 0.6) * Math.PI) * 2)
        tmp.updateMatrix()
        dm.setMatrixAt(i, tmp.matrix)
      })
      dm.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group>
      <group ref={shakeGroup}>
        <instancedMesh ref={brickMesh} args={[brickGeometry, brickMaterial, MAX_BRICKS]} castShadow receiveShadow frustumCulled={false} />
      </group>
      <instancedMesh ref={flyMesh} args={[brickGeometry, brickMaterial, MAX_FLYING]} castShadow frustumCulled={false} />
      <instancedMesh ref={rubbleMesh} args={[brickGeometry, brickMaterial, MAX_RUBBLE]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={dustMesh} args={[dustGeometry, dustMaterial, MAX_DUST]} frustumCulled={false} />
    </group>
  )
}
