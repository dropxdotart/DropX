import { Card, CardContent } from '@/components/ui/card'
import type { Strike } from '@/lib/types'

type StrikeWithIssuer = Strike & { issuer: { username: string | null; display_name: string | null } | null }

export default function StrikeHistory({ strikes }: { strikes: StrikeWithIssuer[] }) {
  return (
    <Card className="border-white/10 bg-card">
      <CardContent className="space-y-2 pt-4">
        <h3 className="text-sm font-medium">Strike history</h3>
        {strikes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No strikes.</p>
        ) : (
          <div className="space-y-2">
            {strikes.map((s) => (
              <div key={s.id} className="text-xs border-b border-white/5 pb-2 last:border-0">
                <p className="text-muted-foreground">
                  {new Date(s.created_at).toLocaleString()} — by{' '}
                  {s.issuer?.display_name ?? s.issuer?.username ?? 'Someone'}
                </p>
                {s.reason && <p>{s.reason}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
