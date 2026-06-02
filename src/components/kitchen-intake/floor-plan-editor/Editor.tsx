'use client'

/**
 * The interactive floor-plan editor — Konva-backed.
 *
 * Architecture:
 *   - `useEditor()` owns plan + selection + history (no DOM, no Konva).
 *   - `<CanvasStage />` renders the canvas reactively from that state and
 *     ALWAYS takes the full container width. The canvas height is derived
 *     from the room aspect ratio, not arbitrary, so the room fills the canvas
 *     instead of floating in a sea of grid.
 *   - The selection panel is a Figma-style floating overlay on desktop
 *     (top-right of the canvas) and a bottom sheet on mobile. It never
 *     reflows the canvas.
 *
 * Words-first: the toolbar is paired with a SentenceBuilder ("Add a [Window]
 * on the [Top wall], about [1 m] wide") so users who prefer words to drag
 * have a first-class path. The selection panel header is also sentence-style
 * with chip popovers — editing IS rewriting the sentence.
 *
 * Confidence: every drag/edit flips the touched element to (H, homeowner).
 * Low-confidence AI elements are dashed; touching one promotes them.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Stage, Layer, Rect, Line, Group, Text, Circle } from 'react-konva'
import type Konva from 'konva'
import {
  Check,
  Plus,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  COUNTER_DEPTH_OPTIONS_CM,
  DEFAULT_COUNTER_DEPTH_CM,
  DIM_HARD_MAX,
  DIM_HARD_MIN,
  FEATURE_DEFAULTS,
  OPENING_DEFAULTS,
  counterSegmentsForWall,
  defaultHasCounter,
  detectDefaultUnit,
  effectiveCounterDepth,
  effectiveCounterLength,
  effectiveCounterStart,
  effectiveHasCounter,
  fitRoom,
  formatLength,
  formatLengthCompact,
  hasCustomCounterLength,
  makeFeature,
  makeIsland,
  makeOpening,
  parseLengthToCm,
  snap,
  snapToWallEnds,
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
import { SentenceBuilder } from './SentenceBuilder'
import { ChipSelect, type ChipOption } from './ChipSelect'
import {
  ELEMENT_CATALOG,
  FEATURE_KINDS,
  OPENING_KINDS,
  parseSizeToCm,
} from './catalog'

// ─── Constants ───────────────────────────────────────────────────────────────

const STAGE_PAD = 88
const SNAP_CM = 5
const CORNER_SNAP_CM = 8
/** Dot grid spacing in cm — drawn as CSS background, aligned to room. */
const GRID_DOT_SPACING_CM = 50
/** Minimum dot spacing in px to keep the grid legible at extreme scales. */
const GRID_DOT_MIN_PX = 14
const COLOR = {
  wall: '#1f2937',
  wallOpen: '#cbd5e1',
  counterFill: '#eef0e9',
  counterStroke: '#bbc1ad',
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
  wallLabel: '#9ca3af',
  wallLabelActive: '#0ea5e9',
} as const

// ─── Public component ────────────────────────────────────────────────────────

export interface FloorPlanEditorProps {
  initialPlan: FloorPlan
  anchorPhotoUrl?: string
  onChange: (plan: FloorPlan) => void
  className?: string
}

export function FloorPlanEditor({ initialPlan, anchorPhotoUrl: _anchor, onChange, className }: FloorPlanEditorProps) {
  void _anchor
  const editor = useEditor(initialPlan)
  const [initialSnapshot] = useState(initialPlan)

  useEffect(() => {
    onChange(editor.plan)
  }, [editor.plan, onChange])

  useEffect(() => {
    editor.setUnits(detectDefaultUnit())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Canvas-only container ref + responsive viewport sizing. The canvas always
  // occupies the full container width; the height is derived from the room
  // aspect ratio (clamped to keep extreme rooms from going pancake-thin or
  // skyscraper-tall). This makes the room itself fill the canvas instead of
  // floating in a sea of grid.
  const canvasContainerRef = useRef<HTMLDivElement | null>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 720, h: 480 })
  useEffect(() => {
    const el = canvasContainerRef.current
    if (!el) return
    const compute = (cw: number) => {
      const w = Math.max(280, Math.floor(cw))
      const roomAspect = editor.plan.room.lengthCm / Math.max(1, editor.plan.room.widthCm)
      const canvasAspect = clamp(roomAspect, 1.1, 2.4)
      const h = clamp(Math.round(w / canvasAspect), 360, 680)
      return { w, h }
    }
    setCanvasSize(compute(el.getBoundingClientRect().width))
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setCanvasSize(compute(e.contentRect.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [editor.plan.room.lengthCm, editor.plan.room.widthCm])

  // `fit` translates room cm → canvas px. Lifted up so we can size the CSS
  // dotted background grid to match the room's cm grid.
  const fit = useMemo(
    () => fitRoom(editor.plan.room, canvasSize, STAGE_PAD),
    [editor.plan.room, canvasSize]
  )

  useKeyboardShortcuts(editor)

  return (
    <div className={cn('space-y-3', className)}>
      <Header editor={editor} />

      {/* Canvas takes the full main-column width. Borderless, with a dotted
          "spatial" grid that fades at top and bottom. Room dimensions are
          drawn directly along the walls (architectural-style) so there's no
          extra chrome above the canvas. The selection panel (lg+) is
          portaled to <body> and floats outside the main container, in the
          page's right-hand whitespace; on narrow viewports it falls back to
          a bottom sheet. Either way the canvas width is unaffected. */}
      <div ref={canvasContainerRef} className="relative">
        <DottedGridBackground fit={fit} viewport={canvasSize} />
        <div className="relative">
          <CanvasStage editor={editor} viewport={canvasSize} fit={fit} />
        </div>
      </div>

      {/* Desktop: floating panel rendered via portal, sticky-with-editor. */}
      <DesktopSelectionPanel
        editor={editor}
        initialSnapshot={initialSnapshot}
        canvasContainerRef={canvasContainerRef}
      />

      {/* Add to your space — toolbar + sentence builder. */}
      <AddSection editor={editor} />

      {/* Mobile: bottom sheet for selection. */}
      <MobileSelectionSheet editor={editor} initialSnapshot={initialSnapshot} />

      {/* A11y live region. */}
      <LiveAnnouncer plan={editor.plan} selection={editor.selection} />
    </div>
  )
}

// ─── Header ──────────────────────────────────────────────────────────────────

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


// ─── Canvas Stage ────────────────────────────────────────────────────────────

interface CanvasStageProps {
  editor: EditorApi
  viewport: { w: number; h: number }
  fit: ReturnType<typeof fitRoom>
}

function CanvasStage({ editor, viewport, fit }: CanvasStageProps) {
  const { plan, selection } = editor
  const stageRef = useRef<Konva.Stage | null>(null)

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
      {/* Background layer: dimension labels rendered in the gutter outside
          the room. They're listenable so clicking a dim label can select
          the room, but they don't overlap any other interactive shapes. */}
      <Layer>
        <WallLabels
          plan={plan}
          fit={fit}
          selection={selection}
          needsSize={
            plan.room.confidence !== 'H' &&
            plan.measurementMethod !== 'deferred_to_designer'
          }
          onSelectRoom={() => editor.select({ kind: 'room' })}
        />
      </Layer>
      <Layer>
        <RoomFrame
          plan={plan}
          fit={fit}
          selectedSide={selection.kind === 'side' ? selection.side : null}
          onSelectRoom={() => editor.select({ kind: 'room' })}
          onSelectSide={(side) => editor.select({ kind: 'side', side })}
        />
        {/* Counter bands sit above the wall lines so draggable runs can
            catch pointer events; non-draggable runs opt out via listening
            so wall clicks still pass through to the lines below. */}
        <CounterBands plan={plan} fit={fit} editor={editor} />
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
        {/* Mid-wall resize handles — rendered last so they sit on top of
            every other item when the room (or one of its sides) is the
            active selection. */}
        <RoomHandles
          fit={fit}
          selected={selection.kind === 'room' || selection.kind === 'side'}
          onSelectSide={(side) => editor.select({ kind: 'side', side })}
          onResize={(patch) => editor.patchRoom(patch)}
        />
      </Layer>
    </Stage>
  )
}

// ─── Background layers ───────────────────────────────────────────────────────

/**
 * Dotted "spatial" grid drawn via CSS, aligned to the room's cm grid so
 * spacing reads as 50 cm regardless of canvas zoom. Sits underneath the
 * Konva stage. Faded vertically with a single linear gradient so the canvas
 * dissolves into whitespace at top and bottom (no hard border vibe).
 *
 * We use a single-axis mask instead of a dual-axis intersect because
 * cross-browser support for `mask-composite: intersect` is uneven, and the
 * vertical fade alone is enough to avoid the rectangular "framed canvas"
 * look — left/right of the canvas the page itself provides whitespace.
 */
function DottedGridBackground({
  fit,
  viewport,
}: {
  fit: ReturnType<typeof fitRoom>
  viewport: { w: number; h: number }
}) {
  const spacing = Math.max(GRID_DOT_MIN_PX, GRID_DOT_SPACING_CM * fit.scale)
  const offsetX = ((fit.inner.x % spacing) + spacing) % spacing
  const offsetY = ((fit.inner.y % spacing) + spacing) % spacing

  const mask =
    'linear-gradient(to bottom, transparent 0%, black 9%, black 91%, transparent 100%)'

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        width: viewport.w,
        height: viewport.h,
        backgroundImage:
          'radial-gradient(circle, rgb(15 23 42 / 0.28) 1.4px, transparent 1.7px)',
        backgroundSize: `${spacing}px ${spacing}px`,
        backgroundPosition: `${offsetX}px ${offsetY}px`,
        WebkitMaskImage: mask,
        maskImage: mask,
      }}
    />
  )
}

/**
 * Counter bands per closed side (homeowner-owned binary), auto-segmented by
 * doors and passages. Windows don't break the counter; features sit on it.
 *
 * Each wall's counter run renders as a Konva Group. When the run is shorter
 * than the wall (custom length set), the Group is draggable along the wall's
 * axis — the homeowner can park a partial counter anywhere on the wall and
 * the model's `counterStartCm` follows. Doors and passages snap the run
 * (we nudge the start to flush against the nearest door edge within a
 * short snap radius). Full-wall counters aren't draggable — there's nothing
 * to slide.
 */
function CounterBands({
  plan,
  fit,
  editor,
}: {
  plan: FloorPlan
  fit: ReturnType<typeof fitRoom>
  editor: EditorApi
}) {
  const inset = 1
  const sides: WallSide[] = ['top', 'bottom', 'left', 'right']
  return (
    <>
      {sides.map((wall) => (
        <CounterBandForWall key={wall} wall={wall} plan={plan} fit={fit} editor={editor} inset={inset} />
      ))}
    </>
  )
}

const COUNTER_DRAG_SNAP_CM = 8

function CounterBandForWall({
  wall,
  plan,
  fit,
  editor,
  inset,
}: {
  wall: WallSide
  plan: FloorPlan
  fit: ReturnType<typeof fitRoom>
  editor: EditorApi
  inset: number
}) {
  const segments = counterSegmentsForWall(plan, wall)
  const groupRef = useRef<Konva.Group | null>(null)
  if (segments.length === 0) return null

  const depthPx = Math.max(14, effectiveCounterDepth(plan, wall) * fit.scale)
  const wallLen = wallLengthCm(wall, plan.room)
  const counterLen = effectiveCounterLength(plan, wall)
  const customLen = hasCustomCounterLength(plan, wall)
  const maxStartCm = Math.max(0, wallLen - counterLen)
  const draggable = customLen && maxStartCm > 0

  // Build segment rects in **wall-local** coords: position along the wall is
  // `seg.startCm * scale`, the perpendicular offset is fixed (the wall edge).
  // We render them inside a Group whose own position is the wall's anchor,
  // so dragging the Group translates all segments together and the cm offset
  // is recoverable from `group.x()` / `group.y()`.
  const rects = segments.map((seg, i) => {
    const lenPx = (seg.endCm - seg.startCm) * fit.scale - inset * 2
    if (lenPx <= 0) return null
    const alongStart = seg.startCm * fit.scale + inset
    const horizontal = wall === 'top' || wall === 'bottom'
    return (
      <Rect
        key={i}
        x={horizontal ? alongStart : inset}
        y={horizontal ? inset : alongStart}
        width={horizontal ? lenPx : depthPx - inset * 2}
        height={horizontal ? depthPx - inset * 2 : lenPx}
        fill={COLOR.counterFill}
        stroke={COLOR.counterStroke}
        strokeWidth={1}
        cornerRadius={2}
        // When draggable, the children must listen so the Group has a hit
        // surface to grab. Otherwise we keep them non-listening so they
        // don't shadow wall-edge clicks.
        listening={draggable}
        onMouseEnter={
          draggable
            ? (e) => {
                const stage = e.target.getStage()
                if (stage) stage.container().style.cursor = 'grab'
              }
            : undefined
        }
        onMouseLeave={
          draggable
            ? (e) => {
                const stage = e.target.getStage()
                if (stage) stage.container().style.cursor = 'default'
              }
            : undefined
        }
      />
    )
  })

  // The Group's natural origin is the wall's start corner — for top this is
  // (innerX, innerY); for bottom (innerX, innerY + roomHeight - depth); etc.
  // We let the Group's own position carry no extra offset for the start
  // corner case; the segments' coords already include `seg.startCm * scale`.
  let originX = 0
  let originY = 0
  switch (wall) {
    case 'top':
      originX = fit.inner.x
      originY = fit.inner.y
      break
    case 'bottom':
      originX = fit.inner.x
      originY = fit.inner.y + plan.room.widthCm * fit.scale - depthPx
      break
    case 'left':
      originX = fit.inner.x
      originY = fit.inner.y
      break
    case 'right':
      originX = fit.inner.x + plan.room.lengthCm * fit.scale - depthPx
      originY = fit.inner.y
      break
  }

  // Drag math: the user grabs the Group anywhere; we constrain to the wall's
  // long axis and clamp the projected offset so the run can't slide off the
  // wall. We then commit the `counterStartCm` once dragging ends.
  const axisHorizontal = wall === 'top' || wall === 'bottom'
  const minOffsetPx = 0
  const maxOffsetPx = maxStartCm * fit.scale
  const dragBoundFunc = (pos: { x: number; y: number }) => {
    if (axisHorizontal) {
      const offset = clamp(pos.x - originX, minOffsetPx, maxOffsetPx)
      return { x: originX + offset, y: originY }
    }
    const offset = clamp(pos.y - originY, minOffsetPx, maxOffsetPx)
    return { x: originX, y: originY + offset }
  }

  const commitFromGroupPosition = () => {
    const node = groupRef.current
    if (!node) return
    const offsetPx = axisHorizontal ? node.x() - originX : node.y() - originY
    let nextStartCm = clamp(offsetPx / fit.scale, 0, maxStartCm)
    // Snap to door/passage edges on this wall (so the counter clicks neatly
    // onto the slot rather than leaving a thin sliver).
    for (const o of plan.openings) {
      if (o.wall !== wall) continue
      if (o.kind !== 'door' && o.kind !== 'passage') continue
      const cands = [o.startCm + o.widthCm, o.startCm - counterLen]
      for (const c of cands) {
        if (Math.abs(nextStartCm - c) < COUNTER_DRAG_SNAP_CM) {
          nextStartCm = clamp(c, 0, maxStartCm)
        }
      }
    }
    nextStartCm = snap(nextStartCm)
    // Treat ~0 as "anchored to start corner" (clears the override).
    editor.patchSide(wall, {
      counterStartCm: nextStartCm <= 4 ? undefined : nextStartCm,
    })
    // Konva mutates the Group's x/y during drag; reset so the next render
    // (which will use the freshly-committed cm) doesn't stack offsets.
    if (axisHorizontal) node.x(originX)
    else node.y(originY)
  }

  // When draggable, the counter sits above the wall line — so its rects
  // catch the press first. Mirror the wall line's behaviour and select the
  // side on press; drag still works because Konva fires drag after mouse
  // movement crosses its threshold. On non-draggable runs we let the press
  // pass through to the wall line below.
  const selectSide = draggable
    ? () => editor.select({ kind: 'side', side: wall })
    : undefined

  return (
    <Group
      ref={groupRef}
      x={originX}
      y={originY}
      draggable={draggable}
      dragBoundFunc={draggable ? dragBoundFunc : undefined}
      onDragEnd={draggable ? commitFromGroupPosition : undefined}
      onMouseDown={selectSide}
      onTouchStart={selectSide}
      // Don't intercept clicks meant for walls/handles; only the visible
      // counter rectangles should receive pointer events when draggable.
      listening={draggable}
    >
      {rects}
    </Group>
  )
}

/**
 * Architectural-style dimension annotations along the room outline.
 * Following standard floor-plan convention, only one dimension per axis
 * is drawn (top for length, left for width) — opposite walls are equal,
 * so doubling them just adds noise. Each dim has a thin parallel line
 * with end ticks and the value sits centered along it. Clicking the
 * dimension selects the room so the homeowner can edit length/width in
 * the side panel.
 *
 * When the room dimensions haven't been confirmed yet (`needsSize`),
 * the labels gain an amber tint and a leading bullet to draw the eye
 * without shouting.
 */
function WallLabels({
  plan,
  fit,
  selection,
  needsSize,
  onSelectRoom,
}: {
  plan: FloorPlan
  fit: ReturnType<typeof fitRoom>
  selection: SelectionId
  needsSize: boolean
  onSelectRoom: () => void
}) {
  const sides = plan.room.sides
  const isActive = (wall: WallSide) =>
    selection.kind === 'side' && selection.side === wall

  const dimLabel = (wall: WallSide) => {
    const len = wallLengthCm(wall, plan.room)
    const dim = formatLengthCompact(len, plan.units)
    const sideSpec = sides[wall]
    const suffix =
      sideSpec.kind === 'open'
        ? ' · open'
        : sideSpec.label
          ? ` · ${sideSpec.label}`
          : ''
    return dim + suffix
  }

  const { x, y, w, h } = fit.inner
  // Distance from the wall to the dimension line (outside the room).
  const offset = 22
  const tickHalf = 4
  const labelGap = 6
  const fontSize = 14
  const lineColor = needsSize ? '#d97706' : COLOR.wallLabel
  const textBaseColor = needsSize ? '#b45309' : COLOR.wallLabel
  const setCursor = (
    e: Konva.KonvaEventObject<MouseEvent>,
    cursor: 'pointer' | 'default'
  ) => {
    const stage = e.target.getStage()
    if (stage) stage.container().style.cursor = cursor
  }

  // Top dimension: horizontal line above the wall, centered text above it.
  const topActive = isActive('top')
  const topFill = topActive ? COLOR.wallLabelActive : textBaseColor
  const topStroke = topActive ? COLOR.wallLabelActive : lineColor
  const topLineY = y - offset
  const topTextWidth = w
  const topTextY = topLineY - labelGap - fontSize

  // Left dimension: vertical line outside the wall, rotated text running
  // bottom-to-top alongside it. We rotate the text around its own center
  // (offsetX/Y = half the box) so positioning the (x, y) anchor at the
  // visual midpoint just works — no fragile offset arithmetic.
  const leftActive = isActive('left')
  const leftFill = leftActive ? COLOR.wallLabelActive : textBaseColor
  const leftStroke = leftActive ? COLOR.wallLabelActive : lineColor
  const leftLineX = x - offset
  const sideTextBoxWidth = h
  const sideTextBoxHeight = fontSize + 4
  const leftTextCx = leftLineX - labelGap - sideTextBoxHeight / 2
  const leftTextCy = y + h / 2

  return (
    <>
      {/* ── Top dimension ─────────────────────────────────────────────── */}
      <Group
        onMouseDown={onSelectRoom}
        onTouchStart={onSelectRoom}
        onMouseEnter={(e) => setCursor(e, 'pointer')}
        onMouseLeave={(e) => setCursor(e, 'default')}
      >
        <Line
          points={[x, topLineY, x + w, topLineY]}
          stroke={topStroke}
          strokeWidth={1}
          listening={false}
        />
        <Line
          points={[x, topLineY - tickHalf, x, topLineY + tickHalf]}
          stroke={topStroke}
          strokeWidth={1}
          listening={false}
        />
        <Line
          points={[x + w, topLineY - tickHalf, x + w, topLineY + tickHalf]}
          stroke={topStroke}
          strokeWidth={1}
          listening={false}
        />
        <Text
          x={x}
          y={topTextY}
          width={topTextWidth}
          align="center"
          text={dimLabel('top')}
          fontSize={fontSize}
          fontStyle="600"
          fill={topFill}
          letterSpacing={0.4}
          listening={false}
        />
        <Rect
          x={x - 4}
          y={topLineY - fontSize - labelGap - 4}
          width={w + 8}
          height={fontSize + labelGap + tickHalf + 8}
          fill="transparent"
        />
      </Group>

      {/* ── Left dimension ────────────────────────────────────────────── */}
      <Group
        onMouseDown={onSelectRoom}
        onTouchStart={onSelectRoom}
        onMouseEnter={(e) => setCursor(e, 'pointer')}
        onMouseLeave={(e) => setCursor(e, 'default')}
      >
        <Line
          points={[leftLineX, y, leftLineX, y + h]}
          stroke={leftStroke}
          strokeWidth={1}
          listening={false}
        />
        <Line
          points={[leftLineX - tickHalf, y, leftLineX + tickHalf, y]}
          stroke={leftStroke}
          strokeWidth={1}
          listening={false}
        />
        <Line
          points={[leftLineX - tickHalf, y + h, leftLineX + tickHalf, y + h]}
          stroke={leftStroke}
          strokeWidth={1}
          listening={false}
        />
        <Text
          x={leftTextCx}
          y={leftTextCy}
          width={sideTextBoxWidth}
          height={sideTextBoxHeight}
          align="center"
          verticalAlign="middle"
          text={dimLabel('left')}
          fontSize={fontSize}
          fontStyle="600"
          fill={leftFill}
          letterSpacing={0.4}
          rotation={-90}
          offsetX={sideTextBoxWidth / 2}
          offsetY={sideTextBoxHeight / 2}
          listening={false}
        />
        <Rect
          x={leftLineX - sideTextBoxHeight - labelGap - tickHalf - 4}
          y={y - 4}
          width={sideTextBoxHeight + labelGap + tickHalf + 8}
          height={h + 8}
          fill="transparent"
        />
      </Group>
    </>
  )
}

// ─── Room frame ──────────────────────────────────────────────────────────────

function RoomFrame({
  plan,
  fit,
  selectedSide,
  onSelectRoom,
  onSelectSide,
}: {
  plan: FloorPlan
  fit: ReturnType<typeof fitRoom>
  selectedSide: WallSide | null
  onSelectRoom: () => void
  onSelectSide: (side: WallSide) => void
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
      hitStrokeWidth: 24,
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

  return (
    <Group>
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
    </Group>
  )
}

/**
 * The four mid-wall resize handles. Lifted out of `RoomFrame` so they can
 * render on top of every other item in the canvas — this way an opening,
 * feature, or island never visually buries the handle when the room is
 * selected. Renders nothing when `selected` is false.
 */
function RoomHandles({
  fit,
  selected,
  onSelectSide,
  onResize,
}: {
  fit: ReturnType<typeof fitRoom>
  selected: boolean
  onSelectSide: (side: WallSide) => void
  onResize: (patch: Partial<RoomSpec>) => void
}) {
  if (!selected) return null
  const { x, y, w, h } = fit.inner
  const handles: { side: WallSide; cx: number; cy: number }[] = [
    { side: 'top', cx: x + w / 2, cy: y },
    { side: 'bottom', cx: x + w / 2, cy: y + h },
    { side: 'left', cx: x, cy: y + h / 2 },
    { side: 'right', cx: x + w, cy: y + h / 2 },
  ]
  return (
    <>
      {handles.map((hndl) => (
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
    </>
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
        <OpeningLabel
          text={`${OPENING_DEFAULTS[opening.kind].label} · ${formatLengthCompact(opening.widthCm, plan.units)}`}
          wall={opening.wall}
          w={w}
          h={h}
        />
      )}
    </Group>
  )
}

/**
 * Floating label for an opening, placed just outside the room and centered
 * on the run axis of the wall:
 *  - top/bottom walls → label above/below the opening, horizontal text
 *  - left/right walls → label to the left/right of the opening, rotated -90°
 *    so it reads bottom-to-top alongside the wall (matching architectural
 *    dimension convention).
 *
 * Centering uses Konva's `width` + `align="center"` for the horizontal cases
 * and `offsetX/offsetY` for center-pivoted rotation on the vertical cases —
 * that way the (x, y) anchor is just the visual midpoint of the label.
 */
function OpeningLabel({
  text,
  wall,
  w,
  h,
}: {
  text: string
  wall: WallSide
  w: number
  h: number
}) {
  const fontSize = 10
  const labelHeight = fontSize + 4
  // Sit close to the opening so the label is unambiguously paired with it
  // and is less likely to collide with neighbouring elements / counters.
  const gap = 2
  const fill = COLOR.textBody
  // Generous layout box so the label never wraps even when the opening is
  // narrow (e.g. a 60 cm door at low canvas zoom). The text just centers
  // inside the box and overflows the opening's run if needed — that's fine
  // because the box is centered on the opening's midpoint.
  const layoutBoxLength = 240

  if (wall === 'top' || wall === 'bottom') {
    const y = wall === 'top' ? -(labelHeight + gap) : h + gap
    return (
      <Text
        text={text}
        x={w / 2 - layoutBoxLength / 2}
        y={y}
        width={layoutBoxLength}
        height={labelHeight}
        align="center"
        verticalAlign="middle"
        wrap="none"
        fontSize={fontSize}
        fontStyle="bold"
        fill={fill}
        listening={false}
      />
    )
  }

  // Vertical wall: rotated -90° (reads bottom-to-top), centered along door
  // height, parked just outside the room. We rotate around the text box's
  // own center via offsetX/offsetY so the (x, y) anchor is just the visual
  // midpoint of the label.
  const cx = wall === 'left' ? -(gap + labelHeight / 2) : w + gap + labelHeight / 2
  return (
    <Text
      text={text}
      x={cx}
      y={h / 2}
      width={layoutBoxLength}
      height={labelHeight}
      align="center"
      verticalAlign="middle"
      wrap="none"
      fontSize={fontSize}
      fontStyle="bold"
      fill={fill}
      rotation={-90}
      offsetX={layoutBoxLength / 2}
      offsetY={labelHeight / 2}
      listening={false}
    />
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

// ─── Selection: desktop overlay + mobile sheet ───────────────────────────────

/**
 * Desktop selection panel — rendered via React portal into <body> so it can
 * escape <main>'s `max-w-3xl` clipping. It floats at one of two positions
 * depending on how much room exists to the right of the canvas:
 *
 *   - "gutter": viewport is wide enough that the page has empty whitespace
 *     to the right of the centered main column. Panel sits in that gutter,
 *     visually beside the canvas but outside the main container.
 *   - "overlay": viewport is desktop-ish but the gutter is too narrow.
 *     Panel falls back to a Figma-style overlay anchored to the canvas's
 *     top-right corner, on top of the canvas.
 *
 * Vertically the panel is sticky-within-the-editor: aligned with the canvas
 * top initially, pinned to a small viewport offset while you scroll inside
 * the editor section, and scrolls out as the editor's bottom approaches.
 * It hides entirely when the editor is fully out of view, so it doesn't
 * follow the user into other intake steps.
 *
 * Below `lg` (1024px) we don't render at all — the bottom sheet handles
 * mobile/tablet on its own.
 */
const PANEL_WIDTH = 280
const PANEL_GAP = 16
const PANEL_TOP_OFFSET = 24
const PANEL_LG_BREAKPOINT = 1024

interface PanelPos {
  top: number
  left: number
  mode: 'gutter' | 'overlay'
  /** Whether the editor is in view at all. Driven by scroll position. */
  visible: boolean
}

function DesktopSelectionPanel({
  editor,
  initialSnapshot,
  canvasContainerRef,
}: {
  editor: EditorApi
  initialSnapshot: FloorPlan
  canvasContainerRef: React.RefObject<HTMLDivElement | null>
}) {
  const hasSelection = editor.selection.kind !== 'none'
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<PanelPos | null>(null)

  // Position recompute. Runs on every scroll/resize while a selection is
  // active. Cheap math, but we still throttle to a single rAF per tick.
  // When `hasSelection` is false we early-return — `pos` stays at its old
  // value, but the render guard below stops the panel from displaying so
  // it doesn't matter; recompute on next selection refreshes it before
  // first paint thanks to `useLayoutEffect`.
  useLayoutEffect(() => {
    if (!hasSelection) return
    let raf = 0
    function recompute() {
      const canvas = canvasContainerRef.current
      if (!canvas) return
      const vpW = window.innerWidth
      const vpH = window.innerHeight

      // Below lg, the bottom sheet is in charge. Don't render the desktop
      // panel — but still report a non-null pos so AnimatePresence knows the
      // panel is "logically present", just not visible.
      if (vpW < PANEL_LG_BREAKPOINT) {
        setPos((prev) =>
          prev && !prev.visible
            ? prev
            : { top: 0, left: 0, mode: 'gutter', visible: false }
        )
        return
      }

      const rect = canvas.getBoundingClientRect()
      const panelH = panelRef.current?.offsetHeight ?? 240

      // Mode: do we have room in the right gutter for the panel + breathing?
      const gutterRight = vpW - rect.right
      const wantsGutter = gutterRight >= PANEL_WIDTH + PANEL_GAP * 2
      const mode: 'gutter' | 'overlay' = wantsGutter ? 'gutter' : 'overlay'

      // Horizontal anchor.
      const left =
        mode === 'gutter'
          ? Math.min(rect.right + PANEL_GAP, vpW - PANEL_WIDTH - PANEL_GAP)
          : Math.max(rect.left + PANEL_GAP, rect.right - PANEL_WIDTH - PANEL_GAP)

      // Vertical sticky-within-bounds. The panel sits at canvas top when the
      // canvas top is below the viewport top; pins to a small offset while
      // the user scrolls inside the editor; and scrolls out alongside the
      // canvas once its bottom no longer leaves room for the full panel.
      const desiredTop = Math.max(rect.top + PANEL_GAP, PANEL_TOP_OFFSET)
      const maxTop = rect.bottom - panelH - PANEL_GAP
      const top = Math.min(desiredTop, maxTop)

      // Visibility: hide once the editor section has fully scrolled past the
      // viewport in either direction.
      const visible = rect.bottom > PANEL_TOP_OFFSET && rect.top < vpH - PANEL_GAP

      setPos({ top, left, mode, visible })
    }
    function schedule() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(recompute)
    }
    schedule()
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    // The panel's height changes when the user toggles counter chips, etc;
    // a ResizeObserver keeps the sticky math accurate without a manual ping.
    let ro: ResizeObserver | null = null
    if (panelRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(schedule)
      ro.observe(panelRef.current)
    }
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      ro?.disconnect()
    }
    // We intentionally re-run when the selection identity changes so the
    // ResizeObserver re-attaches to the freshly mounted panel node.
  }, [hasSelection, canvasContainerRef, editor.selection])

  // The editor is dynamic-imported with ssr:false, so `document` is always
  // defined when this component renders, but guard belt-and-braces.
  if (typeof document === 'undefined') return null

  const showPanel = hasSelection && pos !== null && pos.visible

  return createPortal(
    <AnimatePresence>
      {showPanel && (
        <motion.div
          key="floor-plan-selection-panel"
          ref={panelRef}
          data-floor-plan-panel={pos.mode}
          initial={{ opacity: 0, x: pos.mode === 'gutter' ? -8 : 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: pos.mode === 'gutter' ? -8 : 8 }}
          transition={{ duration: 0.16 }}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: PANEL_WIDTH,
            zIndex: 50,
          }}
          className={cn(
            'rounded-2xl border p-4',
            pos.mode === 'gutter'
              ? 'border-border bg-card shadow-sm ring-1 ring-black/5'
              : 'border-border/70 bg-card/95 shadow-2xl ring-1 ring-black/5 backdrop-blur'
          )}
        >
          <SelectionPanelBody editor={editor} initialSnapshot={initialSnapshot} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

function MobileSelectionSheet({
  editor,
  initialSnapshot,
}: {
  editor: EditorApi
  initialSnapshot: FloorPlan
}) {
  return (
    <AnimatePresence>
      {editor.selection.kind !== 'none' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 lg:hidden"
        >
          <button
            type="button"
            aria-label="Close panel"
            onClick={() => editor.select({ kind: 'none' })}
            className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px]"
          />
          <motion.div
            key={selectionKey(editor.selection)}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-4 shadow-2xl"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
            <SelectionPanelBody editor={editor} initialSnapshot={initialSnapshot} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SelectionPanelBody({
  editor,
  initialSnapshot,
}: {
  editor: EditorApi
  initialSnapshot: FloorPlan
}) {
  const { selection, plan } = editor
  switch (selection.kind) {
    case 'room':
      return <RoomEditor editor={editor} />
    case 'side':
      return <SideEditor editor={editor} side={selection.side} />
    case 'opening':
      return <OpeningEditor editor={editor} id={selection.id} initialSnapshot={initialSnapshot} />
    case 'feature':
      return <FeatureEditor editor={editor} id={selection.id} initialSnapshot={initialSnapshot} />
    case 'island':
      return plan.island ? <IslandEditor editor={editor} initialSnapshot={initialSnapshot} /> : null
    default:
      return null
  }
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
          aria-label="Close"
          className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
        >
          <X className="size-3.5 stroke-[2]" aria-hidden />
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

// ─── Sentence-style editors ──────────────────────────────────────────────────

function SentenceShell({ children }: { children: React.ReactNode }) {
  // Intentionally a `<div>`, not `<p>` — chip popovers render block-level
  // descendants (motion.div, ul) which are invalid inside a paragraph and
  // cause the HTML parser to close the <p> early, breaking hydration.
  return (
    <div className="mb-3 rounded-xl border border-border/70 bg-background/40 px-3 py-2.5 text-[13px] leading-7 text-foreground">
      {children}
    </div>
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
      <SentenceShell>
        This room is{' '}
        <strong className="font-semibold">{formatLength(plan.room.lengthCm, plan.units)}</strong> long
        and{' '}
        <strong className="font-semibold">{formatLength(plan.room.widthCm, plan.units)}</strong> wide.
      </SentenceShell>
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
          Tap a wall on the canvas to mark it as open or label it.
        </p>
      </div>
    </div>
  )
}

function SideEditor({ editor, side }: { editor: EditorApi; side: WallSide }) {
  const { plan } = editor
  const sideSpec = plan.room.sides[side]
  const counterOn = effectiveHasCounter(plan, side)
  const counterIsDefault = sideSpec.hasCounter === undefined
  const counterDefault = defaultHasCounter(side, plan.layoutShape)

  const wallLen = wallLengthCm(side, plan.room)
  const counterDepth = effectiveCounterDepth(plan, side)
  const counterLen = effectiveCounterLength(plan, side)
  const customLen = hasCustomCounterLength(plan, side)
  const counterStart = effectiveCounterStart(plan, side)
  const counterMaxStart = Math.max(0, wallLen - counterLen)
  const counterCenterStart = snap(counterMaxStart / 2)
  // Anchor mode is derived from the current start offset relative to the
  // available "free" space along the wall. We tolerate a tiny window so
  // mild snap drift doesn't bump us out of "centered".
  const ANCHOR_TOLERANCE_CM = 4
  type AnchorMode = 'start' | 'center' | 'end' | 'custom'
  const anchorMode: AnchorMode = (() => {
    if (counterStart <= ANCHOR_TOLERANCE_CM) return 'start'
    if (counterStart >= counterMaxStart - ANCHOR_TOLERANCE_CM) return 'end'
    if (Math.abs(counterStart - counterCenterStart) <= ANCHOR_TOLERANCE_CM) return 'center'
    return 'custom'
  })()

  // Length presets are derived from the wall length so they stay sensible
  // when the room resizes. "Full wall" is represented as `null` (clears the
  // override and lets the renderer use the wall length minus openings).
  const lengthOptions: ChipOption<number | null>[] = [
    { value: null, label: 'full wall', hint: formatLengthCompact(wallLen, plan.units) },
    {
      value: snap(wallLen * 0.66),
      label: 'about ⅔',
      hint: formatLengthCompact(snap(wallLen * 0.66), plan.units),
    },
    {
      value: snap(wallLen * 0.5),
      label: 'half',
      hint: formatLengthCompact(snap(wallLen * 0.5), plan.units),
    },
    {
      value: snap(wallLen * 0.33),
      label: 'about ⅓',
      hint: formatLengthCompact(snap(wallLen * 0.33), plan.units),
    },
  ]

  // Anchor presets translate from a semantic mode into a concrete startCm.
  // 'start' uses 0 (also the legacy default). 'end' parks the run against
  // the far corner. 'center' centers the run within the wall. 'custom' is
  // surfaced via the slider / typed offset.
  const anchorOptions: ChipOption<AnchorMode>[] = [
    { value: 'start', label: 'the start', hint: 'flush corner' },
    { value: 'center', label: 'the center', hint: 'centered' },
    { value: 'end', label: 'the end', hint: 'far corner' },
  ]
  const anchorDisplay: Record<AnchorMode, string> = {
    start: 'the start',
    center: 'the center',
    end: 'the end',
    custom: `${formatLengthCompact(counterStart, plan.units)} from the start`,
  }
  const setAnchor = (mode: AnchorMode) => {
    let nextStart: number | undefined
    if (mode === 'start') nextStart = undefined // 0 = legacy default, leave unset
    else if (mode === 'center') nextStart = counterCenterStart
    else if (mode === 'end') nextStart = counterMaxStart
    else nextStart = counterStart // custom = leave as-is
    editor.patchSide(side, { counterStartCm: nextStart })
  }

  return (
    <div>
      <PanelHeader title={`${capitalize(side)} side`} onClose={() => editor.select({ kind: 'none' })} />
      <SentenceShell>
        The {side} side is{' '}
        <ChipSelect<'closed' | 'open'>
          label="Side type"
          value={sideSpec.kind}
          options={[
            { value: 'closed', label: 'a closed wall' },
            { value: 'open', label: 'open (no wall)' },
          ]}
          display={sideSpec.kind === 'open' ? 'open (no wall)' : 'a closed wall'}
          onChange={(kind) =>
            editor.patchSide(side, {
              kind,
              ...(kind === 'open' ? { hasCounter: false } : {}),
            })
          }
        />
        {sideSpec.kind === 'closed' && (
          <>
            {' '}with{' '}
            <ChipSelect<'on' | 'off'>
              label="Counter"
              value={counterOn ? 'on' : 'off'}
              options={[
                {
                  value: 'on',
                  label: 'counter along it',
                  hint: counterDefault ? 'default' : undefined,
                },
                {
                  value: 'off',
                  label: 'no counter',
                  hint: !counterDefault ? 'default' : undefined,
                },
              ]}
              display={counterOn ? 'counter along it' : 'no counter'}
              onChange={(v) => editor.patchSide(side, { hasCounter: v === 'on' })}
            />
          </>
        )}
        .
        {sideSpec.kind === 'closed' && counterOn && (
          <>
            <br />
            Counter is{' '}
            <ChipSelect<number>
              label="Counter depth"
              value={counterDepth}
              options={COUNTER_DEPTH_OPTIONS_CM.map((cm) => ({
                value: cm,
                label: formatLengthCompact(cm, plan.units),
                hint: cm === DEFAULT_COUNTER_DEPTH_CM ? 'standard' : undefined,
              }))}
              display={`${formatLengthCompact(counterDepth, plan.units)} deep`}
              onChange={(cm) =>
                editor.patchSide(side, {
                  counterDepthCm: cm === DEFAULT_COUNTER_DEPTH_CM ? undefined : cm,
                })
              }
              onCustomValue={(raw) => {
                const parsed = parseLengthToCm(raw)
                if (parsed === null) return null
                return clamp(parsed, 30, 120)
              }}
              customPlaceholder={plan.units === 'cm' ? 'e.g. 58 cm' : `e.g. 1′ 11″`}
            />
            , running{' '}
            <ChipSelect<number | null>
              label="Counter length"
              value={customLen ? counterLen : null}
              options={lengthOptions}
              display={customLen ? formatLengthCompact(counterLen, plan.units) : 'full wall'}
              onChange={(v) =>
                editor.patchSide(side, {
                  counterLengthCm:
                    v === null ? undefined : clamp(snap(v), 0, wallLen),
                })
              }
              onCustomValue={(raw) => {
                const parsed = parseLengthToCm(raw)
                if (parsed === null) return null
                return clamp(snap(parsed), 0, wallLen)
              }}
              customPlaceholder={plan.units === 'cm' ? 'e.g. 200 cm' : `e.g. 6′ 6″`}
            />
            {customLen && counterMaxStart > 0 && (
              <>
                , aligned to{' '}
                <ChipSelect<AnchorMode>
                  label="Counter anchor"
                  value={anchorMode}
                  options={anchorOptions}
                  display={anchorDisplay[anchorMode]}
                  onChange={setAnchor}
                />
              </>
            )}
            .
          </>
        )}
      </SentenceShell>
      <div className="space-y-3">
        {sideSpec.kind === 'closed' && counterOn && (
          <DimSlider
            label="Counter run length"
            cm={counterLen}
            minCm={0}
            maxCm={wallLen}
            unit={plan.units}
            onChange={(cm) =>
              editor.patchSide(side, {
                counterLengthCm: cm >= wallLen ? undefined : clamp(snap(cm), 0, wallLen),
              })
            }
          />
        )}
        {sideSpec.kind === 'closed' && counterOn && customLen && counterMaxStart > 0 && (
          <DimSlider
            label="Distance from start corner"
            cm={counterStart}
            minCm={0}
            maxCm={counterMaxStart}
            unit={plan.units}
            onChange={(cm) => {
              const snapped = clamp(snap(cm), 0, counterMaxStart)
              editor.patchSide(side, {
                counterStartCm: snapped <= ANCHOR_TOLERANCE_CM ? undefined : snapped,
              })
            }}
          />
        )}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
            Optional label (shown to your designer)
          </label>
          <input
            type="text"
            value={sideSpec.label ?? ''}
            placeholder="e.g. window wall, to dining"
            onChange={(e) => editor.patchSide(side, { label: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {sideSpec.kind === 'closed' &&
          (!counterIsDefault ||
            sideSpec.counterDepthCm !== undefined ||
            sideSpec.counterLengthCm !== undefined ||
            sideSpec.counterStartCm !== undefined) && (
            <button
              type="button"
              onClick={() =>
                editor.patchSide(side, {
                  hasCounter: undefined,
                  counterDepthCm: undefined,
                  counterLengthCm: undefined,
                  counterStartCm: undefined,
                })
              }
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              Reset counter to layout default
            </button>
          )}
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
      <SentenceShell>
        This is{' '}
        <ChipSelect<OpeningKind>
          label="Kind"
          value={opening.kind}
          options={OPENING_KINDS.map((k) => ({ value: k, label: ELEMENT_CATALOG[k].article }))}
          display={ELEMENT_CATALOG[opening.kind].article}
          onChange={(kind) => editor.patchOpening(id, { kind })}
        />{' '}
        on the{' '}
        <WallChipForElement
          plan={plan}
          value={opening.wall}
          onChange={(wall) =>
            editor.patchOpening(id, {
              wall,
              startCm: clamp(opening.startCm, 0, wallLengthCm(wall, plan.room) - opening.widthCm),
            })
          }
        />
        ,{' '}
        <SizeChipFor
          value={opening.widthCm}
          unit={plan.units}
          buckets={ELEMENT_CATALOG[opening.kind].sizes}
          onChange={(cm) =>
            editor.patchOpening(id, {
              widthCm: snap(cm),
              startCm: clamp(opening.startCm, 0, total - snap(cm)),
            })
          }
        />{' '}
        wide.
      </SentenceShell>
      <div className="space-y-3">
        <DimSlider
          label="From corner"
          cm={opening.startCm}
          minCm={0}
          maxCm={total - opening.widthCm}
          unit={plan.units}
          onChange={(cm) => editor.patchOpening(id, { startCm: snap(cm) })}
        />
        <PanelActions
          onDelete={() => {
            editor.removeOpening(id)
            editor.select({ kind: 'none' })
          }}
          onReset={original ? () => editor.patchOpening(id, { ...original }) : null}
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
      <SentenceShell>
        The{' '}
        <ChipSelect<FeatureKind>
          label="Kind"
          value={feature.kind}
          options={FEATURE_KINDS.map((k) => ({ value: k, label: ELEMENT_CATALOG[k].label }))}
          display={ELEMENT_CATALOG[feature.kind].label.toLowerCase()}
          onChange={(kind) => editor.patchFeature(id, { kind, widthCm: ELEMENT_CATALOG[kind].defaultCm })}
        />{' '}
        is on the{' '}
        <WallChipForElement
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
        ,{' '}
        <SizeChipFor
          value={feature.widthCm}
          unit={plan.units}
          buckets={ELEMENT_CATALOG[feature.kind].sizes}
          onChange={(cm) =>
            editor.patchFeature(id, {
              widthCm: snap(cm),
              centerCm: clamp(feature.centerCm, snap(cm) / 2, total - snap(cm) / 2),
            })
          }
        />{' '}
        wide.
      </SentenceShell>
      <div className="space-y-3">
        <DimSlider
          label="From corner (centre)"
          cm={feature.centerCm}
          minCm={feature.widthCm / 2}
          maxCm={total - feature.widthCm / 2}
          unit={plan.units}
          onChange={(cm) => editor.patchFeature(id, { centerCm: snap(cm) })}
        />
        {!effectiveHasCounter(plan, feature.wall) && (
          <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-[11px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            There&apos;s no counter on the {feature.wall} wall right now. Tap that side and turn the
            counter on, or move this fixture to a wall that has counter.
          </p>
        )}
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
      <SentenceShell>
        The island is{' '}
        <strong className="font-semibold">{formatLengthCompact(island.lengthCm, plan.units)}</strong> by{' '}
        <strong className="font-semibold">{formatLengthCompact(island.widthCm, plan.units)}</strong>,{' '}
        <ChipSelect<boolean>
          label="Seating"
          value={!!island.seating}
          options={[
            { value: true, label: 'with seating' },
            { value: false, label: 'no seating' },
          ]}
          display={island.seating ? 'with seating' : 'no seating'}
          onChange={(v) => editor.patchIsland({ seating: v })}
        />
        .
      </SentenceShell>
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

function WallChipForElement({
  plan,
  value,
  onChange,
}: {
  plan: FloorPlan
  value: WallSide
  onChange: (w: WallSide) => void
}) {
  const options: ChipOption<WallSide>[] = (['top', 'bottom', 'left', 'right'] as WallSide[]).map(
    (w) => ({
      value: w,
      label: capitalize(w) + ' wall',
      hint: plan.room.sides[w].kind === 'open' ? 'open' : undefined,
      disabled: plan.room.sides[w].kind === 'open',
    })
  )
  return (
    <ChipSelect<WallSide>
      label="Wall"
      value={value}
      options={options}
      display={`${capitalize(value)} wall`}
      onChange={onChange}
    />
  )
}

function SizeChipFor({
  value,
  unit,
  buckets,
  onChange,
}: {
  value: number
  unit: DisplayUnit
  buckets: { id: string; label: string; cm: number }[]
  onChange: (cm: number) => void
}) {
  const options: ChipOption<number>[] = buckets.map((b) => ({
    value: b.cm,
    label: b.label,
    hint: formatLengthCompact(b.cm, unit),
  }))
  return (
    <ChipSelect<number>
      label="Size"
      value={value}
      options={options}
      display={formatLengthCompact(value, unit)}
      onChange={onChange}
      onCustomValue={parseSizeToCm}
      customPlaceholder={unit === 'cm' ? 'e.g. 70 cm' : `e.g. 2′ 6″`}
    />
  )
}

// ─── "Add to your space" section: toolbar + sentence builder ─────────────────

function AddSection({ editor }: { editor: EditorApi }) {
  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Add to your space
      </p>
      <Toolbar editor={editor} />
      <SentenceBuilder editor={editor} />
    </div>
  )
}

function Toolbar({ editor }: { editor: EditorApi }) {
  const { plan } = editor
  const wall: WallSide = (() => {
    const order: WallSide[] = ['top', 'bottom', 'left', 'right']
    return order.find((w) => plan.room.sides[w].kind === 'closed') ?? 'top'
  })()

  function addOpening(kind: OpeningKind) {
    const next = makeOpening(kind, wall, plan.room)
    next.widthCm = ELEMENT_CATALOG[kind].defaultCm
    editor.addOpening(next)
    editor.select({ kind: 'opening', id: next.id })
  }
  function addFeature(kind: FeatureKind) {
    const next = makeFeature(kind, wall, plan.room)
    next.widthCm = ELEMENT_CATALOG[kind].defaultCm
    editor.addFeature(next)
    editor.select({ kind: 'feature', id: next.id })
  }
  function toggleIsland() {
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
    <div className="flex flex-wrap items-center gap-1.5">
      {(['window', 'door', 'passage'] as OpeningKind[]).map((k) => {
        const e = ELEMENT_CATALOG[k]
        const Icon = e.icon
        return (
          <ToolbarButton
            key={k}
            onClick={() => addOpening(k)}
            icon={<Icon className="size-3.5 stroke-[1.75]" aria-hidden />}
            label={`+ ${e.shortLabel}`}
          />
        )
      })}
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      {(['sink', 'hob', 'fridge', 'dishwasher'] as FeatureKind[]).map((k) => {
        const e = ELEMENT_CATALOG[k]
        const Icon = e.icon
        return (
          <ToolbarButton
            key={k}
            onClick={() => addFeature(k)}
            icon={<Icon className="size-3.5 stroke-[1.75]" aria-hidden />}
            label={`+ ${e.shortLabel}`}
          />
        )
      })}
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      <ToolbarButton
        onClick={toggleIsland}
        icon={<Plus className={cn('size-3.5 stroke-[2]', plan.island && 'rotate-45')} aria-hidden />}
        label={plan.island ? 'Remove island' : '+ Island'}
        active={Boolean(plan.island)}
      />
    </div>
  )
}

function ToolbarButton({
  onClick,
  icon,
  label,
  active,
}: {
  onClick: () => void
  icon: React.ReactNode
  label: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors',
        active
          ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
          : 'border-border bg-card text-foreground hover:bg-accent/40'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

// ─── Numeric input + slider ──────────────────────────────────────────────────

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

// ─── A11y live announcer ─────────────────────────────────────────────────────

function LiveAnnouncer({ plan, selection }: { plan: FloorPlan; selection: SelectionId }) {
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

// ─── Misc ────────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}
