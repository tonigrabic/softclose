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
