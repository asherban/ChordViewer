import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (c: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            c.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch { /* setAll called from Server Component — read-only cookie store; safe to ignore */ }
        },
      },
    }
  )
}
