/**
 * Sending a brief must be repeatable. The wrap-up used to decide "first
 * submit?" from a prop read once at page load, so any remount of it within the
 * same page session inserted another brief and emailed the maker again. The id
 * is now minted at submit and the server keys the brief on it; these pin the
 * decision the route makes with it.
 */
import { describe, expect, test } from 'vitest'
import { decideBriefId, isBriefId, mintBriefId } from '@/lib/handoff/brief-id'

const PROJECT = '7d30c5d0-cd78-4dfb-b433-f6e817ee51c5'
const OTHER = 'ee721c72-0fdf-4b2d-9fa8-88f837430a4a'
const fresh = () => 'server-minted'

describe('decideBriefId', () => {
  test('a first send creates the brief under the id the client minted', () => {
    const id = mintBriefId()
    expect(decideBriefId(id, null, PROJECT, fresh)).toEqual({ kind: 'create', id })
  })

  test('the same send again — a remount, a retry — reuses the brief it made', () => {
    const id = mintBriefId()
    expect(decideBriefId(id, { projectId: PROJECT }, PROJECT, fresh)).toEqual({ kind: 'reuse', id })
  })

  test("an id held by another project is refused, never handed back", () => {
    const id = mintBriefId()
    expect(decideBriefId(id, { projectId: OTHER }, PROJECT, fresh)).toEqual({ kind: 'reject' })
    // Ownerless (legacy) briefs cannot be matched to anyone either.
    expect(decideBriefId(id, { projectId: null }, null, fresh)).toEqual({ kind: 'reject' })
  })

  test('no usable id (an older client, or junk) falls back to a server-minted one', () => {
    expect(decideBriefId(undefined, null, PROJECT, fresh)).toEqual({ kind: 'create', id: 'server-minted' })
    expect(decideBriefId("x'; drop table", null, PROJECT, fresh)).toEqual({ kind: 'create', id: 'server-minted' })
  })
})

describe('mintBriefId', () => {
  test('mints distinct v4 UUIDs the uuid primary key accepts', () => {
    const ids = new Set(Array.from({ length: 50 }, mintBriefId))
    expect(ids.size).toBe(50)
    expect([...ids].every(isBriefId)).toBe(true)
  })
})
