'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Rss, User } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function BottomNav() {
  const pathname = usePathname()
  const [signedIn, setSignedIn] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setSignedIn(!!user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (!signedIn) return null

  const tabs = [
    { href: '/', label: 'Drop' },
    { href: '/feed', label: 'Feed' },
    { href: '/profile', label: 'Profile' },
  ] as const

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-white/10 bg-background/90 backdrop-blur-md">
      <div className="max-w-3xl mx-auto grid grid-cols-3">
        {tabs.map((tab) => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors',
                active ? 'text-[color:var(--neon-violet)]' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.href === '/' ? (
                <Image
                  src="/dropx-icon.png"
                  alt=""
                  width={20}
                  height={20}
                  className={active ? 'drop-shadow-[0_0_6px_oklch(0.58_0.25_295/0.7)]' : 'opacity-70'}
                />
              ) : tab.href === '/feed' ? (
                <Rss className="w-5 h-5" />
              ) : (
                <User className="w-5 h-5" />
              )}
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
