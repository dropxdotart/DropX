'use client'

import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { getAdsByPlacement, type AdCreative } from '@/app/actions'
import { trackAd } from '@/lib/adTracking'

// Ads painted into the world — billboards, truck sides, yard fence banners.
// The billboard creatives are fetched once and every sign shares their
// textures (one video element per video ad, however many signs show it).
// A sign picks its creative by `seed`, so neighbours tend to differ.

let creatives: Promise<AdCreative[]> | null = null
const textures = new Map<string, THREE.Texture>()
const pending = new Map<string, Promise<THREE.Texture>>()
const viewed = new Set<string>()
let fallback: THREE.Texture | null = null

function loadCreatives() {
  creatives ??= getAdsByPlacement('billboard').catch(() => [])
  return creatives
}

function textureFor(ad: AdCreative): Promise<THREE.Texture> {
  const have = textures.get(ad.id)
  if (have) return Promise.resolve(have)
  let p = pending.get(ad.id)
  if (p) return p
  p = new Promise<THREE.Texture>((resolve, reject) => {
    if (ad.kind === 'video') {
      const el = document.createElement('video')
      el.src = ad.media_url
      el.crossOrigin = 'anonymous'
      el.loop = true
      el.muted = true
      el.playsInline = true
      // Only use it once it has a frame to show (a format the browser can't
      // play — e.g. .mov outside Safari — keeps the house poster instead).
      const fail = setTimeout(() => reject(new Error('video never loaded')), 10_000)
      // Wait for real playback (time moving, a picture size) — some
      // browsers "load" a video they can't actually decode.
      const ready = () => {
        if (el.currentTime <= 0 || !el.videoWidth) return
        // Make sure a frame can really be read into the 3D view (a video
        // from another site without the right headers draws blank).
        try {
          const c = document.createElement('canvas')
          c.width = c.height = 4
          const g = c.getContext('2d')!
          g.drawImage(el, 0, 0, 4, 4)
          const px = g.getImageData(0, 0, 4, 4).data
          if (!px.some((v, i) => i % 4 === 3 && v > 0)) return // nothing drawn yet
        } catch {
          el.removeEventListener('timeupdate', ready)
          clearTimeout(fail)
          reject(new Error('video can’t be drawn'))
          return
        }
        el.removeEventListener('timeupdate', ready)
        clearTimeout(fail)
        const tex = new THREE.VideoTexture(el)
        tex.colorSpace = THREE.SRGBColorSpace
        resolve(tex)
      }
      el.addEventListener('timeupdate', ready)
      el.addEventListener('error', () => reject(new Error('video failed')), { once: true })
      el.play().catch(() => {})
      return
    }
    new THREE.TextureLoader().setCrossOrigin('anonymous').load(
      ad.media_url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        resolve(tex)
      },
      undefined,
      reject
    )
  }).then((tex) => {
    textures.set(ad.id, tex)
    return tex
  })
  pending.set(ad.id, p)
  return p
}

// A canvas-drawn house ad for when no billboard creative is uploaded yet.
function fallbackPoster() {
  if (fallback || typeof document === 'undefined') return fallback
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
  logo.src = '/rubble-icon-512.png'
  tex.colorSpace = THREE.SRGBColorSpace
  fallback = tex
  return tex
}

export function useWorldAd(seed: number): { ad: AdCreative | null; map: THREE.Texture | null } {
  const [state, setState] = useState<{ ad: AdCreative | null; map: THREE.Texture | null }>({ ad: null, map: null })
  useEffect(() => {
    let live = true
    loadCreatives().then((list) => {
      if (!live) return
      const ad = list.length ? list[Math.abs(Math.floor(seed)) % list.length] : null
      if (!ad) return setState({ ad: null, map: fallbackPoster() })
      if (!viewed.has(ad.id)) {
        viewed.add(ad.id)
        trackAd(ad.id, 'view')
      }
      // The house poster until the ad itself is ready.
      setState({ ad: null, map: fallbackPoster() })
      textureFor(ad)
        .then((map) => live && setState({ ad, map }))
        .catch(() => live && setState({ ad: null, map: fallbackPoster() }))
    })
    return () => {
      live = false
    }
  }, [seed])
  return state
}

function openAd(ad: AdCreative | null) {
  if (!ad?.click_url) return false
  trackAd(ad.id, 'click')
  window.open(ad.click_url, '_blank', 'noopener,noreferrer')
  return true
}

// Just the ad face: a flat panel (16:9 by default), tappable.
export function AdFace({
  seed,
  width,
  height = (width * 9) / 16,
  position,
  rotation,
}: {
  seed: number
  width: number
  height?: number
  position?: [number, number, number]
  rotation?: [number, number, number]
}) {
  const { ad, map } = useWorldAd(seed)
  return (
    <mesh
      position={position}
      rotation={rotation}
      onClick={(e) => {
        if (openAd(ad)) e.stopPropagation()
      }}
    >
      <planeGeometry args={[width, height]} />
      {/* Keyed by the picture: a material first drawn without one needs rebuilding to show it. */}
      <meshBasicMaterial key={map?.uuid ?? 'none'} map={map ?? undefined} color={map ? '#ffffff' : '#1d3a6e'} toneMapped={false} />
    </mesh>
  )
}

// A rooftop billboard: steel legs, a frame and the ad, for flat roofs.
export function RoofBillboard({
  seed,
  position,
  rotationY = 0,
  width = 6,
}: {
  seed: number
  position: [number, number, number]
  rotationY?: number
  width?: number
}) {
  const h = (width * 9) / 16
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {[-width * 0.36, width * 0.36].map((x) => (
        <mesh key={x} position={[x, 0.75, -0.25]}>
          <boxGeometry args={[0.18, 1.5, 0.18]} />
          <meshStandardMaterial color="#4a525c" />
        </mesh>
      ))}
      <mesh position={[0, 1.5 + h / 2, -0.08]}>
        <boxGeometry args={[width + 0.3, h + 0.3, 0.14]} />
        <meshStandardMaterial color="#2c333b" />
      </mesh>
      <AdFace seed={seed} width={width} height={h} position={[0, 1.5 + h / 2, 0.005]} />
    </group>
  )
}

// A fence banner: the ad hung on a fence, with a white hem.
export function FenceBanner({
  seed,
  position,
  rotationY = 0,
  width = 5,
}: {
  seed: number
  position: [number, number, number]
  rotationY?: number
  width?: number
}) {
  const h = (width * 9) / 16
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0, -0.03]}>
        <boxGeometry args={[width + 0.16, h + 0.16, 0.04]} />
        <meshStandardMaterial color="#f2f2ee" />
      </mesh>
      <AdFace seed={seed} width={width} height={h} position={[0, 0, 0]} />
    </group>
  )
}
