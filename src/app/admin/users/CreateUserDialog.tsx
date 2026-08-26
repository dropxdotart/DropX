'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { createRealUser } from './actions'

const WORDS = ['Comet', 'Harbor', 'Ember', 'Willow', 'Falcon', 'Quartz', 'Meadow', 'Ridge']

function generatePassword(): string {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)]
  const digits = Math.floor(1000 + Math.random() * 9000)
  return `${word}-${digits}!`
}

export default function CreateUserDialog() {
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(generatePassword())
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ username: string; email: string; password: string } | null>(null)

  const reset = () => {
    setUsername('')
    setEmail('')
    setPassword(generatePassword())
    setCreated(null)
  }

  const handleCreate = async () => {
    setBusy(true)
    try {
      await createRealUser(username, email, password)
      setCreated({ username: username.trim().toLowerCase(), email: email.trim(), password })
      toast.success('Account created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <UserPlus className="w-3.5 h-3.5 mr-1.5" />
        Create user
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create a user</DialogTitle>
            {!created && (
              <DialogDescription>
                There&apos;s no invite-email flow yet — share these credentials with them yourself once created.
              </DialogDescription>
            )}
          </DialogHeader>

          {created ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Share these with them — this is the only time the password is shown.</p>
              <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-1 text-sm">
                <p>Username: <span className="font-medium text-white">@{created.username}</span></p>
                <p>Email: <span className="font-medium text-white">{created.email}</span></p>
                <p>Password: <span className="font-medium text-white">{created.password}</span></p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Done</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Username</label>
                <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="username" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Password</label>
                <Input value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || !username.trim() || !email.trim() || password.length < 6}
                onClick={handleCreate}
              >
                {busy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Create
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
