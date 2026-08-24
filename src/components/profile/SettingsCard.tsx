'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { setShowEveryoneTab } from '@/app/profile/actions'

export default function SettingsCard({ initialShowEveryone }: { initialShowEveryone: boolean }) {
  const [showEveryone, setShowEveryone] = useState(initialShowEveryone)
  const [, startTransition] = useTransition()

  const handleChange = (checked: boolean) => {
    setShowEveryone(checked)
    startTransition(async () => {
      try {
        await setShowEveryoneTab(checked)
      } catch (err) {
        setShowEveryone(!checked)
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <Card className="border-white/10 bg-card/60 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-sm">Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Show Everyone tab</p>
            <p className="text-xs text-muted-foreground">Turn off to see only people you follow in the feed.</p>
          </div>
          <Switch checked={showEveryone} onCheckedChange={handleChange} />
        </div>
      </CardContent>
    </Card>
  )
}
