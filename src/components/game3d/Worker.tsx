'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import * as THREE from 'three'
import { BRICK_COLORS } from '@/lib/game/blueprints'
import type { Worker as WorkerSim } from '@/lib/game/engine'
import { brickGeometry, brickMaterial } from './Building'

export const WORKER_SCALE = 0.45
const VARIANTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const MAX_STACK = 4

const hatMaterial = new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.6 })
const vestMaterial = new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.7 })

function addGear(character: THREE.Object3D) {
  // Kenney blocky characters are rigid parts (no skinning): the head is a
  // 0.1-scaled 8-unit cube and the torso spans y 0.3–1.2, so gear is
  // parented straight onto those parts and follows every animation.
  const head = character.getObjectByName('head')
  if (head) {
    const crown = new THREE.Mesh(new THREE.BoxGeometry(8.8, 2.6, 8.8), hatMaterial)
    crown.position.set(0, 9.3, 0)
    const brim = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.7, 10.8), hatMaterial)
    brim.position.set(0, 8.3, 0.8)
    head.add(crown, brim)
  }
  const torso = character.getObjectByName('torso')
  if (torso) {
    // Hi-vis vest: a thin shell slightly larger than the torso.
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.62, 0.66), vestMaterial)
    vest.position.set(0, 0.88, 0)
    torso.add(vest)
  }
  character.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true
  })
}

type Pose = 'walk' | 'idle' | 'interact-right'

export default function Worker({ sim }: { sim: WorkerSim }) {
  const variant = VARIANTS[sim.id % VARIANTS.length]
  const { scene, animations } = useGLTF(`/models/characters/character-${variant}.glb`)
  const group = useRef<THREE.Group>(null)
  const carried = useRef<(THREE.Mesh | null)[]>([])
  const pose = useRef<Pose | null>(null)

  const character = useMemo(() => {
    const c = cloneSkinned(scene)
    addGear(c)
    return c
  }, [scene])
  const arms = useMemo(
    () => [character.getObjectByName('arm-left'), character.getObjectByName('arm-right')],
    [character]
  )

  const { actions } = useAnimations(animations, group)
  const carriedMaterial = useMemo(() => brickMaterial.clone(), [])

  const setPose = (next: Pose) => {
    if (pose.current === next) return
    const prev = pose.current ? actions[pose.current] : null
    const action = actions[next]
    if (!action) return
    action.reset().fadeIn(0.15).play()
    prev?.fadeOut(0.15)
    pose.current = next
  }

  useEffect(() => {
    setPose('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, after actions bind
  }, [actions])

  // Runs after drei's mixer update (registered earlier), so the "carrying"
  // arm override wins over whatever the walk cycle did to the arms.
  useFrame(() => {
    const g = group.current
    if (!g) return
    g.position.set(sim.x, 0.04, sim.z)
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, sim.heading, 0.3)

    const moving = sim.state === 'toPick' || sim.state === 'toDumpster'
    setPose(moving ? 'walk' : sim.state === 'picking' ? 'interact-right' : 'idle')

    if (sim.carrying) {
      for (const arm of arms) if (arm) arm.rotation.x = -Math.PI / 2.4
    }
    if (sim.carrying) carriedMaterial.color.set(BRICK_COLORS[sim.carrying])
    carried.current.forEach((brick, i) => {
      if (brick) brick.visible = i < sim.held
    })
  })

  // The group is scaled down to worker size; undo that so the carried brick
  // is the same size as the bricks in the building.
  const brickScale = 1 / WORKER_SCALE

  return (
    <group ref={group} scale={WORKER_SCALE}>
      <primitive object={character} />
      {/* A stack in their arms, one brick per brick held (see stats.carry). */}
      {Array.from({ length: MAX_STACK }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            carried.current[i] = el
          }}
          geometry={brickGeometry}
          material={carriedMaterial}
          position={[0, 1.45 + i * 0.78, 0.85]}
          rotation={[0, i * 0.25, 0]}
          scale={brickScale * 1.1}
          visible={false}
          castShadow
        />
      ))}
    </group>
  )
}

for (const v of VARIANTS) useGLTF.preload(`/models/characters/character-${v}.glb`)
