'use client'

/**
 * SentenceBuilder — a "describe in words" alternative to dragging things onto
 * the canvas. Reads as a sentence (chips fill the blanks):
 *
 *   "Add a [Window] on the [Top wall], about [1 metre] wide."   [Add]
 *
 * Designed for non-technical users: every chip is a popover with named choices
 * (no free typing required), but you CAN type a custom size if you want. The
 * action goes through the same state mutators as the toolbar — no AI parsing,
 * no behavioural divergence between the two paths.
 */

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  effectiveHasCounter,
  formatLengthCompact,
  makeFeature,
  makeIsland,
  makeOpening,
  type DisplayUnit,
  type FeatureKind,
  type FloorPlan,
  type OpeningKind,
} from '@/lib/floor-plan'
import type { WallSide } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ChipSelect, type ChipOption } from './ChipSelect'
import {
  ELEMENT_CATALOG,
  FEATURE_KINDS,
  OPENING_KINDS,
  parseSizeToCm,
  type AddableKind,
} from './catalog'
import type { EditorApi } from './state'

interface SentenceBuilderProps {
  editor: EditorApi
}

/** "Element" includes Island as a special token (no wall, special add path). */
type ElementToken =
  | { tag: 'opening'; kind: OpeningKind }
  | { tag: 'feature'; kind: FeatureKind }
  | { tag: 'island' }

const DEFAULT_TOKEN: ElementToken = { tag: 'opening', kind: 'window' }

export function SentenceBuilder({ editor }: SentenceBuilderProps) {
  const { plan } = editor
  const [token, setToken] = useState<ElementToken>(DEFAULT_TOKEN)
  const [wall, setWall] = useState<WallSide>('top')
  const [sizeCm, setSizeCm] = useState<number>(ELEMENT_CATALOG.window.defaultCm)
  const [pulseAddedId, setPulseAddedId] = useState<string | null>(null)

  // When the token changes, snap size + wall to sensible defaults.
  // Uses the React 19 "compare-prev-during-render" pattern instead of useEffect
  // so the picker stays consistent without a setState-in-effect cascade.
  const [prevTokenKey, setPrevTokenKey] = useState(tokenKey(token))
  if (prevTokenKey !== tokenKey(token)) {
    setPrevTokenKey(tokenKey(token))
    if (token.tag !== 'island') {
      const entry = entryFor(token)
      if (entry) setSizeCm(entry.defaultCm)
    }
    // If the picked wall got marked open since we last touched it, fall back.
    if (token.tag !== 'island' && plan.room.sides[wall]?.kind === 'open') {
      const fallback = firstClosedWall(plan)
      if (fallback) setWall(fallback)
    }
  }

  // After we add something, pulse the panel briefly so the user gets feedback.
  useEffect(() => {
    if (!pulseAddedId) return
    const t = window.setTimeout(() => setPulseAddedId(null), 700)
    return () => window.clearTimeout(t)
  }, [pulseAddedId])

  const closedWalls: WallSide[] = (['top', 'bottom', 'left', 'right'] as WallSide[]).filter(
    (w) => plan.room.sides[w].kind === 'closed'
  )
  const noClosedWalls = closedWalls.length === 0

  function handleAdd() {
    if (token.tag === 'island') {
      const next = makeIsland(plan.room)
      // Optionally apply size if the user picked a non-default island size.
      // (For now island size is the room-derived default; bucket only affects future drags.)
      void sizeCm
      editor.addIsland(next)
      editor.select({ kind: 'island', id: next.id })
      setPulseAddedId(next.id)
      return
    }
    if (noClosedWalls) return
    if (token.tag === 'opening') {
      const next = makeOpening(token.kind, wall, plan.room)
      next.widthCm = sizeCm
      editor.addOpening(next)
      editor.select({ kind: 'opening', id: next.id })
      setPulseAddedId(next.id)
      return
    }
    const next = makeFeature(token.kind, wall, plan.room)
    next.widthCm = sizeCm
    editor.addFeature(next)
    editor.select({ kind: 'feature', id: next.id })
    setPulseAddedId(next.id)
  }

  return (
    <motion.div
      animate={pulseAddedId ? { scale: [1, 1.01, 1] } : { scale: 1 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl border border-border bg-card/60 px-3 py-3 shadow-sm"
    >
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Or describe it
      </p>
      <div className="flex flex-wrap items-baseline gap-x-1 gap-y-1.5 text-[13px] leading-7 text-foreground">
        <span>Add</span>
        <ElementChip token={token} onChange={setToken} />
        {token.tag !== 'island' && (
          <>
            <span>on the</span>
            <WallChip
              plan={plan}
              value={wall}
              onChange={setWall}
              disabled={noClosedWalls}
            />
            <span className="whitespace-nowrap">,</span>
            <span>about</span>
            <SizeChip token={token} cm={sizeCm} unit={plan.units} onChange={setSizeCm} />
            <span>wide.</span>
          </>
        )}
        {token.tag === 'island' && (
          <>
            <span>in the middle of the room.</span>
          </>
        )}
        <button
          type="button"
          onClick={handleAdd}
          disabled={token.tag !== 'island' && noClosedWalls}
          className={cn(
            'ml-auto inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[12px] font-semibold text-primary-foreground shadow-sm transition-opacity disabled:opacity-40'
          )}
        >
          <Plus className="size-3.5 stroke-[2.5]" aria-hidden /> Add
        </button>
      </div>
      {noClosedWalls && token.tag !== 'island' && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          All sides are marked open right now — close at least one side before adding openings or fixtures.
        </p>
      )}
      {token.tag !== 'island' &&
        token.tag === 'feature' &&
        !effectiveHasCounter(plan, wall) && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Heads-up: there&apos;s no counter on the {wall} wall right now. Tap the wall to turn it
            on, or place this fixture somewhere with counter.
          </p>
        )}
    </motion.div>
  )
}

// ─── Chips ───────────────────────────────────────────────────────────────────

function ElementChip({
  token,
  onChange,
}: {
  token: ElementToken
  onChange: (t: ElementToken) => void
}) {
  const groups: { heading: string; tokens: ElementToken[] }[] = [
    {
      heading: 'Openings',
      tokens: OPENING_KINDS.map((k) => ({ tag: 'opening' as const, kind: k })),
    },
    {
      heading: 'Fixtures',
      tokens: FEATURE_KINDS.map((k) => ({ tag: 'feature' as const, kind: k })),
    },
    { heading: 'Other', tokens: [{ tag: 'island' as const }] },
  ]
  const flat: ChipOption<string>[] = groups.flatMap((group) =>
    group.tokens.map((t) => ({
      value: tokenKey(t),
      label: t.tag === 'island' ? 'an island' : ELEMENT_CATALOG[innerKind(t)].article,
    }))
  )
  const display = token.tag === 'island' ? 'an island' : ELEMENT_CATALOG[innerKind(token)].article

  return (
    <ChipSelect<string>
      label="Element"
      value={tokenKey(token)}
      options={flat}
      display={display}
      onChange={(key) => onChange(tokenFromKey(key))}
    />
  )
}

function WallChip({
  plan,
  value,
  onChange,
  disabled,
}: {
  plan: FloorPlan
  value: WallSide
  onChange: (w: WallSide) => void
  disabled?: boolean
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
      disabled={disabled}
    />
  )
}

function SizeChip({
  token,
  cm,
  unit,
  onChange,
}: {
  token: ElementToken
  cm: number
  unit: DisplayUnit
  onChange: (cm: number) => void
}) {
  if (token.tag === 'island') return null
  const entry = entryFor(token)
  if (!entry) return null
  const options: ChipOption<number>[] = entry.sizes.map((s) => ({
    value: s.cm,
    label: s.label,
    hint: formatLengthCompact(s.cm, unit),
  }))
  return (
    <ChipSelect<number>
      label="Size"
      value={cm}
      options={options}
      display={formatLengthCompact(cm, unit)}
      onChange={onChange}
      onCustomValue={parseSizeToCm}
      customPlaceholder={unit === 'cm' ? 'e.g. 70 cm' : `e.g. 2′ 6″`}
    />
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tokenKey(t: ElementToken): string {
  if (t.tag === 'island') return 'island'
  return `${t.tag}:${innerKind(t)}`
}
function tokenFromKey(key: string): ElementToken {
  if (key === 'island') return { tag: 'island' }
  const [tag, kind] = key.split(':') as ['opening' | 'feature', string]
  if (tag === 'opening') return { tag, kind: kind as OpeningKind }
  return { tag, kind: kind as FeatureKind }
}
function innerKind(t: ElementToken): string {
  if (t.tag === 'island') return 'island'
  return t.tag === 'opening' ? t.kind : t.kind
}
function entryFor(t: ElementToken) {
  if (t.tag === 'island') return null
  return ELEMENT_CATALOG[innerKind(t)]
}
function firstClosedWall(plan: FloorPlan): WallSide | null {
  return (['top', 'bottom', 'left', 'right'] as WallSide[]).find(
    (w) => plan.room.sides[w].kind === 'closed'
  ) ?? null
}
function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

// AddableKind referenced for typing fidelity; not currently used at runtime.
void {} as AddableKind | undefined
