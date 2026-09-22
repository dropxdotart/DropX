import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import PasswordGate from './PasswordGate'
import AdManager from './AdManager'

export default async function AdsAdminPage() {
  const store = await cookies()
  const authed = store.get('ads_admin_session')?.value === 'true'

  if (!authed) return <PasswordGate />

  const admin = createAdminClient()
  const { data: ads } = await admin.from('ads').select('*').order('created_at', { ascending: false })

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <AdManager initialAds={ads ?? []} />
    </div>
  )
}
