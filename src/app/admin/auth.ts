'use server'

import { cookies } from 'next/headers'

const COOKIE_NAME = 'admin_session'

// The cookie itself never holds the password — only this server action can
// set it, and only after checking the real password against the env var,
// so a visitor can't forge their way past the gate without knowing it.
// There's no per-user role system anymore after the rebuild, so this
// shared-password gate is the whole security model for every /admin/*
// tool (ads, banned words, ...) — deliberately not more than that, and
// deliberately one shared session rather than a separate password per tool.
export async function checkAdminPassword(password: string): Promise<{ ok: boolean }> {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) throw new Error('ADMIN_PASSWORD is not configured')
  const ok = password === expected
  if (ok) {
    const store = await cookies()
    store.set(COOKIE_NAME, 'true', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/admin',
    })
  }
  return { ok }
}

export async function requireAdminSession(): Promise<void> {
  const store = await cookies()
  if (store.get(COOKIE_NAME)?.value !== 'true') throw new Error('Not authorized')
}
