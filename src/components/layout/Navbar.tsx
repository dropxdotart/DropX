'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Flame } from 'lucide-react'
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

  return (
    <nav className="border-b border-white/10 bg-background/70 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center h-14">
          <div className="flex items-center">
            {user && profile && (
              <div className="flex items-center gap-1 text-sm font-medium bg-white/5 border border-white/10 rounded-full px-2.5 py-1">
                <Flame className="w-3.5 h-3.5 text-[color:var(--neon-orange)]" fill="currentColor" />
                {profile.current_streak}
              </div>
            )}
          </div>

          <Link href="/" className="flex items-center gap-1.5 justify-self-center">
            <Image src="/dropx-icon.png" alt="" width={20} height={20} className="drop-shadow-[0_0_6px_oklch(0.58_0.25_295/0.6)]" priority />
            <Image src="/dropx-text.png" alt="DropX" width={88} height={19} priority />
          </Link>

          <div className="flex items-center justify-end gap-3">
            {user ? (
              <Link href="/profile" className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary">
                <div className="gradient-ring rounded-full p-[2px] cursor-pointer">
                  <Avatar className="w-8 h-8 ring-1 ring-background">
                    {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
                    <AvatarFallback className="bg-secondary">
                      {(profile?.display_name ?? profile?.username)?.[0]?.toUpperCase() ?? 'U'}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </Link>
            ) : (
              <Link href="/auth" className={cn(buttonVariants({ size: 'sm' }), 'glow-violet')}>Sign in</Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
