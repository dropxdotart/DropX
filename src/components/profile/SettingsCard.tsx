'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { ShieldCheck, Settings as SettingsIcon, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { setShowEveryoneTab, setShareToEveryone } from '@/app/profile/actions'
import type { UserRole } from '@/lib/types'

export default function SettingsCard({
  initialShowEveryone,
  initialShareToEveryone,
  role,
}: {
  initialShowEveryone: boolean
  initialShareToEveryone: boolean
  role: UserRole
}) {
  const [showEveryone, setShowEveryone] = useState(initialShowEveryone)
  const [shareToEveryone, setShareToEveryoneState] = useState(initialShareToEveryone)
  const [, startTransition] = useTransition()
  const supabase = createClient()

  const handleShowEveryoneChange = (checked: boolean) => {
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

  const handleShareChange = (checked: boolean) => {
    setShareToEveryoneState(checked)
    startTransition(async () => {
      try {
        await setShareToEveryone(checked)
      } catch (err) {
        setShareToEveryoneState(!checked)
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <Card className="border-white/10 bg-card/60 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-sm">Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Show Everyone tab</p>
            <p className="text-xs text-muted-foreground">Turn off to see only people you follow in the feed.</p>
          </div>
          <Switch checked={showEveryone} onCheckedChange={handleShowEveryoneChange} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Share to Everyone</p>
            <p className="text-xs text-muted-foreground">Turn off to keep your answers/photos out of everyone else's Everyone tab.</p>
          </div>
          <Switch checked={shareToEveryone} onCheckedChange={handleShareChange} />
        </div>

        {(role === 'mod' || role === 'admin') && (
          <div className="pt-1 space-y-2 border-t border-white/5">
            <Link href="/mod" className="flex items-center gap-2 text-sm font-medium pt-3 hover:text-[color:var(--neon-violet)] transition-colors">
              <ShieldCheck className="w-4 h-4" />
              Moderate
            </Link>
            {role === 'admin' && (
              <Link href="/admin" className="flex items-center gap-2 text-sm font-medium hover:text-[color:var(--neon-violet)] transition-colors">
                <SettingsIcon className="w-4 h-4" />
                Admin
              </Link>
            )}
          </div>
        )}

        <Button variant="destructive" size="sm" className="w-full" onClick={handleSignOut}>
          <LogOut className="w-3.5 h-3.5 mr-1.5" />
          Sign out
        </Button>
      </CardContent>
    </Card>
  )
}
