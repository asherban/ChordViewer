import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export async function proxy(request: NextRequest): Promise<NextResponse> {
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

    if (!user && !pathname.startsWith('/auth')) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/auth/login'
      return NextResponse.redirect(loginUrl)
    }

    // Auth pages live at /auth/* in the filesystem — don't rewrite them
    if (!pathname.startsWith('/auth')) {
      const url = request.nextUrl.clone()
      url.pathname = pathname === '/' ? '/app' : `/app${pathname}`
      const routingResponse = NextResponse.rewrite(url)
      supabaseResponse.cookies.getAll().forEach(({ name, value }) =>
        routingResponse.cookies.set(name, value)
      )
      return routingResponse
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|icons\\.svg).*)'],
}
