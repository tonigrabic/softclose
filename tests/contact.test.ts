/**
 * Contact now comes in two shapes: a signed-in customer's account email plus
 * an optional phone, or the anonymous funnel's single `contactValue`. Every
 * surface reads it through contactChannels, so these pin that both shapes —
 * and a brief from before sign-in — still show the maker a way to reach them.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { contactChannels, contactPatchChanges } from '@/lib/contact'
import { readbackFor } from '@/components/kitchen-intake/readbacks'

describe('contactChannels', () => {
  test('signed-in customer: email first, then the optional phone', () => {
    expect(contactChannels({ email: 'ana@example.com', phone: ' +385 91 123 4567 ' })).toEqual([
      'ana@example.com',
      '+385 91 123 4567',
    ])
  })

  test('signed-in customer without a phone: just the email', () => {
    expect(contactChannels({ email: 'ana@example.com', phone: '   ' })).toEqual(['ana@example.com'])
  })

  test('anonymous funnel: the single typed value', () => {
    expect(contactChannels({ contactValue: '+385 91 000 0000' })).toEqual(['+385 91 000 0000'])
  })

  test('the new fields win over a stale anonymous value', () => {
    expect(contactChannels({ email: 'ana@example.com', contactValue: 'old@example.com' })).toEqual([
      'ana@example.com',
    ])
  })

  test('nothing captured: no channels', () => {
    expect(contactChannels({})).toEqual([])
  })
})

describe('contact read-back', () => {
  test('name and every channel, in rail order', () => {
    expect(readbackFor('contact', { name: 'Ana', email: 'ana@example.com', phone: '091 123' })).toBe(
      'Ana · ana@example.com · 091 123'
    )
  })

  test('empty until something is captured', () => {
    expect(readbackFor('contact', {})).toBeNull()
  })
})

describe('contactPatchChanges: a pass through the contact step that changes nothing logs no turn', () => {
  const profile = { name: 'Ana', email: 'ana@example.test', phone: undefined, contactValue: undefined }

  test('the same name and channels — a walk back from the review (IMP-07): unchanged', () => {
    expect(contactPatchChanges({ name: 'Ana', email: 'ana@example.test', phone: undefined, contactValue: undefined }, profile)).toBe(false)
    expect(contactPatchChanges({ name: 'Ana', contactValue: 'x' }, { name: 'Ana', contactValue: 'x' })).toBe(false)
  })

  test('a new name, a phone added or removed, another channel: changed', () => {
    expect(contactPatchChanges({ name: 'Anna', email: 'ana@example.test' }, profile)).toBe(true)
    expect(contactPatchChanges({ name: 'Ana', phone: '+385 91 000 0000' }, profile)).toBe(true)
    expect(contactPatchChanges({ name: 'Ana', phone: undefined }, { ...profile, phone: '+385 91 000 0000' })).toBe(true)
    expect(contactPatchChanges({ name: 'Ana', contactValue: 'y' }, { name: 'Ana', contactValue: 'x' })).toBe(true)
  })

  test('the intake logs the contact turn only then', () => {
    const intake = readFileSync(join(__dirname, '..', 'src/components/kitchen-intake/index.tsx'), 'utf8')
    expect(intake).toMatch(/const changed = contactPatchChanges\(patch, profile\)[\s\S]{0,80}if \(changed\) logTurn\('user', `Contact: /)
  })
})
