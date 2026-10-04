/**
 * Turning the model's raw space read into one honest `SpaceVisionResult`.
 *
 * The photos are ONE room seen from different positions. The model reports,
 * per photo, which wall or corner it shows and which walls carry counter in
 * it; this module makes that list well-formed (one view per photo, in upload
 * order, counter walls only on walls the photo can actually show) and drops
 * dimensions that fall outside the per-shape sanity bands.
 *
 * It deliberately does NOT rewrite `wallRuns` or `layoutShape`: the raw read
 * stays raw, and `reconcileCounterWalls` (called by `fromVision`) is the one
 * place counter walls are derived — for fresh reads, legacy saved reads and
 * reads the homeowner corrected on the room step alike.
 *
 * Pure and import-light: the route, the mock and the tests all use it.
 */
import type {
  ConfidenceLevel,
  PhotoView,
  PhotoViewTarget,
  SpaceVisionResult,
  WallCorner,
  WallSide,
} from '@/lib/types'
import { SHAPE_DIM_BANDS, type LayoutShape } from './model'

const WALLS: readonly WallSide[] = ['top', 'bottom', 'left', 'right']
const CORNERS: Record<WallCorner, [WallSide, WallSide]> = {
  top_left: ['top', 'left'],
  top_right: ['top', 'right'],
  bottom_right: ['bottom', 'right'],
  bottom_left: ['bottom', 'left'],
}
const CONFIDENCES: readonly ConfidenceLevel[] = ['H', 'M', 'L']

/** The walls a view can show: its wall, a corner's two walls, or none. */
export function wallsOf(target: PhotoViewTarget): WallSide[] {
  if ((WALLS as readonly string[]).includes(target)) return [target as WallSide]
  if (target in CORNERS) return [...CORNERS[target as WallCorner]]
  return []
}

function isTarget(v: unknown): v is PhotoViewTarget {
  return typeof v === 'string' && (v === 'unclear' || wallsOf(v as PhotoViewTarget).length > 0)
}

/** One raw per-photo entry as the tool returns it: `photo` is 1-based. */
export interface RawPhotoView {
  photo?: unknown
  shows?: unknown
  counterWalls?: unknown
  confidence?: unknown
}

/** The tool call's input: a SpaceVisionResult whose views still carry 1-based `photo`. */
export type RawVisionRead = Omit<SpaceVisionResult, 'photoViews'> & { photoViews?: RawPhotoView[] }

function unclear(photoIndex: number): PhotoView {
  return { photoIndex, shows: 'unclear', counterWalls: [], confidence: 'L', source: 'ai_vision' }
}

/**
 * One view per photo, in order. Entries pointing at a photo that was not sent
 * are dropped, a repeated photo keeps its first entry, a photo the model said
 * nothing about reads as 'unclear', and counter walls a photo cannot show
 * (not its wall, not its corner's walls) are stripped — which also caps any
 * one photo at two walls, the bound that keeps a perspective over-read from
 * turning an L into a U.
 */
function normalizePhotoViews(raw: unknown, photoCount: number): PhotoView[] {
  const byIndex = new Map<number, PhotoView>()
  for (const entry of Array.isArray(raw) ? (raw as RawPhotoView[]) : []) {
    const photo = typeof entry?.photo === 'number' ? entry.photo : NaN
    if (!Number.isInteger(photo)) continue
    const photoIndex = photo - 1
    if (photoIndex < 0 || photoIndex >= photoCount || byIndex.has(photoIndex)) continue
    const shows: PhotoViewTarget = isTarget(entry.shows) ? entry.shows : 'unclear'
    const visible = wallsOf(shows)
    const counterWalls = WALLS.filter(
      (w) => Array.isArray(entry.counterWalls) && entry.counterWalls.includes(w) && visible.includes(w)
    )
    const confidence = CONFIDENCES.includes(entry.confidence as ConfidenceLevel)
      ? (entry.confidence as ConfidenceLevel)
      : 'L'
    byIndex.set(photoIndex, { photoIndex, shows, counterWalls, confidence, source: 'ai_vision' })
  }
  return Array.from({ length: Math.max(0, photoCount) }, (_, i) => byIndex.get(i) ?? unclear(i))
}

const DIM_MIN = 100
const DIM_MAX = 1200

/** Length is always the longer dimension; orient before checking the band. */
function dimsLookSane(shape: string | undefined, lengthCm: number, widthCm: number): boolean {
  const band = SHAPE_DIM_BANDS[(shape as LayoutShape) ?? 'unsure'] ?? SHAPE_DIM_BANDS.unsure
  const [longer, shorter] = lengthCm >= widthCm ? [lengthCm, widthCm] : [widthCm, lengthCm]
  return longer >= band.length[0] && longer <= band.length[1] && shorter >= band.width[0] && shorter <= band.width[1]
}

/**
 * Normalise a raw read for `photoCount` photos. Defense in depth on the
 * dimensions too: the prompt tells the model to omit dims it cannot anchor,
 * but anything outside the hard limits or the shape's band is dropped here.
 */
export function normalizeVisionRead(raw: unknown, photoCount: number): SpaceVisionResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as RawVisionRead
  const out: SpaceVisionResult = {
    ...(r as Omit<RawVisionRead, 'photoViews'>),
    lookedLikeKitchen: r.lookedLikeKitchen !== false,
    photoViews: normalizePhotoViews(r.photoViews, photoCount),
  }
  if (out.emptyRoom !== true) delete out.emptyRoom
  if (out.lengthCm != null && !(out.lengthCm >= DIM_MIN && out.lengthCm <= DIM_MAX)) out.lengthCm = undefined
  if (out.widthCm != null && !(out.widthCm >= DIM_MIN && out.widthCm <= DIM_MAX)) out.widthCm = undefined
  if (out.lengthCm && out.widthCm && !dimsLookSane(out.layoutShape, out.lengthCm, out.widthCm)) {
    out.lengthCm = undefined
    out.widthCm = undefined
  }
  return out
}

/**
 * The homeowner corrects what one photo shows (tap-to-correct on the room
 * step). A label says where the camera points, not where cabinets are: the
 * view keeps only the runs the new label can show and never gains or moves
 * one — turning a galley's run onto its end wall would drop a real run.
 * Changing which walls carry counter is the shape card's job. Picking the
 * label it already has changes nothing; otherwise the view is now the
 * homeowner's word (H, source 'homeowner'), which `reconcileCounterWalls`
 * reads as "these labels were reviewed". The labels also tell later steps
 * which photo shows which wall.
 */
export function relabelPhotoView(
  vision: SpaceVisionResult,
  photoIndex: number,
  shows: PhotoViewTarget
): SpaceVisionResult {
  const views = vision.photoViews ?? []
  const current = views.find((v) => v.photoIndex === photoIndex)
  if (!current || current.shows === shows) return vision
  return {
    ...vision,
    photoViews: views.map((v) =>
      v.photoIndex === photoIndex
        ? {
            ...v,
            shows,
            counterWalls: v.counterWalls.filter((w) => wallsOf(shows).includes(w)),
            confidence: 'H',
            source: 'homeowner',
          }
        : v
    ),
  }
}
