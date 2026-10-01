'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { getAdByPlacement, type AdCreative } from '@/app/actions'
import { DUMPSTER, TRUCK_STOP, stats, type Engine } from '@/lib/game/engine'
import Prop from './Prop'

const LOGO_URL = '/rubble-icon-512.png'

function Logo({ size, position, rotationY = 0 }: { size: number; position: [number, number, number]; rotationY?: number }) {
  const texture = useTexture(LOGO_URL)
  texture.colorSpace = THREE.SRGBColorSpace
  return (
    <mesh position={position} rotation={[0, rotationY, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial map={texture} transparent roughness={0.6} />
    </mesh>
  )
}

export function Dumpster({ engine }: { engine: Engine }) {
  const fill = useRef<THREE.Mesh>(null)
  const label = useRef<HTMLDivElement>(null)

  useFrame(() => {
    const cap = stats.truckCapacity(engine.upgrades)
    const ratio = Math.min(1, engine.dumpsterLoad / cap)
    if (fill.current) {
      fill.current.visible = ratio > 0
      fill.current.scale.y = Math.max(0.01, ratio)
      fill.current.position.y = 0.25 + (0.75 * ratio) / 2
    }
    if (label.current) {
      const full = engine.dumpsterLoad >= cap
      label.current.textContent = full ? 'FULL' : `${engine.dumpsterLoad}/${cap}`
      label.current.style.background = full ? '#e23f3f' : 'rgba(0,0,0,0.6)'
    }
  })

  return (
    <group position={[DUMPSTER.x, 0, DUMPSTER.z]}>
      <Prop url="/models/roads/dumpster.glb" size={1.7} fit="width" />
      <mesh ref={fill} position={[0, 0.5, 0]}>
        <boxGeometry args={[1.35, 0.75, 1.15]} />
        <meshStandardMaterial color="#b4553c" roughness={0.9} />
      </mesh>
      <Logo size={0.55} position={[0, 0.5, 0.72]} />
      <Html position={[0, 1.6, 0]} center zIndexRange={[5, 0]}>
        <div
          ref={label}
          className="pointer-events-none whitespace-nowrap rounded-full px-2 py-0.5 font-display text-xs text-white"
        />
      </Html>
    </group>
  )
}

const TRUCK_FAR = 34

export function Truck({ engine }: { engine: Engine }) {
  const group = useRef<THREE.Group>(null)

  useFrame(() => {
    const g = group.current
    if (!g) return
    const state = engine.truckState
    g.visible = state !== 'away'
    const p = engine.truckProgress()
    const x =
      state === 'arriving'
        ? THREE.MathUtils.lerp(-TRUCK_FAR, TRUCK_STOP.x, 1 - Math.pow(1 - p, 2))
        : state === 'leaving'
          ? THREE.MathUtils.lerp(TRUCK_FAR, TRUCK_STOP.x, p * p)
          : TRUCK_STOP.x
    g.position.set(x, 0.02, TRUCK_STOP.z)
  })

  return (
    <group ref={group} visible={false}>
      <Prop url="/models/vehicles/garbage-truck.glb" size={1.9} rotationY={Math.PI / 2} />
      {/* Logo on the side facing the camera (and the far side). */}
      <Logo size={0.8} position={[-0.3, 1.05, 0.87]} />
      <Logo size={0.8} position={[-0.3, 1.05, -0.87]} rotationY={Math.PI} />
    </group>
  )
}

// A canvas-drawn house ad for when no billboard creative is uploaded yet.
function useFallbackPoster() {
  return useMemo(() => {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 288
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#1d3a6e'
    ctx.fillRect(0, 0, 512, 288)
    ctx.fillStyle = '#ff6b1a'
    ctx.fillRect(0, 248, 512, 40)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 72px sans-serif'
    ctx.fillText('RUBBLE', 200, 140)
    ctx.font = 'bold 30px sans-serif'
    ctx.fillText('Demolition Co.', 204, 190)
    const tex = new THREE.CanvasTexture(canvas)
    const logo = new Image()
    logo.onload = () => {
      ctx.drawImage(logo, 36, 50, 150, 150)
      tex.needsUpdate = true
    }
    logo.src = LOGO_URL
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])
}

export function Billboard({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  const [ad, setAd] = useState<AdCreative | null>(null)
  const [imageTexture, setImageTexture] = useState<THREE.Texture | null>(null)
  const fallback = useFallbackPoster()

  useEffect(() => {
    getAdByPlacement('billboard').then(setAd)
  }, [])

  // Video creatives become a VideoTexture straight away; images load async.
  const video = useMemo(() => {
    if (ad?.kind !== 'video') return null
    const el = document.createElement('video')
    el.src = ad.media_url
    el.crossOrigin = 'anonymous'
    el.loop = true
    el.muted = true
    el.playsInline = true
    const tex = new THREE.VideoTexture(el)
    tex.colorSpace = THREE.SRGBColorSpace
    return { el, tex }
  }, [ad])

  useEffect(() => {
    if (!video) return
    video.el.play().catch(() => {})
    return () => {
      video.el.pause()
      video.tex.dispose()
    }
  }, [video])

  useEffect(() => {
    if (ad?.kind !== 'image') return
    let disposed = false
    new THREE.TextureLoader().setCrossOrigin('anonymous').load(ad.media_url, (tex) => {
      if (disposed) return tex.dispose()
      tex.colorSpace = THREE.SRGBColorSpace
      setImageTexture(tex)
    })
    return () => {
      disposed = true
    }
  }, [ad])

  const texture = video?.tex ?? (ad?.kind === 'image' ? imageTexture : null)
  const map = texture ?? fallback

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
      <mesh
        position={[0, 3.6, 0.01]}
        onClick={(e) => {
          if (!ad?.click_url) return
          e.stopPropagation()
          window.open(ad.click_url, '_blank', 'noopener,noreferrer')
        }}
      >
        <planeGeometry args={[4, 2.25]} />
        <meshBasicMaterial map={map ?? undefined} color={map ? '#ffffff' : '#1d3a6e'} toneMapped={false} />
      </mesh>
    </group>
  )
}

useTexture.preload(LOGO_URL)
