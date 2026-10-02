'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { Engine } from '@/lib/game/engine'
import { setUsername } from '@/app/playerActions'
import { playerId } from '@/lib/player'

// Pick or change a username: 3–16 letters, numbers or _ (checked again,
// with the banned-word list and uniqueness, on the server).
export default function UsernameForm({
  engine,
  initial,
  submitLabel = 'Save',
  onDone,
}: {
  engine: Engine
  initial: string
  submitLabel?: string
  onDone: () => void
}) {
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const clean = name.trim()
    if (busy || !clean) return
    if (!/^[A-Za-z0-9_]{3,16}$/.test(clean)) {
      setError('Use 3–16 letters, numbers or _')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await setUsername(playerId(), clean)
      if (result.ok) {
        engine.setUsername(result.username)
        engine.notify()
        onDone()
      } else {
        setError(result.message)
      }
    } catch {
      setError("Couldn't reach the server — check your connection")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))
            setError(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="Username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={16}
          autoFocus
          className="min-w-0 flex-1 rounded-xl border-2 border-[#d5ddea] bg-white px-3 py-2 font-display text-lg text-[#1d3a6e] outline-none placeholder:text-[#b9c2cf] focus:border-[#2d7ff9]"
        />
        <button
          onClick={save}
          disabled={busy || name.trim().length < 3}
          className="shrink-0 rounded-xl bg-[#3fbf4a] px-4 font-display text-white shadow-[0_3px_0_#2a8a33] active:translate-y-[3px] active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_3px_0_#97a1ae]"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : submitLabel}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-sm font-bold text-[#c2410c]">{error}</p>
      ) : (
        <p className="mt-1.5 text-xs text-[#5b6f93]">3–16 letters, numbers or _</p>
      )}
    </div>
  )
}
