'use client'

import type { ReactNode } from 'react'

// Rubble's own icons, drawn to match the HUD (chunky shapes, navy outline,
// bright flat colours) instead of system emoji. <Emo e="🧱" /> draws the
// icon for an emoji; <IconText text="+🧱500" /> swaps every known emoji in
// a string. Anything without a drawing falls back to the emoji itself.

const N = '#1d3a6e' // outline
const S = { stroke: N, strokeWidth: 1.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

const ICONS: Record<string, ReactNode> = {
  // Brick
  '🧱': (
    <>
      <path d="M3 9 L13 6 L21 9 L11 12 Z" fill="#e0805f" {...S} />
      <path d="M3 9 L11 12 L11 18 L3 15 Z" fill="#c4553a" {...S} />
      <path d="M11 12 L21 9 L21 15 L11 18 Z" fill="#9e3f2a" {...S} />
      <path d="M6 13.2 L8.5 14.1" stroke="#7a2e1e" strokeWidth={1.2} strokeLinecap="round" />
    </>
  ),
  // Gem
  '💎': (
    <>
      <path d="M4 9 L8 4 L16 4 L20 9 L12 20 Z" fill="#4fc3f7" {...S} />
      <path d="M4 9 H20 M8 4 L10 9 L12 20 M16 4 L14 9 L12 20" fill="none" stroke={N} strokeWidth={1.1} strokeLinejoin="round" />
      <path d="M8.5 5.5 L7 8" stroke="#ffffff" strokeWidth={1.4} strokeLinecap="round" />
    </>
  ),
  // Play (watch an ad)
  '▶': <path d="M7 4.5 L19 12 L7 19.5 Z" fill="#ffffff" {...S} />,
  // Lightning
  '⚡': <path d="M13.5 2.5 L5 13.5 H11 L9.5 21.5 L19 9.5 H13 Z" fill="#ffd23c" {...S} />,
  // Worker: head in a hard hat
  '👷': (
    <>
      <rect x="6.5" y="9" width="11" height="10" rx="2" fill="#f0cfae" {...S} />
      <path d="M5 10 Q5 3.5 12 3.5 Q19 3.5 19 10 Z" fill="#f2c230" {...S} />
      <rect x="4" y="9.3" width="16" height="2.2" rx="1" fill="#f2c230" {...S} />
      <circle cx="10" cy="14.5" r="0.9" fill={N} />
      <circle cx="14" cy="14.5" r="0.9" fill={N} />
    </>
  ),
  // Crane with a wrecking ball
  '🏗': (
    <>
      <path d="M6 21 V5 H20" fill="none" stroke="#f2c230" strokeWidth={3} strokeLinejoin="round" />
      <path d="M6 21 V5 H20" fill="none" stroke={N} strokeWidth={1} strokeLinejoin="round" />
      <path d="M17 5 V12" stroke={N} strokeWidth={1.2} />
      <circle cx="17" cy="15" r="3" fill="#3a3f47" {...S} />
      <rect x="3" y="19.5" width="7" height="2.5" rx="1" fill="#5b6470" {...S} />
    </>
  ),
  // Dynamite
  '🧨': (
    <>
      <rect x="5" y="9" width="4" height="12" rx="1.2" fill="#d64545" {...S} />
      <rect x="10" y="8" width="4" height="13" rx="1.2" fill="#e65a5a" {...S} />
      <rect x="15" y="9" width="4" height="12" rx="1.2" fill="#d64545" {...S} />
      <path d="M12 8 Q12 4 16 3" fill="none" stroke={N} strokeWidth={1.3} />
      <path d="M16.5 1.5 L17.5 3 L19 2.5 L18 4 L19.5 5 L17.5 5 L17 6.5 L16.3 4.8" fill="#ffb02e" stroke="#e8701f" strokeWidth={0.6} />
    </>
  ),
  // Chest (wooden by default — see <Chest> for iron and gold)
  '🧰': (
    <>
      <path d="M3 10 Q3 5 12 5 Q21 5 21 10 Z" fill="#b07a45" {...S} />
      <rect x="3" y="10" width="18" height="10" rx="1.5" fill="#a0703f" {...S} />
      <path d="M3 13 H21" stroke={N} strokeWidth={1.1} />
      <rect x="10" y="11.5" width="4" height="4" rx="0.8" fill="#f2c230" {...S} />
    </>
  ),
  '🎁': (
    <>
      <rect x="4" y="10" width="16" height="10" rx="1.5" fill="#ff6b1a" {...S} />
      <rect x="3" y="7" width="18" height="4" rx="1" fill="#ff8a3d" {...S} />
      <path d="M12 7 V20" stroke="#ffd23c" strokeWidth={2.4} />
      <path d="M12 7 Q8 2 6.5 5 Q6 7 12 7 Q18 7 17.5 5 Q16 2 12 7" fill="#ffd23c" {...S} />
    </>
  ),
  // Team: a tie
  '👔': (
    <>
      <path d="M8 3 L12 6 L16 3 L17 6 L12 8 L7 6 Z" fill="#ffffff" {...S} />
      <path d="M10.5 7.5 L13.5 7.5 L14.5 17 L12 21 L9.5 17 Z" fill="#f2c230" {...S} />
      <path d="M11 10 L14 12 M10 13 L14.2 15.5" stroke="#c98a10" strokeWidth={1} />
    </>
  ),
  // Goals: a target
  '🎯': (
    <>
      <circle cx="11" cy="13" r="8" fill="#ffffff" {...S} />
      <circle cx="11" cy="13" r="5.2" fill="#e23f3f" {...S} />
      <circle cx="11" cy="13" r="2.3" fill="#ffffff" {...S} />
      <path d="M11 13 L20 4" stroke={N} strokeWidth={1.6} strokeLinecap="round" />
      <path d="M17.5 3 L20.5 3.5 L21 6.5" fill="none" stroke={N} strokeWidth={1.4} strokeLinejoin="round" />
    </>
  ),
  // The Boss: his face with kippah and payos
  '😎': (
    <>
      <rect x="5.5" y="6" width="13" height="14" rx="3" fill="#f0cfae" {...S} />
      <path d="M5.5 9.5 Q5.5 6 9 6 H15 Q18.5 6 18.5 9.5 Z" fill="#3b2a1e" />
      <path d="M8.5 5.5 Q12 2 15.5 5.5 Z" fill="#e9e4d6" {...S} />
      <path d="M5.8 11 Q4.6 13.5 6 16 Q4.8 17.5 6.2 19" fill="none" stroke="#3b2a1e" strokeWidth={1.5} strokeLinecap="round" />
      <path d="M18.2 11 Q19.4 13.5 18 16 Q19.2 17.5 17.8 19" fill="none" stroke="#3b2a1e" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx="10" cy="12.5" r="1" fill={N} />
      <circle cx="14" cy="12.5" r="1" fill={N} />
      <path d="M10 16 Q12 17.5 14 16" fill="none" stroke="#9a4a3a" strokeWidth={1.2} strokeLinecap="round" />
    </>
  ),
  '🔒': (
    <>
      <path d="M8 11 V8 Q8 4 12 4 Q16 4 16 8 V11" fill="none" stroke={N} strokeWidth={2} />
      <rect x="5.5" y="10.5" width="13" height="10" rx="2" fill="#f2c230" {...S} />
      <rect x="11" y="14" width="2" height="3.5" rx="1" fill={N} />
    </>
  ),
  '🗑': (
    <>
      <path d="M5 8 H19 L17.5 20 H6.5 Z" fill="#3fa064" {...S} />
      <rect x="4" y="5.5" width="16" height="3" rx="1" fill="#2a8a33" {...S} />
      <path d="M9.5 11 V17 M14.5 11 V17" stroke={N} strokeWidth={1.2} />
    </>
  ),
  '🚛': (
    <>
      <rect x="2.5" y="7" width="12" height="9" rx="1" fill="#ff6b1a" {...S} />
      <path d="M14.5 10 H18.5 L21 13 V16 H14.5 Z" fill="#2d7ff9" {...S} />
      <circle cx="7" cy="17.5" r="2" fill="#2b2b2e" {...S} />
      <circle cx="17.5" cy="17.5" r="2" fill="#2b2b2e" {...S} />
    </>
  ),
  '🔧': <path d="M14.5 3.5 A5 5 0 0 0 10 10 L3.5 16.5 Q3 19 5.5 20.5 L12 14 A5 5 0 0 0 20.5 9.5 L17.5 10.5 L15 9 L13.5 6.5 Z" fill="#9aa5b1" {...S} />,
  '🔨': (
    <>
      <path d="M11.5 10 L5 19.5" stroke="#8a5a30" strokeWidth={3} strokeLinecap="round" />
      <path d="M11.5 10 L5 19.5" stroke={N} strokeWidth={0.8} strokeLinecap="round" />
      <path d="M8 6 L13 3 L19 8 L15.5 11 Z" fill="#9aa5b1" {...S} />
    </>
  ),
  '🚧': (
    <>
      <rect x="3" y="7" width="18" height="6" rx="1" fill="#f2c230" {...S} />
      <path d="M6 7 L10 13 M11 7 L15 13 M16 7 L20 13" stroke={N} strokeWidth={1.6} />
      <path d="M6 13 V20 M18 13 V20" stroke={N} strokeWidth={1.8} />
    </>
  ),
  '🌉': (
    <>
      <path d="M2 13 H22" stroke={N} strokeWidth={2} />
      <path d="M2 13 Q12 3 22 13" fill="none" stroke="#e23f3f" strokeWidth={2} />
      <path d="M7 13 V8.5 M12 13 V6 M17 13 V8.5" stroke={N} strokeWidth={1.2} />
      <path d="M2 18 Q6 16 10 18 T18 18 T22 18" fill="none" stroke="#2d7ff9" strokeWidth={1.6} />
    </>
  ),
  '🚦': (
    <>
      <rect x="8" y="2.5" width="8" height="17" rx="2" fill="#2b2b2e" {...S} />
      <circle cx="12" cy="6.5" r="1.8" fill="#e23f3f" />
      <circle cx="12" cy="11" r="1.8" fill="#f2c230" />
      <circle cx="12" cy="15.5" r="1.8" fill="#3fdc4f" />
      <path d="M12 19.5 V22" stroke={N} strokeWidth={1.8} />
    </>
  ),
  '☕': (
    <>
      <path d="M5 9 H16 V15 Q16 19.5 10.5 19.5 Q5 19.5 5 15 Z" fill="#ffffff" {...S} />
      <path d="M16 10.5 Q20 10.5 19.5 13.5 Q19 16 16 15.5" fill="none" stroke={N} strokeWidth={1.6} />
      <path d="M8.5 6 Q7.5 4.5 8.5 3 M12 6 Q11 4.5 12 3" fill="none" stroke="#9aa5b1" strokeWidth={1.3} strokeLinecap="round" />
    </>
  ),
  '📣': (
    <>
      <path d="M4 10 H8 L17 5 V19 L8 14 H4 Z" fill="#ff6b1a" {...S} />
      <path d="M7 14 L8.5 19.5 H11 L10 14" fill="#ff8a3d" {...S} />
      <path d="M19.5 9.5 Q21 12 19.5 14.5" fill="none" stroke={N} strokeWidth={1.5} strokeLinecap="round" />
    </>
  ),
  '📜': (
    <>
      <path d="M6 4 H17 Q19 4 19 6 V18 Q19 20 17 20 H8 Q6 20 6 18 Z" fill="#efe3c2" {...S} />
      <path d="M9 8.5 H16 M9 11.5 H16 M9 14.5 H13.5" stroke="#8a5a30" strokeWidth={1.2} strokeLinecap="round" />
      <circle cx="16" cy="16.5" r="1.8" fill="#e23f3f" {...S} />
    </>
  ),
  '⏳': (
    <>
      <path d="M6 3 H18 M6 21 H18" stroke={N} strokeWidth={2} strokeLinecap="round" />
      <path d="M7 3 Q7 9 12 12 Q17 9 17 3 Z M7 21 Q7 15 12 12 Q17 15 17 21 Z" fill="#cfe6f5" {...S} />
      <path d="M9.5 19.5 Q12 16 14.5 19.5 Z" fill="#f2c230" />
    </>
  ),
  '🏭': (
    <>
      <path d="M3 20 V11 L8 14 V11 L13 14 V11 L18 14 V20 Z" fill="#9aa5b1" {...S} />
      <rect x="16" y="4" width="3" height="10" fill="#c4553a" {...S} />
      <rect x="6" y="16" width="3" height="2.5" fill="#ffd23c" />
      <rect x="11" y="16" width="3" height="2.5" fill="#ffd23c" />
    </>
  ),
  '🏡': (
    <>
      <path d="M4 11 L12 4 L20 11" fill="#b4482f" {...S} />
      <rect x="6" y="11" width="12" height="9" fill="#efe3c2" {...S} />
      <rect x="10.5" y="14" width="3" height="6" fill="#6b4423" {...S} />
    </>
  ),
  '🏙': (
    <>
      <rect x="3" y="9" width="6" height="12" fill="#8ec9e8" {...S} />
      <rect x="9" y="4" width="7" height="17" fill="#4f7fa3" {...S} />
      <rect x="16" y="11" width="5" height="10" fill="#9aa5b1" {...S} />
    </>
  ),
  '✓': <path d="M5 12.5 L10 17.5 L19.5 6.5" fill="none" stroke="#3fbf4a" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />,
  '✅': <path d="M5 12.5 L10 17.5 L19.5 6.5" fill="none" stroke="#3fbf4a" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />,
  '➕': <path d="M12 5 V19 M5 12 H19" stroke={N} strokeWidth={3} strokeLinecap="round" />,
  '⚙': (
    <>
      <path d="M12 2.5 L14 5 L17 4 L17.5 7 L20.5 8 L19.5 11 L21.5 13 L19 15 L19.5 18 L16.5 18.5 L15 21 L12 19.5 L9 21 L7.5 18.5 L4.5 18 L5 15 L2.5 13 L4.5 11 L3.5 8 L6.5 7 L7 4 L10 5 Z" fill="#9aa5b1" {...S} />
      <circle cx="12" cy="12" r="3" fill="#ffffff" {...S} />
    </>
  ),
  '🤖': (
    <>
      <path d="M12 2.5 L14 5 L17 4 L17.5 7 L20.5 8 L19.5 11 L21.5 13 L19 15 L19.5 18 L16.5 18.5 L15 21 L12 19.5 L9 21 L7.5 18.5 L4.5 18 L5 15 L2.5 13 L4.5 11 L3.5 8 L6.5 7 L7 4 L10 5 Z" fill="#9aa5b1" {...S} />
      <circle cx="12" cy="12" r="3" fill="#ffffff" {...S} />
    </>
  ),
  '💰': (
    <>
      <path d="M9 4 H15 L13.5 7 Q20 10 19 16 Q18 20.5 12 20.5 Q6 20.5 5 16 Q4 10 10.5 7 Z" fill="#f2c230" {...S} />
      <path d="M12 10 V17 M14 11.5 Q12 10.5 10.5 11.5 Q9.5 13 12 13.5 Q14.5 14 13.5 15.8 Q12 16.8 10 15.8" fill="none" stroke={N} strokeWidth={1.2} strokeLinecap="round" />
    </>
  ),
  '💨': <path d="M3 9 H14 Q17 9 17 6.5 Q17 4 14.5 4.5 M3 13 H19 Q21.5 13 21.5 15.5 Q21.5 18 19 17.5 M3 17 H11" fill="none" stroke="#2d7ff9" strokeWidth={2} strokeLinecap="round" />,
  '⭐': <path d="M12 3 L14.6 9 L21 9.4 L16 13.5 L17.6 20 L12 16.5 L6.4 20 L8 13.5 L3 9.4 L9.4 9 Z" fill="#ffd23c" {...S} />,
  '🎉': (
    <>
      <path d="M4 20 L8 8 L16 16 Z" fill="#ff6b1a" {...S} />
      <circle cx="16" cy="5" r="1.4" fill="#2d7ff9" />
      <circle cx="20" cy="10" r="1.4" fill="#3fbf4a" />
      <path d="M12 5 L13 3 M18 13 L20.5 13.5" stroke="#e23f3f" strokeWidth={1.6} strokeLinecap="round" />
    </>
  ),
  '🌧': (
    <>
      <path d="M6 13 Q3 13 3.5 10 Q4 7.5 7 8 Q8 4 12.5 4.5 Q16.5 5 17 8.5 Q21 8.5 20.5 11.5 Q20 13 18 13 Z" fill="#cfe6f5" {...S} />
      <path d="M8 16 L7 19 M12 16 L11 19 M16 16 L15 19" stroke="#2d7ff9" strokeWidth={1.8} strokeLinecap="round" />
    </>
  ),
}
ICONS['☁️'] = (
  <>
    <path d="M6.5 18 Q2.5 18 3 14 Q3.5 11 7 11.5 Q8 6.5 13 7 Q17.5 7.5 18 11.5 Q21.5 11.5 21.2 15 Q21 18 18 18 Z" fill="#ffffff" {...S} />
    <path d="M12 16.5 V11.5 M9.8 13.6 L12 11.4 L14.2 13.6" fill="none" stroke="#2d7ff9" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
  </>
)
ICONS['🚜'] = (
  <>
    <rect x="3" y="11" width="11" height="6" rx="1" fill="#f2c230" {...S} />
    <path d="M6 11 V5 H12 V11" fill="none" stroke={N} strokeWidth={1.6} strokeLinejoin="round" />
    <path d="M15 4 V18 M15 17 H21" stroke="#5b6470" strokeWidth={2} strokeLinecap="round" />
    <rect x="16.5" y="12" width="4.5" height="3" fill="#c4553a" {...S} />
    <circle cx="6" cy="18.5" r="2" fill="#2b2b2e" {...S} />
    <circle cx="12" cy="18.5" r="2" fill="#2b2b2e" {...S} />
  </>
)
// Variants that share a drawing.
ICONS['🏗️'] = ICONS['🏗']
ICONS['🗑️'] = ICONS['🗑']
ICONS['⚙️'] = ICONS['⚙']
ICONS['🏠'] = ICONS['🏡']
ICONS['🛖'] = ICONS['🏡']
ICONS['🏢'] = ICONS['🏙']
ICONS['🏙️'] = ICONS['🏙']
ICONS['🏬'] = ICONS['🏙']
ICONS['🌧️'] = ICONS['🌧']
ICONS['🗝️'] = ICONS['🔒']
ICONS['🗝'] = ICONS['🔒']

export function hasIcon(e: string) {
  return e in ICONS
}

export function Emo({ e, size = '1.15em', className }: { e: string; size?: number | string; className?: string }) {
  const art = ICONS[e]
  if (!art) return <span className={className}>{e}</span>
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`inline-block shrink-0 align-[-0.2em] ${className ?? ''}`} aria-hidden>
      {art}
    </svg>
  )
}

// A chest drawn in its type's colours.
export function Chest({ type, size = 40 }: { type: 'wood' | 'iron' | 'gold'; size?: number }) {
  const [lid, body, latch] = type === 'gold' ? ['#ffd23c', '#f2c230', '#c98a10'] : type === 'iron' ? ['#aab4bf', '#8f9aa6', '#f2c230'] : ['#b07a45', '#a0703f', '#f2c230']
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path d="M3 10 Q3 5 12 5 Q21 5 21 10 Z" fill={lid} {...S} />
      <rect x="3" y="10" width="18" height="10" rx="1.5" fill={body} {...S} />
      <path d="M3 13 H21" stroke={N} strokeWidth={1.1} />
      <rect x="10" y="11.5" width="4" height="4" rx="0.8" fill={latch} {...S} />
      {type !== 'wood' && <path d="M6 5.8 V20 M18 5.8 V20" stroke={N} strokeWidth={0.9} opacity={0.6} />}
    </svg>
  )
}

const EMOJI = /(\p{Extended_Pictographic}️?|▶)/gu

// A string with its emoji drawn as icons (non-strings pass through).
export function IconText({ text }: { text: ReactNode }) {
  if (typeof text !== 'string') return <>{text}</>
  const parts = text.split(EMOJI)
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null
        const base = p.replace(/️/g, '')
        return hasIcon(p) || hasIcon(base) ? <Emo key={i} e={hasIcon(p) ? p : base} /> : <span key={i}>{p}</span>
      })}
    </>
  )
}
