'use client'

import { useState } from 'react'
import { Copy, Loader2, Pencil, X } from 'lucide-react'
import type { Engine, Snapshot } from '@/lib/game/engine'
import { redeemCode } from '@/app/playerActions'
import { playerId } from '@/lib/player'
import UsernameForm from './UsernameForm'

// The player's profile: their public ID (to give support) and a box to
// redeem codes. Settings will live here later too.
export default function ProfileSheet({ engine, snap, onClose }: { engine: Engine; snap: Snapshot; onClose: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [editingName, setEditingName] = useState(false)

  const redeem = async () => {
    if (!code.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await redeemCode(playerId(), code)
      if (result.ok) {
        engine.applyReward(result.grant, null, 'code')
        engine.notify()
        setCode('')
        onClose()
      } else {
        setError(result.message)
      }
    } catch {
      setError("Couldn't reach the server — check your connection")
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!snap.shortId) return
    try {
      await navigator.clipboard.writeText(snap.shortId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked — they can still read it off the screen
    }
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-4 pb-[max(env(safe-area-inset-bottom),16px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-2xl text-[#1d3a6e]">Profile</p>
          <button onClick={onClose} className="rounded-full bg-[#eef2f8] p-2" aria-label="Close">
            <X className="h-5 w-5 text-[#1d3a6e]" />
          </button>
        </div>

        <div className="mb-3 rounded-2xl bg-[#eef2f8] p-3">
          <p className="text-xs text-[#5b6f93]">Username</p>
          {editingName ? (
            <div className="mt-1.5">
              <UsernameForm engine={engine} initial={snap.username ?? ''} onDone={() => setEditingName(false)} />
            </div>
          ) : (
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className={`font-display text-2xl ${snap.username ? 'text-[#1d3a6e]' : 'text-[#9aa6ba]'}`}>{snap.username ?? 'Not set'}</p>
              <button
                onClick={() => setEditingName(true)}
                disabled={!snap.synced}
                className="flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 font-display text-sm text-[#1d3a6e] disabled:opacity-50"
              >
                <Pencil className="h-4 w-4" /> {snap.username ? 'Change' : 'Set name'}
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-[#eef2f8] p-3">
          <p className="text-xs text-[#5b6f93]">Your player ID</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="font-display text-3xl tracking-[0.15em] text-[#1d3a6e]">{snap.shortId ?? '······'}</p>
            {snap.shortId && (
              <button onClick={copy} className="flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 font-display text-sm text-[#1d3a6e]">
                <Copy className="h-4 w-4" /> {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-[#5b6f93]">
            {snap.shortId ? 'Share this with support if you need help.' : 'Connecting… your ID shows once you’re online.'}
          </p>
        </div>

        <div className="mt-3 rounded-2xl bg-[#eef2f8] p-3">
          <p className="font-display text-base text-[#1d3a6e]">Redeem a code</p>
          <div className="mt-2 flex gap-2">
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase())
                setError(null)
              }}
              onKeyDown={(e) => e.key === 'Enter' && redeem()}
              placeholder="ENTER CODE"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={40}
              className="min-w-0 flex-1 rounded-xl border-2 border-[#d5ddea] bg-white px-3 py-2 font-display text-lg tracking-wider text-[#1d3a6e] outline-none placeholder:text-[#b9c2cf] focus:border-[#2d7ff9]"
            />
            <button
              onClick={redeem}
              disabled={busy || !code.trim()}
              className="shrink-0 rounded-xl bg-[#3fbf4a] px-4 font-display text-white shadow-[0_3px_0_#2a8a33] active:translate-y-[3px] active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_3px_0_#97a1ae]"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Redeem'}
            </button>
          </div>
          {error && <p className="mt-2 text-sm font-bold text-[#c2410c]">{error}</p>}
        </div>
      </div>
    </div>
  )
}
