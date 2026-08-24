import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ModQueue from '@/components/mod/ModQueue'
import type { ModQueueItem } from '@/lib/types'

export default async function ModPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'mod' && profile.role !== 'admin')) {
    redirect('/')
  }

  const { data: items } = await supabase
    .from('responses')
    .select('id, photo_url, answered_at, profiles(username, display_name), challenges(prompt)')
    .eq('moderation_status', 'pending')
    .order('answered_at', { ascending: true })

  return (
    <div className="flex-1 px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="font-heading text-xl font-bold tracking-wide">Photo review</h1>
          <p className="text-sm text-muted-foreground">Oldest first — these auto-hide if nobody reviews them in time.</p>
        </div>
        <ModQueue initialItems={(items ?? []) as unknown as ModQueueItem[]} />
      </div>
    </div>
  )
}
