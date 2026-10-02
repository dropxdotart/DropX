'use client'

import { useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DEFAULT_TUNING, TUNE_GROUPS, TUNE_KEYS, type Tuning } from '@/lib/tuning'
import { saveTuning } from './actions'

// Sliders for the game's balance, as percentages of the built-in numbers.
export default function TuningEditor({ initial }: { initial: Tuning }) {
  const [saved, setSaved] = useState(initial)
  const [values, setValues] = useState(initial)
  const [busy, setBusy] = useState(false)
  const dirty = TUNE_KEYS.some((k) => values[k] !== saved[k])
  const custom = TUNE_KEYS.some((k) => values[k] !== 100)

  const save = async () => {
    setBusy(true)
    const r = await saveTuning(values).catch(() => ({ ok: false as const, message: 'Something went wrong' }))
    setBusy(false)
    if (!r.ok) {
      toast.error(r.message)
      return
    }
    setSaved(values)
    toast.success('Saved — games pick it up within about 30 seconds')
  }

  return (
    <div className="w-full max-w-lg space-y-4 pb-20">
      <h1 className="text-lg font-semibold">Game balance</h1>
      <p className="text-sm text-muted-foreground">
        Make the game easier or harder for everyone without an update. 100% is the game as designed; 80% is 20% less, 150% is 50% more.
        Changes reach players within about 30 seconds.
      </p>

      {TUNE_GROUPS.map((g) => (
        <div key={g.title} className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <p className="font-medium">{g.title}</p>
          {g.items.map((i) => {
            const v = values[i.key]
            return (
              <div key={i.key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{i.label}</p>
                    <p className="text-xs text-muted-foreground">{i.help}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className={`text-sm font-semibold tabular-nums ${v === 100 ? 'text-muted-foreground' : 'text-[#ff6b1a]'}`}>{v}%</span>
                    {v !== 100 && (
                      <button
                        type="button"
                        aria-label={`Reset ${i.label}`}
                        onClick={() => setValues((x) => ({ ...x, [i.key]: 100 }))}
                        className="p-1 text-muted-foreground"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="range"
                  min={i.min}
                  max={i.max}
                  step={5}
                  value={v}
                  onChange={(e) => setValues((x) => ({ ...x, [i.key]: Number(e.target.value) }))}
                  className="w-full accent-[#ff6b1a]"
                />
              </div>
            )
          })}
        </div>
      ))}

      <div className="sticky bottom-4 flex gap-2">
        <Button variant="secondary" disabled={busy || !custom} onClick={() => setValues({ ...DEFAULT_TUNING })}>
          Reset all
        </Button>
        <Button className="flex-1" disabled={busy || !dirty} onClick={save}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {dirty ? 'Save changes' : 'Saved'}
        </Button>
      </div>
    </div>
  )
}
