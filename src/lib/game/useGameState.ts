'use client'

import { useEffect, useRef, useState } from 'react'
import { getStructure } from './structures'

const STORAGE_KEY = 'rubble-save-v3'
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

// Every damage point is also a point of scrap; finishing a structure adds
// its completion bonus and swaps in the next one at full health.
function applyDamage(s: SaveData, amount: number): SaveData {
  const health = s.health - amount
  if (health > 0) return { ...s, scrap: s.scrap + amount, health }

  const nextIndex = s.structureIndex + 1
  return {
    ...s,
    scrap: s.scrap + amount + getStructure(s.structureIndex).reward,
    structureIndex: nextIndex,
    health: getStructure(nextIndex).maxHealth,
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

  // The crew actually swings at the building once a second while the tab is
  // open (each member = 1 damage), so idle progress is visible brick by
  // brick. Time spent away is credited as scrap only, at load (above) —
  // there's no building on screen to show it happening against.
  useEffect(() => {
    if (!loaded) return
    const id = setInterval(() => {
      setSave((s) => (s.idleRate > 0 ? applyDamage(s, s.idleRate) : s))
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
    setLastHit(Date.now())
    setSave((s) => applyDamage(s, s.tapPower))
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
