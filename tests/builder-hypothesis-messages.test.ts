/**
 * The hypothesis call reads decor only (IMP-32): one image, the render, plus a
 * few short preference ids. The layout is fixed and measured, so no layout text
 * reaches the model, no anchor photo is sent, and the request never carries the
 * profile's data URLs. These pin the pure message assembly and the hints
 * whitelist the client builds and the server re-checks.
 */
import { describe, expect, test } from 'vitest'
import { buildHypothesisMessages } from '@/app/api/builder-hypothesis/route'
import { decorProfileHints, sanitizeDecorProfileHints } from '@/lib/api/decor-profile-hints'
import type { LeadProfile } from '@/lib/types'

const RENDER = 'data:image/png;base64,RENDER'
const PHOTO = 'data:image/jpeg;base64,PHOTO'

function imageParts(messages: ReturnType<typeof buildHypothesisMessages>) {
  return messages[0].content.filter((p) => p.type === 'image')
}
function textPart(messages: ReturnType<typeof buildHypothesisMessages>) {
  const part = messages[0].content.find((p) => p.type === 'text')
  return part && part.type === 'text' ? part.text : ''
}

describe('buildHypothesisMessages', () => {
  test('one image: the render', () => {
    const messages = buildHypothesisMessages({ renderImage: RENDER, profileSummary: '{}' })
    const images = imageParts(messages)
    expect(images).toHaveLength(1)
    expect(images[0].image).toBe(RENDER)
    expect(textPart(messages)).not.toMatch(/ANCHOR PHOTO/i)
  })

  test("text has no 'FOLLOW THE RENDER' and no 'layout'", () => {
    const messages = buildHypothesisMessages({
      renderImage: RENDER,
      profileSummary: JSON.stringify({ stylePreferences: ['modern'] }),
    })
    const text = textPart(messages)
    expect(text).not.toMatch(/FOLLOW THE RENDER/i)
    expect(text).not.toMatch(/layout/i)
    expect(text).toContain('modern')
  })
})

describe('decorProfileHints', () => {
  const profileWithRenders: LeadProfile = {
    stylePreferences: ['modern', 'scandi'],
    doorMaterial: 'lacquered_mdf',
    worktopPreference: 'quartz',
    backsplashPreference: 'tile',
    appliancesIntegrated: 'integrated',
    spacePhotos: [PHOTO, PHOTO],
    conceptRenders: [
      {
        id: 'r1',
        imageDataUrl: RENDER,
        prompt: 'p',
        modelVersion: 'm',
        anchorPhotoIndex: 0,
        nudges: [],
        inputs: [{ role: 'anchor', imageDataUrl: PHOTO }],
        generatedAt: '2026-10-03T00:00:00.000Z',
      },
    ],
  }

  test('carries no data:image from the profile', () => {
    const hints = decorProfileHints(profileWithRenders)
    expect(JSON.stringify(hints)).not.toContain('data:image')
    expect(hints).toEqual({
      stylePreferences: ['modern', 'scandi'],
      doorMaterial: 'lacquered_mdf',
      worktopPreference: 'quartz',
      backsplashPreference: 'tile',
      appliancesIntegrated: 'integrated',
    })
  })

  test('an empty profile gives empty hints', () => {
    expect(decorProfileHints({} as LeadProfile)).toEqual({})
  })
})

describe('sanitizeDecorProfileHints', () => {
  test('drops unknown keys, data URLs, over-long strings and non-strings; caps the style list at 8', () => {
    const hostile = {
      stylePreferences: [...Array.from({ length: 12 }, (_, i) => `s${i}`), 42, PHOTO],
      doorMaterial: 'x'.repeat(61),
      worktopPreference: PHOTO,
      backsplashPreference: { nested: 'tile' },
      appliancesIntegrated: '  integrated  ',
      layoutContract: { runs: [] },
      profile: { spacePhotos: [PHOTO] },
    }
    const out = sanitizeDecorProfileHints(hostile)
    expect(out).toEqual({
      stylePreferences: ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'],
      appliancesIntegrated: 'integrated',
    })
  })

  test('non-objects give empty hints', () => {
    expect(sanitizeDecorProfileHints(null)).toEqual({})
    expect(sanitizeDecorProfileHints('modern')).toEqual({})
    expect(sanitizeDecorProfileHints(['modern'])).toEqual({})
  })
})
