'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { getEngine, type Engine, type Snapshot } from './engine'

const noSubscribe = () => () => {}

// The engine only exists in the browser (it reads localStorage on creation),
// so the server snapshot is null — server render and hydration stay
// identical, and the client picks the singleton up right after.
export function useEngine(): { engine: Engine; snap: Snapshot } | null {
  const engine = useSyncExternalStore(noSubscribe, getEngine, () => null)

  useEffect(() => {
    if (!engine) return
    const persist = setInterval(() => engine.save(), 3000)
    let hiddenAt = 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        engine.save()
      } else if (hiddenAt) {
        // Frames don't run while the tab is hidden, so time spent in the
        // background is credited the same way as time with the app closed.
        engine.offlineEarnings = engine.catchUp((Date.now() - hiddenAt) / 1000)
        hiddenAt = 0
        engine.notify()
      }
    }
    const onPageHide = () => engine.save()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      clearInterval(persist)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [engine])

  const snap = useSyncExternalStore(
    engine ? engine.subscribe : noSubscribe,
    () => (engine ? engine.getSnapshot() : null),
    () => null
  )

  return engine && snap ? { engine, snap } : null
}
