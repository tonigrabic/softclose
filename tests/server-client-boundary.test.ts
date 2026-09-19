/**
 * Guard: no server-side module (API route handlers) may transitively import a
 * module marked 'use client'.
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

describe('server/client boundary', () => {
  const routes = listRoutes(API_DIR)

  it('finds the API routes', () => {
    expect(routes.length).toBeGreaterThan(0)
  })

  for (const route of routes) {
    it(`${route.replace(ROOT + '/', '')} never reaches a 'use client' module`, () => {
      const seen = new Map<string, string[]>()
      walk(route, seen, [])
      const offenders = [...seen.entries()]
        .filter(([file]) => isClientModule(file))
        .map(([file, trail]) => [...trail, file].map((f) => f.replace(ROOT + '/', '')).join('\n    -> '))
      expect(offenders, `client modules reachable from a route:\n${offenders.join('\n\n')}`).toEqual([])
    })
  }
})
