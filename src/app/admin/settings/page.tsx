import { createClient } from '@/lib/supabase/server'
import { getAppConfig } from '@/lib/config'
import SettingsForm from './SettingsForm'
import AvatarPresetsCard from './AvatarPresetsCard'
import type { AvatarPreset } from '@/lib/types'

export default async function AdminSettingsPage() {
  const supabase = await createClient()
  const config = await getAppConfig(supabase)

  const { data: presets } = await supabase
    .from('avatar_presets')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-4">
      <SettingsForm initial={config} />
      <AvatarPresetsCard initial={(presets ?? []) as AvatarPreset[]} />
    </div>
  )
}
