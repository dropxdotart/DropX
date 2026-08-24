import type { SupabaseClient } from '@supabase/supabase-js'

export type AppConfig = {
  drop_window_start_hour: number
  drop_window_end_hour: number
  photo_grace_minutes: number
}

const DEFAULTS: AppConfig = {
  drop_window_start_hour: 12,
  drop_window_end_hour: 19,
  photo_grace_minutes: 10,
}

// Takes whichever client the caller already has (user-scoped in page.tsx,
// admin in the cron route) rather than creating its own — app_config is
// readable by any authenticated user via RLS, so no privilege is needed
// just to read it. Falls back to the original hardcoded values if the
// config row is somehow missing (e.g. migration hasn't run yet).
export async function getAppConfig(supabase: SupabaseClient): Promise<AppConfig> {
  const { data } = await supabase
    .from('app_config')
    .select('drop_window_start_hour, drop_window_end_hour, photo_grace_minutes')
    .single()

  return data ?? DEFAULTS
}
