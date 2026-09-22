#!/usr/bin/env node
/**
 * Maker accounts — add, list, disable, adopt.
 *
 * Invite-only means makers cannot sign themselves up, so this is how they come
 * into existence. It runs from a laptop straight against whatever database
 * .env.local points at, which is production — so it prints the target project
 * ref and asks before writing. Same shape as setup-storage.mjs / delete-brief.mjs.
 *
 * This is also the lockout recovery path. If nobody can sign in, this is the way
 * back: `add` prints a ready-to-use sign-in link, so a maker can be onboarded
 * before Resend is configured at all.
 *
 *   npm run maker -- add --email ana@stolarija.hr --name "Stolarija Ana"
 *   npm run maker -- list
 *   npm run maker -- disable --email ana@stolarija.hr
 *   npm run maker -- adopt --email ana@stolarija.hr   # give them the pre-auth briefs
 *
 * Flags: --yes skips the confirmation, --url <origin> sets the link's origin.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const line of existsSync(resolve(ROOT, '.env.local')) ? readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

// Mirrors src/lib/auth/tokens.ts, which is the source of truth. tests/maker-script
// imports both and asserts they agree, so these cannot drift apart silently.
export const LOGIN_TTL_MS = 15 * 60 * 1000
export function generateRawToken() { return randomBytes(32).toString('base64url') }
export function hashToken(raw) { return createHash('sha256').update(raw).digest('hex') }
export function normalizeEmail(raw) { return String(raw).trim().toLowerCase() }

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const HAS = (name) => process.argv.includes(`--${name}`)

function die(msg) { console.error(msg); process.exit(1) }

async function confirm(question) {
  if (HAS('yes')) return true
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`${question} [y/N] `)
  rl.close()
  return /^y(es)?$/i.test(answer.trim())
}

async function main() {
  const command = process.argv[2]
  if (!command || HAS('help')) {
    die('usage: npm run maker -- <add|list|disable|adopt> [--email x] [--name y] [--url origin] [--yes]')
  }

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) die('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — check .env.local')
  const ref = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? url
  const db = createClient(url, key, { auth: { persistSession: false } })

  if (command === 'list') {
    const { data, error } = await db
      .from('softclose_accounts')
      .select('email, name, status, created_at, last_login_at')
      .eq('role', 'maker')
      .order('created_at', { ascending: true })
    if (error) throw error
    console.log(`> ${ref} — ${data.length} maker(s)`)
    for (const m of data) {
      const seen = m.last_login_at ? `last seen ${m.last_login_at.slice(0, 10)}` : 'never signed in'
      console.log(`  ${m.email.padEnd(32)} ${String(m.status).padEnd(9)} ${m.name ?? ''}  (${seen})`)
    }
    return
  }

  const email = normalizeEmail(arg('email') ?? '')
  if (!email || !email.includes('@')) die('--email is required')

  if (command === 'add') {
    if (!(await confirm(`Add maker ${email} to ${ref}?`))) return console.log('> aborted')
    const { data: existing } = await db
      .from('softclose_accounts').select('id, role, status').eq('email_norm', email).maybeSingle()

    let accountId
    if (existing) {
      if (existing.role !== 'maker') die(`${email} already exists as a ${existing.role} — refusing to change role`)
      const { error } = await db
        .from('softclose_accounts').update({ status: 'active', name: arg('name') ?? undefined }).eq('id', existing.id)
      if (error) throw error
      accountId = existing.id
      console.log(`> ${email} already existed — re-activated`)
    } else {
      const { data, error } = await db
        .from('softclose_accounts')
        .insert({ email, role: 'maker', status: 'active', name: arg('name') ?? null, locale: 'hr-HR' })
        .select('id').single()
      if (error) throw error
      accountId = data.id
      console.log(`> added maker ${email}`)
    }

    // A sign-in link now, so onboarding does not wait on email being wired up.
    const raw = generateRawToken()
    const { error: tErr } = await db.from('softclose_auth_tokens').insert({
      token_hash: hashToken(raw),
      purpose: 'login',
      account_id: accountId,
      redirect_to: '/dashboard',
      expires_at: new Date(Date.now() + LOGIN_TTL_MS).toISOString(),
    })
    if (tErr) throw tErr
    const origin = (arg('url') ?? process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
    console.log(`\n  Sign-in link (valid 15 minutes, single use):\n  ${origin}/auth/verify?token=${encodeURIComponent(raw)}\n`)
    return
  }

  if (command === 'disable') {
    if (!(await confirm(`Disable ${email} on ${ref}? They will be signed out everywhere.`))) return console.log('> aborted')
    // Bumping session_epoch is what actually kills live cookies; status alone
    // would only stop the next sign-in.
    const { data: acct } = await db
      .from('softclose_accounts').select('id, session_epoch').eq('email_norm', email).maybeSingle()
    if (!acct) die(`no account for ${email}`)
    const { error } = await db
      .from('softclose_accounts')
      .update({ status: 'disabled', session_epoch: acct.session_epoch + 1 })
      .eq('id', acct.id)
    if (error) throw error
    await db.from('softclose_auth_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('account_id', acct.id).is('consumed_at', null)
    console.log(`> disabled ${email} and revoked their outstanding links`)
    return
  }

  if (command === 'adopt') {
    // The briefs that predate auth have no owner, so nobody can open them.
    const { data: acct } = await db
      .from('softclose_accounts').select('id').eq('email_norm', email).eq('role', 'maker').maybeSingle()
    if (!acct) die(`no maker account for ${email} — run "add" first`)
    const { count: pCount } = await db
      .from('softclose_projects').select('id', { count: 'exact', head: true }).is('maker_id', null)
    const { count: bCount } = await db
      .from('softclose_briefs').select('id', { count: 'exact', head: true }).is('maker_id', null)
    if (!pCount && !bCount) return console.log('> nothing to adopt')
    if (!(await confirm(`Give ${email} ${pCount} ownerless project(s) and ${bCount} brief(s) on ${ref}?`))) {
      return console.log('> aborted')
    }
    const { error: pErr } = await db.from('softclose_projects').update({ maker_id: acct.id }).is('maker_id', null)
    if (pErr) throw pErr
    const { error: bErr } = await db.from('softclose_briefs').update({ maker_id: acct.id }).is('maker_id', null)
    if (bErr) throw bErr
    console.log(`> ${email} now owns ${pCount} project(s) and ${bCount} brief(s)`)
    return
  }

  die(`unknown command: ${command}`)
}

// Only run as a CLI — the test imports this module for the token helpers.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
