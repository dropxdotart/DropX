'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useAnimations, useGLTF } from '@react-three/drei'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import * as THREE from 'three'

export const WORKER_SCALE = 0.72
const VARIANTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

const hatMaterial = new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.6 })
const steelMaterial = new THREE.MeshStandardMaterial({ color: '#5b6470', roughness: 0.4, metalness: 0.4 })
const handleMaterial = new THREE.MeshStandardMaterial({ color: '#8a5a2b', roughness: 0.8 })

function addGear(character: THREE.Object3D) {
  // Kenney blocky characters are rigid parts (no skinning): the head is a
  // 0.1-scaled 8-unit cube, the right arm hangs from the shoulder with the
  // hand at local y≈-1. Gear is parented straight onto those parts so it
  // follows every animation for free.
  const head = character.getObjectByName('head')
  if (head) {
    const crown = new THREE.Mesh(new THREE.BoxGeometry(8.8, 2.6, 8.8), hatMaterial)
    crown.position.set(0, 9.3, 0)
    const brim = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.7, 10.8), hatMaterial)
    brim.position.set(0, 8.3, 0.8)
    for (const m of [crown, brim]) {
      m.castShadow = true
      head.add(m)
    }
  }

  const arm = character.getObjectByName('arm-right')
  if (arm) {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 8), handleMaterial)
    handle.rotation.x = Math.PI / 2
    handle.position.set(-0.2, -0.92, 0.45)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.32), steelMaterial)
    head.position.set(-0.2, -0.92, 1.0)
    for (const m of [handle, head]) {
      m.castShadow = true
      arm.add(m)
    }
  }
}

export default function Worker({
  index,
  position,
  rotationY,
}: {
  index: number
  position: [number, number, number]
  rotationY: number
}) {
  const variant = VARIANTS[index % VARIANTS.length]
  const { scene, animations } = useGLTF(`/models/characters/character-${variant}.glb`)
  const group = useRef<THREE.Group>(null)

  const character = useMemo(() => {
    const c = cloneSkinned(scene)
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true
    })
    addGear(c)
    return c
  }, [scene])

  const { actions } = useAnimations(animations, group)

  useEffect(() => {
    const swing = actions['attack-melee-right']
    if (!swing) return
    swing.reset().play()
    // Offset each worker so the crew doesn't swing in lockstep.
    swing.time = (index * 0.37) % swing.getClip().duration
    return () => {
      swing.stop()
    }
  }, [actions, index])

  return (
    <group ref={group} position={position} rotation={[0, rotationY, 0]} scale={WORKER_SCALE}>
      <primitive object={character} />
    </group>
  )
}

for (const v of VARIANTS) useGLTF.preload(`/models/characters/character-${v}.glb`)
