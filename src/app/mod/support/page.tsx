import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import SupportUserCard from './SupportUserCard'

export default async function ModSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'mod' && profile?.role !== 'admin') redirect('/')

  const { data: found } = q
    ? await supabase
        .from('profiles')
        .select('id, username, display_name, current_streak, longest_streak, account_status')
        .ilike('username', q)
        .maybeSingle()
    : { data: null }

  return (
    <div className="flex-1 px-4 py-6">
      <div className="max-w-sm mx-auto space-y-4">
        <div>
          <h1 className="font-heading text-lg font-bold tracking-wide">Support</h1>
          <p className="text-sm text-muted-foreground">Look up a user to fix a streak issue.</p>
        </div>

        <form className="flex gap-2" action="/mod/support">
          <Input name="q" defaultValue={q ?? ''} placeholder="Exact @username" />
          <Button type="submit" variant="outline">Search</Button>
        </form>

        {q && !found && <p className="text-sm text-muted-foreground">No user found with that username.</p>}
        {found && <SupportUserCard user={found} />}
      </div>
    </div>
  )
}
