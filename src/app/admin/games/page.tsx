import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import PasswordGate from '../PasswordGate'
import GameList from './GameList'

export default async function GamesAdminPage() {
  const store = await cookies()
  const authed = store.get('admin_session')?.value === 'true'

  if (!authed) return <PasswordGate title="Games" />

  const admin = createAdminClient()
  const { data: games } = await admin
    .from('games')
    .select('id, key, label, description, icon, available, is_paid, price_cents')
    .order('sort_order', { ascending: true })

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <GameList initialGames={games ?? []} />
    </div>
  )
}
