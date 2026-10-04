/**
 * Which space photo the concept render stands in (IMP-32).
 *
 * All the space photos are one room from different positions, and the photo
 * read labels each one with the wall or corner it shows (`PhotoView`). From
 * those labels and the walls the kitchen stands on (the measured plan's
 * counter walls) this module picks:
 *  - the anchor: the widest shot of the kitchen — the photo that shows the
 *    most of its walls, a corner before a single wall. The homeowner can still
 *    pick another one;
 *  - the room references: up to two other photos sent as "same room, other
 *    position", the ones that show what the anchor does not;
 *  - the other side: the photo for "Prikaži drugi zid", the one that shows the
 *    kitchen walls the anchor leaves out. None when the anchor already shows
 *    every one of them (a corner shot of an L), which hides the button.
 *
 * Works from the labels alone — no extra field in the photo read — so reads
 * saved since IMP-31 rank too. Photos that cannot be sent (a device that
 * resumed without the image data, 'omitted://image') are skipped.
 *
 * Pure and server-safe.
 */
import type { ConfidenceLevel, PhotoView, WallSide } from '@/lib/types'
import { wallsOf } from '@/lib/floor-plan'
import { sanitizePhotoViewTarget } from './room-constraints'

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { H: 0, M: 1, L: 2 }

/** A photo the render can be sent: a data URL or an http(s) URL. Never a resume marker. */
export function isUsablePhoto(p: string | undefined): p is string {
  return (
    typeof p === 'string' && (p.startsWith('data:image/') || p.startsWith('http://') || p.startsWith('https://'))
  )
}

/** The view the photo read gave photo `photoIndex`, if any (first one wins). */
export function viewFor(views: readonly PhotoView[] | undefined, photoIndex: number): PhotoView | undefined {
  return views?.find((v) => v?.photoIndex === photoIndex)
}

/**
 * The walls a view shows. The label goes through the literal set first: a
 * saved view is client data, and `wallsOf` throws on a prototype key.
 */
function viewWalls(view: PhotoView | undefined): WallSide[] {
  const shows = sanitizePhotoViewTarget(view?.shows)
  return shows ? wallsOf(shows) : []
}

interface Score {
  index: number
  /** Kitchen walls the photo shows. */
  planHits: number
  /** 0 corner, 1 wall, 2 unclear or no view. */
  kind: number
  /** 0 H … 2 L, 3 no view. */
  confidence: number
  counterWalls: number
}

function score(index: number, view: PhotoView | undefined, planWalls: readonly WallSide[]): Score {
  const walls = viewWalls(view)
  return {
    index,
    planHits: walls.filter((w) => planWalls.includes(w)).length,
    kind: walls.length === 2 ? 0 : walls.length === 1 ? 1 : 2,
    confidence:
      view && Object.prototype.hasOwnProperty.call(CONFIDENCE_RANK, view.confidence)
        ? CONFIDENCE_RANK[view.confidence]
        : 3,
    counterWalls: Array.isArray(view?.counterWalls) ? view.counterWalls.length : 0,
  }
}

function compareScores(a: Score, b: Score): number {
  return (
    b.planHits - a.planHits ||
    a.kind - b.kind ||
    a.confidence - b.confidence ||
    b.counterWalls - a.counterWalls ||
    a.index - b.index
  )
}

/**
 * Usable photos, widest shot of the kitchen first. Sorted by: how many of the
 * kitchen walls the photo shows; a corner before a wall before an unclear or
 * missing view; confidence H, M, L; how many walls with counter the photo
 * read saw in it; upload order.
 */
export function rankAnchorPhotos(
  photos: readonly string[],
  views: readonly PhotoView[] | undefined,
  planWalls: readonly WallSide[]
): number[] {
  return photos
    .flatMap((p, i) => (isUsablePhoto(p) ? [score(i, viewFor(views, i), planWalls)] : []))
    .sort(compareScores)
    .map((s) => s.index)
}

/** The anchor the render starts from until the homeowner picks another. */
export function defaultAnchorIndex(
  photos: readonly string[],
  views: readonly PhotoView[] | undefined,
  planWalls: readonly WallSide[]
): number {
  return rankAnchorPhotos(photos, views, planWalls)[0] ?? 0
}

/**
 * Up to `max` other photos to send as "same room, other position". Each pick
 * prefers a photo that shows kitchen walls not yet shown (by the anchor or an
 * earlier pick), then any wall not yet shown — the window wall behind the
 * camera, say — then the anchor rank. `include` goes first whatever it shows
 * (the other-side render sends the main render's anchor). Data URLs only: the
 * server takes nothing else as a room reference.
 */
export function roomReferenceIndices(
  photos: readonly string[],
  views: readonly PhotoView[] | undefined,
  anchorIndex: number,
  planWalls: readonly WallSide[],
  max = 2,
  include: readonly number[] = []
): number[] {
  const isRef = (i: number) => i !== anchorIndex && typeof photos[i] === 'string' && photos[i].startsWith('data:image/')
  const picked: number[] = []
  for (const i of include) {
    if (picked.length < max && isRef(i) && !picked.includes(i)) picked.push(i)
  }
  const shown = new Set<WallSide>(viewWalls(viewFor(views, anchorIndex)))
  for (const i of picked) viewWalls(viewFor(views, i)).forEach((w) => shown.add(w))

  const ranked = rankAnchorPhotos(photos, views, planWalls).filter((i) => isRef(i) && !picked.includes(i))
  while (picked.length < max && ranked.length > 0) {
    let best = 0
    let bestKey: [number, number] = [-1, -1]
    ranked.forEach((i, pos) => {
      const fresh = viewWalls(viewFor(views, i)).filter((w) => !shown.has(w))
      const key: [number, number] = [fresh.filter((w) => planWalls.includes(w)).length, fresh.length]
      // Strictly greater only: on a tie the earlier (better-ranked) photo stays.
      if (key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
        best = pos
        bestKey = key
      }
    })
    const [i] = ranked.splice(best, 1)
    picked.push(i)
    viewWalls(viewFor(views, i)).forEach((w) => shown.add(w))
  }
  return picked
}

/**
 * The photo for "Prikaži drugi zid": the one, other than the anchor, that
 * shows the most kitchen walls the anchor does not. On a tie, the photo that
 * repeats less of the anchor's walls (the other side, not the same wall from
 * a corner), then the anchor rank. Null when no photo adds a kitchen wall —
 * the anchor already shows the whole kitchen, or nothing is labelled.
 */
export function otherSidePhotoIndex(
  photos: readonly string[],
  views: readonly PhotoView[] | undefined,
  anchorIndex: number,
  planWalls: readonly WallSide[]
): number | null {
  const anchorWalls = viewWalls(viewFor(views, anchorIndex))
  let best: { index: number; gain: number; overlap: number } | null = null
  for (const i of rankAnchorPhotos(photos, views, planWalls)) {
    if (i === anchorIndex) continue
    const walls = viewWalls(viewFor(views, i))
    const gain = walls.filter((w) => planWalls.includes(w) && !anchorWalls.includes(w)).length
    const overlap = walls.filter((w) => anchorWalls.includes(w)).length
    if (gain === 0) continue
    if (!best || gain > best.gain || (gain === best.gain && overlap < best.overlap)) best = { index: i, gain, overlap }
  }
  return best?.index ?? null
}
