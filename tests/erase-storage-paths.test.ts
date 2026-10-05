/**
 * Static guard for "Izbriši moju kuhinju" (IMP-09): the erase only reaches the
 * Storage objects it knows the path of.
 *
 * lib/project/erase lists `briefs/<briefId>/` for each brief of the project —
 * the one path the app writes today (the handoff's offloadMedia). A new
 * Storage write somewhere else (a project-level folder for checkpoint photos,
 * say) would leave a homeowner's photos behind after they deleted their
 * kitchen, and nothing would go red. So: every Storage write is pinned here,
 * and adding one means teaching erase.ts about it first.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const ROOT = resolve(__dirname, '..')
const SRC = join(ROOT, 'src')

function listSources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listSources(full))
    else if (/\.(ts|tsx|mjs|js)$/.test(entry)) out.push(full)
  }
  return out
}

const sources = listSources(SRC).map((file) => ({
  rel: file.replace(ROOT + '/', ''),
  src: readFileSync(file, 'utf8'),
}))

describe('every Storage path the app writes is one erase knows', () => {
  test('offloadMedia is only ever called with `briefs/${briefId}`', () => {
    // `offloadMedia(` followed by its arguments; the definition
    // (`offloadMedia<T>(`) does not match, so only calls are collected.
    const calls = sources.flatMap(({ rel, src }) =>
      [...src.matchAll(/\boffloadMedia\s*\(([^)]*)\)/g)].map((m) => ({ rel, args: m[1] }))
    )
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) {
      const prefix = c.args.split(',')[1]?.trim()
      expect(prefix, `${c.rel} offloads to ${prefix}`).toBe('`briefs/${briefId}`')
    }
  })

  test('.storage.from( appears only in the media module and the erase', () => {
    const users = sources.filter(({ src }) => /\.storage\s*\.from\s*\(/.test(src)).map(({ rel }) => rel)
    expect(users.sort()).toEqual(['src/lib/db/media.ts', 'src/lib/project/erase.ts'])
  })

  test('media.ts writes only through the uploader offloadMedia drives', () => {
    const media = sources.find((s) => s.rel === 'src/lib/db/media.ts')!.src
    expect([...media.matchAll(/\.upload\s*\(/g)]).toHaveLength(1)
    expect(media).not.toMatch(/\.(move|copy)\s*\(/)
  })
})
