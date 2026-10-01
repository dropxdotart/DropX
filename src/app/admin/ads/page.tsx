import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminSession } from '../auth'
import PasswordGate from '../PasswordGate'
import AdManager from './AdManager'
import type { Media } from './actions'

export default async function AdsAdminPage() {
  if (!(await isAdminSession())) return <PasswordGate title="Ads admin" />

  const { data } = await createAdminClient()
    .from('ad_media')
    .select('id, kind, media_url, click_url, active, starts_at, ends_at, created_at, ads(id, media_id, placement, active, starts_at, ends_at)')
    .order('created_at', { ascending: false })

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <AdManager initialMedia={(data ?? []) as Media[]} />
    </div>
  )
}
