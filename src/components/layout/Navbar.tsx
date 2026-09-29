'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { leaveAllRooms } from '@/app/actions'
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

  // "Signing out" here just means forgetting this guest identity — there's
  // no account to log back into, so this drops the anonymous session and
  // sends them back to the nickname prompt. Also leaves any room they were
  // in first (and deletes it if that was the last player) — otherwise
  // they'd linger as a phantom player nobody can remove, since forgetting
  // their identity means they can never come back to leave properly.
  const handleForget = async () => {
    await leaveAllRooms()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <nav className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/flex-symbol.png" alt="" width={26} height={26} priority />
            <span className="font-heading text-base font-bold tracking-tight text-foreground">flex</span>
          </Link>

          {user && (
            <button onClick={handleForget} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Not you?
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
