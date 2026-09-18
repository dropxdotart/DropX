import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isHandler } from '@/lib/handlers'
import { Hammer } from 'lucide-react'
import AdminFontScope from '../admin/AdminFontScope'

// Posting-as-bot (HandlerPanel) is on hold until the hot-take/caption/dare
// drop model has a consumer submission flow to post through — bot account
// creation itself still works (see ./actions.ts's createBot), just has no
// UI here yet.
export default async function HandlersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: profile } = await supabase.from('profiles').select('role, badges').eq('id', user.id).single()
  if (!isHandler(profile)) redirect('/')

  return (
    <div className="font-scope flex-1 px-4 py-8">
      <AdminFontScope className="font-scope" />
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="font-heading text-xl font-bold tracking-wide">Handlers</h1>
          <p className="text-sm text-muted-foreground">Create bot accounts and post as them — for real, attributed to the bot.</p>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card py-20 text-center">
          <div className="rounded-full bg-muted p-3">
            <Hammer className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Work happening</p>
            <p className="text-sm text-muted-foreground max-w-xs mt-1">
              Posting as a bot is being rebuilt for the new hot-take/caption/dare drops — not live yet.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
