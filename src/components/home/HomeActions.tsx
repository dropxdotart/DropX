'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Play, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { joinRoom } from '@/app/actions'
import { cn } from '@/lib/utils'

function isRedirectSignal(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'digest' in err && typeof err.digest === 'string' && err.digest.startsWith('NEXT_REDIRECT')
}

// Hosting now has its own step in between (choosing which game — see
// /host), so that button is a plain link, not an action here. Joining
// asks for the room code first, then — for a first-time visitor — the
// name, right here instead of gating the whole home page up front.
export default function HomeActions({ needsNickname }: { needsNickname: boolean }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [askingName, setAskingName] = useState(false)
  const [joining, startJoin] = useTransition()

  const join = (nickname?: string) => {
    startJoin(async () => {
      try {
        await joinRoom(code, nickname)
      } catch (err) {
        if (isRedirectSignal(err)) throw err
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  const handleSubmitCode = (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || joining) return
    if (needsNickname) {
      setAskingName(true)
      return
    }
    join()
  }

  const handleSubmitName = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || joining) return
    join(name)
  }

  if (askingName) {
    return (
      <form onSubmit={handleSubmitName} className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Joining <span className="text-foreground font-mono font-semibold">{code}</span> — what should we call you?
        </p>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={24}
          disabled={joining}
          autoFocus
          className="h-12 rounded-xl text-center text-base"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl px-4"
            disabled={joining}
            onClick={() => setAskingName(false)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button type="submit" className="flex-1 h-12 rounded-xl text-base" disabled={joining || !name.trim()}>
            {joining && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Join
          </Button>
        </div>
      </form>
    )
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

      <form className="flex gap-2" onSubmit={handleSubmitCode}>
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
