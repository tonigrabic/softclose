/**
 * Checkpoint payload rules.
 *
 * Two of these guard failures this project has already paid for once:
 *
 *  - Inline images in a request body produced a production 413 on
 *    /api/builder-hypothesis. A checkpoint runs every few seconds, so the same
 *    mistake here would be worse. `stripImages` must leave nothing that starts
 *    with `data:image/` anywhere in the payload, at any depth.
 *  - The React StrictMode double-mount once persisted two briefs per submit.
 *    The same double-fire now means two checkpoints at the same base revision,
 *    one of which must 409. `classifyConflict` is what stops that showing the
 *    customer a scary "another device is editing this" banner on every dev load.
 *
 * And one that guards a claim rather than a crash: the maker's "changed since
 * you got the brief" flag is derived from updated_at, so a write that changes
 * nothing must not happen. That is what the fingerprint is for.
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_CHECKPOINT_BYTES,
  OMITTED_IMAGE,
  classifyConflict,
  nextBackoffMs,
  snapshotFingerprint,
  stripImages,
} from '@/lib/project/checkpoint'

const PNG = 'data:image/png;base64,iVBORw0KGgo='
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

describe('stripImages', () => {
  it('removes an image at any depth, including inside arrays', () => {
    const snapshot = {
      spacePhotos: [PNG, JPG],
      inspirationRefs: [{ id: 'a', imageUrl: PNG, source: 'upload' }],
      conceptRenders: [{ id: 'r1', imageDataUrl: JPG, inputs: [{ role: 'anchor', imageDataUrl: PNG }] }],
      profile: { builderState: { rerenders: [{ imageDataUrl: JPG }] } },
    }
    const out = stripImages(snapshot)
    expect(JSON.stringify(out)).not.toContain('data:image/')
    expect(out.spacePhotos).toEqual([OMITTED_IMAGE, OMITTED_IMAGE])
    expect(out.conceptRenders[0].inputs[0].imageDataUrl).toBe(OMITTED_IMAGE)
    expect(out.profile.builderState.rerenders[0].imageDataUrl).toBe(OMITTED_IMAGE)
  })

  it('keeps the structure intact so nothing downstream sees a missing field', () => {
    const out = stripImages({ conceptRenders: [{ id: 'r1', imageDataUrl: PNG, prompt: 'matte black' }] })
    expect(out.conceptRenders[0].id).toBe('r1')
    expect(out.conceptRenders[0].prompt).toBe('matte black')
    expect(typeof out.conceptRenders[0].imageDataUrl).toBe('string')
  })

  it('leaves everything that is not an inline image alone', () => {
    const snapshot = {
      storageRef: 'storage://softclose-media/projects/x/001.jpg',
      url: 'https://example.com/a.png',
      text: 'a data:image/ mention in the middle of a sentence',
      n: 42,
      flag: true,
      nothing: null,
    }
    expect(stripImages(snapshot)).toEqual(snapshot)
  })

  it('collapses a real snapshot far below the size ceiling', () => {
    // 4 photos at ~400 KB each is an ordinary session and ~2 MB of base64.
    const big = { spacePhotos: Array.from({ length: 4 }, () => `data:image/jpeg;base64,${'A'.repeat(400_000)}`) }
    expect(JSON.stringify(big).length).toBeGreaterThan(MAX_CHECKPOINT_BYTES / 2)
    expect(JSON.stringify(stripImages(big)).length).toBeLessThan(1_000)
  })
})

describe('snapshotFingerprint', () => {
  it('is stable across key order', () => {
    expect(snapshotFingerprint({ a: 1, b: { c: 2, d: 3 } })).toBe(snapshotFingerprint({ b: { d: 3, c: 2 }, a: 1 }))
  })

  it('changes when any value changes', () => {
    const base = { step: 'builder', picks: { door: 'matte' } }
    expect(snapshotFingerprint(base)).not.toBe(snapshotFingerprint({ ...base, step: 'scope' }))
    expect(snapshotFingerprint(base)).not.toBe(snapshotFingerprint({ step: 'builder', picks: { door: 'gloss' } }))
  })

  it('distinguishes array order, which is meaningful for photos and renders', () => {
    expect(snapshotFingerprint({ a: [1, 2] })).not.toBe(snapshotFingerprint({ a: [2, 1] }))
  })

  it('treats an absent key and an undefined value as the same', () => {
    expect(snapshotFingerprint({ a: 1 })).toBe(snapshotFingerprint({ a: 1, b: undefined }))
  })

  it('does not collide on the change that matters most — a different estimate', () => {
    expect(snapshotFingerprint({ low: 12000, high: 16000 })).not.toBe(
      snapshotFingerprint({ low: 14000, high: 19000 })
    )
  })
})

describe('classifyConflict', () => {
  it('treats a 409 carrying our own payload as already applied', () => {
    // StrictMode double-mount, or a retry after a timeout that actually landed.
    expect(classifyConflict('abc123', 'abc123').alreadyApplied).toBe(true)
  })

  it('treats a 409 carrying different content as a real conflict', () => {
    expect(classifyConflict('abc123', 'def456').alreadyApplied).toBe(false)
  })

  it('treats a missing server fingerprint as a real conflict, not a match', () => {
    // Fail towards stopping. Guessing "probably ours" is how you overwrite a
    // second device's work.
    expect(classifyConflict('abc123', null).alreadyApplied).toBe(false)
  })
})

describe('nextBackoffMs', () => {
  it('climbs and then holds', () => {
    expect(nextBackoffMs(0)).toBe(2_000)
    expect(nextBackoffMs(1)).toBe(5_000)
    expect(nextBackoffMs(2)).toBe(15_000)
    expect(nextBackoffMs(3)).toBe(60_000)
    expect(nextBackoffMs(99)).toBe(60_000)
  })
})
