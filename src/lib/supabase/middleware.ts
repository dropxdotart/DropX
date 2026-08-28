import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const TIMEOUT_MS = 5000

// A slow or momentarily-unreachable Supabase must never take routing down
// with it — this ran unbounded before, and a single slow response here was
// enough to hit Vercel's middleware execution limit and 504 the entire site
// (MIDDLEWARE_INVOCATION_TIMEOUT) for every visitor, not just the one
// affected request. Every protected page already does its own
// auth.getUser() + redirect server-side, so on timeout it's safe to just
// fall through and let that real check happen at the page instead of here.
function withTimeout<T>(promise: PromiseLike<T>, ms = TIMEOUT_MS): Promise<T | 'timeout'> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms)),
  ])
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const userResult = await withTimeout(supabase.auth.getUser())
  if (userResult === 'timeout') return supabaseResponse
  const { data: { user } } = userResult

  const protectedRoutes = ['/profile']
  const isProtected = protectedRoutes.some(r => request.nextUrl.pathname.startsWith(r))

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth'
    return NextResponse.redirect(url)
  }

  // Suspended/banned blocking is cross-cutting (should apply to every route,
  // not just the ones that happen to redo this check themselves), so it
  // lives here rather than being copy-pasted into each page's own
  // `if (!user) redirect(...)` guard. Their own profile stays readable by
  // them (no RLS change) so the app can explain why they're locked out.
  if (user && !request.nextUrl.pathname.startsWith('/auth')) {
    const profileResult = await withTimeout(
      supabase.from('profiles').select('account_status').eq('id', user.id).single()
    )

    if (profileResult !== 'timeout') {
      const { data: profile } = profileResult
      if (profile && profile.account_status !== 'active') {
        const url = request.nextUrl.clone()
        url.pathname = '/auth'
        url.searchParams.set('blocked', profile.account_status)
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
