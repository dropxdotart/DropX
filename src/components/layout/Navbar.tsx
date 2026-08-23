'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Flame, LogOut, User, Zap } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import type { Profile } from '@/lib/types'

export default function Navbar() {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) {
        supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
          .then(({ data }) => setProfile(data))
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <nav className="border-b border-white/10 bg-background/70 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 font-heading font-bold text-xl tracking-wide">
            <Zap className="w-6 h-6 text-[color:var(--neon-violet)] drop-shadow-[0_0_8px_oklch(0.62_0.24_300/0.8)]" fill="currentColor" />
            <span className="gradient-text">DropX</span>
          </Link>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                {profile && (
                  <div className="flex items-center gap-1 text-sm font-medium bg-white/5 border border-white/10 rounded-full px-2.5 py-1">
                    <Flame className="w-3.5 h-3.5 text-[color:var(--neon-orange)]" fill="currentColor" />
                    {profile.current_streak}
                  </div>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary">
                    <div className="gradient-ring rounded-full p-[2px] cursor-pointer">
                      <Avatar className="w-8 h-8 ring-1 ring-background">
                        <AvatarFallback className="bg-secondary">
                          {profile?.username?.[0]?.toUpperCase() ?? 'U'}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => window.location.href = '/profile'}>
                      <User className="w-4 h-4 mr-2" />
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Link href="/auth" className={cn(buttonVariants({ size: 'sm' }), 'glow-violet')}>Sign in</Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
