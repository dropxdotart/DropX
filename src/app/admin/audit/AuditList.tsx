'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { listAudit, type AuditRow } from '../statsActions'

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function detailText(d: Record<string, unknown> | null) {
  if (!d) return null
  const parts = Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
  return parts.length ? parts.join(' · ') : null
}

// Every admin change, newest first.
export default function AuditList({ initial }: { initial: AuditRow[] }) {
  const [rows, setRows] = useState(initial)
  const [more, setMore] = useState(initial.length === 100)
  const [loading, setLoading] = useState(false)

  const loadMore = async () => {
    setLoading(true)
    try {
      const next = await listAudit(rows[rows.length - 1]?.id)
      setRows((r) => [...r, ...next])
      setMore(next.length === 100)
    } catch {
      toast.error("Couldn't load more")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-lg space-y-4">
      <h1 className="text-lg font-semibold">Audit log</h1>
      <p className="text-sm text-muted-foreground">Every change made in the admin panel, newest first.</p>
      {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No changes yet.</p>}
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {rows.map((r) => {
          const detail = detailText(r.details)
          return (
            <div key={r.id} className="p-3 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0">
                  <span className="font-medium">{r.action}</span>
                  {r.target && <span className="text-muted-foreground"> · {r.target}</span>}
                </p>
                <span className="shrink-0 text-xs text-muted-foreground">{when(r.created_at)}</span>
              </div>
              {detail && <p className="mt-0.5 break-words text-xs text-muted-foreground">{detail}</p>}
            </div>
          )
        })}
      </div>
      {more && (
        <Button variant="secondary" className="w-full" onClick={loadMore} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Load more
        </Button>
      )}
    </div>
  )
}
