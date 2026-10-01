'use client'

import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

// Kenney packs each use their own unit scale, so every prop is normalized
// to a target size on load instead of hand-tuning a scale per model.
export default function Prop({
  url,
  size,
  fit = 'height',
  position = [0, 0, 0],
  rotationY = 0,
}: {
  url: string
  size: number
  fit?: 'height' | 'width'
  position?: [number, number, number]
  rotationY?: number
}) {
  const { scene } = useGLTF(url)

  const object = useMemo(() => {
    const clone = scene.clone(true)
    const box = new THREE.Box3().setFromObject(clone)
    const dims = box.getSize(new THREE.Vector3())
    const scale = size / (fit === 'height' ? dims.y : Math.max(dims.x, dims.z))
    clone.scale.setScalar(scale)
    clone.position.y = -box.min.y * scale
    clone.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    return clone
  }, [scene, size, fit])

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <primitive object={object} />
    </group>
  )
}
