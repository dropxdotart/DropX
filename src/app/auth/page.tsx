'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Puzzle, Brain, Lightbulb, HelpCircle, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        })
        if (error) throw error
        toast.success('Account created! Check your email to verify.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/')
        router.refresh()
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 overflow-hidden">
      {/* Decorative trivia/puzzle motifs — placeholder until real artwork is ready. */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <Puzzle className="absolute -left-4 top-[12%] w-24 h-24 text-[color:var(--neon-violet)]/20 -rotate-12" />
        <Brain className="absolute right-[6%] top-[8%] w-28 h-28 text-[color:var(--neon-cyan)]/20 rotate-6" />
        <HelpCircle className="absolute left-[10%] bottom-[14%] w-20 h-20 text-[color:var(--neon-pink)]/20 -rotate-6" />
        <Lightbulb className="absolute right-[10%] bottom-[10%] w-24 h-24 text-[color:var(--neon-orange)]/20 rotate-12" />
        <Sparkles className="absolute left-[45%] top-[4%] w-14 h-14 text-[color:var(--neon-violet)]/20" />
      </div>

      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <div className="rounded-full bg-white/5 p-3 glow-violet">
              <Image src="/dropx-icon.png" alt="DropX" width={40} height={40} priority />
            </div>
          </div>
          <h1 className="font-heading text-2xl font-bold tracking-wide">
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {mode === 'login'
              ? "Sign in to keep your streak alive"
              : 'Join DropX — a new challenge every day'}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-card/60 backdrop-blur-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'signup' && (
              <Input
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                className="h-11 rounded-xl border-white/10 bg-white/5 focus-visible:ring-[color:var(--neon-violet)]/50"
              />
            )}
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 rounded-xl border-white/10 bg-white/5 focus-visible:ring-[color:var(--neon-violet)]/50"
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="h-11 rounded-xl border-white/10 bg-white/5 focus-visible:ring-[color:var(--neon-violet)]/50"
            />
            <Button type="submit" className="w-full h-11 rounded-xl glow-violet" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="text-[color:var(--neon-cyan)] hover:underline font-medium"
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
