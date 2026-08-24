import { createClient } from '@/lib/supabase/server'
import { getAppConfig } from '@/lib/config'
import SettingsForm from './SettingsForm'

export default async function AdminSettingsPage() {
  const supabase = await createClient()
  const config = await getAppConfig(supabase)

  return <SettingsForm initial={config} />
}
