'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Undo2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { reverseModeration } from './actions'

export default function ReverseButton({ responseId }: { responseId: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleReverse = () => {
    if (!confirm('Reverse this decision? This does not adjust the affected streak automatically.')) return
    startTransition(async () => {
      try {
        await reverseModeration(responseId)
        toast.success('Decision reversed')
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <Button size="sm" variant="outline" disabled={isPending} onClick={handleReverse}>
      {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
      Reverse
    </Button>
  )
}
