import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  // Refreshes the session — must not add logic between createServerClient and getUser()
  const { data: { user } } = await supabase.auth.getUser()

  const hostname = request.headers.get('host') ?? ''
  const isApp = hostname.startsWith('go.')

  if (isApp) {
    const { pathname } = request.nextUrl

    // Unauthenticated users on non-auth paths → redirect to login
    if (!user && !pathname.startsWith('/auth')) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/auth/login'
      const redirectResponse = NextResponse.redirect(loginUrl)
      supabaseResponse.cookies.getAll().forEach(({ name, value }) =>
        redirectResponse.cookies.set(name, value)
      )
      return redirectResponse
    }

    // Rewrite go.* paths to the /app route segment
    const url = request.nextUrl.clone()
    url.pathname = pathname === '/' ? '/app' : `/app${pathname}`
    const rewriteResponse = NextResponse.rewrite(url)
    supabaseResponse.cookies.getAll().forEach(({ name, value }) =>
      rewriteResponse.cookies.set(name, value)
    )
    return rewriteResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|icons\\.svg).*)'],
}
