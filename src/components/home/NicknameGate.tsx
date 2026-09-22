'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

// The entire "auth" experience: no email, no password — just a name.
// Everyone gets a real (anonymous) Supabase session under the hood, so all
// the existing RLS (host-only round control, per-player votes, etc.) works
// unchanged; the only thing a person actually does is pick what to be
// called. Rendered by the home page itself in place of the host/join
// buttons whenever there's no signed-in session yet.
export default function NicknameGate() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || loading) return
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInAnonymously()
      if (error) throw error
      if (!data.user) throw new Error('Could not start a session')

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ username: trimmed, display_name: trimmed })
        .eq('id', data.user.id)
      if (profileError) throw profileError

      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="What should we call you?"
        maxLength={24}
        disabled={loading}
        autoFocus
        className="h-12 rounded-xl text-center text-base"
      />
      <Button type="submit" className="w-full h-12 rounded-xl text-base" disabled={loading || !name.trim()}>
        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Continue
      </Button>
    </form>
  )
}
