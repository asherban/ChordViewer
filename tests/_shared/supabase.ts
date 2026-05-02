import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export function serviceClient(): SupabaseClient {
  return createClient(url, serviceKey, { auth: { persistSession: false } })
}

export interface TestUser {
  id: string
  email: string
  password: string
  accessToken: string
  client: SupabaseClient // signed-in anon client — exercises RLS correctly
}

export async function createTestUser(opts: { email?: string; password?: string } = {}): Promise<TestUser> {
  const email = opts.email ?? `test-${randomUUID()}@local.test`
  const password = opts.password ?? 'test-password-123'

  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)

  // Create a client and sign in on it so the auth module manages the session in
  // memory. This is the correct pattern for PostgREST RLS — the auth module
  // injects the Bearer token into every request automatically.
  const client = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data: signIn, error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError || !signIn.session) throw new Error(`signIn failed: ${signInError?.message}`)

  return {
    id: data.user.id,
    email,
    password,
    accessToken: signIn.session.access_token,
    client,
  }
}

export async function deleteTestUser(id: string): Promise<void> {
  const { error } = await serviceClient().auth.admin.deleteUser(id)
  if (error) throw new Error(`deleteTestUser failed: ${error.message}`)
}

/** Read raw rows via the service-role client (bypasses RLS). For assertions. */
export async function queryRows<T = Record<string, unknown>>(
  table: string,
  filter: Record<string, unknown>
): Promise<T[]> {
  let query = serviceClient().from(table).select('*')
  for (const [col, val] of Object.entries(filter)) {
    query = query.eq(col, val as string)
  }
  const { data, error } = await query
  if (error) throw new Error(`queryRows(${table}) failed: ${error.message}`)
  return (data ?? []) as T[]
}
