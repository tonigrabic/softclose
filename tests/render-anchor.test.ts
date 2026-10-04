/**
 * IMP-32: which space photo the concept render stands in.
 *
 * The anchor is the widest shot of the kitchen (vision ranks, the homeowner
 * can override), the other photos go along as "same room, other position",
 * and "Prikaži drugi zid" renders from the photo that shows the kitchen walls
 * the anchor leaves out — hidden when the anchor already shows them all.
 *
 * Views come from the mock photo read through the real normaliser, and the
 * kitchen walls from the measured mock room, so the test reads the same data
 * the render step does.
 */
import { describe, expect, test } from 'vitest'
import { mockSpaceVision, MOCK_SPACE_VISION } from '@/lib/api/mock-fixtures/space-vision'
import {
  normalizeVisionRead,
  roomPlanFromVision,
  validate,
  withMeasuredWall,
  workingPlanFromRoom,
} from '@/lib/floor-plan'
import {
  defaultAnchorIndex,
  isUsablePhoto,
  otherSidePhotoIndex,
  rankAnchorPhotos,
  roomReferenceIndices,
  viewFor,
} from '@/lib/render/anchor'
import { roomConstraintsFor } from '@/lib/render/room-constraints'
import type { PhotoView, WallSide } from '@/lib/types'

const OMITTED = 'omitted://image'
const photo = (n: number) => `data:image/jpeg;base64,PHOTO${n}`
const PHOTOS = [photo(1), photo(2), photo(3), photo(4)]

/** Mock views: 0 faces A (top), 1 faces D (left), 2 faces C (bottom, the window wall), 3 the A–D corner. */
const VIEWS: PhotoView[] = normalizeVisionRead(mockSpaceVision(4), 4).photoViews!

/** The kitchen walls of the measured mock L, as the render step gets them. */
function planWalls(): WallSide[] {
  let room = roomPlanFromVision(MOCK_SPACE_VISION)!
  room = withMeasuredWall(room, 'top', 420, { hasPhotos: true })
  room = validate(withMeasuredWall(room, 'left', 300, { hasPhotos: true }))
  const c = roomConstraintsFor({ plan: workingPlanFromRoom(room, 'keep'), existing: room, intent: 'keep', existingRoom: 'kitchen' })
  return c!.counterWalls.map((w) => w.wall)
}

describe('the fixture', () => {
  test('four views, and the kitchen stands on A and D', () => {
    expect(VIEWS.map((v) => v.shows)).toEqual(['top', 'left', 'bottom', 'top_left'])
    expect(planWalls()).toEqual(['top', 'left'])
  })
})

describe('isUsablePhoto', () => {
  test('data and http(s) URLs only — never a resume marker', () => {
    expect(isUsablePhoto(photo(1))).toBe(true)
    expect(isUsablePhoto('https://example.test/k.jpg')).toBe(true)
    expect(isUsablePhoto(OMITTED)).toBe(false)
    expect(isUsablePhoto('')).toBe(false)
    expect(isUsablePhoto(undefined)).toBe(false)
  })
})

describe('rankAnchorPhotos / defaultAnchorIndex', () => {
  test('the A–D corner shot first, then the single walls, the window wall last', () => {
    const walls = planWalls()
    expect(rankAnchorPhotos(PHOTOS, VIEWS, walls)).toEqual([3, 0, 1, 2])
    expect(defaultAnchorIndex(PHOTOS, VIEWS, walls)).toBe(3)
  })

  test('an omitted photo is skipped: the next best stands in', () => {
    const photos = [photo(1), photo(2), photo(3), OMITTED]
    expect(rankAnchorPhotos(photos, VIEWS, planWalls())).not.toContain(3)
    expect(defaultAnchorIndex(photos, VIEWS, planWalls())).toBe(0)
  })

  test('no views: the first photo', () => {
    expect(defaultAnchorIndex(PHOTOS, undefined, planWalls())).toBe(0)
    expect(defaultAnchorIndex(PHOTOS, [], planWalls())).toBe(0)
  })

  test('no usable photo at all still answers 0', () => {
    expect(defaultAnchorIndex([OMITTED], VIEWS, planWalls())).toBe(0)
    expect(defaultAnchorIndex([], VIEWS, planWalls())).toBe(0)
  })

  test('confidence breaks a tie between two shots of the same kind', () => {
    const views: PhotoView[] = [
      { ...VIEWS[0], confidence: 'L' },
      { ...VIEWS[1], confidence: 'H' },
    ]
    expect(rankAnchorPhotos(PHOTOS.slice(0, 2), views, planWalls())).toEqual([1, 0])
  })

  test('kitchen walls outrank the corner: a corner of two empty walls loses to a kitchen wall', () => {
    const views: PhotoView[] = [
      { photoIndex: 0, shows: 'bottom_right', counterWalls: [], confidence: 'H', source: 'ai_vision' },
      { photoIndex: 1, shows: 'left', counterWalls: ['left'], confidence: 'L', source: 'ai_vision' },
    ]
    expect(defaultAnchorIndex(PHOTOS.slice(0, 2), views, planWalls())).toBe(1)
  })

  test('a hostile label never throws and counts as unclear', () => {
    const views = [{ ...VIEWS[0], shows: 'toString' }, { ...VIEWS[1], confidence: 'constructor' }] as unknown as PhotoView[]
    expect(() => rankAnchorPhotos(PHOTOS.slice(0, 2), views, planWalls())).not.toThrow()
    expect(defaultAnchorIndex(PHOTOS.slice(0, 2), views, planWalls())).toBe(1)
  })
})

describe('otherSidePhotoIndex', () => {
  test('a corner shot of the whole L leaves no other wall: the button hides', () => {
    expect(otherSidePhotoIndex(PHOTOS, VIEWS, 3, planWalls())).toBeNull()
  })

  test('from wall A, the photo facing wall D — not the corner that repeats A', () => {
    expect(otherSidePhotoIndex(PHOTOS, VIEWS, 0, planWalls())).toBe(1)
    expect(otherSidePhotoIndex(PHOTOS, VIEWS, 1, planWalls())).toBe(0)
  })

  test('from the window wall, the corner that shows both kitchen walls', () => {
    expect(otherSidePhotoIndex(PHOTOS, VIEWS, 2, planWalls())).toBe(3)
  })

  test('the other wall\'s photo omitted on this device: the corner still shows D', () => {
    expect(otherSidePhotoIndex([photo(1), OMITTED, photo(3), photo(4)], VIEWS, 0, planWalls())).toBe(3)
  })

  test('no views, or no kitchen walls: nothing to show', () => {
    expect(otherSidePhotoIndex(PHOTOS, undefined, 0, planWalls())).toBeNull()
    expect(otherSidePhotoIndex(PHOTOS, VIEWS, 0, [])).toBeNull()
  })
})

describe('roomReferenceIndices', () => {
  test('from the corner: the window wall behind the camera first, then the best-ranked', () => {
    expect(roomReferenceIndices(PHOTOS, VIEWS, 3, planWalls())).toEqual([2, 0])
  })

  test('from wall A: wall D first (a kitchen wall the anchor misses), then the window wall', () => {
    const refs = roomReferenceIndices(PHOTOS, VIEWS, 0, planWalls())
    expect(refs).toHaveLength(2)
    // The corner and the D photo both add wall D; the corner ranks higher.
    expect(refs[0]).toBe(3)
    // Wall D is now shown, so the next pick is the one that adds a new wall.
    expect(refs[1]).toBe(2)
  })

  test('never the anchor, never an omitted or non-data photo, at most `max`', () => {
    const photos = [photo(1), OMITTED, 'https://example.test/k.jpg', photo(4)]
    const refs = roomReferenceIndices(photos, VIEWS, 0, planWalls(), 2)
    expect(refs).toEqual([3])
    expect(roomReferenceIndices(PHOTOS, VIEWS, 3, planWalls(), 1)).toHaveLength(1)
    expect(roomReferenceIndices([photo(1)], VIEWS, 0, planWalls())).toEqual([])
  })

  test('the other-side render sends the main anchor first', () => {
    // Main render from wall A (photo 0); the other side renders from D (photo 1).
    const refs = roomReferenceIndices(PHOTOS, VIEWS, 1, planWalls(), 2, [0])
    expect(refs[0]).toBe(0)
    expect(refs).toHaveLength(2)
    expect(refs).not.toContain(1)
    // A and D are shown; the window wall adds the most.
    expect(refs[1]).toBe(2)
  })
})

describe('viewFor', () => {
  test('finds a view by photo index, not by position', () => {
    const shuffled = [VIEWS[2], VIEWS[0]]
    expect(viewFor(shuffled, 0)?.shows).toBe('top')
    expect(viewFor(shuffled, 1)).toBeUndefined()
    expect(viewFor(undefined, 0)).toBeUndefined()
  })
})
