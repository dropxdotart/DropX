'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import StreakCalendar from '@/components/streak/StreakCalendar'
import { extendStreakToTodayAsMod } from './actions'
import type { StreakDay } from '@/lib/streak'

type SupportUser = {
  id: string
  username: string | null
  display_name: string | null
  current_streak: number
  longest_streak: number
  account_status: string
}

export default function SupportPanel({ user, streakDays }: { user: SupportUser; streakDays: StreakDay[] }) {
  return (
    <Card className="border-white/10 bg-card max-w-lg">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-white">
          {user.display_name ?? user.username ?? 'Someone'}
          {user.account_status !== 'active' && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize text-destructive">
              {user.account_status}
            </Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">@{user.username}</p>
      </CardHeader>
      <CardContent>
        <StreakCalendar
          currentStreak={user.current_streak}
          longestStreak={user.longest_streak}
          days={streakDays}
          onExtendToToday={() => extendStreakToTodayAsMod(user.id)}
        />
      </CardContent>
    </Card>
  )
}
