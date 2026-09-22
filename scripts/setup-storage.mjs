#!/usr/bin/env node
/** One-time: create the private media bucket. Idempotent. Pass --local for the `supabase start` stack. */
import { createClient } from '@supabase/supabase-js'
import { loadEnv, targetLabel } from './_env.mjs'
loadEnv()
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: buckets } = await db.storage.listBuckets()
if (buckets?.some((b) => b.name === 'softclose-media')) { console.log(`> bucket softclose-media exists on ${targetLabel()}`); process.exit(0) }
const { error } = await db.storage.createBucket('softclose-media', { public: false, fileSizeLimit: '10MB', allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] })
if (error) { console.error(error); process.exit(1) }
console.log('> created private bucket softclose-media')
