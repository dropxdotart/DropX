'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createRoom, joinRoom } from '@/app/actions'

// redirect() inside a server action throws a special digest-tagged error to
// signal Next's own runtime to navigate — a plain try/catch around the call
// intercepts that error just like any other, which stops the redirect from
// ever happening. Every catch block below has to let this one specific
// shape through unhandled instead of treating it as a real failure.
function isRedirectSignal(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'digest' in err && typeof err.digest === 'string' && err.digest.startsWith('NEXT_REDIRECT')
}

export default function HomeActions() {
  const [code, setCode] = useState('')
  const [creating, startCreate] = useTransition()
  const [joining, startJoin] = useTransition()

  const handleCreate = () => {
    startCreate(async () => {
      try {
        await createRoom()
      } catch (err) {
        if (isRedirectSignal(err)) throw err
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

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
      <Button className="w-full h-12 rounded-xl text-base" disabled={creating} onClick={handleCreate}>
        {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
        Start a room
      </Button>

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
