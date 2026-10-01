'use client'

import { useEffect, useRef, useState } from 'react'
import { getStructure } from './structures'

const STORAGE_KEY = 'rubble-save-v1'
const TAP_UPGRADE_BASE_COST = 25
const IDLE_UPGRADE_BASE_COST = 50
const UPGRADE_COST_GROWTH = 1.15
// Capped so leaving the tab open for days doesn't produce an absurd number —
// still a meaningful welcome-back reward without feeling exploitable.
const MAX_OFFLINE_SECONDS = 60 * 60 * 8

type SaveData = {
  scrap: number
  structureIndex: number
  health: number
  tapPower: number
  idleRate: number
  tapUpgradesBought: number
  idleUpgradesBought: number
  lastSeen: number
}

function freshSave(): SaveData {
  return {
    scrap: 0,
    structureIndex: 0,
    health: getStructure(0).maxHealth,
    tapPower: 1,
    idleRate: 0,
    tapUpgradesBought: 0,
    idleUpgradesBought: 0,
    lastSeen: Date.now(),
  }
}

function loadSave(): { save: SaveData; offlineEarnings: number } {
  if (typeof window === 'undefined') return { save: freshSave(), offlineEarnings: 0 }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { save: freshSave(), offlineEarnings: 0 }
    const parsed = JSON.parse(raw) as SaveData
    const elapsedSeconds = Math.min((Date.now() - parsed.lastSeen) / 1000, MAX_OFFLINE_SECONDS)
    const offlineEarnings = Math.floor(elapsedSeconds * parsed.idleRate)
    return { save: { ...parsed, scrap: parsed.scrap + offlineEarnings, lastSeen: Date.now() }, offlineEarnings }
  } catch {
    return { save: freshSave(), offlineEarnings: 0 }
  }
}

export function tapUpgradeCost(bought: number): number {
  return Math.round(TAP_UPGRADE_BASE_COST * Math.pow(UPGRADE_COST_GROWTH, bought))
}

export function idleUpgradeCost(bought: number): number {
  return Math.round(IDLE_UPGRADE_BASE_COST * Math.pow(UPGRADE_COST_GROWTH, bought))
}

export function useGameState() {
  const [save, setSave] = useState<SaveData>(freshSave)
  const [offlineEarnings, setOfflineEarnings] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [lastHit, setLastHit] = useState(0)
  const saveRef = useRef(save)
  saveRef.current = save

  // Loaded only after mount so the server-rendered shell matches a fresh
  // save exactly — localStorage doesn't exist during SSR, and reading it
  // any earlier would mismatch and trigger a hydration warning.
  useEffect(() => {
    const { save: loadedSave, offlineEarnings: earnings } = loadSave()
    setSave(loadedSave)
    setOfflineEarnings(earnings)
    setLoaded(true)
  }, [])

  // Idle income ticks once a second while the tab is open; the bigger
  // lump-sum catch-up for time spent away happens once at load (above).
  useEffect(() => {
    if (!loaded) return
    const id = setInterval(() => {
      setSave((s) => (s.idleRate > 0 ? { ...s, scrap: s.scrap + s.idleRate } : s))
    }, 1000)
    return () => clearInterval(id)
  }, [loaded])

  // Persist on every change, and once more on tab-hide so "time away" is
  // measured from the last moment the player was actually looking at it.
  useEffect(() => {
    if (!loaded) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...save, lastSeen: Date.now() }))
  }, [save, loaded])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saveRef.current, lastSeen: Date.now() }))
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])

  const tap = () => {
    setSave((s) => {
      const structure = getStructure(s.structureIndex)
      const health = s.health - s.tapPower
      setLastHit(Date.now())

      if (health <= 0) {
        const nextIndex = s.structureIndex + 1
        return {
          ...s,
          scrap: s.scrap + s.tapPower + structure.reward,
          structureIndex: nextIndex,
          health: getStructure(nextIndex).maxHealth,
        }
      }

      return { ...s, scrap: s.scrap + s.tapPower, health }
    })
  }

  const buyTapUpgrade = () => {
    setSave((s) => {
      const cost = tapUpgradeCost(s.tapUpgradesBought)
      if (s.scrap < cost) return s
      return { ...s, scrap: s.scrap - cost, tapPower: s.tapPower + 1, tapUpgradesBought: s.tapUpgradesBought + 1 }
    })
  }

  const buyIdleUpgrade = () => {
    setSave((s) => {
      const cost = idleUpgradeCost(s.idleUpgradesBought)
      if (s.scrap < cost) return s
      return { ...s, scrap: s.scrap - cost, idleRate: s.idleRate + 1, idleUpgradesBought: s.idleUpgradesBought + 1 }
    })
  }

  const claimRewardedBonus = () => {
    setSave((s) => ({ ...s, scrap: s.scrap + Math.max(s.idleRate * 60, 50) }))
  }

  const clearOfflineEarnings = () => setOfflineEarnings(0)

  return {
    loaded,
    scrap: save.scrap,
    structure: getStructure(save.structureIndex),
    structureIndex: save.structureIndex,
    health: save.health,
    tapPower: save.tapPower,
    idleRate: save.idleRate,
    tapUpgradesBought: save.tapUpgradesBought,
    idleUpgradesBought: save.idleUpgradesBought,
    offlineEarnings,
    lastHit,
    tap,
    buyTapUpgrade,
    buyIdleUpgrade,
    claimRewardedBonus,
    clearOfflineEarnings,
  }
}
