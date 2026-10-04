/**
 * The homeowner's whole in-progress journey, as one serialisable object.
 *
 * This type used to live inside the KitchenIntake component body, which was
 * fine while the only consumer was IndexedDB. It is now also the shape stored
 * server-side on the project row, so it must be readable by server code —
 * hence a lib module with no `'use client'` import edges. (The field types it
 * needs were moved into `@/lib/types` for the same reason.)
 *
 * Forward tolerance: `applySnapshot` in the intake defaults every field
 * (`?? null`, `?? []`, `Boolean(...)`), so ADDING an optional field needs no
 * version bump and no migration — an older snapshot simply gets the default.
 * Bump `SNAPSHOT_VERSION` only for renames and semantic changes, and add the
 * matching entry to `MIGRATIONS` below.
 */
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'
import type { BuilderScreenId } from '@/lib/builder/inventory'
import type { UnitEdits } from '@/lib/builder/unit-assembly'
import type { FloorPlan } from '@/lib/floor-plan'
import type { FlowStepId } from '@/lib/flow'
import type {
  ClientMessage,
  ConceptRender,
  ContactValue,
  LeadProfile,
  ProductReference,
  SpaceVisionResult,
  UploadedReference,
  WrapUpData,
} from '@/lib/types'
import type { InspirationVisionResult } from '@/app/api/inspiration-vision/route'

export const SNAPSHOT_VERSION = 1

export interface ProjectSnapshot {
  currentStepId: FlowStepId
  profile: LeadProfile
  transcript: ClientMessage[]
  isDone: boolean
  wrapUpData: WrapUpData | null
  spacePhotos: string[]
  spaceVision: SpaceVisionResult | null
  floorPlan: FloorPlan | null
  unitEdits: UnitEdits | null
  inspirationStyles: string[]
  inspirationRefs: UploadedReference[]
  inspirationVision: InspirationVisionResult | null
  conceptRenders: ConceptRender[]
  chosenRenderId: string | null
  productReferences: ProductReference[]
  siteAccess: string | null
  contactDraft: ContactValue
  mustHavesText: string
  niceToHavesText: string
  dealBreakersText: string
  builderHypothesis: BuilderHypothesis | null
  builderStartedNoAI: boolean
  /** Which screen of the room step (shape, then measure). Optional: older snapshots default to 'shape'. */
  roomPhase?: 'shape' | 'measure'
  /**
   * The room as it is today, as the room step is editing it — kept apart from
   * `floorPlan` (the kitchen being built), so going back to the room step
   * never shows or saves the planned layout as the existing room.
   */
  roomPlan?: FloorPlan | null
  /**
   * The builder group the homeowner was on (IMP-06), so a reload reopens the
   * builder there. A screen cursor, not brief content — which is why it lives
   * here and not on `profile.builderState`, which rides into the handoff.
   * Optional: older snapshots, and journeys that never reached the builder,
   * open at the first group. Kept `undefined` rather than null when unset, so
   * an older snapshot fingerprints the same.
   */
  builderGroupId?: BuilderScreenId
  /**
   * The typed wishlist the profile's lists were translated from (IMP-07,
   * lib/review-nav `wishlistSource`). Passing the wishlist step with the same
   * text then keeps the lists instead of asking the AI to word them afresh —
   * which would make an unchanged kitchen a new brief. Optional: older
   * snapshots translate once more. `undefined` when unset, so they
   * fingerprint the same.
   */
  wishlistSource?: string
  /**
   * The review the brief on file went out from (IMP-07): its summary, its id
   * and the print of the profile actually sent. A finish whose profile prints
   * the same shows this review again — the brief the maker has, nothing to
   * send — even after a change was made and undone, or the review was rebuilt
   * in between. Trusted only while its id is the project's current brief
   * (lib/handoff/review `sentReviewFrom`). Optional: older snapshots derive it
   * from their review; `undefined` when unset, so they fingerprint the same.
   */
  sentReview?: WrapUpData
}

type SnapshotRecord = Record<string, unknown>
type Migration = (data: SnapshotRecord) => SnapshotRecord

/** Keyed by the version being migrated FROM; each returns the next version's shape. */
const MIGRATIONS: Record<number, Migration> = {}

export type MigrateResult =
  | { ok: true; snapshot: ProjectSnapshot; version: number; migrated: boolean }
  | { ok: false; reason: 'version_ahead' | 'unreadable' }

/**
 * Bring a stored snapshot up to the current shape.
 *
 * A snapshot written by NEWER code (a rolled-back deploy) is refused rather
 * than read: the caller serves it read-only and disables checkpointing, because
 * writing our older shape back over it would destroy whatever the newer code
 * stored. Dropping it — which is the right move for the local IndexedDB cache —
 * would here mean the customer's only kitchen appears empty.
 */
export function migrateSnapshot(raw: unknown, fromVersion: number): MigrateResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'unreadable' }
  if (fromVersion > SNAPSHOT_VERSION) return { ok: false, reason: 'version_ahead' }

  let data = raw as SnapshotRecord
  let version = fromVersion
  while (version < SNAPSHOT_VERSION) {
    const migrate = MIGRATIONS[version]
    if (!migrate) return { ok: false, reason: 'unreadable' }
    data = migrate(data)
    version += 1
  }
  return { ok: true, snapshot: data as unknown as ProjectSnapshot, version, migrated: version !== fromVersion }
}
