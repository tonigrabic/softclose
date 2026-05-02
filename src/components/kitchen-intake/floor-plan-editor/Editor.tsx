'use client'

/**
 * The interactive floor-plan editor — Konva-backed.
 *
 * Architecture:
 *   - `useEditor()` owns plan + selection + history (no DOM, no Konva).
 *   - `<Stage />` here renders the canvas reactively from that state.
 *   - All numeric controls (dimension inputs, sliders, side toggles) live
 *     OUTSIDE the canvas so mobile users have big tap targets and the
 *     canvas itself stays a "spatial context, not a precision tool" surface.
 *
 * Touch: tap to select, drag to nudge. We never depend on a 12 px drag
 * handle for precision — the bottom-sheet sliders handle that.
 *
 * Confidence: every drag/edit flips the touched element to (H, homeowner).
 * The static SVG presenter draws low-confidence elements dashed; once the
 * user touches one, the dash resolves visibly.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Stage,
  Layer,
  Rect,
  Line,
  Group,
  Text,
  Circle,
} from 'react-konva'
import type Konva from 'konva'
import {
  Check,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  DIM_HARD_MAX,
  DIM_HARD_MIN,
  FEATURE_DEFAULTS,
  OPENING_DEFAULTS,
  cmToFeetInches,
  detectDefaultUnit,
  fitRoom,
  formatLength,
  formatLengthCompact,
  makeFeature,
  makeIsland,
  makeOpening,
  parseLengthToCm,
  snap,
  snapToWallEnds,
  validate,
  wallAxis,
  wallLengthCm,
  type DisplayUnit,
  type Feature,
  type FeatureKind,
  type FloorPlan,
  type Island,
  type Opening,
  type OpeningKind,
  type RoomSpec,
} from '@/lib/floor-plan'
import type { WallSide } from '@/lib/types'
import { useEditor, type EditorApi, type SelectionId } from './state'

// ─── Constants ───────────────────────────────────────────────────────────────

const STAGE_PAD = 56
const SNAP_CM = 5
const CORNER_SNAP_CM = 8
const COLOR = {
  bg: '#fafaf9',
  grid10: '#e7e5e4',
  grid50: '#d6d3d1',
  wall: '#1f2937',
  wallOpen: '#cbd5e1',
  cabHint: '#f5f5f4',
  cabHintStroke: '#d6d3d1',
  islandFill: '#d6d3d1',
  islandStroke: '#a8a29e',
  windowFill: '#dbeafe',
  windowStroke: '#3b82f6',
  doorFill: '#fef3c7',
  doorStroke: '#d97706',
  passageFill: '#f1f5f9',
  passageStroke: '#94a3b8',
  feature: '#475569',
  featureFill: '#f1f5f9',
  lowConf: '#94a3b8',
  selectedRing: '#0ea5e9',
  textBody: '#57534e',
  textHint: '#a8a29e',
  snap: '#0ea5e9',
} as const

// ─── Public component ────────────────────────────────────────────────────────

export interface FloorPlanEditorProps {
  /**
   * Plan that seeds the editor on first mount. Subsequent updates from the
   * homeowner stay inside the editor; the parent receives them via `onChange`.
   */
  initialPlan: FloorPlan
  /** Optional thumbnail backdrop — usually the user's first space photo. */
  anchorPhotoUrl?: string
  /** Fires after every committed mutation. Use for upstream persistence. */
  onChange: (plan: FloorPlan) => void
  className?: string
}

export function FloorPlanEditor({ initialPlan, anchorPhotoUrl: _anchorPhotoUrl, onChange, className }: FloorPlanEditorProps) {
  void _anchorPhotoUrl
  const editor = useEditor(initialPlan)
  // Pin the initial plan as a one-shot snapshot for "Reset to AI guess".
  // useState (not useRef) so we can read it during render without lint friction.
  const [initialSnapshot] = useState(initialPlan)

  // Notify parent on every change.
  useEffect(() => {
    onChange(editor.plan)
  }, [editor.plan, onChange])

  // Default unit from locale on first paint.
  useEffect(() => {
    editor.setUnits(detectDefaultUnit())
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Container size measurement so the Stage scales with viewport.
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: 640, h: 420 })
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.max(280, Math.floor(e.contentRect.width))
        const h = Math.max(280, Math.floor(Math.min(540, w * 0.66)))
        setSize({ w, h })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Keyboard: Cmd/Ctrl-Z undo, shift-Cmd-Z redo, Delete/Backspace remove,
  // Esc deselect, arrow keys nudge selected element by 5 cm (1 cm w/ Shift).
  useKeyboardShortcuts(editor)

  // The room-size moment surfaces when room confidence is L (no AI dims or
  // homeowner hasn't confirmed) AND we haven't deferred to the designer.
  const needsSize =
    editor.plan.room.confidence !== 'H' &&
    editor.plan.measurementMethod !== 'deferred_to_designer'

  return (
    <div className={cn('space-y-3', className)}>
      <Header editor={editor} />

      {needsSize && <SizeMomentBanner editor={editor} />}

      {/* Canvas + element controls */}
      <div className="flex flex-col gap-3 lg:flex-row">
        <div
          ref={containerRef}
          className="relative min-h-[280px] flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
        >
          <CanvasStage editor={editor} viewport={size} />
        </div>
        <SelectionPanel editor={editor} initialSnapshot={initialSnapshot} />
      </div>

      {/* Toolbar pinned below */}
      <Toolbar editor={editor} />

      {/* A11y live region for screen-reader announcements when elements move via keyboard. */}
      <LiveAnnouncer plan={editor.plan} selection={editor.selection} />
    </div>
  )
}

// ─── Header (units, undo/redo, deferred-to-designer toggle) ──────────────────

function Header({ editor }: { editor: EditorApi }) {
  const { plan } = editor
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <UnitToggle value={plan.units} onChange={editor.setUnits} />
        <button
          type="button"
          onClick={editor.undo}
          disabled={!editor.canUndo}
          aria-label="Undo"
          className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
        >
          <Undo2 className="size-3.5 stroke-[2]" aria-hidden />
        </button>
        <button
          type="button"
          onClick={editor.redo}
          disabled={!editor.canRedo}
          aria-label="Redo"
          className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
        >
          <Redo2 className="size-3.5 stroke-[2]" aria-hidden />
        </button>
      </div>
      <div className="flex items-center gap-2">
        {plan.measurementMethod === 'deferred_to_designer' ? (
          <button
            type="button"
            onClick={() => editor.setMeasurementMethod('homeowner_only')}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
          >
            <Check className="size-3 stroke-[2]" aria-hidden />
            Designer measures · undo
          </button>
        ) : (
          <button
            type="button"
            onClick={() => editor.setMeasurementMethod('deferred_to_designer')}
            className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip — designer measures on site
          </button>
        )}
      </div>
    </div>
  )
}

function UnitToggle({
  value,
  onChange,
}: {
  value: DisplayUnit
  onChange: (u: DisplayUnit) => void
}) {
  return (
    <div
      role="group"
      aria-label="Units"
      className="inline-flex items-center rounded-full border border-border bg-card p-0.5 text-[11px] font-medium"
    >
      {(['cm', 'ft_in'] as DisplayUnit[]).map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => onChange(u)}
          className={cn(
            'rounded-full px-2.5 py-1 transition-colors',
            value === u ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {u === 'cm' ? 'cm' : 'ft+in'}
        </button>
      ))}
    </div>
  )
}

// ─── Size moment banner ──────────────────────────────────────────────────────

function SizeMomentBanner({ editor }: { editor: EditorApi }) {
  const { plan } = editor
  return (
    <div className="rounded-2xl border border-amber-300/60 bg-amber-50/70 p-4 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
      <p className="text-[13px] font-semibold">Set the room size first</p>
      <p className="mt-0.5 text-xs leading-relaxed">
        We couldn&apos;t reliably scale your photos. Type your rough dimensions, drag the room edges,
        or tap &ldquo;Designer measures on site&rdquo; if you&apos;d rather skip this.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <DimInput
          label="Length (longer wall)"
          cm={plan.room.lengthCm}
          unit={plan.units}
          onCommit={(cm) =>
            editor.patchRoom({ lengthCm: clamp(cm, DIM_HARD_MIN, DIM_HARD_MAX), confidence: 'H', source: 'homeowner' })
          }
        />
        <DimInput
          label="Width (shorter wall)"
          cm={plan.room.widthCm}
          unit={plan.units}
          onCommit={(cm) =>
            editor.patchRoom({ widthCm: clamp(cm, DIM_HARD_MIN, DIM_HARD_MAX), confidence: 'H', source: 'homeowner' })
          }
        />
      </div>
    </div>
  )
}

// ─── Canvas Stage ────────────────────────────────────────────────────────────

interface CanvasStageProps {
  editor: EditorApi
  viewport: { w: number; h: number }
}

function CanvasStage({ editor, viewport }: CanvasStageProps) {
  const { plan, selection } = editor
  const fit = useMemo(
    () => fitRoom(plan.room, viewport, STAGE_PAD),
    [plan.room.lengthCm, plan.room.widthCm, viewport.w, viewport.h] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const stageRef = useRef<Konva.Stage | null>(null)

  // Click on background = deselect.
  const handleBgClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (e.target === e.target.getStage()) {
        editor.select({ kind: 'none' })
      }
    },
    [editor]
  )

  return (
    <Stage
      ref={stageRef}
      width={viewport.w}
      height={viewport.h}
      onMouseDown={handleBgClick}
      onTouchStart={handleBgClick}
      style={{ touchAction: 'none' }}
    >
      <Layer listening={false}>
        <GridBackground viewport={viewport} fit={fit} room={plan.room} />
        <CabinetHints plan={plan} fit={fit} />
      </Layer>
      <Layer>
        <RoomFrame
          plan={plan}
          fit={fit}
          selected={selection.kind === 'room' || selection.kind === 'side'}
          selectedSide={selection.kind === 'side' ? selection.side : null}
          onSelectRoom={() => editor.select({ kind: 'room' })}
          onSelectSide={(side) => editor.select({ kind: 'side', side })}
          onResize={(patch) => editor.patchRoom(patch)}
        />
        {plan.openings.map((o) => (
          <OpeningNode
            key={o.id}
            opening={o}
            plan={plan}
            fit={fit}
            selected={selection.kind === 'opening' && selection.id === o.id}
            onSelect={() => editor.select({ kind: 'opening', id: o.id })}
            onChange={(patch) => editor.patchOpening(o.id, patch)}
          />
        ))}
        {plan.features.map((f) => (
          <FeatureNode
            key={f.id}
            feature={f}
            plan={plan}
            fit={fit}
            selected={selection.kind === 'feature' && selection.id === f.id}
            onSelect={() => editor.select({ kind: 'feature', id: f.id })}
            onChange={(patch) => editor.patchFeature(f.id, patch)}
          />
        ))}
        {plan.island && (
          <IslandNode
            island={plan.island}
            fit={fit}
            room={plan.room}
            selected={selection.kind === 'island'}
            onSelect={() => editor.select({ kind: 'island', id: plan.island!.id })}
            onChange={editor.patchIsland}
          />
        )}
      </Layer>
    </Stage>
  )
}

// ─── Grid + cabinet hint background ──────────────────────────────────────────

function GridBackground({
  viewport,
  fit,
  room,
}: {
  viewport: { w: number; h: number }
  fit: ReturnType<typeof fitRoom>
  room: { lengthCm: number; widthCm: number }
}) {
  const lines = useMemo(() => {
    const out: { points: number[]; major: boolean }[] = []
    const step10 = 10 * fit.scale
    const step50 = 50 * fit.scale
    if (step10 < 6) return out // density guard for tiny scales
    const right = fit.inner.x + room.lengthCm * fit.scale
    const bottom = fit.inner.y + room.widthCm * fit.scale
    for (let xCm = 0; xCm <= room.lengthCm + 0.001; xCm += 10) {
      const x = fit.inner.x + xCm * fit.scale
      out.push({ points: [x, fit.inner.y, x, bottom], major: xCm % 50 === 0 })
    }
    for (let yCm = 0; yCm <= room.widthCm + 0.001; yCm += 10) {
      const y = fit.inner.y + yCm * fit.scale
      out.push({ points: [fit.inner.x, y, right, y], major: yCm % 50 === 0 })
    }
    void step50
    return out
  }, [fit.inner.x, fit.inner.y, fit.scale, room.lengthCm, room.widthCm])

  return (
    <>
      <Rect x={0} y={0} width={viewport.w} height={viewport.h} fill={COLOR.bg} />
      {lines.map((l, i) => (
        <Line
          key={i}
          points={l.points}
          stroke={l.major ? COLOR.grid50 : COLOR.grid10}
          strokeWidth={l.major ? 0.6 : 0.4}
        />
      ))}
    </>
  )
}

function CabinetHints({ plan, fit }: { plan: FloorPlan; fit: ReturnType<typeof fitRoom> }) {
  const sides = plan.room.sides
  const depthPx = 22
  const inset = 4
  const { x, y, w, h } = fit.inner
  const items: { x: number; y: number; w: number; h: number }[] = []
  const top = () => sides.top.kind === 'closed' && items.push({ x: x + inset, y: y + inset, w: w - inset * 2, h: depthPx })
  const bottom = () => sides.bottom.kind === 'closed' && items.push({ x: x + inset, y: y + h - depthPx - inset, w: w - inset * 2, h: depthPx })
  const left = () => sides.left.kind === 'closed' && items.push({ x: x + inset, y: y + inset, w: depthPx, h: h - inset * 2 })
  const right = () => sides.right.kind === 'closed' && items.push({ x: x + w - depthPx - inset, y: y + inset, w: depthPx, h: h - inset * 2 })

  switch (plan.layoutShape) {
    case 'galley':
      top()
      bottom()
      break
    case 'l_shape':
      top()
      left()
      break
    case 'u_shape':
      top()
      left()
      right()
      break
    case 'peninsula':
      top()
      if (sides.bottom.kind === 'closed') {
        items.push({ x: x + inset, y: y + h - depthPx - inset, w: (w - inset * 2) * 0.55, h: depthPx })
      }
      break
    case 'island':
    case 'open':
      top()
      break
    default:
      top()
  }
  return (
    <>
      {items.map((r, i) => (
        <Rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill={COLOR.cabHint}
          stroke={COLOR.cabHintStroke}
          dash={[2, 4]}
          strokeWidth={1}
          cornerRadius={2}
          listening={false}
        />
      ))}
    </>
  )
}

// ─── Room frame (walls + edge handles) ───────────────────────────────────────

function RoomFrame({
  plan,
  fit,
  selected,
  selectedSide,
  onSelectRoom,
  onSelectSide,
  onResize,
}: {
  plan: FloorPlan
  fit: ReturnType<typeof fitRoom>
  selected: boolean
  selectedSide: WallSide | null
  onSelectRoom: () => void
  onSelectSide: (side: WallSide) => void
  onResize: (patch: Partial<RoomSpec>) => void
}) {
  const { x, y, w, h } = fit.inner
  const sides = plan.room.sides

  const lineFor = (side: WallSide) => {
    const open = sides[side].kind === 'open'
    const isSel = selectedSide === side
    const stroke = open ? COLOR.wallOpen : COLOR.wall
    const dash = open ? [8, 6] : undefined
    const baseProps = {
      stroke: isSel ? COLOR.selectedRing : stroke,
      strokeWidth: isSel ? 4 : 3,
      dash,
      hitStrokeWidth: 24, // touch-friendly
      onMouseDown: () => onSelectSide(side),
      onTouchStart: () => onSelectSide(side),
    }
    switch (side) {
      case 'top':
        return <Line points={[x, y, x + w, y]} {...baseProps} />
      case 'bottom':
        return <Line points={[x, y + h, x + w, y + h]} {...baseProps} />
      case 'left':
        return <Line points={[x, y, x, y + h]} {...baseProps} />
      case 'right':
        return <Line points={[x + w, y, x + w, y + h]} {...baseProps} />
    }
  }

  // Edge resize handles — small grab dots in the middle of each side.
  const handles: { side: WallSide; cx: number; cy: number }[] = [
    { side: 'top', cx: x + w / 2, cy: y },
    { side: 'bottom', cx: x + w / 2, cy: y + h },
    { side: 'left', cx: x, cy: y + h / 2 },
    { side: 'right', cx: x + w, cy: y + h / 2 },
  ]

  return (
    <Group>
      {/* Transparent background hit-target so tapping inside the room selects the room. */}
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="transparent"
        onMouseDown={onSelectRoom}
        onTouchStart={onSelectRoom}
      />
      {(['top', 'right', 'bottom', 'left'] as WallSide[]).map((side) => (
        <Group key={side}>{lineFor(side)}</Group>
      ))}
      {selected &&
        handles.map((hndl) => (
          <Circle
            key={hndl.side}
            x={hndl.cx}
            y={hndl.cy}
            radius={7}
            fill="white"
            stroke={COLOR.selectedRing}
            strokeWidth={2}
            draggable
            dragBoundFunc={(pos) => {
              // Constrain handle drag to its own axis.
              if (hndl.side === 'top' || hndl.side === 'bottom') return { x: hndl.cx, y: pos.y }
              return { x: pos.x, y: hndl.cy }
            }}
            onMouseDown={(e) => {
              e.cancelBubble = true
              onSelectSide(hndl.side)
            }}
            onDragMove={(e) => {
              const target = e.target
              const px = target.x()
              const py = target.y()
              if (hndl.side === 'top' || hndl.side === 'bottom') {
                const newWidthCm = pxLengthToCm(
                  hndl.side === 'top' ? y + h - py : py - y,
                  fit.scale
                )
                const widthCm = clamp(snap(newWidthCm), DIM_HARD_MIN, DIM_HARD_MAX)
                onResize({ widthCm, confidence: 'H', source: 'homeowner' })
              } else {
                const newLenCm = pxLengthToCm(
                  hndl.side === 'left' ? x + w - px : px - x,
                  fit.scale
                )
                const lengthCm = clamp(snap(newLenCm), DIM_HARD_MIN, DIM_HARD_MAX)
                onResize({ lengthCm, confidence: 'H', source: 'homeowner' })
              }
            }}
          />
        ))}
    </Group>
  )
}

function pxLengthToCm(px: number, scale: number): number {
  return Math.max(0, px / scale)
}

// ─── Opening node ────────────────────────────────────────────────────────────

function OpeningNode({
  opening,
  plan,
  fit,
  selected,
  onSelect,
  onChange,
}: {
  opening: Opening
  plan: FloorPlan
  fit: ReturnType<typeof fitRoom>
  selected: boolean
  onSelect: () => void
  onChange: (patch: Partial<Opening>) => void
}) {
  const total = wallLengthCm(opening.wall, plan.room)
  const horiz = wallAxis(opening.wall) === 'h'
  const wPx = opening.widthCm * fit.scale
  const baseColors = openingColors(opening.kind)
  const dashed = opening.confidence === 'L' && !selected ? [3, 3] : undefined

  // Position
  const startPx = opening.startCm * fit.scale
  const x = horiz
    ? fit.inner.x + startPx
    : opening.wall === 'left'
      ? fit.inner.x - 5
      : fit.inner.x + plan.room.lengthCm * fit.scale - 5
  const y = horiz
    ? opening.wall === 'top'
      ? fit.inner.y - 5
      : fit.inner.y + plan.room.widthCm * fit.scale - 5
    : fit.inner.y + startPx
  const w = horiz ? wPx : 10
  const h = horiz ? 10 : wPx

  const stroke = opening.confidence === 'L' && !selected ? COLOR.lowConf : baseColors.stroke

  return (
    <Group
      x={x}
      y={y}
      draggable
      dragBoundFunc={(pos) => {
        // Constrain drag to the wall axis.
        if (horiz) {
          const minX = fit.inner.x
          const maxX = fit.inner.x + total * fit.scale - wPx
          return { x: clamp(pos.x, minX, maxX), y }
        }
        const minY = fit.inner.y
        const maxY = fit.inner.y + total * fit.scale - wPx
        return { x, y: clamp(pos.y, minY, maxY) }
      }}
      onMouseDown={(e) => {
        e.cancelBubble = true
        onSelect()
      }}
      onTouchStart={(e) => {
        e.cancelBubble = true
        onSelect()
      }}
      onDragMove={(e) => {
        const node = e.target
        const startCmRaw = horiz
          ? (node.x() - fit.inner.x) / fit.scale
          : (node.y() - fit.inner.y) / fit.scale
        const snapped = snapToWallEnds(snap(startCmRaw, SNAP_CM), total - opening.widthCm, CORNER_SNAP_CM)
        onChange({ startCm: clamp(snapped, 0, total - opening.widthCm) })
      }}
    >
      <Rect
        width={w}
        height={h}
        fill={baseColors.fill}
        stroke={selected ? COLOR.selectedRing : stroke}
        strokeWidth={selected ? 2 : 1.5}
        dash={dashed}
        cornerRadius={2}
      />
      {selected && (
        <Text
          text={`${OPENING_DEFAULTS[opening.kind].label} · ${formatLengthCompact(opening.widthCm, plan.units)}`}
          x={horiz ? -2 : -34}
          y={horiz ? -16 : -2}
          fontSize={10}
          fill={COLOR.textBody}
          fontStyle="bold"
        />
      )}
    </Group>
  )
}

function openingColors(kind: OpeningKind): { fill: string; stroke: string } {
  switch (kind) {
    case 'window':
      return { fill: COLOR.windowFill, stroke: COLOR.windowStroke }
    case 'door':
      return { fill: COLOR.doorFill, stroke: COLOR.doorStroke }
    case 'passage':
      return { fill: COLOR.passageFill, stroke: COLOR.passageStroke }
  }
}

// ─── Feature node ────────────────────────────────────────────────────────────

function FeatureNode({
  feature,
  plan,
  fit,
  selected,
  onSelect,
  onChange,
}: {
  feature: Feature
  plan: FloorPlan
  fit: ReturnType<typeof fitRoom>
  selected: boolean
  onSelect: () => void
  onChange: (patch: Partial<Feature>) => void
}) {
  const total = wallLengthCm(feature.wall, plan.room)
  const horiz = wallAxis(feature.wall) === 'h'
  const wPx = feature.widthCm * fit.scale
  const hPx = 22
  const insetCm = 28
  const stroke = feature.confidence === 'L' && !selected ? COLOR.lowConf : COLOR.feature
  const dashed = feature.confidence === 'L' && !selected ? [3, 3] : undefined

  const startCm = clamp(feature.centerCm - feature.widthCm / 2, 0, total - feature.widthCm)
  const x = horiz
    ? fit.inner.x + startCm * fit.scale
    : feature.wall === 'left'
      ? fit.inner.x + insetCm * fit.scale - hPx / 2
      : fit.inner.x + (plan.room.lengthCm - insetCm) * fit.scale - hPx / 2
  const y = horiz
    ? feature.wall === 'top'
      ? fit.inner.y + insetCm * fit.scale - hPx / 2
      : fit.inner.y + (plan.room.widthCm - insetCm) * fit.scale - hPx / 2
    : fit.inner.y + startCm * fit.scale
  const w = horiz ? wPx : hPx
  const h = horiz ? hPx : wPx

  return (
    <Group
      x={x}
      y={y}
      draggable
      dragBoundFunc={(pos) => {
        if (horiz) {
          const minX = fit.inner.x
          const maxX = fit.inner.x + total * fit.scale - wPx
          return { x: clamp(pos.x, minX, maxX), y }
        }
        const minY = fit.inner.y
        const maxY = fit.inner.y + total * fit.scale - wPx
        return { x, y: clamp(pos.y, minY, maxY) }
      }}
      onMouseDown={(e) => {
        e.cancelBubble = true
        onSelect()
      }}
      onTouchStart={(e) => {
        e.cancelBubble = true
        onSelect()
      }}
      onDragMove={(e) => {
        const node = e.target
        const startRaw = horiz
          ? (node.x() - fit.inner.x) / fit.scale
          : (node.y() - fit.inner.y) / fit.scale
        const snappedStart = snapToWallEnds(snap(startRaw, SNAP_CM), total - feature.widthCm, CORNER_SNAP_CM)
        onChange({ centerCm: clamp(snappedStart, 0, total - feature.widthCm) + feature.widthCm / 2 })
      }}
    >
      <Rect
        width={w}
        height={h}
        fill={COLOR.featureFill}
        stroke={selected ? COLOR.selectedRing : stroke}
        strokeWidth={selected ? 2 : 1.25}
        dash={dashed}
        cornerRadius={3}
      />
      <Text
        text={FEATURE_DEFAULTS[feature.kind].label}
        x={horiz ? 0 : -2}
        y={horiz ? 0 : 0}
        width={w}
        height={h}
        align="center"
        verticalAlign="middle"
        fontSize={10}
        fontStyle="bold"
        fill={stroke}
      />
      {selected && (
        <Text
          text={formatLengthCompact(feature.widthCm, plan.units)}
          x={horiz ? 0 : -34}
          y={horiz ? -14 : 0}
          width={horiz ? w : 30}
          align={horiz ? 'center' : 'right'}
          fontSize={10}
          fill={COLOR.textBody}
          fontStyle="bold"
        />
      )}
    </Group>
  )
}

// ─── Island node ─────────────────────────────────────────────────────────────

function IslandNode({
  island,
  fit,
  room,
  selected,
  onSelect,
  onChange,
}: {
  island: Island
  fit: ReturnType<typeof fitRoom>
  room: RoomSpec
  selected: boolean
  onSelect: () => void
  onChange: (patch: Partial<Island>) => void
}) {
  const wPx = island.lengthCm * fit.scale
  const hPx = island.widthCm * fit.scale
  const x = fit.inner.x + island.centerXCm * fit.scale - wPx / 2
  const y = fit.inner.y + island.centerYCm * fit.scale - hPx / 2
  const dashed = island.confidence === 'L' && !selected ? [3, 3] : undefined

  return (
    <Group
      x={x}
      y={y}
      draggable
      dragBoundFunc={(pos) => {
        const minX = fit.inner.x + 60 * fit.scale
        const maxX = fit.inner.x + (room.lengthCm - island.lengthCm - 60) * fit.scale
        const minY = fit.inner.y + 60 * fit.scale
        const maxY = fit.inner.y + (room.widthCm - island.widthCm - 60) * fit.scale
        return {
          x: clamp(pos.x, Math.min(minX, maxX), Math.max(minX, maxX)),
          y: clamp(pos.y, Math.min(minY, maxY), Math.max(minY, maxY)),
        }
      }}
      onMouseDown={(e) => {
        e.cancelBubble = true
        onSelect()
      }}
      onTouchStart={(e) => {
        e.cancelBubble = true
        onSelect()
      }}
      onDragMove={(e) => {
        const node = e.target
        const cx = (node.x() - fit.inner.x) / fit.scale + island.lengthCm / 2
        const cy = (node.y() - fit.inner.y) / fit.scale + island.widthCm / 2
        onChange({ centerXCm: snap(cx, SNAP_CM), centerYCm: snap(cy, SNAP_CM) })
      }}
    >
      <Rect
        width={wPx}
        height={hPx}
        fill={COLOR.islandFill}
        stroke={selected ? COLOR.selectedRing : COLOR.islandStroke}
        strokeWidth={selected ? 2 : 1.5}
        dash={dashed}
        cornerRadius={4}
      />
      <Text
        text="Island"
        width={wPx}
        height={hPx}
        align="center"
        verticalAlign="middle"
        fontSize={11}
        fill={COLOR.textBody}
        fontStyle="bold"
      />
    </Group>
  )
}

// ─── Selection panel (right of stage on desktop, below on mobile) ────────────

function SelectionPanel({
  editor,
  initialSnapshot,
}: {
  editor: EditorApi
  initialSnapshot: FloorPlan
}) {
  const { plan, selection } = editor

  if (selection.kind === 'none') {
    return (
      <div className="hidden w-full shrink-0 rounded-2xl border border-border bg-card/40 p-4 text-xs text-muted-foreground lg:block lg:w-72">
        <p className="font-semibold text-foreground">Tap any element</p>
        <p className="mt-1 leading-relaxed">
          Walls, doors, windows, sink, hob, fridge, dishwasher, island — all draggable.
          Edit numbers here.
        </p>
        <ul className="mt-3 space-y-1 text-[11px]">
          <li>· Drag a wall edge to resize the room.</li>
          <li>· Tap a side line to mark it open (no wall).</li>
          <li>· Use the toolbar below to add anything.</li>
        </ul>
      </div>
    )
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={selectionKey(selection)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2 }}
        className="w-full shrink-0 rounded-2xl border border-border bg-card p-4 shadow-sm lg:w-72"
      >
        {selection.kind === 'room' && <RoomEditor editor={editor} />}
        {selection.kind === 'side' && <SideEditor editor={editor} side={selection.side} />}
        {selection.kind === 'opening' && (
          <OpeningEditor editor={editor} id={selection.id} initialSnapshot={initialSnapshot} />
        )}
        {selection.kind === 'feature' && (
          <FeatureEditor editor={editor} id={selection.id} initialSnapshot={initialSnapshot} />
        )}
        {selection.kind === 'island' && plan.island && (
          <IslandEditor editor={editor} initialSnapshot={initialSnapshot} />
        )}
      </motion.div>
    </AnimatePresence>
  )
}

function selectionKey(s: SelectionId): string {
  if (s.kind === 'opening' || s.kind === 'feature' || s.kind === 'island') return `${s.kind}:${s.id}`
  if (s.kind === 'side') return `side:${s.side}`
  return s.kind
}

function PanelHeader({
  title,
  onClose,
  badge,
}: {
  title: string
  onClose: () => void
  badge?: React.ReactNode
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </p>
      <div className="flex items-center gap-2">
        {badge}
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
    </div>
  )
}

function ProvenanceBadge({
  confidence,
  source,
}: {
  confidence: 'H' | 'M' | 'L'
  source: 'homeowner' | 'ai_vision' | 'inferred' | 'preset'
}) {
  const sourceMeta = {
    homeowner: { label: 'you confirmed', tone: 'bg-emerald-100 text-emerald-800' },
    ai_vision: { label: 'AI guess', tone: 'bg-violet-100 text-violet-800' },
    inferred: { label: 'inferred', tone: 'bg-amber-100 text-amber-800' },
    preset: { label: 'default', tone: 'bg-blue-100 text-blue-800' },
  }[source]
  const confLabel = confidence === 'H' ? 'high' : confidence === 'M' ? 'med' : 'low'
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase', sourceMeta.tone)}>
      {sourceMeta.label} · {confLabel}
    </span>
  )
}

function RoomEditor({ editor }: { editor: EditorApi }) {
  const { plan } = editor
  return (
    <div>
      <PanelHeader
        title="Room"
        onClose={() => editor.select({ kind: 'none' })}
        badge={<ProvenanceBadge confidence={plan.room.confidence} source={plan.room.source} />}
      />
      <div className="space-y-3">
        <DimInput
          label="Length (longer wall)"
          cm={plan.room.lengthCm}
          unit={plan.units}
          onCommit={(cm) =>
            editor.patchRoom({
              lengthCm: clamp(cm, DIM_HARD_MIN, DIM_HARD_MAX),
              confidence: 'H',
              source: 'homeowner',
            })
          }
        />
        <DimInput
          label="Width (shorter wall)"
          cm={plan.room.widthCm}
          unit={plan.units}
          onCommit={(cm) =>
            editor.patchRoom({
              widthCm: clamp(cm, DIM_HARD_MIN, DIM_HARD_MAX),
              confidence: 'H',
              source: 'homeowner',
            })
          }
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Tap each wall to mark it as open (no wall — opens to another room) or label it
          for the maker.
        </p>
      </div>
    </div>
  )
}

function SideEditor({ editor, side }: { editor: EditorApi; side: WallSide }) {
  const { plan } = editor
  const sideSpec = plan.room.sides[side]
  const wallTitle = `${capitalize(side)} side`
  return (
    <div>
      <PanelHeader title={wallTitle} onClose={() => editor.select({ kind: 'none' })} />
      <div className="space-y-3">
        <div role="group" aria-label="Side kind" className="grid grid-cols-2 gap-1.5">
          {(['closed', 'open'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => editor.patchSide(side, { kind: k })}
              className={cn(
                'rounded-lg border px-2.5 py-2 text-[12px] font-medium transition-colors',
                sideSpec.kind === k
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {k === 'closed' ? 'Closed wall' : 'Open (no wall)'}
            </button>
          ))}
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
            Optional label
          </label>
          <input
            type="text"
            value={sideSpec.label ?? ''}
            placeholder="e.g. window wall, to dining"
            onChange={(e) => editor.patchSide(side, { label: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Open sides can&apos;t host windows, doors, or cabinets. Use this for open-plan
          kitchens that flow into dining or living spaces.
        </p>
      </div>
    </div>
  )
}

function OpeningEditor({
  editor,
  id,
  initialSnapshot,
}: {
  editor: EditorApi
  id: string
  initialSnapshot: FloorPlan
}) {
  const { plan } = editor
  const opening = plan.openings.find((o) => o.id === id)
  if (!opening) return null
  const original = initialSnapshot.openings.find((o) => o.id === id)
  const total = wallLengthCm(opening.wall, plan.room)

  return (
    <div>
      <PanelHeader
        title={OPENING_DEFAULTS[opening.kind].label}
        onClose={() => editor.select({ kind: 'none' })}
        badge={<ProvenanceBadge confidence={opening.confidence} source={opening.source} />}
      />
      <div className="space-y-3">
        <WallPicker
          plan={plan}
          value={opening.wall}
          onChange={(wall) =>
            editor.patchOpening(id, {
              wall,
              startCm: clamp(opening.startCm, 0, wallLengthCm(wall, plan.room) - opening.widthCm),
            })
          }
        />
        <DimSlider
          label="Width"
          cm={opening.widthCm}
          minCm={30}
          maxCm={Math.min(total, 360)}
          unit={plan.units}
          onChange={(cm) =>
            editor.patchOpening(id, {
              widthCm: snap(cm),
              startCm: clamp(opening.startCm, 0, total - snap(cm)),
            })
          }
        />
        <DimSlider
          label="From corner"
          cm={opening.startCm}
          minCm={0}
          maxCm={total - opening.widthCm}
          unit={plan.units}
          onChange={(cm) => editor.patchOpening(id, { startCm: snap(cm) })}
        />
        <KindRow>
          {(['window', 'door', 'passage'] as OpeningKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => editor.patchOpening(id, { kind: k })}
              className={cn(
                'rounded-lg border px-2 py-1.5 text-[12px] font-medium transition-colors',
                opening.kind === k
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {OPENING_DEFAULTS[k].label}
            </button>
          ))}
        </KindRow>
        <PanelActions
          onDelete={() => {
            editor.removeOpening(id)
            editor.select({ kind: 'none' })
          }}
          onReset={
            original
              ? () => editor.patchOpening(id, { ...original })
              : null
          }
        />
      </div>
    </div>
  )
}

function FeatureEditor({
  editor,
  id,
  initialSnapshot,
}: {
  editor: EditorApi
  id: string
  initialSnapshot: FloorPlan
}) {
  const { plan } = editor
  const feature = plan.features.find((f) => f.id === id)
  if (!feature) return null
  const original = initialSnapshot.features.find((f) => f.id === id)
  const total = wallLengthCm(feature.wall, plan.room)

  return (
    <div>
      <PanelHeader
        title={FEATURE_DEFAULTS[feature.kind].label}
        onClose={() => editor.select({ kind: 'none' })}
        badge={<ProvenanceBadge confidence={feature.confidence} source={feature.source} />}
      />
      <div className="space-y-3">
        <WallPicker
          plan={plan}
          value={feature.wall}
          onChange={(wall) =>
            editor.patchFeature(id, {
              wall,
              centerCm: clamp(
                feature.centerCm,
                feature.widthCm / 2,
                wallLengthCm(wall, plan.room) - feature.widthCm / 2
              ),
            })
          }
        />
        <DimSlider
          label="Width"
          cm={feature.widthCm}
          minCm={30}
          maxCm={150}
          unit={plan.units}
          onChange={(cm) =>
            editor.patchFeature(id, {
              widthCm: snap(cm),
              centerCm: clamp(feature.centerCm, snap(cm) / 2, total - snap(cm) / 2),
            })
          }
        />
        <DimSlider
          label="From corner (centre)"
          cm={feature.centerCm}
          minCm={feature.widthCm / 2}
          maxCm={total - feature.widthCm / 2}
          unit={plan.units}
          onChange={(cm) => editor.patchFeature(id, { centerCm: snap(cm) })}
        />
        <KindRow>
          {(['sink', 'hob', 'fridge', 'dishwasher'] as FeatureKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => editor.patchFeature(id, { kind: k, widthCm: FEATURE_DEFAULTS[k].widthCm })}
              className={cn(
                'rounded-lg border px-2 py-1.5 text-[12px] font-medium transition-colors',
                feature.kind === k
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {FEATURE_DEFAULTS[k].label}
            </button>
          ))}
        </KindRow>
        <PanelActions
          onDelete={() => {
            editor.removeFeature(id)
            editor.select({ kind: 'none' })
          }}
          onReset={original ? () => editor.patchFeature(id, { ...original }) : null}
        />
      </div>
    </div>
  )
}

function IslandEditor({
  editor,
  initialSnapshot,
}: {
  editor: EditorApi
  initialSnapshot: FloorPlan
}) {
  const { plan } = editor
  if (!plan.island) return null
  const island = plan.island
  const original = initialSnapshot.island

  return (
    <div>
      <PanelHeader
        title="Island"
        onClose={() => editor.select({ kind: 'none' })}
        badge={<ProvenanceBadge confidence={island.confidence} source={island.source} />}
      />
      <div className="space-y-3">
        <DimSlider
          label="Length"
          cm={island.lengthCm}
          minCm={80}
          maxCm={Math.min(plan.room.lengthCm * 0.85, 360)}
          unit={plan.units}
          onChange={(cm) => editor.patchIsland({ lengthCm: snap(cm) })}
        />
        <DimSlider
          label="Width"
          cm={island.widthCm}
          minCm={60}
          maxCm={Math.min(plan.room.widthCm * 0.85, 180)}
          unit={plan.units}
          onChange={(cm) => editor.patchIsland({ widthCm: snap(cm) })}
        />
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
          <span className="text-[13px]">Seating</span>
          <button
            type="button"
            onClick={() => editor.patchIsland({ seating: !island.seating })}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-semibold',
              island.seating ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            {island.seating ? 'Yes' : 'No'}
          </button>
        </div>
        <PanelActions
          onDelete={() => {
            editor.removeIsland()
            editor.select({ kind: 'none' })
          }}
          onReset={original ? () => editor.patchIsland({ ...original }) : null}
        />
      </div>
    </div>
  )
}

function PanelActions({
  onDelete,
  onReset,
}: {
  onDelete: () => void
  onReset: (() => void) | null
}) {
  return (
    <div className="flex items-center justify-between gap-2 pt-1">
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3 stroke-[2]" aria-hidden /> Reset to AI guess
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="ml-auto inline-flex items-center gap-1 rounded-lg border border-destructive/30 bg-destructive/5 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="size-3 stroke-[2]" aria-hidden /> Remove
      </button>
    </div>
  )
}

function KindRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-1.5">{children}</div>
}

function WallPicker({
  plan,
  value,
  onChange,
}: {
  plan: FloorPlan
  value: WallSide
  onChange: (w: WallSide) => void
}) {
  return (
    <div role="group" aria-label="Wall" className="grid grid-cols-4 gap-1.5">
      {(['top', 'right', 'bottom', 'left'] as WallSide[]).map((w) => {
        const open = plan.room.sides[w].kind === 'open'
        const disabled = open
        return (
          <button
            key={w}
            type="button"
            disabled={disabled}
            onClick={() => onChange(w)}
            className={cn(
              'rounded-lg border px-1.5 py-1.5 text-[11px] font-medium capitalize transition-colors',
              value === w
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
              disabled && 'opacity-30 hover:text-muted-foreground'
            )}
            title={disabled ? 'This side is open — no wall to attach to.' : undefined}
          >
            {w}
          </button>
        )
      })}
    </div>
  )
}

// ─── Numeric input + slider with unit parsing ────────────────────────────────

function DimInput({
  label,
  cm,
  unit,
  onCommit,
}: {
  label: string
  cm: number
  unit: DisplayUnit
  onCommit: (cm: number) => void
}) {
  const [text, setText] = useState(() => formatLength(cm, unit))
  const [error, setError] = useState<string | null>(null)
  // Re-sync external changes (drag, undo, unit toggle) without a useEffect:
  // detect prop changes during render and reset state. This is the recommended
  // React 19 pattern for "reset state when a key prop changes" — avoids the
  // double-commit cascade you get with setState-in-useEffect.
  const [prevCm, setPrevCm] = useState(cm)
  const [prevUnit, setPrevUnit] = useState(unit)
  if (prevCm !== cm || prevUnit !== unit) {
    setPrevCm(cm)
    setPrevUnit(unit)
    setText(formatLength(cm, unit))
    setError(null)
  }

  const commit = () => {
    const parsed = parseLengthToCm(text)
    if (parsed === null) {
      setError(`Try e.g. ${unit === 'cm' ? '260 cm' : `8' 6"`}`)
      return
    }
    setError(null)
    onCommit(parsed)
  }
  return (
    <div>
      <label className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={() => onCommit(snap(cm + 10))}
          className="text-[11px] text-muted-foreground hover:text-foreground"
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </label>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
        className={cn(
          'w-full rounded-lg border bg-background px-3 py-2 text-[14px] focus:outline-none focus:ring-2',
          error
            ? 'border-destructive ring-destructive'
            : 'border-border focus:border-primary focus:ring-ring'
        )}
      />
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  )
}

function DimSlider({
  label,
  cm,
  minCm,
  maxCm,
  unit,
  onChange,
}: {
  label: string
  cm: number
  minCm: number
  maxCm: number
  unit: DisplayUnit
  onChange: (cm: number) => void
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
        <span className="font-mono text-[11px] text-foreground">{formatLength(cm, unit)}</span>
      </div>
      <input
        type="range"
        min={Math.max(0, Math.floor(minCm))}
        max={Math.ceil(maxCm)}
        step={5}
        value={Math.min(maxCm, Math.max(minCm, cm))}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-foreground"
      />
    </div>
  )
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

function Toolbar({ editor }: { editor: EditorApi }) {
  const { plan } = editor
  const wall: WallSide = (() => {
    // Pick a default wall for new elements: the closed side facing the most floor space
    // (heuristic: top if closed, else any closed side).
    const order: WallSide[] = ['top', 'bottom', 'left', 'right']
    return order.find((w) => plan.room.sides[w].kind === 'closed') ?? 'top'
  })()

  function addOpening(kind: OpeningKind) {
    const next = makeOpening(kind, wall, plan.room)
    editor.addOpening(next)
    editor.select({ kind: 'opening', id: next.id })
  }
  function addFeature(kind: FeatureKind) {
    const next = makeFeature(kind, wall, plan.room)
    editor.addFeature(next)
    editor.select({ kind: 'feature', id: next.id })
  }
  function addOrRemoveIsland() {
    if (plan.island) {
      editor.removeIsland()
      editor.select({ kind: 'none' })
    } else {
      const next = makeIsland(plan.room)
      editor.addIsland(next)
      editor.select({ kind: 'island', id: next.id })
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-card/60 px-2 py-2 shadow-sm">
      <ToolbarButton onClick={() => addOpening('window')} icon="◻︎" label="Window" />
      <ToolbarButton onClick={() => addOpening('door')} icon="⊟" label="Door" />
      <ToolbarButton onClick={() => addOpening('passage')} icon="⊖" label="Passage" />
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      <ToolbarButton onClick={() => addFeature('sink')} icon="◯" label="Sink" />
      <ToolbarButton onClick={() => addFeature('hob')} icon="◉" label="Hob" />
      <ToolbarButton onClick={() => addFeature('fridge')} icon="▭" label="Fridge" />
      <ToolbarButton onClick={() => addFeature('dishwasher')} icon="▢" label="DW" />
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      <ToolbarButton
        onClick={addOrRemoveIsland}
        icon={plan.island ? <Minus className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
        label={plan.island ? 'Remove island' : 'Island'}
      />
    </div>
  )
}

function ToolbarButton({
  onClick,
  icon,
  label,
}: {
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[12px] font-medium text-foreground transition-colors hover:bg-accent/40"
    >
      <span aria-hidden className="text-[14px] leading-none">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  )
}

// ─── Keyboard shortcuts ──────────────────────────────────────────────────────

function useKeyboardShortcuts(editor: EditorApi) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) editor.redo()
        else editor.undo()
        return
      }
      if (e.key === 'Escape') {
        editor.select({ kind: 'none' })
        return
      }
      const sel = editor.selection
      const stepCm = e.shiftKey ? 1 : 5
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (sel.kind === 'opening') editor.removeOpening(sel.id)
        else if (sel.kind === 'feature') editor.removeFeature(sel.id)
        else if (sel.kind === 'island') editor.removeIsland()
        if (sel.kind === 'opening' || sel.kind === 'feature' || sel.kind === 'island') editor.select({ kind: 'none' })
        return
      }
      const arrow = arrowDelta(e.key)
      if (!arrow) return
      e.preventDefault()
      nudgeSelection(editor, arrow, stepCm)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor])
}

function arrowDelta(key: string): { dx: number; dy: number } | null {
  switch (key) {
    case 'ArrowLeft':
      return { dx: -1, dy: 0 }
    case 'ArrowRight':
      return { dx: 1, dy: 0 }
    case 'ArrowUp':
      return { dx: 0, dy: -1 }
    case 'ArrowDown':
      return { dx: 0, dy: 1 }
    default:
      return null
  }
}

function nudgeSelection(editor: EditorApi, d: { dx: number; dy: number }, stepCm: number) {
  const sel = editor.selection
  const { plan } = editor
  if (sel.kind === 'opening') {
    const o = plan.openings.find((x) => x.id === sel.id)
    if (!o) return
    const horiz = wallAxis(o.wall) === 'h'
    const delta = (horiz ? d.dx : d.dy) * stepCm
    if (delta === 0) return
    const total = wallLengthCm(o.wall, plan.room)
    editor.patchOpening(o.id, { startCm: clamp(o.startCm + delta, 0, total - o.widthCm) })
  } else if (sel.kind === 'feature') {
    const f = plan.features.find((x) => x.id === sel.id)
    if (!f) return
    const horiz = wallAxis(f.wall) === 'h'
    const delta = (horiz ? d.dx : d.dy) * stepCm
    if (delta === 0) return
    const total = wallLengthCm(f.wall, plan.room)
    editor.patchFeature(f.id, {
      centerCm: clamp(f.centerCm + delta, f.widthCm / 2, total - f.widthCm / 2),
    })
  } else if (sel.kind === 'island' && plan.island) {
    const i = plan.island
    editor.patchIsland({
      centerXCm: clamp(i.centerXCm + d.dx * stepCm, i.lengthCm / 2 + 60, plan.room.lengthCm - i.lengthCm / 2 - 60),
      centerYCm: clamp(i.centerYCm + d.dy * stepCm, i.widthCm / 2 + 60, plan.room.widthCm - i.widthCm / 2 - 60),
    })
  }
}

// ─── Live announcer for screen readers ───────────────────────────────────────

function LiveAnnouncer({ plan, selection }: { plan: FloorPlan; selection: SelectionId }) {
  // Derive the message during render — no effect needed. The aria-live region
  // re-announces whenever the text content changes, which is exactly what we want.
  const msg = announcementFor(plan, selection)
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {msg}
    </div>
  )
}

function announcementFor(plan: FloorPlan, selection: SelectionId): string {
  if (selection.kind === 'opening') {
    const o = plan.openings.find((x) => x.id === selection.id)
    if (!o) return ''
    return `${OPENING_DEFAULTS[o.kind].label} on ${o.wall} wall, ${formatLengthCompact(o.widthCm, plan.units)} wide, ${formatLengthCompact(o.startCm, plan.units)} from corner.`
  }
  if (selection.kind === 'feature') {
    const f = plan.features.find((x) => x.id === selection.id)
    if (!f) return ''
    return `${FEATURE_DEFAULTS[f.kind].label} on ${f.wall} wall, ${formatLengthCompact(f.widthCm, plan.units)} wide, centred ${formatLengthCompact(f.centerCm, plan.units)} from corner.`
  }
  if (selection.kind === 'island' && plan.island) {
    return `Island, ${formatLengthCompact(plan.island.lengthCm, plan.units)} by ${formatLengthCompact(plan.island.widthCm, plan.units)}.`
  }
  if (selection.kind === 'room') {
    return `Room, ${formatLength(plan.room.lengthCm, plan.units)} by ${formatLength(plan.room.widthCm, plan.units)}.`
  }
  return ''
}

// ─── Misc helpers ────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

// Keep types referenced even if local-unused (tree-shake hints).
void cmToFeetInches
void validate
