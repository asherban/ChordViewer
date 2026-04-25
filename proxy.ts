import { type NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest, user: { id: string } | null): NextResponse {
  const hostname = request.headers.get('host') ?? ''
  const isApp = hostname.startsWith('go.')

  if (isApp) {
    const { pathname } = request.nextUrl

    // Unauthenticated users on non-auth paths → redirect to login
    if (!user && !pathname.startsWith('/auth')) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/auth/login'
      return NextResponse.redirect(loginUrl)
    }

    // Rewrite go.* paths to the /app route segment
    const url = request.nextUrl.clone()
    url.pathname = pathname === '/' ? '/app' : `/app${pathname}`
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}
