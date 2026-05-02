/**
 * Public API for the floor-plan module.
 *
 * The cm-based FloorPlan is the single source of truth. Two presenters
 * consume it: the Konva editor (client) and the deterministic SVG (server-safe,
 * used by handoff + thumbnails). Vision results from /api/space-vision flow
 * through `fromVision` into a FloorPlan.
 */
export type {
  FloorPlan,
  RoomSpec,
  RoomSides,
  SideKind,
  SideSpec,
  LayoutShape,
  Opening,
  OpeningKind,
  Feature,
  FeatureKind,
  Island,
  ElementSource,
  Provenance,
  MeasurementMethod,
  DisplayUnit,
} from './model'

export {
  FEATURE_DEFAULTS,
  OPENING_DEFAULTS,
  DEFAULT_ROOM_BY_SHAPE,
  SHAPE_DIM_BANDS,
  DIM_HARD_MIN,
  DIM_HARD_MAX,
  fromVision,
  fromShapePreset,
  validate,
  hasHomeownerEdits,
  confirmedBy,
  makeOpening,
  makeFeature,
  makeIsland,
  wallAxis,
  wallLengthCm,
  clamp,
  isOpening,
  isFeature,
  isIsland,
} from './model'

export { renderFloorPlanSvg } from './svg'
export type { SvgRenderMode } from './svg'

export {
  fitRoom,
  cmPointToPx,
  pxPointToCm,
  featurePxRect,
  openingPxRect,
  snap,
  snapToWallEnds,
  nearestWall,
  projectPxToWallCm,
} from './geometry'
export type { FitResult, PxRect } from './geometry'

export {
  detectDefaultUnit,
  cmToInches,
  cmToFeetInches,
  formatLength,
  formatLengthCompact,
  parseLengthToCm,
} from './units'

import type { FloorPlan } from './model'
import { fromVision } from './model'
import type { LeadProfile } from '@/lib/types'

/**
 * Resolve the FloorPlan to display for a given LeadProfile, preferring the
 * confirmed `profile.floorPlan` over raw `spaceVisionResult`. Returns null
 * if the profile has neither — caller decides what to do (e.g. show
 * shape-picker bootstrap).
 */
export function planFromProfile(profile: LeadProfile): FloorPlan | null {
  if (profile.floorPlan) return profile.floorPlan
  if (profile.spaceVisionResult) {
    // Lazily migrate vision → cm. Caller may persist this back if it wants to.
    return fromVision(profile.spaceVisionResult)
  }
  return null
}

/**
 * True when the profile has any floor-plan-relevant input (used to gate
 * whether to render anything at all). Replaces `hasFloorPlanInput()`.
 */
export function hasPlan(profile: LeadProfile): boolean {
  return Boolean(
    profile.floorPlan ||
      profile.spaceVisionResult ||
      profile.layoutShape ||
      profile.hasIsland ||
      profile.spaceLengthCm ||
      profile.spaceWidthCm
  )
}
