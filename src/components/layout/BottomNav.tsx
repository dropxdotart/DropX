'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LayoutGrid, Puzzle, Trophy, CircleUserRound } from 'lucide-react'
import { cn } from '@/lib/utils'

const SIDE_TABS = [
  { href: '/feed', label: 'Feed', icon: LayoutGrid },
  { href: '/play', label: 'Play', icon: Puzzle },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/profile', label: 'Profile', icon: CircleUserRound },
] as const

export default function BottomNav({ initialSignedIn }: { initialSignedIn: boolean }) {
  const pathname = usePathname()
  const [signedIn, setSignedIn] = useState(initialSignedIn)
  const supabase = createClient()

  // Seeded from the server via props — see Navbar for why. The listener
  // stays as a safety net for auth changes without a full navigation.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (!signedIn) return null

  const dropActive = pathname === '/'
  const leftTabs = SIDE_TABS.slice(0, 2)
  const rightTabs = SIDE_TABS.slice(2)

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-white/10 bg-background/90 backdrop-blur-md">
      <div className="max-w-3xl mx-auto grid grid-cols-5 items-end">
        {leftTabs.map((tab) => {
          const active = pathname === tab.href
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors',
                active ? 'text-[color:var(--neon-violet)]' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-5 h-5" />
              {tab.label}
            </Link>
          )
        })}

        <Link href="/" className="flex flex-col items-center -mt-6">
          <div
            className={cn(
              'rounded-full p-4 gradient-hero glow-violet-lg ring-4 ring-background transition-transform',
              dropActive ? 'scale-105' : 'scale-100'
            )}
          >
            <Image src="/dropx-icon.png" alt="Drop" width={30} height={30} />
          </div>
          <span className={cn('text-[11px] font-semibold pt-1.5', dropActive ? 'text-[color:var(--neon-violet)]' : 'text-white/70')}>
            Drop
          </span>
        </Link>

        {rightTabs.map((tab) => {
          const active = pathname === tab.href
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors',
                active ? 'text-[color:var(--neon-violet)]' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-5 h-5" />
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
