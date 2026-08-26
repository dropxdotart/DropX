'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Loader2, Flame, Bot, Heart } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { createBot, botSubmitAnswer, botLike } from './actions'
import type { ChallengeWithAnswer } from '@/lib/types'

type BotProfile = {
  id: string
  username: string | null
  display_name: string | null
  current_streak: number
  longest_streak: number
}

type FeedItem = {
  id: string
  answer: string
  photo_url: string | null
  answered_at: string
  profiles: { username: string | null; display_name: string | null } | null
  challenges: { prompt: string } | null
}

export default function HandlerPanel({
  bots,
  challenge,
  answeredBotIds,
  feedItems,
}: {
  bots: BotProfile[]
  challenge: ChallengeWithAnswer | null
  answeredBotIds: string[]
  feedItems: FeedItem[]
}) {
  const [newBotName, setNewBotName] = useState('')
  const [creating, setCreating] = useState(false)
  const [selectedBotId, setSelectedBotId] = useState<string | null>(bots[0]?.id ?? null)
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const selectedBot = bots.find((b) => b.id === selectedBotId) ?? null
  const botAlreadyAnswered = selectedBot ? answeredBotIds.includes(selectedBot.id) : false

  const handleCreateBot = () => {
    if (!newBotName.trim() || creating) return
    setCreating(true)
    startTransition(async () => {
      try {
        const { id, streak } = await createBot(newBotName)
        toast.success(`Created — starting streak ${streak}`)
        setNewBotName('')
        setSelectedBotId(id)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setCreating(false)
      }
    })
  }

  const handleAnswer = (value: string) => {
    if (!selectedBot || !challenge || busy) return
    setBusy('answer')
    setAnswer(value)
    startTransition(async () => {
      try {
        const { isCorrect } = await botSubmitAnswer(selectedBot.id, challenge.id, value)
        toast.success(isCorrect ? 'Answered — correct' : 'Answered — incorrect')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setBusy(null)
      }
    })
  }

  const handleLike = (responseId: string) => {
    if (!selectedBot || busy) return
    setBusy(`like-${responseId}`)
    startTransition(async () => {
      try {
        await botLike(selectedBot.id, responseId)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setBusy(null)
      }
    })
  }

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <div className="space-y-4">
        <Card className="border-white/10 bg-card">
          <CardHeader><CardTitle className="text-sm">Create bot</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Input
              placeholder="Name"
              value={newBotName}
              onChange={(e) => setNewBotName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateBot()}
            />
            <Button size="sm" variant="secondary" className="w-full" disabled={creating || !newBotName.trim()} onClick={handleCreateBot}>
              {creating && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Create
            </Button>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card">
          <CardHeader><CardTitle className="text-sm">Bots ({bots.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {bots.length === 0 ? (
              <p className="px-4 pb-4 text-xs text-muted-foreground">No bots yet.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {bots.map((bot) => (
                  <button
                    key={bot.id}
                    onClick={() => setSelectedBotId(bot.id)}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition-colors',
                      selectedBotId === bot.id ? 'bg-white/10' : 'hover:bg-white/5'
                    )}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Bot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{bot.display_name ?? bot.username}</span>
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <Flame className="w-3 h-3 text-[color:var(--neon-orange)]" fill="currentColor" />
                      {bot.current_streak}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {!selectedBot ? (
          <p className="text-sm text-muted-foreground">Create or select a bot to post as.</p>
        ) : (
          <>
            <p className="text-sm">
              Posting as <span className="font-semibold text-white">{selectedBot.display_name ?? selectedBot.username}</span>
              <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">streak {selectedBot.current_streak}</Badge>
            </p>

            <Card className="border-white/10 bg-card">
              <CardHeader><CardTitle className="text-sm">Today&apos;s challenge</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {!challenge ? (
                  <p className="text-xs text-muted-foreground">Nothing has dropped yet today.</p>
                ) : botAlreadyAnswered ? (
                  <p className="text-xs text-muted-foreground">Already answered.</p>
                ) : (
                  <>
                    <p className="text-sm font-medium">{challenge.prompt}</p>
                    {challenge.type === 'multiple_choice' && challenge.choices ? (
                      <div className="grid grid-cols-2 gap-2">
                        {challenge.choices.map((choice) => (
                          <Button
                            key={choice}
                            size="sm"
                            variant="outline"
                            disabled={busy === 'answer'}
                            onClick={() => handleAnswer(choice)}
                          >
                            {busy === 'answer' && answer === choice && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                            {choice}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault()
                          handleAnswer(answer)
                        }}
                      >
                        <Input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer" />
                        <Button type="submit" size="sm" variant="secondary" disabled={busy === 'answer'}>
                          {busy === 'answer' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                          Submit
                        </Button>
                      </form>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-card">
              <CardHeader><CardTitle className="text-sm">Recent feed</CardTitle></CardHeader>
              <CardContent className="p-0 divide-y divide-white/5">
                {feedItems.map((item) => (
                  <div key={item.id} className="p-3 space-y-2 text-sm">
                    <p className="text-xs text-muted-foreground">
                      {item.profiles?.display_name ?? item.profiles?.username ?? 'Someone'} · {item.challenges?.prompt}
                    </p>
                    <p className="truncate">{item.answer}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      disabled={busy === `like-${item.id}`}
                      onClick={() => handleLike(item.id)}
                    >
                      <Heart className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
