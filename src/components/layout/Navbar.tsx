'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { User as SupabaseUser } from '@supabase/supabase-js'

export default function Navbar({ initialUser }: { initialUser: SupabaseUser | null }) {
  const [user, setUser] = useState<SupabaseUser | null>(initialUser)
  const supabase = createClient()

  // Seeded from the server via props so there's no signed-out flash on
  // load — this listener is just a safety net for auth changes that
  // happen without a full navigation.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/auth'
  }

  return (
    <nav className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Placeholder wordmark until the real logo is ready — plain
              lowercase monospace, matching the Quiet Tech direction. */}
          <Link href="/" className="font-mono text-lg font-semibold tracking-tight text-foreground">
            flex
          </Link>

          {user ? (
            <button onClick={handleSignOut} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sign out
            </button>
          ) : (
            <Link href="/auth" className={cn(buttonVariants({ size: 'sm' }), 'glow-violet')}>Sign in</Link>
          )}
        </div>
      </div>
    </nav>
  )
}
