'use server'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'admin_session'

// The cookie holds a token derived from the password with an HMAC, never
// the password itself — and not a fixed value like "true", which anyone
// could set in their own browser. Only someone who knew the password can
// have the token; changing ADMIN_PASSWORD signs everyone out.
function sessionToken(): string | null {
  const password = process.env.ADMIN_PASSWORD?.trim()
  if (!password) return null
  return createHmac('sha256', password).update('rubble-admin-session-v1').digest('hex')
}

export async function isAdminSession(): Promise<boolean> {
  const expected = sessionToken()
  const actual = (await cookies()).get(COOKIE_NAME)?.value
  if (!expected || !actual || actual.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}

// There's no per-user role system anymore after the rebuild, so this
// shared-password gate is the whole security model for every /admin/*
// tool (ads, banned words, ...) — deliberately not more than that, and
// deliberately one shared session rather than a separate password per tool.
export async function checkAdminPassword(password: string): Promise<{ ok: boolean }> {
  // Trimmed because the production value was stored with a trailing newline
  // (a common side effect of piping it into `vercel env add`), which made
  // the correct password impossible to type.
  const expected = process.env.ADMIN_PASSWORD?.trim()
  if (!expected) throw new Error('ADMIN_PASSWORD is not configured')
  const ok = password.trim() === expected
  if (ok) {
    const store = await cookies()
    store.set(COOKIE_NAME, sessionToken()!, {
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
  if (!(await isAdminSession())) throw new Error('Not authorized')
}
