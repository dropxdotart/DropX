import { createAdminClient } from '@/lib/supabase/admin'

// The admin audit log (migration 013): what was changed, on what, and when.
// Called by admin server actions after a change succeeds. Logging never
// blocks the change itself.

export async function audit(action: string, target: string | null = null, details: Record<string, unknown> | null = null) {
  try {
    await createAdminClient().from('admin_audit').insert({ action, target, details })
  } catch {
    // the change already happened — a missing log line isn't worth failing it
  }
}

// "UKFSNW (Yoohee)" for a player id.
export async function playerTag(id: string): Promise<string> {
  const { data } = await createAdminClient().from('players').select('short_id, username').eq('id', id).maybeSingle()
  if (!data) return id
  return data.username ? `${data.short_id} (${data.username})` : data.short_id
}

// A row's display name, for targets like buildings and codes.
export async function nameOf(table: string, id: string | number, column: string): Promise<string> {
  const { data } = await createAdminClient().from(table).select(column).eq('id', id).maybeSingle()
  const v = (data as Record<string, unknown> | null)?.[column]
  return typeof v === 'string' ? v : String(id)
}
