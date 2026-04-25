import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { proxy } from './proxy'

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

  const routingResponse = proxy(request, user)

  // Forward refreshed session cookies onto the routing response
  if (routingResponse !== supabaseResponse) {
    supabaseResponse.cookies.getAll().forEach(({ name, value }) =>
      routingResponse.cookies.set(name, value)
    )
  }

  return routingResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|icons\\.svg).*)'],
}
