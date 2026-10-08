'use client'

import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { AdFace } from './WorldAds'

export const LOGO_URL = '/rubble-icon-512.png'

export function Logo({ size, position, rotationY = 0 }: { size: number; position: [number, number, number]; rotationY?: number }) {
  const texture = useTexture(LOGO_URL)
  texture.colorSpace = THREE.SRGBColorSpace
  return (
    <mesh position={position} rotation={[0, rotationY, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial map={texture} transparent roughness={0.6} />
    </mesh>
  )
}

// A roadside billboard on two posts (the ad itself comes from WorldAds).
export function Billboard({ position, rotationY, seed = 0 }: { position: [number, number, number]; rotationY: number; seed?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {[-1.4, 1.4].map((x) => (
        <mesh key={x} position={[x, 1.4, -0.1]} castShadow>
          <boxGeometry args={[0.18, 2.8, 0.18]} />
          <meshStandardMaterial color="#5b6470" />
        </mesh>
      ))}
      <mesh position={[0, 3.6, -0.06]} castShadow>
        <boxGeometry args={[4.3, 2.5, 0.12]} />
        <meshStandardMaterial color="#e9e6dd" />
      </mesh>
      <AdFace seed={seed} width={4} position={[0, 3.6, 0.01]} />
    </group>
  )
}

useTexture.preload(LOGO_URL)
