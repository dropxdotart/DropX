'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { buildReport } from '@/app/admin/ads/report'
import type { Report } from '@/app/admin/ads/shared'

// The public, read-only campaign report behind a share link. The token is
// the only key: it opens exactly one campaign's numbers and nothing else.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SharedCampaign = {
  name: string
  advertiser: string
  placements: string[]
  starts_at: string | null
  ends_at: string | null
  creatives: { id: string; name: string; kind: 'image' | 'video'; media_url: string }[]
}

export async function getSharedCampaign(token: string): Promise<(SharedCampaign & { id: string }) | null> {
  if (!UUID.test(token)) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('ad_campaigns')
    .select('id, name, advertiser, placements, starts_at, ends_at')
    .eq('report_token', token)
    .maybeSingle()
  if (!data) return null
  const { data: creatives } = await admin.from('ad_creatives').select('id, name, kind, media_url').eq('campaign_id', data.id).order('created_at')
  return { ...data, creatives: creatives ?? [] }
}

export async function getSharedReport(token: string, from: string, to: string, tz: string): Promise<Report | null> {
  const c = await getSharedCampaign(token)
  if (!c) return null
  return buildReport(from, to, tz, c.id)
}
