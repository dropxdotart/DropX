'use client'

import { useEffect, useRef, useState } from 'react'
import { Lock } from 'lucide-react'

// A taped-off button on the side rail: a hint that something new is coming.
// Tapping it only gets a teasing line.
const LINES = ['Not yet…', 'Something big is coming', 'No peeking!', 'The crew won’t say a word', 'Still under wraps', 'Soon…']

export default function TeaserButton() {
  const [line, setLine] = useState<string | null>(null)
  const next = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const tap = () => {
    setLine(LINES[next.current++ % LINES.length])
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setLine(null), 2200)
  }
  return (
    <div className="relative">
      {line && (
        <span
          role="status"
          className="absolute right-[calc(100%+8px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-xl bg-white px-3 py-1.5 font-display text-sm text-[#1d3a6e] shadow-[0_3px_0_rgba(0,0,0,0.2)]"
        >
          {line}
        </span>
      )}
      <button
        onClick={tap}
        aria-label="Something new is coming"
        className="pointer-events-auto relative flex h-12 w-12 flex-col items-center justify-center overflow-hidden rounded-2xl border-[3px] border-white bg-[#4a5568] shadow-[0_3px_0_#2b3340] active:translate-y-0.5"
      >
        <Lock className="h-[18px] w-[18px] text-white/90" />
        <span className="font-display text-[9px] leading-none text-white">???</span>
        <span className="hazard-tape pointer-events-none absolute -left-2 -right-2 top-1/2 h-[7px] -translate-y-1/2 -rotate-[28deg] opacity-90" aria-hidden />
      </button>
    </div>
  )
}
