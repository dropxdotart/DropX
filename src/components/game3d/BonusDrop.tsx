'use client'

import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { BONUS_LIFETIME_SECONDS, BONUS_SPOT, BRICK, DUMPSTER, ROAD_Z, TRAILER_FAR, type Engine } from '@/lib/game/engine'
import Prop from './Prop'
import { Logo } from './SiteProps'
import { brickGeometry, brickMaterial } from './Building'
import { pointer } from './drag'

// The bonus trailer: it rolls along the far lane every few minutes and spills
// a pile of bricks onto the sidewalk. Tapping the pile (or the side tab in
// the HUD) offers an ad to claim them; claimed bricks arc into the dumpster.

const PILE_BRICKS = 22
const TRAILER_Z = ROAD_Z + 0.65
const COLORS = ['#c8553d', '#b4553c', '#d96c4f', '#a84a35', '#cf7b5a']
const FALL_SECONDS = 0.5
const FLY_SECONDS = 0.9
const PILE_SCALE = 1.7

const tmp = new THREE.Object3D()
const tmpColor = new THREE.Color()

export default function BonusDrop({ engine, onOpen }: { engine: Engine; onOpen: () => void }) {
  const trailer = useRef<THREE.Group>(null)
  const pile = useRef<THREE.InstancedMesh>(null)
  const hit = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const marker = useRef<THREE.Group>(null)

  // A loose heap: wider at the bottom, a few bricks stacked on top.
  const offsets = useMemo(() => {
    let seed = 7
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    return Array.from({ length: PILE_BRICKS }, (_, i) => {
      const layer = i < 12 ? 0 : i < 19 ? 1 : 2
      const r = (0.7 - layer * 0.22) * Math.sqrt(rand())
      const a = rand() * Math.PI * 2
      return {
        x: Math.cos(a) * r * 1.6,
        z: Math.sin(a) * r * 0.7,
        y: BRICK * PILE_SCALE * (0.5 + layer * 0.9),
        rot: rand() * Math.PI,
        tilt: (rand() - 0.5) * 0.5,
        delay: rand() * 0.25,
      }
    })
  }, [])

  const colored = useRef(false)

  useFrame(() => {
    const t = engine.time

    // Trailer drive-by
    const g = trailer.current
    if (g) {
      const p = engine.trailerProgress()
      g.visible = p >= 0 && p < 1
      if (g.visible) g.position.set(THREE.MathUtils.lerp(TRAILER_FAR, -TRAILER_FAR, p), 0.02, TRAILER_Z)
    }

    const mesh = pile.current
    if (!mesh) return
    if (!colored.current) {
      for (let i = 0; i < PILE_BRICKS; i++) mesh.setColorAt(i, tmpColor.set(COLORS[i % COLORS.length]))
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      colored.current = true
    }

    const drop = engine.bonusDrop
    const claim = engine.lastBonusClaim
    const flying = claim && t - claim.at < FLY_SECONDS + 0.3
    if (hit.current) hit.current.visible = !!drop
    if (ring.current) {
      ring.current.visible = !!drop
      if (drop) {
        const left = (drop.expiresAt - t) / BONUS_LIFETIME_SECONDS
        ring.current.scale.setScalar(1 + Math.sin(t * 5) * 0.06)
        ;(ring.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.35 * left
      }
    }

    if (marker.current) {
      marker.current.visible = !!drop && t - drop.droppedAt > FALL_SECONDS + 0.3
      marker.current.position.y = 2.1 + Math.sin(t * 4) * 0.15
    }

    if (!drop && !flying) {
      mesh.visible = false
      return
    }
    mesh.visible = true

    for (let i = 0; i < PILE_BRICKS; i++) {
      const o = offsets[i]
      let x = BONUS_SPOT.x + o.x
      let y = o.y
      let z = BONUS_SPOT.z + o.z
      let s = 1
      if (drop) {
        // Tumble off the trailer bed onto the sidewalk.
        const k = THREE.MathUtils.clamp((t - drop.droppedAt - o.delay) / FALL_SECONDS, 0, 1)
        z = THREE.MathUtils.lerp(TRAILER_Z, z, k)
        y = THREE.MathUtils.lerp(1.1, y, k) + Math.sin(k * Math.PI) * 0.8
        // Shrink away over the last couple of seconds if nobody claims it.
        s = THREE.MathUtils.clamp((drop.expiresAt - t) / 2, 0, 1)
      } else if (claim) {
        // Arc into the dumpster, staggered.
        const k = THREE.MathUtils.clamp((t - claim.at - o.delay) / FLY_SECONDS, 0, 1)
        const e = k * k * (3 - 2 * k)
        x = THREE.MathUtils.lerp(x, DUMPSTER.x + o.x * 0.5, e)
        z = THREE.MathUtils.lerp(z, DUMPSTER.z + o.z * 0.5, e)
        y = THREE.MathUtils.lerp(y, 0.9, e) + Math.sin(e * Math.PI) * 3
        s = k >= 1 ? 0 : 1
      }
      tmp.position.set(x, y, z)
      tmp.rotation.set(o.tilt, o.rot, 0)
      tmp.scale.setScalar(s * PILE_SCALE)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  const open = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (engine.bonusDrop && !pointer.dragged) onOpen()
  }

  return (
    <>
      <group ref={trailer} visible={false}>
        <Prop url="/models/vehicles/truck-flat.glb" size={1.5} rotationY={-Math.PI / 2} />
        {/* Brick load strapped to the bed */}
        <mesh position={[0.45, 0.85, 0]} castShadow>
          <boxGeometry args={[1.1, 0.45, 0.9]} />
          <meshStandardMaterial color="#c8553d" roughness={0.9} />
        </mesh>
        <Logo size={0.6} position={[0.3, 0.8, 0.78]} />
        <Logo size={0.6} position={[0.3, 0.8, -0.78]} rotationY={Math.PI} />
      </group>

      <instancedMesh
        ref={pile}
        args={[brickGeometry, brickMaterial, PILE_BRICKS]}
        castShadow
        visible={false}
        frustumCulled={false}
      />
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[BONUS_SPOT.x, 0.06, BONUS_SPOT.z]} visible={false}>
        <ringGeometry args={[1.25, 1.55, 40]} />
        <meshBasicMaterial color="#3aa0ff" transparent opacity={0.7} depthWrite={false} />
      </mesh>
      {/* Bobbing blue marker so the pile reads as tappable */}
      <group ref={marker} position={[BONUS_SPOT.x, 2.1, BONUS_SPOT.z]} visible={false}>
        <mesh position={[0, -0.1, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.4, 0.5, 4]} />
          <meshStandardMaterial color="#3aa0ff" emissive="#1d5fa8" emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.22, 0.4, 0.22]} />
          <meshStandardMaterial color="#3aa0ff" emissive="#1d5fa8" emissiveIntensity={0.5} />
        </mesh>
      </group>
      <mesh
        ref={hit}
        position={[BONUS_SPOT.x, 1.2, BONUS_SPOT.z]}
        visible={false}
        onClick={open}
        onPointerOver={() => engine.bonusDrop && (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <boxGeometry args={[3, 2.6, 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  )
}
