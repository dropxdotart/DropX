import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Puzzle, Sparkles } from 'lucide-react'

export default async function PlayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
      <div className="relative mb-5">
        <div className="rounded-full bg-white/5 p-5 glow-violet">
          <Puzzle className="w-10 h-10 text-[color:var(--neon-violet)]" />
        </div>
        <Sparkles className="absolute -top-1.5 -right-1.5 w-4 h-4 text-[color:var(--neon-orange)]" fill="currentColor" />
      </div>
      <h1 className="font-heading text-xl font-bold tracking-wide">Coming soon</h1>
      <p className="text-muted-foreground text-sm max-w-xs mt-2">
        More trivia and challenges beyond the daily drop — each one earning you points.
      </p>
    </div>
  )
}
