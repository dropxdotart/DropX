'use client'

import { Suspense, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { Engine } from '@/lib/game/engine'
import { FleetTruck } from '@/components/game3d/Stations'
import { Cab } from '@/components/game3d/ToolTrucks'
import { Bus, DeliveryVan, RubblePickup } from '@/components/game3d/Vehicles'

// A stand-in engine: four trucks, one per tier, the last one tipping.
const fake = {
  trucks: [0, 1, 2, 3].map((i) => ({ x: -6 + i * 4, z: 0, heading: Math.PI / 5, state: i === 3 ? 'unloading' : i === 0 ? 'driving' : 'parked', cargo: 60, load: 4, speed: 0, timer: 1, yard: 0, broken: 0 })),
  yardU: () => ({ yardSpeed: 0, yardIndex: 0 }),
} as unknown as Engine

function Tool() {
  const spin = useRef(1)
  return (
    <group position={[2, 0, -7]} rotation={[0, Math.PI / 5, 0]}>
      <Cab color="#f2c230" spin={spin} />
    </group>
  )
}

export default function TrucksPreview() {
  return (
    <div className="fixed inset-0 bg-[#9fd4ef]">
      <Canvas shadows camera={{ position: [10, 9, 12], fov: 35 }}>
        <hemisphereLight args={['#ffffff', '#8a7a60', 1.5]} />
        <directionalLight position={[8, 14, 6]} intensity={1.6} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[60, 60]} />
          <meshStandardMaterial color="#646b76" />
        </mesh>
        <Suspense fallback={null}>
          {[0, 1, 2, 3].map((i) => (
            <FleetTruck key={i} engine={fake} id={i} tier={i} onSelect={() => {}} />
          ))}
          <Tool />
          <group position={[-6, 0, 5]} rotation={[0, Math.PI / 5, 0]}>
            <Bus />
          </group>
          <group position={[-1, 0, 5]} rotation={[0, Math.PI / 5, 0]}>
            <DeliveryVan seed={1} />
          </group>
          <group position={[3, 0, 5]} rotation={[0, Math.PI / 5, 0]}>
            <RubblePickup />
          </group>
        </Suspense>
        <OrbitControls target={[0, 1, -1]} />
      </Canvas>
    </div>
  )
}
