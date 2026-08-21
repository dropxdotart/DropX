import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Service-role client for server-only jobs (the daily drop cron) that need to
// read/write the unscheduled challenge pool, which RLS hides from anon/authenticated.
// Never import this from client components or anything that ships to the browser.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
