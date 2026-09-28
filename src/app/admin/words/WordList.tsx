'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { addBannedWord, removeBannedWord } from './actions'

type Word = { id: string; word: string }

// Nickname checks are a case-insensitive *substring* match (see
// ensureIdentity in src/app/actions.ts) — entries here should mostly be
// whole words, since a short entry (e.g. a 3-letter word) can end up
// blocking innocent names that merely contain it. Worth knowing when
// adding one, not something the UI can fully guard against.
export default function WordList({ initialWords }: { initialWords: Word[] }) {
  const [words, setWords] = useState(initialWords)
  const [input, setInput] = useState('')
  const [adding, startAdd] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const word = input.trim()
    if (!word || adding) return
    startAdd(async () => {
      try {
        await addBannedWord(word)
        setWords((prev) => [...prev, { id: crypto.randomUUID(), word: word.toLowerCase() }].sort((a, b) => a.word.localeCompare(b.word)))
        setInput('')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  const handleRemove = (id: string) => {
    setBusyId(id)
    startTransition(async () => {
      try {
        await removeBannedWord(id)
        setWords((prev) => prev.filter((w) => w.id !== id))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <h1 className="text-lg font-semibold">Banned words</h1>
      <p className="text-sm text-muted-foreground -mt-4">
        Blocked from nicknames — checked as a substring, case-insensitive.
      </p>

      <form onSubmit={handleAdd} className="flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Add a word" disabled={adding} />
        <Button type="submit" disabled={adding || !input.trim()}>
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {words.length === 0 && <p className="text-sm text-muted-foreground">No banned words yet.</p>}
        {words.map((w) => (
          <span key={w.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-card pl-2.5 pr-1 py-1 text-sm">
            {w.word}
            <button
              type="button"
              disabled={busyId === w.id}
              onClick={() => handleRemove(w.id)}
              className="p-0.5 rounded-full hover:bg-accent disabled:opacity-50"
            >
              {busyId === w.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}
