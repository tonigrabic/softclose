'use client'

import { useId, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, MessageCircle, X } from 'lucide-react'
import { useTranslations, type TranslationKey } from '@/lib/i18n'
import {
  formatQuoteEur,
  isDecided,
  isOpenStatus,
  NOTE_MAX,
  noteLength,
  parseEurInput,
  validateDecision,
  type MakerDecision,
} from '@/lib/project/decision'
import { cn } from '@/lib/utils'
import { decideBrief, type DecideResult } from './actions'

/** The maker's decision as the brief page shows it. Labels are formatted on the
 *  server with the session locale, like the dashboard's, so they cannot
 *  mismatch on hydration. */
export interface DecisionView {
  /** The brief's maker_status as stored. */
  status: string
  note: string | null
  /** Set only for a quote: "6.200 €". */
  quotedLabel: string | null
  /** Set once decided: "03. 10. 2026." */
  decidedLabel: string | null
}

type DecideError = Extract<DecideResult, { ok: false }>['error']

const CHIP_KEY: Record<MakerDecision, TranslationKey> = {
  quoted: 'maker.decision.chip.quoted',
  clarify: 'maker.decision.chip.clarify',
  declined: 'maker.decision.chip.declined',
}

const CHIP_TONE: Record<MakerDecision, string> = {
  quoted: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  clarify: 'bg-amber-100 text-amber-800 ring-amber-200',
  declined: 'bg-rose-50 text-rose-700 ring-rose-200',
}

const ERROR_KEY: Record<DecideError, TranslationKey> = {
  invalid_status: 'maker.decision.error.transition',
  transition: 'maker.decision.error.transition',
  amount_required: 'maker.decision.error.amount',
  amount_invalid: 'maker.decision.error.amount',
  note_required: 'maker.decision.error.noteRequired',
  note_too_long: 'maker.decision.error.noteTooLong',
  superseded: 'maker.decision.error.superseded',
  stale: 'maker.decision.error.stale',
  unavailable: 'maker.decision.error.unavailable',
}

/** The three buttons keep the colours and icons the demo always had. */
const BUTTONS: Array<{
  key: MakerDecision
  label: TranslationKey
  Icon: typeof Check
  iconClass: string
  idle: string
  active: string
}> = [
  {
    key: 'quoted',
    label: 'maker.action.quote',
    Icon: Check,
    iconClass: 'stroke-[3]',
    idle: 'bg-emerald-500 hover:bg-emerald-600',
    active: 'bg-emerald-600 ring-2 ring-emerald-300',
  },
  {
    key: 'clarify',
    label: 'maker.action.clarify',
    Icon: MessageCircle,
    iconClass: 'stroke-[2]',
    idle: 'bg-amber-500 hover:bg-amber-600',
    active: 'bg-amber-600 ring-2 ring-amber-300',
  },
  {
    key: 'declined',
    label: 'maker.action.decline',
    Icon: X,
    iconClass: 'stroke-[3]',
    idle: 'bg-rose-500 hover:bg-rose-600',
    active: 'bg-rose-600 ring-2 ring-rose-300',
  },
]

const SUBMIT_TONE: Record<MakerDecision, string> = {
  quoted: 'bg-emerald-600 hover:bg-emerald-700',
  clarify: 'bg-amber-600 hover:bg-amber-700',
  declined: 'bg-rose-600 hover:bg-rose-700',
}

/** "Ponuda 6.200 € · 03. 10. 2026." — nothing at all before a decision. */
export function DecisionChip({ decision }: { decision: DecisionView }) {
  const { t } = useTranslations()
  if (!isDecided(decision.status)) return null
  const label = t(CHIP_KEY[decision.status])
    .replace('{amount}', decision.quotedLabel ?? '—')
    .replace('{date}', decision.decidedLabel ?? '')
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        CHIP_TONE[decision.status]
      )}
    >
      {label}
    </span>
  )
}

/**
 * The maker's three buttons, for real (IMP-03): a quote with the amount they
 * actually quoted, a question for the customer, or a decline.
 *
 * Each button opens a small inline form rather than deciding on the click — a
 * quote needs its amount, a question needs its text, and a decline closes the
 * customer's project, so all three deserve one deliberate confirm. The panel
 * checks with the same `validateDecision` the server action runs, so the
 * submit button is enabled exactly when the save would be accepted.
 *
 * Quote and decline are final for the brief, so once either is recorded the
 * panel shrinks to the chip. A question keeps it open.
 */
export function DecisionPanel({ briefId, decision }: { briefId: string; decision: DecisionView }) {
  const { t, locale } = useTranslations()
  const router = useRouter()
  const id = useId()
  const [mode, setMode] = useState<MakerDecision | null>(null)
  const [amountRaw, setAmountRaw] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<DecideError | null>(null)
  const [pending, startTransition] = useTransition()

  if (!isOpenStatus(decision.status)) {
    return (
      <div>
        <DecisionChip decision={decision} />
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{t('maker.decision.final')}</p>
      </div>
    )
  }

  const parsed = mode === 'quoted' ? parseEurInput(amountRaw) : null
  const check = mode
    ? validateDecision({ from: decision.status, to: mode, note, quotedEur: parsed ?? undefined })
    : null
  const amountError =
    mode === 'quoted' && amountRaw.trim() !== '' && check !== null && !check.ok &&
    (check.error === 'amount_invalid' || check.error === 'amount_required')
  const length = noteLength(note.trim())
  const tooLong = length > NOTE_MAX

  const submitLabel = (() => {
    if (mode === 'quoted') {
      const amount = check?.ok && check.decision.quotedEur !== null ? formatQuoteEur(check.decision.quotedEur, locale) : '—'
      return t('maker.decision.submit.quote').replace('{amount}', amount)
    }
    return t(mode === 'clarify' ? 'maker.decision.submit.clarify' : 'maker.decision.submit.decline')
  })()

  function open(next: MakerDecision) {
    setMode(next)
    setError(null)
  }

  function cancel() {
    setMode(null)
    setAmountRaw('')
    setNote('')
    setError(null)
  }

  function submit() {
    if (!check?.ok || pending) return
    const { status, note: cleanNote, quotedEur } = check.decision
    setError(null)
    startTransition(async () => {
      let result: DecideResult | undefined
      try {
        result = await decideBrief(briefId, status, cleanNote, quotedEur)
      } catch {
        setError('unavailable')
        return
      }
      // A signed-out session redirects to /login from inside the action; the
      // router is already on its way and there is nothing to show here.
      if (!result) return
      if (result.ok) {
        // revalidatePath in the action re-renders this page with the saved
        // decision; the chip takes over from the form.
        setMode(null)
        setAmountRaw('')
        setNote('')
        return
      }
      setError(result.error)
      // Decided elsewhere (another tab): show what is actually saved.
      if (result.error === 'stale' || result.error === 'transition') router.refresh()
    })
  }

  return (
    <div>
      <div className="flex gap-2">
        {BUTTONS.map(({ key, label, Icon, iconClass, idle, active }) => (
          <button
            key={key}
            type="button"
            onClick={() => open(key)}
            disabled={pending}
            aria-expanded={mode === key}
            aria-controls={mode === key ? `${id}-form` : undefined}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wide text-white transition-all disabled:opacity-40',
              mode === key ? active : idle,
              mode !== null && mode !== key && 'opacity-50 hover:opacity-100'
            )}
          >
            <Icon className={cn('mr-1 inline size-3', iconClass)} aria-hidden />
            {t(label)}
          </button>
        ))}
      </div>

      {mode && (
        <form
          id={`${id}-form`}
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3"
        >
          {mode === 'quoted' && (
            <div>
              <label htmlFor={`${id}-amount`} className="block text-[11px] font-semibold text-slate-700">
                {t('maker.decision.amount.label')}
              </label>
              <input
                id={`${id}-amount`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="6.200"
                value={amountRaw}
                onChange={(e) => setAmountRaw(e.target.value)}
                aria-invalid={amountError || undefined}
                aria-describedby={`${id}-amount-hint`}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-200"
              />
              <p id={`${id}-amount-hint`} className="mt-1 text-[11px] leading-relaxed text-slate-500">
                {t('maker.decision.amount.hint')}
              </p>
              {amountError && (
                <p role="alert" className="mt-1 text-[11px] text-rose-700">
                  {t('maker.decision.error.amount')}
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor={`${id}-note`} className="block text-[11px] font-semibold text-slate-700">
              {t(mode === 'clarify' ? 'maker.decision.note.clarify' : 'maker.decision.note.optional')}
            </label>
            <textarea
              id={`${id}-note`}
              rows={mode === 'clarify' ? 3 : 2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required={mode === 'clarify'}
              aria-invalid={tooLong || undefined}
              className="mt-1 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-200"
            />
            <p className={cn('mt-0.5 text-right font-mono text-[10px]', tooLong ? 'text-rose-700' : 'text-slate-400')}>
              {t('maker.decision.note.count').replace('{n}', String(length)).replace('{max}', String(NOTE_MAX))}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={!check?.ok || pending}
              className={cn(
                'rounded-md px-3 py-2 text-xs font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                SUBMIT_TONE[mode]
              )}
            >
              {pending ? t('maker.decision.saving') : submitLabel}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="rounded-md px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40"
            >
              {t('maker.decision.cancel')}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[11px] leading-relaxed text-rose-700">
          {t(ERROR_KEY[error])}
          {error === 'superseded' && (
            <>
              {' '}
              <Link href="/dashboard" className="font-semibold underline underline-offset-2">
                {t('maker.decision.error.supersededLink')}
              </Link>
            </>
          )}
        </p>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{t('maker.decision.visible')}</p>
    </div>
  )
}
