'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { checkAdminPassword } from './actions'

export default function PasswordGate() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || loading) return
    setLoading(true)
    try {
      const { ok } = await checkAdminPassword(password)
      if (!ok) throw new Error('Wrong password')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-3">
        <h1 className="text-lg font-semibold text-center mb-4">Ads admin</h1>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          disabled={loading}
          className="h-11 rounded-xl"
        />
        <Button type="submit" className="w-full h-11 rounded-xl" disabled={loading || !password}>
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Enter
        </Button>
      </form>
    </div>
  )
}
