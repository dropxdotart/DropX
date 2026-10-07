import { createAdminClient } from '@/lib/supabase/admin'

// The game's on/off switch (game_settings key 'maintenance'). While it's
// on, players see the "Sorry, building" screen; admins still get the game.
export async function isMaintenanceOn(): Promise<boolean> {
  try {
    const { data } = await createAdminClient().from('game_settings').select('value').eq('key', 'maintenance').maybeSingle()
    return !!(data?.value as { on?: boolean } | null)?.on
  } catch {
    return false
  }
}
