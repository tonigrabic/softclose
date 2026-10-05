/**
 * IMP-09 Done-when: the EGGER decor images are off in production unless
 * someone deliberately turns them on.
 *
 * The swatches hotlink EGGER's CDN, and the owner's own note says that is for
 * testing only until EGGER gives permission (Toni, 2026-09-26). It used to be
 * a compile-time `const = true`, so a production deploy shipped the hotlinks
 * with nothing to stop it. Now only `NEXT_PUBLIC_DECOR_IMAGES=1` turns them
 * on; unset, every decor is its colour tile.
 *
 * The flag is read when the module loads, so each case stubs the env, resets
 * the module registry and imports afresh.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import decorImages from '@/lib/catalog/decor-images.json'

/** A decor the manifest has an image for — "W960 ST7" → code + structure. */
const [CODE, STRUCTURE] = Object.keys(decorImages.images)[0].split(' ')

async function loadSwatches(env: { NODE_ENV?: string; NEXT_PUBLIC_DECOR_IMAGES?: string | undefined }) {
  if (env.NODE_ENV) vi.stubEnv('NODE_ENV', env.NODE_ENV)
  vi.stubEnv('NEXT_PUBLIC_DECOR_IMAGES', env.NEXT_PUBLIC_DECOR_IMAGES)
  vi.resetModules()
  return import('@/lib/builder/swatches')
}

async function renderSwatch(flag: string | undefined) {
  vi.stubEnv('NEXT_PUBLIC_DECOR_IMAGES', flag)
  vi.resetModules()
  const { DecorSwatch } = await import('@/components/builder/DecorSwatch')
  return renderToStaticMarkup(createElement(DecorSwatch, { code: CODE, structure: STRUCTURE }))
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('DECOR_IMAGES_ENABLED', () => {
  test('production with the variable unset: off, and the swatch has no image', async () => {
    const m = await loadSwatches({ NODE_ENV: 'production', NEXT_PUBLIC_DECOR_IMAGES: undefined })
    expect(m.DECOR_IMAGES_ENABLED).toBe(false)
    const swatch = m.decorSwatch(CODE, STRUCTURE)
    expect(swatch).not.toBeNull()
    expect(swatch!.imagePath).toBeNull()
    expect(swatch!.hexHint).toMatch(/^#/)
  })

  test('development with the variable unset: still off — off by default everywhere', async () => {
    const m = await loadSwatches({ NODE_ENV: 'development', NEXT_PUBLIC_DECOR_IMAGES: undefined })
    expect(m.DECOR_IMAGES_ENABLED).toBe(false)
    expect(m.decorSwatch(CODE, STRUCTURE)!.imagePath).toBeNull()
  })

  test("'1' turns the EGGER images on", async () => {
    const m = await loadSwatches({ NEXT_PUBLIC_DECOR_IMAGES: '1' })
    expect(m.DECOR_IMAGES_ENABLED).toBe(true)
    expect(m.decorSwatch(CODE, STRUCTURE)!.imagePath).toMatch(/^https:\/\/cdn\.egger\.com\//)
  })

  test.each(['true', '0', 'yes', ' 1', ''])("%j does not — only the exact '1' does", async (value) => {
    const m = await loadSwatches({ NEXT_PUBLIC_DECOR_IMAGES: value })
    expect(m.DECOR_IMAGES_ENABLED).toBe(false)
  })
})

describe('DecorSwatch', () => {
  test('on: the image is fetched with no referrer', async () => {
    const html = await renderSwatch('1')
    expect(html).toMatch(/<img[^>]*referrerpolicy="no-referrer"/i)
    expect(html).toContain('cdn.egger.com')
  })

  test('off: no image at all, the colour tile instead', async () => {
    const html = await renderSwatch(undefined)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('egger')
    expect(html).toContain('background-color')
  })

  test('every <img> in the component carries referrerPolicy="no-referrer"', () => {
    const src = readFileSync(join(__dirname, '..', 'src/components/builder/DecorSwatch.tsx'), 'utf8')
    const imgs = [...src.matchAll(/<img\b[\s\S]*?\/>/g)].map((m) => m[0])
    expect(imgs.length).toBeGreaterThan(0)
    for (const tag of imgs) expect(tag).toContain('referrerPolicy="no-referrer"')
  })
})
