/**
 * Env loading for the CLI scripts, and the one place that decides which
 * database they talk to.
 *
 * Default is `.env.local`, which points at PRODUCTION — that is deliberate and
 * unchanged: the scrapers and the maker command are admin tools meant to act on
 * the real project. Pass `--local` to load `.env.development.local` instead and
 * work against the `supabase start` stack.
 *
 * Anything already in process.env wins over both, so a one-off override still
 * works: SUPABASE_URL=… node scripts/whatever.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function loadEnv({ local = process.argv.includes('--local') } = {}) {
  const file = resolve(ROOT, local ? '.env.development.local' : '.env.local')
  if (!existsSync(file)) {
    throw new Error(`${file} not found${local ? ' — run `supabase start` first' : ''}`)
  }
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
  return { file, local }
}

/** Human-readable name for the target, so a script can say where it is about to write. */
export function targetLabel(url = process.env.SUPABASE_URL) {
  if (!url) return 'unknown'
  if (/127\.0\.0\.1|localhost/.test(url)) return 'LOCAL'
  return url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? url
}
