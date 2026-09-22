/**
 * Server-only Supabase admin client.
 *
 * Uses the service-role key, so this module must NEVER be imported from a
 * client component (tests/server-client-boundary guards the other direction;
 * the env var has no NEXT_PUBLIC_ prefix so the bundler can't leak it).
 *
 * Returns null when the env is missing so every caller degrades to the
 * pre-database behaviour (in-memory bundle, JSON download) instead of 500ing —
 * the funnel must keep working on a laptop with no DB configured.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null | undefined

export function supabaseAdmin(): SupabaseClient | null {
  if (cached !== undefined) return cached
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    cached = null
    return cached
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'softclose' } },
  })
  return cached
}

export function dbEnabled(): boolean {
  return supabaseAdmin() !== null
}

/** Table names live in one place (dedicated Supabase project "softclose", ref elowaiqwadmazwchzaft). */
export const TABLES = {
  /** One customer's one kitchen. Renamed from softclose_sessions in 0004 —
   *  "session" already meant three other things in this codebase. */
  projects: 'softclose_projects',
  briefs: 'softclose_briefs',
  accounts: 'softclose_accounts',
  authTokens: 'softclose_auth_tokens',
  products: 'softclose_products',
  priceHistory: 'softclose_price_history',
} as const
