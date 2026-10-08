'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import Person from '@/components/game3d/Person'
import { MANAGERS, OUTFITS, outfitLook } from '@/lib/game/managers'

export default function PeoplePreview() {
  return (
    <div className="fixed inset-0 bg-[#9fd4ef]">
      <Canvas shadows camera={{ position: [0, 1.6, 6], fov: 35 }}>
        <hemisphereLight args={['#ffffff', '#8a7a60', 1.5]} />
        <directionalLight position={[3, 6, 5]} intensity={1.6} castShadow />
        {OUTFITS.map((o, i) => (
          <group key={o.id} position={[(i - 2) * 0.9, 0.6, 1]}>
            <Person look={outfitLook(o.id)} seed={i} />
          </group>
        ))}
        {MANAGERS.filter((m) => m.id !== 'boss').map((m, i) => (
          <group key={m.id} position={[(i - 7) * 0.55, -0.6, -1]}>
            <Person look={m.look} scale={0.8} walking={i % 3 === 0} seed={i} />
          </group>
        ))}
        <OrbitControls target={[0, 0.8, 0]} />
      </Canvas>
    </div>
  )
}
