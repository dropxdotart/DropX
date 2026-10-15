'use client'

import { useRef } from 'react'
import { useRouter } from 'next/navigation'

const TAPS = 5
const WINDOW_MS = 2500

// The build tag. Also the hidden way into the admin panel from the game:
// tap it 5 times quickly (the admin pages still ask for the password).
export default function VersionTag({ label }: { label: string }) {
  const router = useRouter()
  const taps = useRef<number[]>([])
  const tap = () => {
    const now = Date.now()
    taps.current = [...taps.current.filter((t) => now - t < WINDOW_MS), now]
    if (taps.current.length >= TAPS) {
      taps.current = []
      router.push('/admin')
    }
  }
  return (
    <span
      onClick={tap}
      className="fixed bottom-2 right-2 z-40 rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground select-none"
    >
      {label}
    </span>
  )
}
