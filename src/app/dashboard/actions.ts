'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { ensureCustomerAccount } from '@/lib/auth/accounts'
import { requireMaker } from '@/lib/auth/dal'
import { issueToken, recentTokenCount, revokeOpenInvites } from '@/lib/auth/magic-link'
import { createProject } from '@/lib/auth/projects'
import { isEmail, magicLinkUrl, maskEmail, normalizeEmail } from '@/lib/auth/tokens'
import { buildInviteEmail } from '@/lib/notify/auth-email'
import { sendEmail } from '@/lib/notify/send'
import { supabaseAdmin, TABLES } from '@/lib/db/supabase'

export interface InviteState {
  status: 'idle' | 'created' | 'error'
  /** Always returned, and always shown. The maker is the issuer, so unlike a
   *  login link there is nothing to protect here — and Croatian trades send
   *  links over WhatsApp. Email is the convenience, not the mechanism. */
  link?: string
  customerName?: string
  emailed?: boolean
  message?: string
}

const MAX_INVITES_PER_DAY = 20
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Create an invite: a pending customer account, the one project it opens into,
 * and the magic link that is both.
 *
 * `requireMaker()` is called here and not merely relied upon from the proxy —
 * a Server Action POSTs to whatever route hosts it, and Next's own docs warn
 * that matcher changes can take such a POST out of the proxy's coverage.
 */
export async function inviteCustomer(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const session = await requireMaker()

  const rawEmail = String(formData.get('email') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const email = normalizeEmail(rawEmail)

  if (!isEmail(email)) return { status: 'error', message: 'invalidEmail' }
  if (email === normalizeEmail(session.email)) return { status: 'error', message: 'selfInvite' }

  const db = supabaseAdmin()
  if (!db) return { status: 'error', message: 'unavailable' }

  const sentToday = await recentTokenCount(session.accountId, 'invite', DAY_MS)
  if (sentToday >= MAX_INVITES_PER_DAY) return { status: 'error', message: 'tooMany' }

  const customer = await ensureCustomerAccount({
    email,
    name: name || null,
    invitedBy: session.accountId,
    locale: session.locale,
  })
  if (!customer) return { status: 'error', message: 'unavailable' }
  // An existing maker cannot be invited as somebody's customer.
  if (customer.role !== 'customer') return { status: 'error', message: 'notACustomer' }

  const project = await createProject({
    makerId: session.accountId,
    customerId: customer.id,
    title: name || customer.email,
    locale: session.locale,
  })
  if (!project) return { status: 'error', message: 'unavailable' }

  // One live invite per project: a superseded link must stop working.
  await revokeOpenInvites(project.id)

  const issued = await issueToken({
    accountId: customer.id,
    purpose: 'invite',
    projectId: project.id,
    issuedBy: session.accountId,
    redirectTo: `/kitchen/${project.id}`,
  })
  if (!issued) return { status: 'error', message: 'unavailable' }

  const h = await headers()
  const origin = process.env.APP_URL?.replace(/\/$/, '') || `https://${h.get('host') ?? 'localhost:3000'}`
  const url = magicLinkUrl(origin, issued.raw)

  const mail = buildInviteEmail({
    url,
    makerName: session.name ?? session.email,
    customerName: name || null,
  })
  const result = await sendEmail({ to: customer.email, ...mail })
  console.info('[auth] invite created', maskEmail(email), result.provider, result.outcome)

  revalidatePath('/dashboard')
  return { status: 'created', link: url, customerName: name || customer.email, emailed: result.ok }
}

export interface ResendState {
  status: 'idle' | 'created' | 'error'
  link?: string
  projectId?: string
  emailed?: boolean
  message?: string
}

/** A fresh link for a project whose invite was lost or expired. Revokes the old one. */
export async function resendInvite(_prev: ResendState, formData: FormData): Promise<ResendState> {
  const session = await requireMaker()
  const projectId = String(formData.get('projectId') ?? '')

  const db = supabaseAdmin()
  if (!db) return { status: 'error', message: 'unavailable' }

  const { data } = await db
    .from(TABLES.projects)
    .select('id, customer_id, title, maker_id')
    .eq('id', projectId)
    .maybeSingle()
  // Not ours, or not there: one answer for both, so this cannot be used to
  // discover which project ids exist.
  if (!data || data.maker_id !== session.accountId || !data.customer_id) {
    return { status: 'error', message: 'unavailable' }
  }

  const { data: customer } = await db
    .from(TABLES.accounts)
    .select('email, name')
    .eq('id', data.customer_id)
    .maybeSingle()
  if (!customer) return { status: 'error', message: 'unavailable' }

  await revokeOpenInvites(projectId)
  const issued = await issueToken({
    accountId: data.customer_id as string,
    purpose: 'invite',
    projectId,
    issuedBy: session.accountId,
    redirectTo: `/kitchen/${projectId}`,
  })
  if (!issued) return { status: 'error', message: 'unavailable' }

  const h = await headers()
  const origin = process.env.APP_URL?.replace(/\/$/, '') || `https://${h.get('host') ?? 'localhost:3000'}`
  const url = magicLinkUrl(origin, issued.raw)
  const mail = buildInviteEmail({
    url,
    makerName: session.name ?? session.email,
    customerName: (customer.name as string | null) ?? null,
  })
  const result = await sendEmail({ to: customer.email as string, ...mail })

  revalidatePath('/dashboard')
  return { status: 'created', link: url, projectId, emailed: result.ok }
}
