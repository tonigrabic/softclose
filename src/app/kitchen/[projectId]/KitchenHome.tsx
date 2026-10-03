'use client'

import { useState } from 'react'
import { Camera, Check, Hammer, ListChecks, Sparkles } from 'lucide-react'
import { KitchenIntake } from '@/components/kitchen-intake'
import { AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/button'
import { RangeLine, type RangeLineValue } from '@/components/range/RangeLine'
import { useTranslations, type TranslationKey } from '@/lib/i18n'
import type { FlowStepId } from '@/lib/flow'
import type { MakerDecision } from '@/lib/project/decision'
import type { ProjectSnapshot } from '@/lib/project/snapshot'
import { cn } from '@/lib/utils'

export interface KitchenHomeProps {
  projectId: string
  /** The maker's name; null when the project has none (worded "your maker"). */
  makerName: string | null
  /** Where they left off, for the continue label. Null before they start. */
  stepLabel: string | null
  submittedAt: string | null
  makerViewedAt: string | null
  briefId: string | null
  /** The works range the current brief stored, with its ± and assumptions.
   *  Null when the brief went out without a build (no range to show). */
  range: RangeLineValue | null
  /** The maker's answer on the current brief (IMP-03). Never the quoted
   *  amount: that is the maker's to send, with its terms. */
  decision: { status: MakerDecision; date: string | null; note: string | null } | null
  /** Declined or archived: no edit, no re-send — the handoff refuses one. */
  closed: boolean
  started: boolean
  /** Concurrency token for checkpoint writes. */
  revision: number
  /** The maker is looking at their customer's kitchen: show it, never write. */
  readOnly: boolean
  /** The journey as the server last saw it, for a resume on any device. */
  snapshot: ProjectSnapshot | null
  /** The customer's account — their email is the brief's contact address. */
  customerEmail: string | null
  customerName: string | null
}

const DECISION_COPY: Record<MakerDecision, { pill: TranslationKey; line: TranslationKey; tone: string }> = {
  quoted: {
    pill: 'kitchen.home.decision.pill.quoted',
    line: 'kitchen.home.decision.quoted',
    tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  },
  clarify: {
    pill: 'kitchen.home.decision.pill.clarify',
    line: 'kitchen.home.decision.clarify',
    tone: 'bg-amber-50 text-amber-800 ring-amber-200',
  },
  // Calm, not alarming (rule 7): a decline reads as "closed", not as an error.
  declined: {
    pill: 'kitchen.home.decision.pill.declined',
    line: 'kitchen.home.decision.declined',
    tone: 'bg-muted text-muted-foreground ring-border',
  },
}

/**
 * The line under the maker's answer: what happens next. It may only promise
 * what this screen shows. A closed project has no way into its summary any
 * more, so a decline mentions the estimate only when there is one on screen
 * below — and says nothing when the brief went out without a range.
 */
export function decisionNextKey(status: MakerDecision, hasRange: boolean): TranslationKey | null {
  if (status === 'quoted') return 'kitchen.home.decision.quotedNext'
  if (status === 'clarify') return 'kitchen.home.decision.clarifyNext'
  return hasRange ? 'kitchen.home.decision.declinedNext' : null
}

const ACTS = [
  { icon: Camera, key: 'kitchen.home.act.space' },
  { icon: Sparkles, key: 'kitchen.home.act.look' },
  { icon: Hammer, key: 'kitchen.home.act.build' },
  { icon: ListChecks, key: 'kitchen.home.act.details' },
] as const

/**
 * Where an invite lands, and where every later sign-in lands.
 *
 * It is the walkthrough AND the status page, which is the point: before they
 * start it answers "what is this, what do I need, what do I get"; afterwards
 * the same screen says where the brief got to. The product had neither, and
 * the customer half of "end the ghosting both ways" did not exist at all.
 *
 * Deliberately not a guided tour over the real UI: AGENTS.md rule 7 asks for
 * calm, not flashy, and coach marks are the opposite of calm on a screen whose
 * job is to reduce anxiety about spending €15,000.
 */
export function KitchenHome(props: KitchenHomeProps) {
  const { t } = useTranslations()
  const [entered, setEntered] = useState(false)
  const [startAt, setStartAt] = useState<FlowStepId | undefined>(undefined)
  // Heads a sentence ("Tvoj izrađivač je otvorio…"), so capitalised. The
  // range lines (here and in the intake) get the raw name and word their own
  // lower-case fallback mid-sentence ("raspon koji tvoj izrađivač potvrđuje").
  const makerLabel = props.makerName || t('kitchen.home.yourMaker')

  if (entered) {
    return (
      <KitchenIntake
        projectId={props.projectId}
        makerName={props.makerName}
        initialRevision={props.revision}
        readOnly={props.readOnly}
        hasExistingBrief={Boolean(props.briefId)}
        initialSnapshot={props.snapshot}
        customerEmail={props.customerEmail}
        customerName={props.customerName}
        startAt={startAt}
      />
    )
  }

  const submitted = Boolean(props.submittedAt)
  const decision = props.decision
    ? {
        ...props.decision,
        copy: DECISION_COPY[props.decision.status],
        next: decisionNextKey(props.decision.status, props.range != null),
      }
    : null

  return (
    <AuthShell signedIn>
      <div className="w-full py-6">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('kitchen.home.eyebrow')}
        </p>
        <h1 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-foreground">
          {t(
            props.closed ? 'kitchen.home.titleClosed' : submitted ? 'kitchen.home.titleSubmitted' : 'kitchen.home.title'
          ).replace('{maker}', makerLabel)}
        </h1>

        {submitted ? (
          <div className="mt-5 space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="flex items-start gap-2 text-sm text-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              {t('kitchen.home.status.sent').replace('{date}', props.submittedAt!)}
            </p>
            {/* Only claims the maker opened it when they actually did — the
                stamp now comes from a maker-authenticated page load. */}
            <p className="text-sm text-muted-foreground">
              {props.makerViewedAt
                ? t('kitchen.home.status.seen')
                    .replace('{maker}', makerLabel)
                    .replace('{date}', props.makerViewedAt)
                : t('kitchen.home.status.notSeen').replace('{maker}', makerLabel)}
            </p>
            {/* The maker's answer (rule 8): the homeowner learns the outcome
                here, without chasing anyone. */}
            {decision ? (
              <div className="space-y-1.5">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ring-1 ring-inset',
                      decision.copy.tone
                    )}
                  >
                    {t(decision.copy.pill)}
                  </span>
                  <span>
                    {t(decision.copy.line)
                      .replace('{maker}', makerLabel)
                      .replace('{date}', decision.date ?? '')}
                  </span>
                </p>
                {decision.next ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">{t(decision.next)}</p>
                ) : null}
                {decision.note ? (
                  <blockquote className="whitespace-pre-line border-l-2 border-border pl-3 text-sm leading-relaxed text-foreground">
                    {decision.note}
                  </blockquote>
                ) : null}
              </div>
            ) : null}
            {/* The one range line (IMP-04): the figures the brief stored,
                the ±, who confirms it and what it leaves out. */}
            <RangeLine
              className="border-t border-border/60 pt-3"
              voice="homeowner"
              makerName={props.makerName}
              label={t('kitchen.home.status.rangeLabel')}
              range={props.range}
              fallback={
                props.closed ? null : (
                  // Sent without a build, so without a range — there is no
                  // number to show until they build, and they can do that from
                  // here. (Not on a closed project: there is no building any more.)
                  <div className="border-t border-border/60 pt-3">
                    <p className="text-sm text-foreground">{t('kitchen.home.status.noRange')}</p>
                    {!props.readOnly && (
                      <button
                        type="button"
                        onClick={() => {
                          setStartAt('builder')
                          setEntered(true)
                        }}
                        className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
                      >
                        <Hammer className="size-3.5" aria-hidden />
                        {t('kitchen.home.cta.build')}
                      </button>
                    )}
                  </div>
                )
              }
            />
          </div>
        ) : props.closed ? null : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t('kitchen.home.what')}</p>

            <div className="mt-6 space-y-3">
              {ACTS.map(({ icon: Icon, key }, i) => (
                <div key={key} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Icon className="size-3.5" />
                  </span>
                  <p className="text-sm text-foreground">
                    <span className="text-muted-foreground">{i + 1}.</span> {t(key)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-xs font-medium text-foreground">{t('kitchen.home.need.title')}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('kitchen.home.need.body')}</p>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t('kitchen.home.time')}</p>
          </>
        )}

        {/* A closed project keeps its status card — sent, seen, the maker's
            answer and the range when there is one — but offers no way back
            into the intake or its summary: a re-send would be refused, and an
            edit nobody receives is worse than none. A question (clarify)
            keeps editing open — changing the kitchen is one way to answer. */}
        {!props.closed ? (
          <>
            <Button size="lg" className="mt-6 h-11 w-full rounded-xl text-sm" onClick={() => setEntered(true)}>
              {submitted
                ? t('kitchen.home.cta.edit')
                : props.started
                  ? t('kitchen.home.cta.continue').replace('{step}', props.stepLabel ?? '')
                  : t('kitchen.home.cta.start')}
            </Button>

            {props.briefId ? (
              <p className="mt-3 text-center text-[0.6875rem] text-muted-foreground">
                {t('kitchen.home.editNote').replace('{maker}', makerLabel)}
              </p>
            ) : (
              <p className="mt-3 text-center text-[0.6875rem] text-muted-foreground">
                {t('kitchen.makerSees').replace('{maker}', makerLabel)}
              </p>
            )}
          </>
        ) : null}
      </div>
    </AuthShell>
  )
}
