import { describe, expect, test } from 'vitest'
import { collectMediaRefs, offloadMedia, resolveMedia } from '@/lib/db/media'

const PNG = 'data:image/png;base64,' + Buffer.from('fakepng').toString('base64')
const JPG = 'data:image/jpeg;base64,' + Buffer.from('fakejpg').toString('base64')

describe('media offload', () => {
  test('replaces every data URL with a storage ref, uploading each distinct image once', async () => {
    const uploads: Array<{ path: string; type: string; size: number }> = []
    const input = {
      brief: { spacePhotos: [JPG, JPG], conceptRenders: [{ id: 'r1', imageDataUrl: PNG, inputs: [{ role: 'anchor', imageDataUrl: JPG }] }], name: 'x' },
      note: 'https://not-a-data-url',
    }
    const { value, count, bytes } = await offloadMedia(input, 'briefs/abc', async (path, b, type) => {
      uploads.push({ path, type, size: b.byteLength })
    })
    expect(count).toBe(2) // JPG once, PNG once
    expect(bytes).toBe(7 + 7)
    expect(uploads.map((u) => u.path)).toEqual(['briefs/abc/001.jpg', 'briefs/abc/002.png'])
    expect(value.brief.spacePhotos[0]).toBe('storage://softclose-media/briefs/abc/001.jpg')
    expect(value.brief.spacePhotos[1]).toBe(value.brief.spacePhotos[0])
    expect(value.brief.conceptRenders[0].imageDataUrl).toBe('storage://softclose-media/briefs/abc/002.png')
    expect(value.brief.conceptRenders[0].inputs[0].imageDataUrl).toBe(value.brief.spacePhotos[0])
    expect(value.note).toBe('https://not-a-data-url')
    expect(value.brief.name).toBe('x')
  })

  test('collect + resolve swap refs for signed urls and leave everything else alone', async () => {
    const stored = { a: 'storage://softclose-media/briefs/abc/001.jpg', b: ['storage://softclose-media/briefs/abc/002.png', 'plain'], c: 3 }
    expect([...collectMediaRefs(stored)]).toEqual(['briefs/abc/001.jpg', 'briefs/abc/002.png'])
    const out = await resolveMedia(stored, async (paths) => Object.fromEntries(paths.map((p) => [p, `https://signed/${p}`])))
    expect(out.a).toBe('https://signed/briefs/abc/001.jpg')
    expect(out.b).toEqual(['https://signed/briefs/abc/002.png', 'plain'])
    expect(out.c).toBe(3)
  })

  test('no-op without data urls or refs', async () => {
    const plain = { x: 1, y: ['a'] }
    expect((await offloadMedia(plain, 'p', async () => {})).count).toBe(0)
    expect(await resolveMedia(plain, async () => ({}))).toEqual(plain)
  })
})
