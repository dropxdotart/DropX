'use server'

import { createClient } from '@/lib/supabase/server'

export type AdCreative = { id: string; kind: 'image' | 'video'; media_url: string; click_url: string | null }

// Players never sign in, so this reads through the plain anon client — RLS
// grants `anon` select on active ads specifically for this (see migration
// 001). Picks randomly among active ads for the given placement so a
// handful of creatives rotate instead of always showing the newest.
export async function getAdByPlacement(placement: 'rewarded' | 'interstitial' | 'banner' | 'billboard'): Promise<AdCreative | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('ads').select('id, kind, media_url, click_url').eq('active', true).eq('placement', placement)
  if (!data || data.length === 0) return null
  return data[Math.floor(Math.random() * data.length)]
}
