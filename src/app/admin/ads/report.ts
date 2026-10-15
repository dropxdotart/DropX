import { createAdminClient } from '@/lib/supabase/admin'
import { ZERO, type Report, type Totals } from './shared'

type Row = {
  day: string
  campaign_id: string
  creative_id: string | null
  placement: string
  views: number
  clicks: number
  completes: number
  skips: number
  watch_seconds: number
  bricks: number
}

function add(into: Totals, r: Row) {
  into.views += Number(r.views)
  into.clicks += Number(r.clicks)
  into.completes += Number(r.completes)
  into.skips += Number(r.skips)
  into.watchSeconds += Number(r.watch_seconds)
  into.bricks += Number(r.bricks)
}

// Every date from `from` to `to` in a time zone, so quiet days still show
// on the chart.
function datesBetween(from: string, to: string, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  const out = new Set<string>()
  for (let t = new Date(from).getTime(); t < new Date(to).getTime(); t += 6 * 3600_000) out.add(fmt.format(new Date(t)))
  return [...out]
}

// A full report for a date range — every campaign, or just one.
export async function buildReport(from: string, to: string, tz: string, campaignId: string | null): Promise<Report> {
  const admin = createAdminClient()
  const zone = Intl.supportedValuesOf('timeZone').includes(tz) ? tz : 'UTC'
  const [rows, reach] = await Promise.all([
    admin.rpc('ad_report', { p_from: from, p_to: to, p_campaign: campaignId, p_tz: zone }),
    admin.rpc('ad_reach', { p_from: from, p_to: to, p_campaign: campaignId }),
  ])
  if (rows.error) throw new Error(rows.error.message)
  if (reach.error) throw new Error(reach.error.message)
  const data = (rows.data ?? []) as Row[]

  const totals = { ...ZERO }
  const byPlacement: Record<string, Totals> = {}
  const byCreative: Record<string, Totals> = {}
  const byCampaign: Record<string, Totals> = {}
  const perDay = new Map<string, { views: number; clicks: number; completes: number }>()
  for (const r of data) {
    add(totals, r)
    add((byPlacement[r.placement] ??= { ...ZERO }), r)
    if (r.creative_id) add((byCreative[r.creative_id] ??= { ...ZERO }), r)
    add((byCampaign[r.campaign_id] ??= { ...ZERO }), r)
    const d = perDay.get(r.day) ?? { views: 0, clicks: 0, completes: 0 }
    d.views += Number(r.views)
    d.clicks += Number(r.clicks)
    d.completes += Number(r.completes)
    perDay.set(r.day, d)
  }
  for (const r of (reach.data ?? []) as { campaign_id: string | null; reach: number }[]) {
    if (r.campaign_id === null) totals.reach = Number(r.reach)
    else (byCampaign[r.campaign_id] ??= { ...ZERO }).reach = Number(r.reach)
  }

  // "All time" starts at the first day with anything in it.
  let dates = datesBetween(from, to, zone)
  const first = [...perDay.keys()].sort()[0]
  if (first && dates.length > 31) dates = dates.filter((d) => d >= first)
  if (!first && dates.length > 31) dates = dates.slice(-7)
  const days = dates.map((day) => ({ day, ...(perDay.get(day) ?? { views: 0, clicks: 0, completes: 0 }) }))

  return { from, to, totals, days, byPlacement, byCreative, byCampaign }
}
