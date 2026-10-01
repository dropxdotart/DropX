'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { getAdByPlacement, type AdCreative } from '@/app/actions'

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
