/**
 * Static guard: every API route checks for a session, every server action
 * outside the public pages calls a DAL guard, and the public-path list is
 * exactly what we think it is.
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
import { isPublicPath, PUBLIC_PATHS } from '@/lib/auth/redirect'

const ROOT = resolve(__dirname, '..')
const APP_DIR = join(ROOT, 'src', 'app')
const API_DIR = join(APP_DIR, 'api')
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

/** `actions.ts` files under src/app that declare `'use server'` at the top. */
function listActionFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listActionFiles(full))
    else if (/^actions\.tsx?$/.test(entry) && /^\s*['"]use server['"]/.test(readFileSync(full, 'utf8'))) out.push(full)
  }
  return out
}

/** The route an action file sits under, with route groups and the file dropped. */
function routeOf(file: string): string {
  const segments = file
    .slice(APP_DIR.length + 1)
    .split('/')
    .slice(0, -1)
    .filter((s) => !/^\(.*\)$/.test(s))
  return '/' + segments.join('/')
}

const actionFiles = listActionFiles(APP_DIR)

describe('every server action outside the public pages is guarded', () => {
  // A Server Action is a POST endpoint reachable directly, with any arguments,
  // whatever page imports it. The page's own guard does not run on that POST,
  // so each exported action must call a DAL guard itself. Login and verify are
  // the exception by definition: they are how a signed-out person gets in.
  it('finds the actions', () => {
    expect(actionFiles.length).toBeGreaterThanOrEqual(3)
  })

  for (const file of actionFiles) {
    const rel = file.replace(ROOT + '/', '')
    if (isPublicPath(routeOf(file))) continue

    const src = readFileSync(file, 'utf8')
    const starts = [...src.matchAll(/export\s+async\s+function\s+(\w+)/g)]

    it(`${rel} exports at least one action`, () => {
      expect(starts.length).toBeGreaterThan(0)
    })

    starts.forEach((m, i) => {
      const body = src.slice(m.index, starts[i + 1]?.index ?? src.length)
      it(`${rel} → ${m[1]} calls a DAL guard`, () => {
        expect(
          /\brequire(Session|Maker|Customer|BriefAccess|ProjectAccess)\s*\(/.test(body),
          `${m[1]} in ${rel} has no requireSession/requireMaker/requireCustomer/requireBriefAccess/requireProjectAccess call`
        ).toBe(true)
      })
    })
  }
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
