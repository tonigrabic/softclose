#!/usr/bin/env node
/** Delete a brief, its session row and its Storage objects (Storage API — SQL deletes are blocked). */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const line of existsSync(resolve(ROOT, '.env.local')) ? readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}
const ids = process.argv.slice(2)
if (!ids.length) { console.error('usage: node scripts/delete-brief.mjs <briefId> [...]'); process.exit(1) }
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
for (const id of ids) {
  const { data: objs } = await db.storage.from('softclose-media').list(`briefs/${id}`)
  const paths = (objs ?? []).map((o) => `briefs/${id}/${o.name}`)
  if (paths.length) { const { error } = await db.storage.from('softclose-media').remove(paths); if (error) throw error }
  const { data: row } = await db.from('softclose_briefs').select('session_id').eq('id', id).maybeSingle()
  await db.from('softclose_briefs').delete().eq('id', id)
  if (row?.session_id) await db.from('softclose_sessions').delete().eq('id', row.session_id)
  console.log(`> deleted brief ${id} (${paths.length} objects)`)
}
