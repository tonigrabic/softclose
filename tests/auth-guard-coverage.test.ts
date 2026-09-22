/**
 * Static guard: every API route checks for a session, and the public-path list
 * is exactly what we think it is.
 *
 * This is the same idea as tests/server-client-boundary — a whole-repo property
 * that unit tests cannot see. The failure it prevents is quiet: someone adds
 * `src/app/api/whatever/route.ts`, forgets the two-line preamble, and ships an
 * endpoint that spends OpenAI credits for anyone who finds it. Nothing goes
 * red, no page breaks, and there is no reason anyone would look.
 *
 * It reads source text rather than importing the routes, because importing them
 * would drag in the AI SDK, the model config and a Supabase client.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PUBLIC_PATHS } from '@/lib/auth/redirect'

const ROOT = resolve(__dirname, '..')
const API_DIR = join(ROOT, 'src', 'app', 'api')
const PROXY = join(ROOT, 'src', 'proxy.ts')

function listRoutes(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listRoutes(full))
    else if (/^route\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const routes = listRoutes(API_DIR)

describe('every API route is guarded', () => {
  it('finds the routes', () => {
    expect(routes.length).toBeGreaterThanOrEqual(7)
  })

  for (const route of routes) {
    const rel = route.replace(ROOT + '/', '')
    it(`${rel} checks the session`, () => {
      const src = readFileSync(route, 'utf8')
      expect(
        /\b(apiAccount|requireProjectAccess|requireBriefAccess|requireMaker|requireCustomer|getSession)\s*\(/.test(src),
        `${rel} has no session check — add \`const session = await apiAccount()\` as the first statement of POST`
      ).toBe(true)
    })

    it(`${rel} answers 401 rather than redirecting`, () => {
      const src = readFileSync(route, 'utf8')
      // redirect() in a route handler sends a fetch() caller an HTML login page,
      // which the intake's readJson() then reports as a parse error.
      expect(/\bredirect\s*\(\s*['"`]\/login/.test(src), `${rel} redirects to /login`).toBe(false)
    })
  }

  it('checks auth before the mock short-circuit', () => {
    // MOCK_AI is a dev convenience; it must not double as a way in.
    for (const route of routes) {
      const src = readFileSync(route, 'utf8')
      const mockAt = src.indexOf('mockAiEnabled()')
      if (mockAt === -1) continue
      const guardAt = src.indexOf('apiAccount()')
      expect(guardAt, `${route.replace(ROOT + '/', '')} has no apiAccount() call`).toBeGreaterThan(-1)
      expect(
        guardAt < mockAt,
        `${route.replace(ROOT + '/', '')} checks mockAiEnabled() before the session`
      ).toBe(true)
    }
  })
})

describe('proxy', () => {
  it('exists and declares a matcher', () => {
    expect(existsSync(PROXY)).toBe(true)
    const src = readFileSync(PROXY, 'utf8')
    expect(src).toMatch(/export const config\s*=/)
    expect(src).toMatch(/matcher/)
  })

  it('answers 401 for unauthenticated API calls instead of redirecting them', () => {
    const src = readFileSync(PROXY, 'utf8')
    expect(src).toContain("pathname.startsWith('/api/')")
    expect(src).toMatch(/status:\s*401/)
  })

  it('is at src/proxy.ts — Next 16 renamed middleware, and a stray middleware.ts does nothing', () => {
    expect(existsSync(join(ROOT, 'src', 'middleware.ts'))).toBe(false)
    expect(existsSync(join(ROOT, 'middleware.ts'))).toBe(false)
  })
})

describe('public paths', () => {
  it('is exactly the three routes that must work signed out', () => {
    // Anything added here is reachable by anyone on the internet. Changing this
    // list should be a deliberate act, not a side effect.
    expect([...PUBLIC_PATHS]).toEqual(['/login', '/auth/verify', '/logout'])
  })
})
