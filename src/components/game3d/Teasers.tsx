'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BLOCK, cellOpen, getGrown, islandAt, ISLANDS } from '@/lib/game/islands'

// Hints at the big update: now and then a tug pushes a barge with a lit
// sign along the water just past the island, and a small plane tows a banner
// across the sky (the water can be out of view at normal zoom; the sky never
// is). Both travel across the screen, so their signs always face the camera.

const MESSAGES = [
  'SOMETHING BIG IS COMING',
  'BIGGER MACHINES ON THE WAY',
  'NEW CREWS ARRIVING SOON',
  'YOUR NAME ON THE TRUCKS?',
  'CAUTION: BIG CHANGES AHEAD',
  'PSST... KEEP WATCHING THE WATER',
]

const SIGN_W = 24
const SIGN_H = 3.2
const SPEED = 4.5
const TRIP = 60 // how far it sails each way from the middle of the view
const CLEARANCE = 28 // past the corner of the island's last block, clear of the beach
const FIRST_WAIT = 40
const WAIT_MIN = 45
const WAIT_MAX = 90
const HALF_BLOCK = BLOCK / 2
const RIGHT = new THREE.Vector2(1, -1).normalize() // screen-right on the ground
const UP = new THREE.Vector2(-1, -1).normalize() // screen-up on the ground

// Land (with its beach) under this point?
function nearLand(x: number, z: number) {
  const g = getGrown()
  const reach = HALF_BLOCK + 9
  return ISLANDS.some((s) => s.cells.some((c) => cellOpen(s, c, g) && Math.abs(c.i * BLOCK - x) < reach && Math.abs(c.j * BLOCK - z) < reach))
}

// One texture per message, drawn the first time one is needed (the font
// loads late), shared by the boat and the plane.
let signs: THREE.Texture[] = []
function sign(n: number) {
  if (!signs.length) signs = MESSAGES.map(signTexture)
  return signs[n % signs.length]
}

function signTexture(text: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = Math.round((1024 * SIGN_H) / SIGN_W)
  const ctx = canvas.getContext('2d')!
  const family = getComputedStyle(document.body).getPropertyValue('--font-lilita').trim() || 'sans-serif'
  ctx.fillStyle = '#1d3a6e'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#ff6b1a'
  ctx.fillRect(0, canvas.height - 10, canvas.width, 10)
  ctx.fillRect(0, 0, canvas.width, 10)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  // The biggest size that fits the board.
  let px = 92
  do {
    ctx.font = `${px}px ${family}, sans-serif`
    px -= 2
  } while (ctx.measureText(text).width > canvas.width - 48 && px > 20)
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 3)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function Box({ s, p, c }: { s: [number, number, number]; p: [number, number, number]; c: string }) {
  return (
    <mesh position={p} castShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={0.7} />
    </mesh>
  )
}

export function TeaserBoat({ center }: { center: React.RefObject<THREE.Vector3> }) {
  const group = useRef<THREE.Group>(null)
  const tug = useRef<THREE.Group>(null)
  const signMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), [])
  const trip = useRef({ at: FIRST_WAIT, x: 0, z: 0, dir: 1, next: 3, on: false })

  useFrame(({ clock }, dt) => {
    const g = group.current
    if (!g) return
    const t = trip.current
    t.at -= Math.min(dt, 0.1)
    if (!t.on) {
      g.visible = false
      if (t.at > 0) return
      signMat.map = sign(t.next)
      signMat.needsUpdate = true
      t.next++
      // A line just past the island's top-of-screen shore, under the view.
      const c = center.current
      const here = islandAt(c.x, c.z) ?? ISLANDS[0]
      const grown = getGrown()
      const cells = here.cells.filter((cell) => cellOpen(here, cell, grown))
      const shore = Math.max(...cells.map((cell) => (cell.i * BLOCK - HALF_BLOCK) * UP.x + (cell.j * BLOCK - HALF_BLOCK) * UP.y))
      const along = c.x * RIGHT.x + c.z * RIGHT.y
      const up = shore + CLEARANCE
      t.x = along * RIGHT.x + up * UP.x
      t.z = along * RIGHT.y + up * UP.y
      t.dir = t.next % 2 ? 1 : -1
      t.at = (TRIP * 2) / SPEED
      t.on = true
      if (tug.current) {
        tug.current.position.x = t.dir * (SIGN_W / 2 + 3.2)
        tug.current.rotation.y = t.dir > 0 ? 0 : Math.PI
      }
    }
    const left = t.at * SPEED - TRIP // +TRIP at the start, -TRIP at the end
    if (left < -TRIP) {
      t.on = false
      t.at = WAIT_MIN + Math.random() * (WAIT_MAX - WAIT_MIN)
      return
    }
    const off = -left * t.dir
    const x = t.x + RIGHT.x * off
    const z = t.z + RIGHT.y * off
    const time = clock.getElapsedTime()
    g.position.set(x, Math.sin(time * 1.1) * 0.07, z)
    g.rotation.z = Math.sin(time * 0.8) * 0.008
    g.visible = !nearLand(x, z)
  })

  return (
    <group ref={group} visible={false}>
      {/* Local +x is screen-right, so the sign reads left to right */}
      <group rotation={[0, Math.PI / 4, 0]}>
        {/* The barge */}
        <Box s={[SIGN_W + 2, 0.7, 4]} p={[0, 0.15, 0]} c="#3a3f47" />
        <Box s={[SIGN_W + 2.2, 0.14, 4.2]} p={[0, 0.5, 0]} c="#f2c230" />
        <Box s={[SIGN_W + 1.6, 0.1, 3.5]} p={[0, 0.58, 0]} c="#59616d" />
        {/* The sign on its posts */}
        {[-0.42, 0, 0.42].map((k) => (
          <Box key={k} s={[0.22, 2, 0.22]} p={[k * SIGN_W, 1.5, -0.3]} c="#2b2b2e" />
        ))}
        <mesh position={[0, 3.6, -0.15]} material={signMat}>
          <planeGeometry args={[SIGN_W, SIGN_H]} />
        </mesh>
        <Box s={[SIGN_W + 0.3, SIGN_H + 0.3, 0.2]} p={[0, 3.6, -0.3]} c="#2b2b2e" />
        {/* The tug (its nose toward +x) */}
        <group ref={tug}>
          <Box s={[4.4, 0.9, 2.6]} p={[0, 0.25, 0]} c="#ff6b1a" />
          <Box s={[4.5, 0.16, 2.7]} p={[0, 0.74, 0]} c="#ffffff" />
          <Box s={[2, 1.2, 1.9]} p={[-0.3, 1.4, 0]} c="#f4f1ea" />
          <Box s={[1.1, 0.5, 1.95]} p={[0.15, 1.65, 0]} c="#4f7fa3" />
          <Box s={[2.3, 0.14, 2.2]} p={[-0.3, 2.07, 0]} c="#1d3a6e" />
          <Box s={[0.4, 0.9, 0.4]} p={[-0.9, 2.5, 0]} c="#2b2b2e" />
        </group>
      </group>
    </group>
  )
}

// ── The banner plane ───────────────────────────────────────────────────

const BANNER_W = 17
const BANNER_H = 2.3
const PLANE_HEIGHT = 20 // up in the sky, which puts it in the upper part of the view
const PLANE_SPEED = 4.5
const PLANE_TRIP = 40
const PLANE_FIRST_WAIT = 15
const PLANE_WAIT_MIN = 60
const PLANE_WAIT_MAX = 120

export function TeaserPlane({ center }: { center: React.RefObject<THREE.Vector3> }) {
  const group = useRef<THREE.Group>(null)
  const plane = useRef<THREE.Group>(null)
  const banner = useRef<THREE.Group>(null)
  const prop = useRef<THREE.Mesh>(null)
  const signMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, side: THREE.DoubleSide }), [])
  const trip = useRef({ at: PLANE_FIRST_WAIT, along: 0, up: 0, dir: 1, next: 0, on: false })

  useFrame(({ clock }, dt) => {
    const g = group.current
    if (!g) return
    const t = trip.current
    t.at -= Math.min(dt, 0.1)
    if (!t.on) {
      g.visible = false
      if (t.at > 0) return
      signMat.map = sign(t.next)
      signMat.needsUpdate = true
      t.next++
      t.along = center.current.x * RIGHT.x + center.current.z * RIGHT.y
      t.up = center.current.x * UP.x + center.current.z * UP.y
      t.dir = t.next % 2 ? 1 : -1
      t.at = (PLANE_TRIP * 2) / PLANE_SPEED
      t.on = true
      // The plane leads, with the banner trailing behind on its tow line.
      if (plane.current) {
        plane.current.position.x = (t.dir * (BANNER_W + 6)) / 2
        plane.current.rotation.y = t.dir > 0 ? 0 : Math.PI
      }
    }
    const left = t.at * PLANE_SPEED - PLANE_TRIP
    if (left < -PLANE_TRIP) {
      t.on = false
      t.at = PLANE_WAIT_MIN + Math.random() * (PLANE_WAIT_MAX - PLANE_WAIT_MIN)
      return
    }
    const a = t.along - left * t.dir
    const time = clock.getElapsedTime()
    g.position.set(a * RIGHT.x + t.up * UP.x, PLANE_HEIGHT + Math.sin(time * 0.7) * 0.25, a * RIGHT.y + t.up * UP.y)
    g.visible = true
    if (prop.current) prop.current.rotation.x = time * 30
    if (banner.current) banner.current.rotation.x = Math.sin(time * 2.2) * 0.05
  })

  return (
    <group ref={group} visible={false}>
      <group rotation={[0, Math.PI / 4, 0]}>
        <group ref={banner}>
          <mesh material={signMat}>
            <planeGeometry args={[BANNER_W, BANNER_H]} />
          </mesh>
        </group>
        {/* The plane (nose toward +x); the tow line reaches back to the banner */}
        <group ref={plane}>
          <Box s={[3, 0.04, 0.04]} p={[-1.5, 0, 0]} c="#2b2b2e" />
          <Box s={[3, 0.75, 0.75]} p={[1.5, 0.1, 0]} c="#ff6b1a" />
          <Box s={[0.9, 0.5, 0.78]} p={[1.9, 0.42, 0]} c="#4f7fa3" />
          <Box s={[0.8, 0.1, 5]} p={[1.9, 0.75, 0]} c="#ffffff" />
          <Box s={[0.8, 0.1, 5]} p={[1.9, -0.25, 0]} c="#ffffff" />
          {[-1.8, 1.8].map((z) => (
            <Box key={z} s={[0.08, 1, 0.08]} p={[1.9, 0.25, z]} c="#2b2b2e" />
          ))}
          <Box s={[0.7, 0.8, 0.1]} p={[0.25, 0.75, 0]} c="#1d3a6e" />
          <Box s={[0.6, 0.1, 1.8]} p={[0.25, 0.3, 0]} c="#ffffff" />
          <mesh ref={prop} position={[3.08, 0.1, 0]}>
            <boxGeometry args={[0.06, 1.5, 0.14]} />
            <meshStandardMaterial color="#2b2b2e" />
          </mesh>
        </group>
      </group>
    </group>
  )
}
