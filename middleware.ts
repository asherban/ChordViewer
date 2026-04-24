import { type NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? ''
  const isApp = hostname.startsWith('go.')

  if (isApp) {
    const url = request.nextUrl.clone()
    url.pathname = url.pathname === '/' ? '/app' : `/app${url.pathname}`
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|icons\\.svg).*)'],
}
