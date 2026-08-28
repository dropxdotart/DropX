'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { updateAppConfig } from './actions'
import type { AppConfig } from '@/lib/config'

export default function SettingsForm({ initial }: { initial: AppConfig }) {
  const [config, setConfig] = useState(initial)
  const [submitting, setSubmitting] = useState(false)
  const [, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    startTransition(async () => {
      try {
        await updateAppConfig(config)
        toast.success('Settings saved')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setSubmitting(false)
      }
    })
  }

  return (
    <Card className="border-border bg-card max-w-md">
      <CardHeader><CardTitle className="text-base">Daily drop</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Window start (ET hour, 0-23)</label>
              <Input
                type="number"
                min={0}
                max={23}
                value={config.drop_window_start_hour}
                onChange={(e) => setConfig({ ...config, drop_window_start_hour: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Window end (ET hour, 0-23)</label>
              <Input
                type="number"
                min={0}
                max={23}
                value={config.drop_window_end_hour}
                onChange={(e) => setConfig({ ...config, drop_window_end_hour: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Photo review grace period (minutes)</label>
            <Input
              type="number"
              min={1}
              value={config.photo_grace_minutes}
              onChange={(e) => setConfig({ ...config, photo_grace_minutes: Number(e.target.value) })}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save settings
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
