import 'server-only'
import { supabaseAdmin, TABLES } from '@/lib/db/supabase'
import { normalizeEmail } from './tokens'
import type { Role } from './session'

export type AccountStatus = 'pending' | 'active' | 'disabled'

export interface Account {
  id: string
  email: string
  role: Role
  status: AccountStatus
  name: string | null
  locale: string | null
  sessionEpoch: number
}

const COLUMNS = 'id, email, role, status, name, locale, session_epoch'

interface AccountRow {
  id: string
  email: string
  role: Role
  status: AccountStatus
  name: string | null
  locale: string | null
  session_epoch: number
}

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    name: row.name,
    locale: row.locale,
    sessionEpoch: row.session_epoch,
  }
}

export async function findAccountByEmail(email: string): Promise<Account | null> {
  const db = supabaseAdmin()
  if (!db) return null
  // email_norm is a generated column, so the lookup is case-insensitive without
  // a functional index or a citext extension.
  const { data } = await db.from(TABLES.accounts).select(COLUMNS).eq('email_norm', normalizeEmail(email)).maybeSingle()
  return data ? toAccount(data as AccountRow) : null
}

export async function findAccountById(id: string): Promise<Account | null> {
  const db = supabaseAdmin()
  if (!db) return null
  const { data } = await db.from(TABLES.accounts).select(COLUMNS).eq('id', id).maybeSingle()
  return data ? toAccount(data as AccountRow) : null
}

/**
 * The account a maker's invite creates. `pending` until the link is opened —
 * which is what distinguishes "invited, never showed up" from "signed in once"
 * on the maker's dashboard.
 *
 * Returns the existing account if one already has this email, so inviting the
 * same person twice does not fail; the caller decides whether a second project
 * is allowed.
 */
export async function ensureCustomerAccount(input: {
  email: string
  name?: string | null
  invitedBy: string
  locale?: string | null
}): Promise<Account | null> {
  const db = supabaseAdmin()
  if (!db) return null
  const existing = await findAccountByEmail(input.email)
  if (existing) return existing

  const { data, error } = await db
    .from(TABLES.accounts)
    .insert({
      email: normalizeEmail(input.email),
      role: 'customer',
      status: 'pending',
      name: input.name ?? null,
      locale: input.locale ?? null,
      invited_by: input.invitedBy,
    })
    .select(COLUMNS)
    .single()
  if (error) {
    console.error('[auth] ensureCustomerAccount failed', error.message)
    return null
  }
  return toAccount(data as AccountRow)
}

/** First successful sign-in: pending → active. */
export async function activateAccount(id: string): Promise<void> {
  const db = supabaseAdmin()
  if (!db) return
  await db.from(TABLES.accounts).update({ status: 'active' }).eq('id', id).eq('status', 'pending')
}

export async function touchLastLogin(id: string): Promise<void> {
  const db = supabaseAdmin()
  if (!db) return
  await db.from(TABLES.accounts).update({ last_login_at: new Date().toISOString() }).eq('id', id)
}
