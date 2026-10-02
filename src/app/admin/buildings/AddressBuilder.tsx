'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { buildFromAddress } from './actions'

// Type an address (or a famous building's name) and get a starting shape
// from the real building's outline and height on OpenStreetMap.
export default function AddressBuilder() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    if (!q.trim() || busy) return
    setBusy(true)
    const r = await buildFromAddress(q).catch(() => ({ ok: false as const, message: 'Something went wrong' }))
    setBusy(false)
    if (!r.ok) {
      toast.error(r.message)
      return
    }
    toast.success(`Built from the map. ${r.note}`, { duration: 7000 })
    router.push(`/admin/buildings/${r.id}`)
  }
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 font-medium">
        <MapPin className="h-4 w-4" /> Build from a real address
      </p>
      <p className="text-xs text-muted-foreground">
        Uses the building&apos;s real outline and height from OpenStreetMap. The map doesn&apos;t know what the outside looks like, so you&apos;ll
        get the right shape with plain walls to touch up in the brick editor. Famous names work too.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          go()
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 792 Eastern Parkway, Brooklyn" />
        <Button type="submit" disabled={busy || !q.trim()} className="shrink-0">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Build'}
        </Button>
      </form>
    </div>
  )
}
