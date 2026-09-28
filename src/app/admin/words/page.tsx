import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import PasswordGate from '../PasswordGate'
import WordList from './WordList'

export default async function WordsAdminPage() {
  const store = await cookies()
  const authed = store.get('admin_session')?.value === 'true'

  if (!authed) return <PasswordGate title="Banned words" />

  const admin = createAdminClient()
  const { data: words } = await admin.from('banned_words').select('id, word').order('word', { ascending: true })

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <WordList initialWords={words ?? []} />
    </div>
  )
}
