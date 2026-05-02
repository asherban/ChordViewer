import { config } from 'dotenv'
import path from 'path'

export async function setup() {
  config({ path: path.resolve(process.cwd(), '.env.test.local') })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
  try {
    const res = await fetch(`${url}/rest/v1/`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch {
    throw new Error(
      `Local Supabase is not running. Start it with:\n  npm run db:start\n\nThen copy the anon and service_role keys from:\n  npm run db:status\ninto .env.test.local`
    )
  }
}
