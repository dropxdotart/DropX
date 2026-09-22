'use client'

import { useTransition } from 'react'
import { Loader2, MessageCircleQuestion, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { createRoom } from '@/app/actions'

function isRedirectSignal(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'digest' in err && typeof err.digest === 'string' && err.digest.startsWith('NEXT_REDIRECT')
}

const GAMES = [
  {
    id: 'hot_take' as const,
    label: 'Hot Take',
    description: 'Vote agree or disagree, see the split live.',
    icon: '🔥',
    available: true,
  },
  {
    id: 'who_said_it' as const,
    label: 'Who Said It',
    description: 'Answer anonymously, guess who wrote what.',
    icon: MessageCircleQuestion,
    available: false,
  },
  {
    id: 'caption' as const,
    label: 'Caption This',
    description: 'Caption a photo, vote for the funniest.',
    icon: ImageIcon,
    available: false,
  },
]

export default function GamePicker() {
  const [pending, startTransition] = useTransition()

  const handlePick = () => {
    startTransition(async () => {
      try {
        await createRoom()
      } catch (err) {
        if (isRedirectSignal(err)) throw err
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <div className="space-y-3">
      {GAMES.map((game) => (
        <button
          key={game.id}
          type="button"
          disabled={!game.available || pending}
          onClick={handlePick}
          className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left hover:border-foreground/30 hover:bg-accent transition-colors disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-card"
        >
          <span className="text-2xl shrink-0" aria-hidden>
            {typeof game.icon === 'string' ? game.icon : <game.icon className="w-6 h-6 text-muted-foreground" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{game.label}</span>
            <span className="block text-xs text-muted-foreground">
              {game.available ? game.description : 'Coming soon'}
            </span>
          </span>
          {pending && game.available && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
        </button>
      ))}
    </div>
  )
}
