'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { CUSTOM_BUILDINGS_KEY, getEngine, PENDING_GRANTS_KEY, type Engine, type Snapshot } from './engine'
import { registerCustomBuildings } from './buildings'
import { getCustomBuildings, syncPlayer } from '@/app/playerActions'
import { playerId } from '@/lib/player'

const SYNC_SECONDS = 30
const SHORT_ID_KEY = 'rubble-short-id'

// Fetches the admin-made buildings (and keeps a copy for next launch).
async function loadCustomBuildings(engine: Engine) {
  try {
    const defs = await getCustomBuildings()
    registerCustomBuildings(defs)
    try {
      localStorage.setItem(CUSTOM_BUILDINGS_KEY, JSON.stringify(defs))
    } catch {
      // storage full — fetched again next launch
    }
    engine.notify()
  } catch {
    // offline — the cached list stands
  }
}

// Replays time away a slice at a time (so the screen never freezes),
// updating the HUD's progress as it goes.
function runCatchUp(engine: Engine) {
  if (!engine.catchingUp()) return
  const done = engine.stepCatchUp(24)
  engine.notify()
  if (!done) setTimeout(() => runCatchUp(engine), 0)
}

// Uploads the save to the player's cloud record and applies any gifts or
// balance edits an admin left for them.
// This visit, for the admin play-time stats: only time with the game on
// screen counts, and a break of over 5 minutes starts a new visit.
const SESSION_GAP_MS = 5 * 60 * 1000
const session = { id: '', startedAt: 0, seconds: 0, visibleSince: 0 }

function newSession() {
  session.id = crypto.randomUUID()
  session.startedAt = Date.now()
  session.seconds = 0
  session.visibleSince = Date.now()
}

function sessionInfo() {
  const live = session.visibleSince ? (Date.now() - session.visibleSince) / 1000 : 0
  return { id: session.id, startedAt: session.startedAt, seconds: Math.round(session.seconds + live) }
}

function pauseSession() {
  if (!session.visibleSince) return
  session.seconds += (Date.now() - session.visibleSince) / 1000
  session.visibleSince = 0
}

function resumeSession(hiddenMs: number) {
  if (!session.id || hiddenMs > SESSION_GAP_MS) newSession()
  else session.visibleSince = Date.now()
}

async function syncCloud(engine: Engine) {
  const activity = engine.takeActivity()
  try {
    const { shortId, username, grants, ban, live } = await syncPlayer(
      playerId(),
      engine.cloudSummary(),
      engine.saveData(),
      session.id ? sessionInfo() : undefined,
      activity
    )
    engine.setUsername(username)
    engine.setBan(ban)
    engine.setLive(live.events, live.broadcasts)
    engine.markDirty()
    engine.markSynced()
    if (shortId && shortId !== engine.shortId) {
      engine.setShortId(shortId)
      try {
        localStorage.setItem(SHORT_ID_KEY, shortId)
      } catch {
        // fine — it comes back on the next sync
      }
    }
    // A reset reloads the game: gifts sent after it wait in storage and are
    // applied to the fresh game; anything before it is moot.
    // (A restore works the same way: it reloads with the backed-up save.)
    const lastReset = grants.findLastIndex((g) => g.kind === 'reset' || g.kind === 'restore')
    if (lastReset >= 0) {
      try {
        localStorage.setItem(PENDING_GRANTS_KEY, JSON.stringify(grants.slice(lastReset + 1)))
      } catch {
        // storage unavailable — those gifts are lost
      }
      engine.applyReward(grants[lastReset], grants[lastReset].message, 'admin')
      return
    }
    for (const g of grants) engine.applyReward(g, g.message, g.source)
    engine.notify()
  } catch {
    // offline — try again next time
    engine.returnActivity(activity)
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
    loadCustomBuildings(engine)
    runCatchUp(engine)
    newSession()
    const firstSync = setTimeout(() => syncCloud(engine), 2000)
    const cloud = setInterval(() => syncCloud(engine), SYNC_SECONDS * 1000)
    const persist = setInterval(() => engine.save(), 3000)
    // Admin edits to buildings (new ones, schedules, redesigns) arrive
    // without a reload: every few minutes, and on coming back to the app.
    const buildings = setInterval(() => loadCustomBuildings(engine), 5 * 60 * 1000)
    let hiddenAt = 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        pauseSession()
        engine.save()
        syncCloud(engine)
      } else if (hiddenAt) {
        loadCustomBuildings(engine)
        // Frames don't run while the tab is hidden, so time spent in the
        // background is credited the same way as time with the app closed.
        resumeSession(Date.now() - hiddenAt)
        engine.beginCatchUp((Date.now() - hiddenAt) / 1000)
        hiddenAt = 0
        runCatchUp(engine)
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
      clearInterval(buildings)
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
