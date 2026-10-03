'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, Check, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslations, type TranslationKey } from '@/lib/i18n'
import {
  CEILING_MAX_CM,
  CEILING_MIN_CM,
  ROOM_CARDS,
  TARGET_CARDS,
  WALL_LETTER,
  cardForPlan,
  counterWalls,
  fromShapePreset,
  missingWalls,
  parseCeilingCm,
  parseWallLengthCm,
  renderFloorPlanSvg,
  wallEstimateCm,
  withCeiling,
  withMeasuredWall,
  withShape,
  type FloorPlan,
  type LayoutShape,
  type RoomCard,
} from '@/lib/floor-plan'
import { OMITTED_IMAGE } from '@/lib/project/checkpoint'
import type { LayoutIntent, PhotoViewTarget, SpaceVisionResult, WallSide } from '@/lib/types'
import { FloorPlanStatic } from './FloorPlanStatic'
import { ChipSelect, type ChipOption } from './floor-plan-editor/ChipSelect'

const ALL_LETTERS: Record<WallSide, string> = { ...WALL_LETTER }
const INTENTS: readonly LayoutIntent[] = ['keep', 'add_island', 'move_sink', 'change']
const VIEW_TARGETS: readonly PhotoViewTarget[] = [
  'top',
  'right',
  'bottom',
  'left',
  'top_right',
  'bottom_right',
  'bottom_left',
  'top_left',
  'unclear',
]
const CORNER_WALLS: Record<string, [WallSide, WallSide]> = {
  top_right: ['top', 'right'],
  bottom_right: ['right', 'bottom'],
  bottom_left: ['bottom', 'left'],
  top_left: ['top', 'left'],
}

export type RoomPhase = 'shape' | 'measure'
export type SaveLaterResult = 'saved_project' | 'saved_local' | 'failed'

export interface RoomStepProps {
  phase: RoomPhase
  photos: string[]
  vision: SpaceVisionResult | null
  isReading: boolean
  readFailed: boolean
  onRetryRead: () => void
  onRelabel: (photoIndex: number, shows: PhotoViewTarget) => void
  plan: FloorPlan | null
  onPlanChange: (plan: FloorPlan | null) => void
  existingRoom?: 'kitchen' | 'empty'
  onExistingRoomChange: (room: 'kitchen' | 'empty') => void
  layoutIntent?: LayoutIntent
  onLayoutIntentChange: (intent: LayoutIntent) => void
  onSaveLater: () => Promise<SaveLaterResult>
}

/**
 * "Tvoj prostor danas" — the room as it is, before any render (IMP-31).
 *
 * Screen 1: what each photo shows (tap to correct), the shape card read from
 * all of them, and what the homeowner wants to do with that layout.
 * Screen 2: every wall the kitchen stands on, measured. The fields start
 * empty; the photo read's number is a grey hint under the field, never its
 * value, and there is no button that copies it. The footer Continue stays off
 * until every wall has a typed length — the render is not reachable without
 * one. No tape measure? The journey is saved; they come back to this screen.
 */
export function RoomStep(props: RoomStepProps) {
  return props.phase === 'shape' ? <ShapeScreen {...props} /> : <MeasureScreen {...props} />
}

function letterLabel(t: (k: TranslationKey) => string, target: PhotoViewTarget): string {
  if (target === 'unclear') return t('room.view.unclear')
  if (target in CORNER_WALLS) {
    const [a, b] = CORNER_WALLS[target].map((w) => WALL_LETTER[w]).sort()
    return t('room.view.corner').replace('{a}', a).replace('{b}', b)
  }
  return t('room.view.wall').replace('{a}', WALL_LETTER[target as WallSide])
}

function ShapeScreen({
  photos,
  vision,
  isReading,
  readFailed,
  onRetryRead,
  onRelabel,
  plan,
  onPlanChange,
  existingRoom,
  onExistingRoomChange,
  layoutIntent,
  onLayoutIntentChange,
}: RoomStepProps) {
  const { t, locale } = useTranslations()
  const empty = existingRoom === 'empty'
  const selected: RoomCard | null = empty ? 'empty' : cardForPlan(plan)
  const views = vision?.lookedLikeKitchen && !vision.emptyRoom ? (vision.photoViews ?? []) : []
  const viewOptions: ChipOption<PhotoViewTarget>[] = VIEW_TARGETS.map((v) => ({ value: v, label: letterLabel(t, v) }))

  if (isReading) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card/40 px-5 py-8 text-center"
        role="status"
        aria-live="polite"
      >
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="size-2 rounded-full bg-primary/60"
              animate={{ y: [0, -8, 0], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 0.65, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
            />
          ))}
        </div>
        <p className="text-sm font-medium text-foreground">{t('room.reading')}</p>
      </div>
    )
  }

  function pickCard(card: RoomCard) {
    if (card === 'empty') {
      onExistingRoomChange('empty')
      onPlanChange(null)
      return
    }
    onExistingRoomChange('kitchen')
    onPlanChange(withShape(empty ? null : plan, card))
  }

  return (
    <div className="space-y-6">
      {readFailed && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/50 bg-amber-50/60 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <AlertCircle className="size-4 shrink-0 stroke-[1.75]" aria-hidden />
          <span className="flex-1">{t('room.readFailed')}</span>
          <button
            type="button"
            onClick={onRetryRead}
            className="inline-flex items-center gap-1 rounded-full border border-current/30 px-3 py-1 text-xs font-semibold"
          >
            <RotateCcw className="size-3" aria-hidden />
            {t('common.retry')}
          </button>
        </div>
      )}

      {views.length > 0 && (
        <section className="space-y-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('room.views.title')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('room.views.hint')}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {views.map((v) => {
              const src = photos[v.photoIndex]
              const visible = Boolean(src && src !== OMITTED_IMAGE)
              const label = t('room.views.photo').replace('{n}', String(v.photoIndex + 1))
              return (
                <div key={v.photoIndex} className="space-y-1.5">
                  <div className="aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted">
                    {visible ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt={label} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-muted-foreground">
                        {label}
                      </div>
                    )}
                  </div>
                  <ChipSelect
                    value={v.shows}
                    options={viewOptions}
                    onChange={(shows) => onRelabel(v.photoIndex, shows)}
                    label={t('room.views.chipTitle').replace('{n}', String(v.photoIndex + 1))}
                    variant="standalone"
                    tone="muted"
                  />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {plan && !empty && (
        <FloorPlanStatic
          plan={plan}
          showDimensions={false}
          hideFooter
          wallLetters={ALL_LETTERS}
          className="mx-auto max-w-md"
        />
      )}

      <section className="space-y-2.5">
        <p className="text-sm font-semibold text-foreground">{t('room.shape.title')}</p>
        <CardGrid
          cards={ROOM_CARDS}
          selected={selected}
          onPick={pickCard}
          preview={(card) => (card === 'empty' ? null : card === selected && plan ? plan : null)}
          locale={locale}
        />
        {vision && !readFailed && selected && selected !== 'empty' && (
          <p className="text-[11px] text-muted-foreground">{t('room.shape.estimated')}</p>
        )}
      </section>

      {empty ? (
        <section className="space-y-2.5">
          <p className="text-sm font-semibold text-foreground">{t('room.empty.title')}</p>
          <CardGrid
            cards={TARGET_CARDS}
            selected={cardForPlan(plan)}
            onPick={(card) => onPlanChange(withShape(plan, card))}
            preview={(card) => (card === cardForPlan(plan) && plan ? plan : null)}
            locale={locale}
          />
        </section>
      ) : (
        plan && (
          <section className="space-y-2.5">
            <div>
              <p className="text-sm font-semibold text-foreground">{t('room.intent.title')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('room.intent.help')}</p>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('room.intent.title')}>
              {INTENTS.map((intent) => (
                <button
                  key={intent}
                  type="button"
                  aria-pressed={layoutIntent === intent}
                  onClick={() => onLayoutIntentChange(intent)}
                  className={cn(
                    'rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors',
                    layoutIntent === intent
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:border-primary/50'
                  )}
                >
                  {t(`room.intent.${intent}`)}
                </button>
              ))}
            </div>
          </section>
        )
      )}
    </div>
  )
}

function CardGrid<C extends RoomCard>({
  cards,
  selected,
  onPick,
  preview,
  locale,
}: {
  cards: readonly C[]
  selected: RoomCard | null
  onPick: (card: C) => void
  preview: (card: C) => FloorPlan | null
  locale: import('@/lib/i18n').Locale
}) {
  const { t } = useTranslations()
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {cards.map((card) => {
        const plan =
          card === 'empty'
            ? null
            : (preview(card) ?? fromShapePreset(card as LayoutShape, { hasIsland: card === 'island' }))
        const svg = plan ? renderFloorPlanSvg(plan, { showDimensions: false, showDisclaimer: false, locale }) : null
        const isSelected = selected === card
        return (
          <button
            key={card}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onPick(card)}
            className={cn(
              'relative flex flex-col items-stretch overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-colors',
              isSelected ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background' : 'border-border hover:border-primary/50'
            )}
          >
            {svg ? (
              // The picture illustrates the card; its labels are not the button's name.
              <div aria-hidden className="aspect-[3/2] bg-background" dangerouslySetInnerHTML={{ __html: svg }} />
            ) : (
              <div aria-hidden className="flex aspect-[3/2] items-center justify-center bg-background">
                <div className="h-3/5 w-3/5 rounded-sm border-2 border-dashed border-muted-foreground/40" />
              </div>
            )}
            <div className="border-t border-border/70 px-3 py-2">
              <p className="text-sm font-semibold text-foreground">{t(`room.card.${card}`)}</p>
              <p className="text-[11px] text-muted-foreground">{t(`room.card.${card}.description`)}</p>
            </div>
            {isSelected && (
              <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3 stroke-[3]" aria-hidden />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function MeasureScreen({ photos, vision, plan, onPlanChange, onSaveLater }: RoomStepProps) {
  const { t } = useTranslations()
  const [saveState, setSaveState] = useState<'idle' | 'saving' | SaveLaterResult>('idle')
  if (!plan) return null
  const walls = counterWalls(plan)
  const missing = missingWalls(plan)
  const measured = walls.filter((w) => !missing.includes(w))
  const hasPhotos = photos.some((p) => p && p !== OMITTED_IMAGE)
  const letters = Object.fromEntries(walls.map((w) => [w, WALL_LETTER[w]])) as Partial<Record<WallSide, string>>
  const missingText = missing.map((w) => t('room.measure.wall').replace('{a}', WALL_LETTER[w])).join(', ')
  const ceilingHint = vision?.ceilingHeightCm ? Math.round(vision.ceilingHeightCm) : null

  async function saveLater() {
    setSaveState('saving')
    setSaveState(await onSaveLater())
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-foreground">{t('room.measure.title')}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t('room.measure.intro')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('room.measure.tip')}</p>
      </div>

      <FloorPlanStatic
        plan={plan}
        showDimensions={false}
        hideFooter
        wallLetters={letters}
        wallLettersDone={measured}
        className="mx-auto max-w-md"
      />

      <div className="space-y-3">
        {walls.map((wall) => (
          <LengthField
            key={wall}
            id={`room-wall-${wall}`}
            label={t('room.measure.wall').replace('{a}', WALL_LETTER[wall])}
            initialCm={plan.room.sides[wall].measuredLengthCm}
            hintCm={wallEstimateCm(vision, wall)}
            parse={parseWallLengthCm}
            rangeError={t('room.measure.range')}
            describedBy={missing.length > 0 ? 'room-missing' : undefined}
            onValue={(cm) => {
              if (cm === (plan.room.sides[wall].measuredLengthCm ?? null)) return
              onPlanChange(withMeasuredWall(plan, wall, cm, { hasPhotos }))
            }}
          />
        ))}

        <LengthField
          id="room-ceiling"
          label={t('room.ceiling.label')}
          initialCm={plan.ceilingSource === 'homeowner' ? plan.ceilingHeightCm : undefined}
          hintCm={ceilingHint}
          parse={parseCeilingCm}
          rangeError={t('room.ceiling.range').replace('{min}', String(CEILING_MIN_CM)).replace('{max}', String(CEILING_MAX_CM))}
          unmeasuredNote={t('room.ceiling.unmeasured')}
          onValue={(cm) => onPlanChange(withCeiling(plan, cm, vision?.ceilingHeightCm))}
        />
      </div>

      {missing.length > 0 && (
        <p id="room-missing" className="text-xs text-muted-foreground" aria-live="polite">
          {t('room.measure.missing').replace('{walls}', missingText)}
        </p>
      )}

      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <button
          type="button"
          onClick={() => void saveLater()}
          disabled={saveState === 'saving'}
          className="text-left text-sm font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-60"
        >
          {t('room.later')}
        </button>
        {saveState !== 'idle' && saveState !== 'saving' && (
          <p
            className={cn('mt-1.5 text-xs', saveState === 'failed' ? 'text-destructive' : 'text-muted-foreground')}
            role="status"
          >
            {t(
              saveState === 'saved_project'
                ? 'room.later.savedProject'
                : saveState === 'saved_local'
                  ? 'room.later.savedLocal'
                  : 'room.later.failed'
            )}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * One length, typed. Empty at first; the photo estimate is a muted line under
 * it, never its value. A value that parses is handed up as it is typed (so
 * Continue enables without a blur); one that does not is reported on blur.
 */
function LengthField({
  id,
  label,
  initialCm,
  hintCm,
  parse,
  rangeError,
  unmeasuredNote,
  describedBy,
  onValue,
}: {
  id: string
  label: string
  initialCm?: number
  hintCm: number | null
  parse: (raw: string) => number | null
  rangeError: string
  /** Shown while empty — the optional ceiling's "nije izmjereno". */
  unmeasuredNote?: string
  describedBy?: string
  onValue: (cm: number | null) => void
}) {
  const { t } = useTranslations()
  const [text, setText] = useState(initialCm ? String(Math.round(initialCm)) : '')
  const [touched, setTouched] = useState(false)
  const cm = parse(text)
  const showError = touched && text.trim() !== '' && cm == null
  const echo = cm != null && text.trim() !== String(cm)
  const notes = [
    hintCm ? t('room.measure.hint').replace('{cm}', String(hintCm)) : null,
    cm == null && unmeasuredNote ? unmeasuredNote : null,
  ].filter(Boolean)

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 rounded-2xl border border-border bg-card/60 px-4 py-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {notes.length > 0 && <p className="mt-0.5 text-[11px] text-muted-foreground/80">{notes.join(' · ')}</p>}
        {cm != null && (
          <p className="mt-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            {echo ? `${t('room.measure.metres').replace('{cm}', String(cm))} · ` : ''}
            {t('room.measure.measured')}
          </p>
        )}
        {showError && <p className="mt-0.5 text-[11px] text-destructive">{rangeError}</p>}
      </div>
      <div
        className={cn(
          'flex items-center overflow-hidden rounded-lg border bg-background focus-within:ring-1',
          showError ? 'border-destructive focus-within:ring-destructive/30' : 'border-border focus-within:border-primary/60 focus-within:ring-primary/20'
        )}
      >
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-invalid={showError}
          aria-describedby={describedBy}
          onChange={(e) => {
            setText(e.target.value)
            onValue(parse(e.target.value))
          }}
          onBlur={() => setTouched(true)}
          className="w-24 bg-transparent px-2.5 py-2 text-right text-[15px] tabular-nums text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
        />
        <span className="shrink-0 pr-2.5 text-[11px] text-muted-foreground/60">cm</span>
      </div>
    </div>
  )
}
