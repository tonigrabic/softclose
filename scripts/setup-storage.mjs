#!/usr/bin/env node
/** One-time: create the private media bucket. Idempotent. */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const line of existsSync(resolve(ROOT, '.env.local')) ? readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: buckets } = await db.storage.listBuckets()
if (buckets?.some((b) => b.name === 'softclose-media')) { console.log('> bucket softclose-media exists'); process.exit(0) }
const { error } = await db.storage.createBucket('softclose-media', { public: false, fileSizeLimit: '10MB', allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] })
if (error) { console.error(error); process.exit(1) }
console.log('> created private bucket softclose-media')
