'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { adjustStreakAsSupport } from './actions'

type SupportUser = {
  id: string
  username: string | null
  display_name: string | null
  current_streak: number
  longest_streak: number
  account_status: string
}

export default function SupportUserCard({ user }: { user: SupportUser }) {
  const [streak, setStreak] = useState(String(user.current_streak))
  const [submitting, setSubmitting] = useState(false)
  const [, startTransition] = useTransition()

  const handleSave = () => {
    setSubmitting(true)
    startTransition(async () => {
      try {
        await adjustStreakAsSupport(user.id, Number(streak))
        toast.success('Streak updated')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setSubmitting(false)
      }
    })
  }

  return (
    <Card className="border-white/10 bg-card/60 max-w-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {user.display_name ?? user.username ?? 'Someone'}
          {user.account_status !== 'active' && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize text-destructive">
              {user.account_status}
            </Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">@{user.username}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Longest streak: {user.longest_streak}</p>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Current streak</label>
          <Input type="number" min={0} value={streak} onChange={(e) => setStreak(e.target.value)} />
        </div>
        <Button size="sm" disabled={submitting} onClick={handleSave} className="glow-violet">
          {submitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          Save streak
        </Button>
      </CardContent>
    </Card>
  )
}
