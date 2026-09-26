/**
 * Guard, both directions:
 *  1. No server-side module — API route handlers, the proxy, the auth data
 *     access layer — may transitively import a module marked 'use client'.
 *  2. No 'use client' module may import the Supabase admin client, which holds
 *     the service-role key. There is no anon key in this app, so a client
 *     module reaching src/lib/db/supabase.ts is not a degraded query; it is a
 *     full-access credential heading for the browser bundle.
 *
 * Why this exists: /api/handoff returned 500 on the very last step of the real
 * funnel ("Attempted to call tDynamic() from the server but tDynamic is on the
 * client") while 131 unit tests were green — vitest doesn't enforce the
 * React Server Components boundary, so only a static walk of the import graph
 * can catch it before a browser does.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
const SRC = join(ROOT, 'src')
const API_DIR = join(SRC, 'app', 'api')
const AUTH_DIR = join(SRC, 'lib', 'auth')
const PROXY = join(SRC, 'proxy.ts')
const SUPABASE_MODULE = join(SRC, 'lib', 'db', 'supabase.ts')

const IMPORT_RE = /^\s*(?:import|export)\s+(?!type\s)[^'"]*?\s+from\s+['"]([^'"]+)['"]/gm
const SIDE_EFFECT_IMPORT_RE = /^\s*import\s+['"]([^'"]+)['"]/gm

function listRoutes(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listRoutes(full))
    else if (/^route\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

function listSources(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listSources(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

function resolveImport(spec: string, fromFile: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
  else return null // node_modules / bare specifiers — out of scope
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return null
}

function isClientModule(file: string): boolean {
  const head = readFileSync(file, 'utf8').slice(0, 2000)
  return /^\s*['"]use client['"]\s*;?\s*$/m.test(head)
}

function walk(file: string, seen: Map<string, string[]>, trail: string[]): void {
  if (seen.has(file)) return
  seen.set(file, trail)
  const src = readFileSync(file, 'utf8')
  const specs = new Set<string>()
  for (const m of src.matchAll(IMPORT_RE)) specs.add(m[1])
  for (const m of src.matchAll(SIDE_EFFECT_IMPORT_RE)) specs.add(m[1])
  for (const spec of specs) {
    const target = resolveImport(spec, file)
    if (target && /\.(ts|tsx)$/.test(target)) walk(target, seen, [...trail, file])
  }
}

function clientModulesReachableFrom(entry: string): string[] {
  const seen = new Map<string, string[]>()
  walk(entry, seen, [])
  return [...seen.entries()]
    .filter(([file]) => isClientModule(file))
    .map(([file, trail]) => [...trail, file].map((f) => f.replace(ROOT + '/', '')).join('\n    -> '))
}

describe('server/client boundary', () => {
  // The proxy is the worst place to get this wrong: it runs on EVERY request,
  // so one bad import 500s the whole app rather than a single route.
  const serverEntries = [...listRoutes(API_DIR), ...listSources(AUTH_DIR), ...(existsSync(PROXY) ? [PROXY] : [])]

  it('finds the API routes', () => {
    expect(listRoutes(API_DIR).length).toBeGreaterThan(0)
  })

  for (const entry of serverEntries) {
    it(`${entry.replace(ROOT + '/', '')} never reaches a 'use client' module`, () => {
      const offenders = clientModulesReachableFrom(entry)
      expect(offenders, `client modules reachable from server code:\n${offenders.join('\n\n')}`).toEqual([])
    })
  }

  it("no 'use client' module imports the service-role Supabase client", () => {
    const offenders = listSources(SRC)
      .filter(isClientModule)
      .filter((file) => {
        const src = readFileSync(file, 'utf8')
        const specs = new Set<string>()
        for (const m of src.matchAll(IMPORT_RE)) specs.add(m[1])
        for (const m of src.matchAll(SIDE_EFFECT_IMPORT_RE)) specs.add(m[1])
        return [...specs].some((spec) => resolveImport(spec, file) === SUPABASE_MODULE)
      })
      .map((f) => f.replace(ROOT + '/', ''))
    expect(offenders, `client modules importing the service-role client:\n${offenders.join('\n')}`).toEqual([])
  })
})
