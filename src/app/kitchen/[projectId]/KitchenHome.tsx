'use client'

import { useState } from 'react'
import { Camera, Check, Hammer, ListChecks, Sparkles } from 'lucide-react'
import { KitchenIntake } from '@/components/kitchen-intake'
import { AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n'
import type { ProjectSnapshot } from '@/lib/project/snapshot'

export interface KitchenHomeProps {
  projectId: string
  makerName: string
  /** Where they left off, for the continue label. Null before they start. */
  stepLabel: string | null
  submittedAt: string | null
  makerViewedAt: string | null
  briefId: string | null
  range: string | null
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
      />
    )
  }

  const submitted = Boolean(props.submittedAt)

  return (
    <AuthShell signedIn>
      <div className="w-full py-6">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('kitchen.home.eyebrow')}
        </p>
        <h1 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-foreground">
          {t(submitted ? 'kitchen.home.titleSubmitted' : 'kitchen.home.title').replace('{maker}', props.makerName)}
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
                    .replace('{maker}', props.makerName)
                    .replace('{date}', props.makerViewedAt)
                : t('kitchen.home.status.notSeen').replace('{maker}', props.makerName)}
            </p>
            {props.range ? (
              <p className="text-sm text-foreground">
                {t('kitchen.home.status.range').replace('{range}', props.range)}
              </p>
            ) : null}
          </div>
        ) : (
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

        <Button size="lg" className="mt-6 h-11 w-full rounded-xl text-sm" onClick={() => setEntered(true)}>
          {submitted
            ? t('kitchen.home.cta.edit')
            : props.started
              ? t('kitchen.home.cta.continue').replace('{step}', props.stepLabel ?? '')
              : t('kitchen.home.cta.start')}
        </Button>

        {props.briefId ? (
          <p className="mt-3 text-center text-[0.6875rem] text-muted-foreground">
            {t('kitchen.home.editNote').replace('{maker}', props.makerName)}
          </p>
        ) : (
          <p className="mt-3 text-center text-[0.6875rem] text-muted-foreground">
            {t('kitchen.makerSees').replace('{maker}', props.makerName)}
          </p>
        )}
      </div>
    </AuthShell>
  )
}
