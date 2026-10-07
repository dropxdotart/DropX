'use client'

import { useState, useTransition } from 'react'
import { setMaintenance } from './actions'

export default function MaintenanceToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="font-medium">{on ? '🚧 The game is OFF — players see “Sorry, building!”' : '✅ The game is ON for everyone'}</p>
      <p className="text-sm text-muted-foreground">While it’s off, you can still play it on any device signed in to this admin.</p>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setMaintenance(!on)
            if (res.ok) {
              setOn(!on)
              setError('')
            } else setError('Couldn’t save — try again.')
          })
        }
        className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${on ? 'bg-green-600' : 'bg-red-600'}`}
      >
        {on ? 'Turn the game back on' : 'Turn the game off'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
