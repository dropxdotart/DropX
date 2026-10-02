'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { duplicateBuilding } from './actions'

// Makes an editable copy (switched off) and opens it.
export default function DuplicateButton({ source }: { source: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        const r = await duplicateBuilding(source).catch(() => ({ ok: false as const, message: 'Something went wrong' }))
        setBusy(false)
        if (!r.ok) {
          toast.error(r.message)
          return
        }
        toast.success('Copied — it starts switched off')
        router.push(`/admin/buildings/${r.id}`)
      }}
      className="flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium disabled:opacity-50"
      aria-label="Duplicate"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />} Duplicate
    </button>
  )
}
