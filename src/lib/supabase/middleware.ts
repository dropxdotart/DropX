import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const TIMEOUT_MS = 5000

// A slow or momentarily-unreachable Supabase must never take routing down
// with it — a single slow response here was once enough to hit Vercel's
// middleware execution limit and 504 the entire site for every visitor.
// Every protected page already does its own auth.getUser() + redirect
// server-side, so on timeout it's safe to just fall through and let that
// real check happen at the page instead of here.
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

  // No separate sign-in page — identity is just a nickname, asked for at
  // the point someone actually starts or joins a room (see GamePicker and
  // HomeActions), so /host itself doesn't require a session; only /room
  // does, since it's only ever reached after createRoom/joinRoom already
  // established one.
  const protectedRoutes = ['/room']
  const isProtected = protectedRoutes.some(r => request.nextUrl.pathname.startsWith(r))

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
