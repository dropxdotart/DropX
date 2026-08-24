'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { deleteChallenge } from './actions'

export default function ChallengeRowActions({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleDelete = () => {
    if (!confirm('Delete this challenge from the pool?')) return
    startTransition(async () => {
      try {
        await deleteChallenge(id)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <div className="flex items-center gap-1">
      <Link href={`/admin/challenges/${id}`}>
        <Button size="icon-sm" variant="ghost"><Pencil className="w-3.5 h-3.5" /></Button>
      </Link>
      <Button size="icon-sm" variant="ghost" onClick={handleDelete} disabled={isPending} className="text-destructive hover:text-destructive">
        {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      </Button>
    </div>
  )
}
