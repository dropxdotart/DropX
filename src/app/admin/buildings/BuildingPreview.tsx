'use client'

import { useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { BRICK_COLORS } from '@/lib/game/blueprints'
import { bricksFromCells, type ShapeSize } from '@/lib/game/shapes'

const geometry = new THREE.BoxGeometry(0.94, 0.94, 0.94)
const material = new THREE.MeshStandardMaterial({ roughness: 0.85 })
const tmp = new THREE.Object3D()
const tmpColor = new THREE.Color()

function Bricks({ size, cells }: { size: ShapeSize; cells: Uint8Array }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const bricks = useMemo(() => bricksFromCells(size, cells), [size, cells])
  // Room for growth so editing doesn't re-create the mesh every stroke.
  const capacity = Math.max(256, Math.ceil(bricks.length / 512) * 512)

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    bricks.forEach((b, i) => {
      tmp.position.set(b.x, b.y + 0.5, b.z)
      tmp.updateMatrix()
      m.setMatrixAt(i, tmp.matrix)
      m.setColorAt(i, tmpColor.set(BRICK_COLORS[b.color]))
    })
    m.count = bricks.length
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [bricks])

  return <instancedMesh key={capacity} ref={mesh} args={[geometry, material, capacity]} castShadow receiveShadow frustumCulled={false} />
}

// A spinnable 3D view of a shape. In the brick editor, `layer` shows which
// layer is being painted as a translucent sheet.
export default function BuildingPreview({ size, cells, layer }: { size: ShapeSize; cells: Uint8Array; layer?: number | null }) {
  const [W, H, D] = size
  const reach = Math.max(W, D, H * 0.8)
  return (
    <div className="h-72 w-full overflow-hidden rounded-2xl bg-[#9fd4ef]" style={{ touchAction: 'none' }}>
      <Canvas shadows camera={{ position: [reach * 1.9, reach * 1.5, reach * 1.9], fov: 40 }}>
        <hemisphereLight args={['#e8f4ff', '#6f8f4a', 0.9]} />
        <directionalLight position={[reach, reach * 2, reach * 0.6]} intensity={2} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[W + 8, D + 8]} />
          <meshStandardMaterial color="#c8ab7e" />
        </mesh>
        <Bricks size={size} cells={cells} />
        {layer !== null && layer !== undefined && (
          <mesh position={[0, layer + 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[W + 1, D + 1]} />
            <meshBasicMaterial color="#2d7ff9" transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        )}
        <OrbitControls target={[0, H * 0.4, 0]} enablePan={false} minDistance={reach * 0.6} maxDistance={reach * 4} />
      </Canvas>
    </div>
  )
}
