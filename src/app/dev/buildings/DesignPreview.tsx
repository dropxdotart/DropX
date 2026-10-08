'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { BUILDINGS, bricksFor } from '@/lib/game/buildings'
import { BRICK_COLORS } from '@/lib/game/blueprints'

function Bricks({ id, cutY, cutZ }: { id: string; cutY: number; cutZ: number }) {
  const all = useMemo(() => bricksFor(BUILDINGS.find((b) => b.id === id)!), [id])
  const shown = useMemo(() => all.filter((b) => b.y <= cutY && b.z <= cutZ), [all, cutY, cutZ])
  const mesh = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const o = new THREE.Object3D()
    const c = new THREE.Color()
    shown.forEach((b, i) => {
      o.position.set(b.x, b.y + 0.5, b.z)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      m.setColorAt(i, c.set(BRICK_COLORS[b.color]))
    })
    m.count = shown.length
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [shown])
  return (
    <instancedMesh key={all.length} ref={mesh} args={[undefined, undefined, all.length]} castShadow receiveShadow>
      <boxGeometry args={[0.94, 0.94, 0.94]} />
      <meshStandardMaterial />
    </instancedMesh>
  )
}

export default function DesignPreview() {
  const [id, setId] = useState(BUILDINGS[0].id)
  const [cutY, setCutY] = useState(200)
  const [cutZ, setCutZ] = useState(200)
  const def = BUILDINGS.find((b) => b.id === id)!
  const count = bricksFor(def).length
  return (
    <div className="fixed inset-0 flex flex-col bg-[#9fd4ef]">
      <div className="flex flex-wrap items-center gap-2 bg-white p-2 text-sm">
        {BUILDINGS.map((b) => (
          <button key={b.id} onClick={() => setId(b.id)} className={`rounded px-2 py-1 ${b.id === id ? 'bg-[#1d3a6e] text-white' : 'bg-[#eef2f8]'}`}>
            {b.name}
          </button>
        ))}
        <span className="font-mono">{count} bricks</span>
        <label>
          top <input type="range" min={0} max={80} value={Math.min(cutY, 80)} onChange={(e) => setCutY(Number(e.target.value))} />
        </label>
        <label>
          front <input type="range" min={-20} max={20} value={Math.max(-20, Math.min(cutZ, 20))} onChange={(e) => setCutZ(Number(e.target.value))} />
        </label>
      </div>
      <Canvas shadows camera={{ position: [40, 38, 40], fov: 35 }}>
        <hemisphereLight args={['#ffffff', '#8a7a60', 1.4]} />
        <directionalLight position={[30, 50, 20]} intensity={1.6} castShadow />
        <Bricks id={id} cutY={cutY} cutZ={cutZ} />
        <OrbitControls target={[0, 6, 0]} />
      </Canvas>
    </div>
  )
}
