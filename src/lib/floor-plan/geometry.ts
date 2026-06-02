/**
 * Pure geometry helpers — cm ↔ px, snapping, hit-testing math. No React,
 * no Konva, no DOM. The Konva editor and the SVG presenter both use these.
 */
import type { WallSide } from '@/lib/types'
import { clamp, wallAxis, wallLengthCm, type Feature, type Opening, type RoomSpec } from './model'

/** Pixel-space rectangle. */
export interface PxRect {
  x: number
  y: number
  w: number
  h: number
}

/** Result of fitting a room into a viewport with optional padding. */
export interface FitResult {
  scale: number       // px per cm
  inner: PxRect       // where the room rectangle lives in px
  viewport: { w: number; h: number }
}

/**
 * Fit the room (length × width cm) into a viewport (w × h px) with padding,
 * preserving aspect ratio. Returns a scale + the inner px rect for the room.
 */
export function fitRoom(
  room: { lengthCm: number; widthCm: number },
  viewport: { w: number; h: number },
  paddingPx = 56
): FitResult {
  const usableW = Math.max(60, viewport.w - paddingPx * 2)
  const usableH = Math.max(60, viewport.h - paddingPx * 2)
  const scaleX = usableW / room.lengthCm
  const scaleY = usableH / room.widthCm
  const scale = Math.min(scaleX, scaleY)
  const innerW = room.lengthCm * scale
  const innerH = room.widthCm * scale
  return {
    scale,
    inner: {
      x: (viewport.w - innerW) / 2,
      y: (viewport.h - innerH) / 2,
      w: innerW,
      h: innerH,
    },
    viewport,
  }
}

/** Convert a (cm-from-room-top-left) point to px in the viewport. */
export function cmPointToPx(
  pointCm: { xCm: number; yCm: number },
  fit: FitResult
): { x: number; y: number } {
  return {
    x: fit.inner.x + pointCm.xCm * fit.scale,
    y: fit.inner.y + pointCm.yCm * fit.scale,
  }
}

/** Inverse: px point → cm (clamped to room interior). */
export function pxPointToCm(
  px: { x: number; y: number },
  fit: FitResult,
  room: { lengthCm: number; widthCm: number }
): { xCm: number; yCm: number } {
  return {
    xCm: clamp((px.x - fit.inner.x) / fit.scale, 0, room.lengthCm),
    yCm: clamp((px.y - fit.inner.y) / fit.scale, 0, room.widthCm),
  }
}

/** A start/end point along a wall in cm. */
export function wallSegmentCm(
  wall: WallSide,
  startCm: number,
  lengthAlongCm: number,
  room: { lengthCm: number; widthCm: number }
): { ax: number; ay: number; bx: number; by: number } {
  switch (wall) {
    case 'top':
      return { ax: startCm, ay: 0, bx: startCm + lengthAlongCm, by: 0 }
    case 'bottom':
      return { ax: startCm, ay: room.widthCm, bx: startCm + lengthAlongCm, by: room.widthCm }
    case 'left':
      return { ax: 0, ay: startCm, bx: 0, by: startCm + lengthAlongCm }
    case 'right':
      return { ax: room.lengthCm, ay: startCm, bx: room.lengthCm, by: startCm + lengthAlongCm }
  }
}

/** Inset px rectangle for a feature pill — sits just inside the wall. */
export function featurePxRect(
  feature: Feature,
  fit: FitResult,
  room: RoomSpec,
  insetCm = 28
): PxRect {
  const total = wallLengthCm(feature.wall, room)
  const start = clamp(feature.centerCm - feature.widthCm / 2, 0, total - feature.widthCm)
  const wPx = feature.widthCm * fit.scale
  const hPx = 22
  switch (feature.wall) {
    case 'top':
      return { x: fit.inner.x + start * fit.scale, y: fit.inner.y + insetCm * fit.scale - hPx / 2, w: wPx, h: hPx }
    case 'bottom':
      return { x: fit.inner.x + start * fit.scale, y: fit.inner.y + (room.widthCm - insetCm) * fit.scale - hPx / 2, w: wPx, h: hPx }
    case 'left':
      return { x: fit.inner.x + insetCm * fit.scale - hPx / 2, y: fit.inner.y + start * fit.scale, w: hPx, h: wPx }
    case 'right':
      return { x: fit.inner.x + (room.lengthCm - insetCm) * fit.scale - hPx / 2, y: fit.inner.y + start * fit.scale, w: hPx, h: wPx }
  }
}

/** Px rectangle for an opening — centred on the wall edge. */
export function openingPxRect(
  opening: Opening,
  fit: FitResult,
  room: RoomSpec,
  thicknessPx = 10
): PxRect {
  const wPx = opening.widthCm * fit.scale
  const half = thicknessPx / 2
  switch (opening.wall) {
    case 'top':
      return {
        x: fit.inner.x + opening.startCm * fit.scale,
        y: fit.inner.y - half,
        w: wPx,
        h: thicknessPx,
      }
    case 'bottom':
      return {
        x: fit.inner.x + opening.startCm * fit.scale,
        y: fit.inner.y + room.widthCm * fit.scale - half,
        w: wPx,
        h: thicknessPx,
      }
    case 'left':
      return {
        x: fit.inner.x - half,
        y: fit.inner.y + opening.startCm * fit.scale,
        w: thicknessPx,
        h: wPx,
      }
    case 'right':
      return {
        x: fit.inner.x + room.lengthCm * fit.scale - half,
        y: fit.inner.y + opening.startCm * fit.scale,
        w: thicknessPx,
        h: wPx,
      }
  }
}

/** Snap a cm value to the nearest multiple of `stepCm`. */
export function snap(cm: number, stepCm = 5): number {
  return Math.round(cm / stepCm) * stepCm
}

/** Snap to a corner (0 or wall length) when within `thresholdCm`. */
export function snapToWallEnds(
  cm: number,
  totalCm: number,
  thresholdCm = 8
): number {
  if (cm < thresholdCm) return 0
  if (cm > totalCm - thresholdCm) return totalCm
  return cm
}

/** Find which wall a px point is closest to. Used for cross-wall drag. */
export function nearestWall(
  px: { x: number; y: number },
  fit: FitResult,
  room: { lengthCm: number; widthCm: number }
): WallSide {
  const right = fit.inner.x + room.lengthCm * fit.scale
  const bottom = fit.inner.y + room.widthCm * fit.scale
  const dTop = Math.abs(px.y - fit.inner.y)
  const dBottom = Math.abs(px.y - bottom)
  const dLeft = Math.abs(px.x - fit.inner.x)
  const dRight = Math.abs(px.x - right)
  const min = Math.min(dTop, dBottom, dLeft, dRight)
  if (min === dTop) return 'top'
  if (min === dBottom) return 'bottom'
  if (min === dLeft) return 'left'
  return 'right'
}

/** Project a px point onto the named wall, returning startCm-from-corner. */
export function projectPxToWallCm(
  px: { x: number; y: number },
  wall: WallSide,
  fit: FitResult,
  room: { lengthCm: number; widthCm: number }
): number {
  const total = wallAxis(wall) === 'h' ? room.lengthCm : room.widthCm
  if (wallAxis(wall) === 'h') {
    return clamp((px.x - fit.inner.x) / fit.scale, 0, total)
  }
  return clamp((px.y - fit.inner.y) / fit.scale, 0, total)
}
