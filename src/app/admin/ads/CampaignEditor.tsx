'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ISLANDS } from '@/lib/game/islands'
import { saveCampaign } from './actions'
import { DAYS, PLACEMENTS, TIME_ZONES, type Audience, type CampaignInput } from './shared'

const CTA_SUGGESTIONS = ['Learn more', 'Play now', 'Shop now', 'Sign up', 'Download', 'Visit site', 'Get offer']

function hourLabel(h: number) {
  if (h === 0 || h === 24) return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

// ISO ⇄ the browser's datetime-local value (in the admin's own zone).
function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null)

function Section({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {help && <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        on ? 'border-[#2d7ff9] bg-[#2d7ff9] text-white' : 'border-border text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

// A whole number, or empty for "no limit".
function NumberBox({ value, onChange, placeholder = 'No limit', min = 1 }: { value: number | null; onChange: (n: number | null) => void; placeholder?: string; min?: number }) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={min}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? null : Math.max(min, Math.round(Number(e.target.value))))}
      className="tabular-nums"
    />
  )
}

const selectClass = 'h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm'

// Create or edit a campaign, section by section, like an ad network's
// campaign settings.
export default function CampaignEditor({ id, initial, onSaved }: { id: string | null; initial: CampaignInput; onSaved?: () => void }) {
  const router = useRouter()
  const [c, setC] = useState<CampaignInput>(initial)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof CampaignInput>(k: K, v: CampaignInput[K]) => setC((prev) => ({ ...prev, [k]: v }))
  const allDay = c.hour_from === null && c.hour_to === null
  const everyDay = !c.days?.length

  const save = async () => {
    setSaving(true)
    const r = await saveCampaign(id, c)
    setSaving(false)
    if (!r.ok) return toast.error(r.message)
    toast.success(id ? 'Saved' : 'Campaign created — now add its ads')
    if (id) {
      onSaved?.()
      router.refresh()
    } else router.push(`/admin/ads/${r.id}?tab=ads`)
  }

  const toggleIn = <T,>(list: T[] | null, v: T) => {
    const cur = list ?? []
    return cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
  }

  return (
    <div className="space-y-3 pb-24">
      <Section title="Campaign">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Campaign name" hint="Only you see this">
            <Input value={c.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Pizza Palace — October" maxLength={80} />
          </Field>
          <Field label="Advertiser" hint="Shown on the ad">
            <Input value={c.advertiser} onChange={(e) => set('advertiser', e.target.value)} placeholder="e.g. Pizza Palace" maxLength={60} />
          </Field>
        </div>
      </Section>

      <Section title="Text and button" help="Shown under full-screen ads and on the card at the end of a video.">
        <Field label="Headline">
          <Input value={c.headline} onChange={(e) => set('headline', e.target.value)} placeholder="e.g. Two large pizzas for $20" maxLength={90} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Button text">
            <Input value={c.cta_text} onChange={(e) => set('cta_text', e.target.value)} maxLength={24} />
          </Field>
          <Field label="Button link" hint="Leave empty for no button">
            <Input value={c.cta_url ?? ''} onChange={(e) => set('cta_url', e.target.value || null)} placeholder="https://" inputMode="url" />
          </Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CTA_SUGGESTIONS.map((s) => (
            <Chip key={s} on={c.cta_text === s} onClick={() => set('cta_text', s)}>
              {s}
            </Chip>
          ))}
        </div>
        {/* What players will see */}
        <div className="rounded-xl bg-[#11161d] p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">Preview</p>
          <div className="flex items-center gap-3 rounded-2xl bg-white p-2.5 pr-3 text-[#16202e]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#2d7ff9] font-semibold text-white">
              {(c.advertiser || c.name || 'A').trim().charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{c.headline || c.advertiser || 'Your headline'}</span>
              <span className="block truncate text-xs text-[#5f6b7a]">{c.headline ? c.advertiser || 'Sponsored' : 'Sponsored'}</span>
            </span>
            {c.cta_url && <span className="shrink-0 rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-semibold text-white">{c.cta_text || 'Learn more'}</span>}
          </div>
        </div>
      </Section>

      <Section title="Placements" help="Where in the game this campaign's ads can show.">
        <div className="grid gap-2 sm:grid-cols-2">
          {PLACEMENTS.map((p) => {
            const on = c.placements.includes(p.value)
            return (
              <button
                key={p.value}
                type="button"
                aria-pressed={on}
                onClick={() => set('placements', toggleIn(c.placements, p.value))}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                  on ? 'border-[#2d7ff9] bg-[#2d7ff9]/8' : 'border-border hover:border-foreground/30'
                }`}
              >
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${on ? 'border-[#2d7ff9] bg-[#2d7ff9] text-white' : 'border-border'}`}>
                  {on && '✓'}
                </span>
                <span>
                  <span className="block text-sm font-medium">{p.label}</span>
                  <span className="block text-xs text-muted-foreground">{p.hint}</span>
                  <span className="block text-[11px] text-muted-foreground">Best size {p.size}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Schedule" help="Dates are in your time; days and hours use the campaign's time zone.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Start" hint="Empty: starts now">
            <Input type="datetime-local" value={toLocalInput(c.starts_at)} onChange={(e) => set('starts_at', fromLocalInput(e.target.value))} />
          </Field>
          <Field label="End" hint="Empty: runs until you stop it">
            <Input type="datetime-local" value={toLocalInput(c.ends_at)} onChange={(e) => set('ends_at', fromLocalInput(e.target.value))} />
          </Field>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Days</p>
          <div className="flex flex-wrap gap-1.5">
            <Chip on={everyDay} onClick={() => set('days', null)}>
              Every day
            </Chip>
            {DAYS.map((d, i) => (
              <Chip key={d} on={!everyDay && !!c.days?.includes(i)} onClick={() => set('days', toggleIn(c.days, i).sort())}>
                {d}
              </Chip>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Hours</p>
          <div className="flex flex-wrap items-center gap-2">
            <Chip on={allDay} onClick={() => setC((p) => ({ ...p, hour_from: null, hour_to: null }))}>
              All day
            </Chip>
            <Chip on={!allDay} onClick={() => allDay && setC((p) => ({ ...p, hour_from: 9, hour_to: 21 }))}>
              Set hours
            </Chip>
            {!allDay && (
              <span className="flex items-center gap-2 text-sm">
                <select className={`${selectClass} w-24`} value={c.hour_from ?? 0} onChange={(e) => set('hour_from', Number(e.target.value))} aria-label="From">
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
                to
                <select className={`${selectClass} w-24`} value={c.hour_to ?? 24} onChange={(e) => set('hour_to', Number(e.target.value))} aria-label="To">
                  {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </span>
            )}
          </div>
        </div>
        <Field label="Time zone">
          <select className={selectClass} value={c.tz} onChange={(e) => set('tz', e.target.value)}>
            {[...new Set([c.tz, ...TIME_ZONES])].map((z) => (
              <option key={z} value={z}>
                {z.replace('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Limits" help="Views, counted across all of the campaign's placements. Leave empty for no limit.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Per player, per day">
            <NumberBox value={c.freq_cap} onChange={(n) => set('freq_cap', n)} />
          </Field>
          <Field label="All players, per day">
            <NumberBox value={c.daily_cap} onChange={(n) => set('daily_cap', n)} />
          </Field>
          <Field label="Total" hint="Stops once reached">
            <NumberBox value={c.total_cap} onChange={(n) => set('total_cap', n)} />
          </Field>
        </div>
      </Section>

      <Section title="Audience" help="Who sees it. Everyone, unless you narrow it down.">
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Players</p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['all', 'Everyone'],
                ['new', 'New (first 7 days)'],
                ['returning', 'Returning'],
              ] as [Audience, string][]
            ).map(([v, label]) => (
              <Chip key={v} on={c.audience === v} onClick={() => set('audience', v)}>
                {label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Min level">
            <NumberBox value={c.min_level} onChange={(n) => set('min_level', n)} placeholder="Any" />
          </Field>
          <Field label="Max level">
            <NumberBox value={c.max_level} onChange={(n) => set('max_level', n)} placeholder="Any" />
          </Field>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Has reached</p>
          <div className="flex flex-wrap gap-1.5">
            <Chip on={!c.islands?.length} onClick={() => set('islands', null)}>
              Any island
            </Chip>
            {ISLANDS.map((s) => (
              <Chip key={s.id} on={!!c.islands?.includes(s.id)} onClick={() => set('islands', toggleIn(c.islands, s.id as string))}>
                {s.name}
              </Chip>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Priority" help="When several campaigns could show, a higher priority shows more often.">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={10}
            value={c.weight}
            onChange={(e) => set('weight', Number(e.target.value))}
            className="flex-1 accent-[#2d7ff9]"
            aria-label="Priority"
          />
          <span className="w-10 text-right text-sm font-semibold tabular-nums">{c.weight}×</span>
        </div>
      </Section>

      <Section title="Notes" help="For you — deal terms, contacts, anything.">
        <textarea
          value={c.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm"
        />
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={c.status === 'active'} onChange={(e) => set('status', e.target.checked ? 'active' : 'paused')} className="accent-[#2d7ff9]" />
            {c.status === 'active' ? 'On — serves when its schedule allows' : 'Paused'}
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => (id ? setC(initial) : router.push('/admin/ads'))} disabled={saving}>
              {id ? 'Reset' : 'Cancel'}
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {id ? 'Save changes' : 'Create campaign'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
