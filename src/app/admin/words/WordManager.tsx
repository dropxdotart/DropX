'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addBannedWord, adminSetUsername, flaggedPlayers, listBannedWords, removeBannedWord, type PlayerRow } from '../players/actions'

// Words players can't use in usernames (on top of a built-in list), and
// existing names that break the rules so they can be cleared.
export default function WordManager({ initialWords, initialFlagged }: { initialWords: string[]; initialFlagged: PlayerRow[] }) {
  const [words, setWords] = useState(initialWords)
  const [flagged, setFlagged] = useState(initialFlagged)
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    const [w, f] = await Promise.all([listBannedWords(), flaggedPlayers()])
    setWords(w)
    setFlagged(f)
  }

  const add = async () => {
    setBusy(true)
    const result = await addBannedWord(word).catch(() => ({ ok: false as const, message: 'Something went wrong' }))
    setBusy(false)
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    setWord('')
    await refresh()
  }

  const remove = async (w: string) => {
    const result = await removeBannedWord(w).catch(() => ({ ok: false as const, message: 'Something went wrong' }))
    if (result.ok) await refresh()
    else toast.error(result.message)
  }

  const clearName = async (p: PlayerRow) => {
    const result = await adminSetUsername(p.id, null).catch(() => ({ ok: false as const, message: 'Something went wrong' }))
    if (result.ok) setFlagged((prev) => prev.filter((x) => x.id !== p.id))
    else toast.error(result.message)
  }

  return (
    <div className="w-full max-w-lg space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Banned words</h1>
        <p className="text-sm text-muted-foreground">
          Usernames containing these are rejected, on top of a built-in list of common offensive words. Disguises like
          b4dw0rd or bad_word are caught too.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <Input value={word} onChange={(e) => setWord(e.target.value.replace(/[^A-Za-z0-9]/g, ''))} placeholder="Add a word" maxLength={30} />
        <Button type="submit" disabled={busy || word.trim().length < 2}>
          Add
        </Button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {words.length === 0 && <p className="text-sm text-muted-foreground">No words added yet.</p>}
        {words.map((w) => (
          <span key={w} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-mono text-xs">
            {w}
            <button type="button" onClick={() => remove(w)} aria-label={`Remove ${w}`} className="opacity-60 hover:opacity-100">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Names that break the rules</p>
        {flagged.length === 0 ? (
          <p className="text-sm text-muted-foreground">None right now.</p>
        ) : (
          flagged.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm">
                <span className="font-semibold">{p.username}</span>{' '}
                <span className="font-mono text-xs text-muted-foreground">{p.short_id}</span>
              </p>
              <Button variant="secondary" onClick={() => clearName(p)}>
                Clear name
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
