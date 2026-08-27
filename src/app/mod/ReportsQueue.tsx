'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Flag, Trash2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { dismissReport, removeReportedAvatar, issueStrikeForReport } from './actions'

type ReportItem = {
  id: string
  target_ref: string | null
  reason: string | null
  created_at: string
  reporter: { username: string | null; display_name: string | null } | null
  target: { username: string | null; display_name: string | null } | null
}

function ReportCard({ report, onHandled }: { report: ReportItem; onHandled: (id: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [strikeOpen, setStrikeOpen] = useState(false)
  const [strikeReason, setStrikeReason] = useState('')
  const [, startTransition] = useTransition()

  const run = (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    startTransition(async () => {
      try {
        await fn()
        onHandled(report.id)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
        setBusy(null)
      }
    })
  }

  return (
    <div className="rounded-xl border border-white/10 bg-card/60 backdrop-blur-sm p-3 space-y-3">
      <div className="flex items-center gap-3">
        {report.target_ref ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Storage URL
          <img src={report.target_ref} alt="" className="w-14 h-14 rounded-full object-cover shrink-0 border border-white/10" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{report.target?.display_name ?? report.target?.username ?? 'Someone'}</p>
          <p className="text-xs text-muted-foreground">
            Reported by {report.reporter?.display_name ?? report.reporter?.username ?? 'Someone'}
          </p>
          <p className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleString()}</p>
        </div>
      </div>

      {report.reason && <p className="text-xs text-muted-foreground border-l-2 border-white/10 pl-2">{report.reason}</p>}

      {strikeOpen ? (
        <div className="space-y-2">
          <Textarea
            value={strikeReason}
            onChange={(e) => setStrikeReason(e.target.value)}
            placeholder="Strike reason (optional)"
            rows={2}
            disabled={busy !== null}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={busy !== null}
              onClick={() => run('strike', () => issueStrikeForReport(report.id, strikeReason))}
            >
              {busy === 'strike' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Confirm strike
            </Button>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setStrikeOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run('dismiss', () => dismissReport(report.id))}>
            {busy === 'dismiss' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
            Dismiss
          </Button>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run('remove', () => removeReportedAvatar(report.id))}>
            {busy === 'remove' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
            Remove photo
          </Button>
          <Button size="sm" variant="destructive" disabled={busy !== null} onClick={() => setStrikeOpen(true)}>
            <Flag className="w-3.5 h-3.5 mr-1.5" />
            Issue strike
          </Button>
        </div>
      )}
    </div>
  )
}

export default function ReportsQueue({ initialReports }: { initialReports: ReportItem[] }) {
  const [reports, setReports] = useState(initialReports)
  const handleHandled = (id: string) => setReports((prev) => prev.filter((r) => r.id !== id))

  if (reports.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 gap-3 text-center">
        <ShieldCheck className="w-8 h-8 text-muted-foreground" />
        <p className="text-muted-foreground">No pending reports.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {reports.map((r) => (
        <ReportCard key={r.id} report={r} onHandled={handleHandled} />
      ))}
    </div>
  )
}
