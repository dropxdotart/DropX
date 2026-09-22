'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Play } from 'lucide-react'
import { toast } from 'sonner'
import { joinRoom } from '@/app/actions'
import { cn } from '@/lib/utils'

function isRedirectSignal(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'digest' in err && typeof err.digest === 'string' && err.digest.startsWith('NEXT_REDIRECT')
}

// Hosting now has its own step in between (choosing which game — see
// /host), so that button is a plain link, not an action here. Joining
// stays a one-step inline form since there's nothing to choose.
export default function HomeActions() {
  const [code, setCode] = useState('')
  const [joining, startJoin] = useTransition()

  const handleJoin = () => {
    if (!code.trim()) return
    startJoin(async () => {
      try {
        await joinRoom(code)
      } catch (err) {
        if (isRedirectSignal(err)) throw err
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <div className="space-y-4">
      <Link href="/host" className={cn(buttonVariants(), 'w-full h-12 rounded-xl text-base')}>
        <Play className="w-4 h-4 mr-2" />
        Host a game
      </Link>

      <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono uppercase tracking-wide">
        <div className="h-px flex-1 bg-border" />
        or join one
        <div className="h-px flex-1 bg-border" />
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); handleJoin() }}
      >
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CODE"
          maxLength={4}
          disabled={joining}
          className="h-12 rounded-xl text-center text-lg tracking-[0.3em] font-mono font-semibold uppercase"
        />
        <Button type="submit" variant="outline" className="h-12 rounded-xl px-6" disabled={joining || !code.trim()}>
          {joining && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
          Join
        </Button>
      </form>
    </div>
  )
}
