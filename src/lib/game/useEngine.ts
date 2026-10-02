'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { getEngine, type Engine, type Snapshot } from './engine'
import { syncPlayer } from '@/app/playerActions'
import { playerId } from '@/lib/player'

const SYNC_SECONDS = 30
const SHORT_ID_KEY = 'rubble-short-id'

// Uploads the save to the player's cloud record and applies any gifts or
// balance edits an admin left for them.
async function syncCloud(engine: Engine) {
  try {
    const { shortId, grants } = await syncPlayer(playerId(), engine.cloudSummary(), engine.saveData())
    if (shortId && shortId !== engine.shortId) {
      engine.setShortId(shortId)
      try {
        localStorage.setItem(SHORT_ID_KEY, shortId)
      } catch {
        // fine — it comes back on the next sync
      }
    }
    for (const g of grants) engine.applyReward(g, g.message, g.source)
    engine.notify()
  } catch {
    // offline — try again next time
  }
}

const noSubscribe = () => () => {}

// The engine only exists in the browser (it reads localStorage on creation),
// so the server snapshot is null — server render and hydration stay
// identical, and the client picks the singleton up right after.
export function useEngine(): { engine: Engine; snap: Snapshot } | null {
  const engine = useSyncExternalStore(noSubscribe, getEngine, () => null)

  useEffect(() => {
    if (!engine) return
    try {
      engine.setShortId(localStorage.getItem(SHORT_ID_KEY))
    } catch {
      // not available — shown after the first sync
    }
    const firstSync = setTimeout(() => syncCloud(engine), 2000)
    const cloud = setInterval(() => syncCloud(engine), SYNC_SECONDS * 1000)
    const persist = setInterval(() => engine.save(), 3000)
    let hiddenAt = 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        engine.save()
        syncCloud(engine)
      } else if (hiddenAt) {
        // Frames don't run while the tab is hidden, so time spent in the
        // background is credited the same way as time with the app closed.
        engine.offlineEarnings = engine.catchUp((Date.now() - hiddenAt) / 1000)
        hiddenAt = 0
        engine.notify()
        // Pick up any gifts sent while the app was in the background.
        syncCloud(engine)
      }
    }
    const onPageHide = () => engine.save()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      clearTimeout(firstSync)
      clearInterval(cloud)
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
