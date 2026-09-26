import 'server-only'
import { supabaseAdmin, TABLES } from '@/lib/db/supabase'
import { safeNextPath } from './redirect'
import {
  classifyConsume,
  expiryFor,
  generateToken,
  hashToken,
  type ConsumeVerdict,
  type TokenPurpose,
} from './tokens'

export interface IssuedToken {
  /** The raw token — goes in the email and nowhere else. Never stored. */
  raw: string
  expiresAt: Date
}

export async function issueToken(input: {
  accountId: string
  purpose: TokenPurpose
  projectId?: string | null
  issuedBy?: string | null
  /** Validated here, at issue time, and stored — so the emailed URL has no
   *  redirect parameter for anyone to rewrite. */
  redirectTo?: string | null
}): Promise<IssuedToken | null> {
  const db = supabaseAdmin()
  if (!db) return null
  const { raw, hash } = generateToken()
  const expiresAt = expiryFor(input.purpose)
  const { error } = await db.from(TABLES.authTokens).insert({
    token_hash: hash,
    purpose: input.purpose,
    account_id: input.accountId,
    project_id: input.projectId ?? null,
    issued_by: input.issuedBy ?? null,
    redirect_to: input.redirectTo ? safeNextPath(input.redirectTo, '') || null : null,
    expires_at: expiresAt.toISOString(),
  })
  if (error) {
    console.error('[auth] issueToken failed', error.message)
    return null
  }
  return { raw, expiresAt }
}

export interface ConsumedToken {
  verdict: ConsumeVerdict
  accountId?: string
  projectId?: string | null
  purpose?: TokenPurpose
  redirectTo?: string | null
}

/**
 * Claim a token, once.
 *
 * The claim is a single conditional UPDATE rather than a read followed by a
 * write: two tabs opening the same link race inside Postgres, where exactly one
 * of them can match `consumed_at is null`. A read-then-write would let both
 * through.
 *
 * When nothing matches we read the row again purely to say *why* — for the log.
 * The caller shows one identical screen for every failure, because telling
 * someone "already used" rather than "not a real link" is a small oracle.
 */
export async function consumeToken(raw: string): Promise<ConsumedToken> {
  const db = supabaseAdmin()
  if (!db) return { verdict: 'invalid' }
  const hash = hashToken(raw)
  const nowIso = new Date().toISOString()

  const { data: claimed } = await db
    .from(TABLES.authTokens)
    .update({ consumed_at: nowIso })
    .eq('token_hash', hash)
    .is('consumed_at', null)
    .is('revoked_at', null)
    .gt('expires_at', nowIso)
    .select('account_id, project_id, purpose, redirect_to')
    .maybeSingle()

  if (claimed) {
    return {
      verdict: 'ok',
      accountId: claimed.account_id as string,
      projectId: (claimed.project_id as string | null) ?? null,
      purpose: claimed.purpose as TokenPurpose,
      redirectTo: (claimed.redirect_to as string | null) ?? null,
    }
  }

  const { data: row } = await db
    .from(TABLES.authTokens)
    .select('account_id, project_id, purpose, redirect_to, expires_at, consumed_at, revoked_at')
    .eq('token_hash', hash)
    .maybeSingle()

  const verdict = classifyConsume(
    row
      ? {
          expires_at: row.expires_at as string,
          consumed_at: (row.consumed_at as string | null) ?? null,
          revoked_at: (row.revoked_at as string | null) ?? null,
        }
      : null
  )

  // 'grace' is a just-consumed token: a mail scanner that prefetched the link,
  // a double submit, two tabs. They held the link, so re-honouring it for a
  // couple of minutes grants nothing they did not already have.
  if (verdict === 'grace' && row) {
    return {
      verdict,
      accountId: row.account_id as string,
      projectId: (row.project_id as string | null) ?? null,
      purpose: row.purpose as TokenPurpose,
      redirectTo: (row.redirect_to as string | null) ?? null,
    }
  }
  return { verdict }
}

/** Issuing a fresh invite kills the open ones, so an old link cannot be used later. */
export async function revokeOpenInvites(projectId: string): Promise<void> {
  const db = supabaseAdmin()
  if (!db) return
  await db
    .from(TABLES.authTokens)
    .update({ revoked_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .eq('purpose', 'invite')
    .is('consumed_at', null)
    .is('revoked_at', null)
}

/**
 * How many tokens of this purpose we issued for this account recently.
 *
 * This is the mail-bombing limit, and it lives in the database on purpose: the
 * in-memory limiter in lib/rate-limit.ts is per-Vercel-instance, so it counts
 * almost nothing across a fleet. A row per send does not have that problem.
 */
export async function recentTokenCount(accountId: string, purpose: TokenPurpose, windowMs: number): Promise<number> {
  const db = supabaseAdmin()
  if (!db) return 0
  const since = new Date(Date.now() - windowMs).toISOString()
  const { count } = await db
    .from(TABLES.authTokens)
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('purpose', purpose)
    .gte('created_at', since)
  return count ?? 0
}
