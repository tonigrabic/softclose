'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n'
import { forgetLocalJourney } from '@/lib/project/forget-local'
import { deleteMyAccount, deleteMyKitchen } from './actions'

/**
 * "Izbriši moju kuhinju" on the kitchen home (IMP-09).
 *
 * Two steps, both calm (rule 7, and AGENTS.md's no-dark-patterns line): a
 * quiet text link opens an inline panel that says exactly what goes and what
 * stays, with "Odustani" first and the same size as "Izbriši trajno". No
 * countdown, no checkbox, no guilt copy, and the destructive button is never
 * pre-focused — the panel's heading is.
 *
 * The browser's own copies (IndexedDB snapshot, the builder's unload record)
 * are forgotten BEFORE the action runs, because the action redirects away on
 * success. On a failure the server copy still exists, so a journey whose local
 * copy is gone resumes from the server; nothing is lost by clearing early.
 *
 * One failure is different: the kitchen went and only the account step
 * stopped. The project row is gone, so deleteMyKitchen would now 404; the
 * panel turns into the account panel and its retry runs deleteMyAccount.
 * "Odustani" then leaves for / — this kitchen page no longer exists, and the
 * no-kitchen panel there offers the same account delete.
 */
export function DeleteKitchen({
  projectId,
  makerName,
  submitted,
}: {
  projectId: string
  makerName: string | null
  /** A brief went out: the maker may already hold an email notice about it. */
  submitted: boolean
}) {
  const [asking, setAsking] = useState(false)
  const [failed, setFailed] = useState(false)
  const [kitchenGone, setKitchenGone] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <DeleteKitchenView
      variant={kitchenGone ? 'account' : 'kitchen'}
      kitchenGone={kitchenGone}
      makerName={makerName}
      submitted={submitted}
      asking={asking}
      pending={pending}
      failed={failed}
      onOpen={() => {
        setFailed(false)
        setAsking(true)
      }}
      onCancel={() => {
        if (kitchenGone) window.location.assign('/')
        else setAsking(false)
      }}
      onConfirm={() =>
        startTransition(async () => {
          setFailed(false)
          await forgetLocalJourney(projectId)
          try {
            // Success never returns: the action redirects to /login?deleted=….
            const result = kitchenGone ? await deleteMyAccount() : await deleteMyKitchen(projectId)
            if (result && !result.ok) {
              if (result.error === 'account') setKitchenGone(true)
              setFailed(true)
            }
          } catch (err) {
            // The redirect arrives as a thrown Next error — hand it back.
            unstable_rethrow(err)
            setFailed(true)
          }
        })
      }
    />
  )
}

/**
 * "Izbriši moj račun" on the no-kitchen panel at / (IMP-09): an account whose
 * kitchen is gone — its delete stopped at the account step, or the project
 * was removed — still holds an email address and a name, and this is the way
 * to erase them. Same two calm steps as the kitchen panel.
 */
export function DeleteAccount() {
  const [asking, setAsking] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <DeleteKitchenView
      variant="account"
      makerName={null}
      submitted={false}
      asking={asking}
      pending={pending}
      failed={failed}
      onOpen={() => {
        setFailed(false)
        setAsking(true)
      }}
      onCancel={() => setAsking(false)}
      onConfirm={() =>
        startTransition(async () => {
          setFailed(false)
          try {
            // Success never returns: the action redirects to /login?deleted=account.
            const result = await deleteMyAccount()
            if (result && !result.ok) setFailed(true)
          } catch (err) {
            unstable_rethrow(err)
            setFailed(true)
          }
        })
      }
    />
  )
}

/** The link and the panel for a given state — split from the hooks so each
 *  state renders on its own (tests/delete-kitchen-ui.test.ts). */
export function DeleteKitchenView({
  variant = 'kitchen',
  kitchenGone = false,
  makerName,
  submitted,
  asking,
  pending,
  failed,
  onOpen,
  onCancel,
  onConfirm,
}: {
  /** 'account': the account alone, once no kitchen is left on it. */
  variant?: 'kitchen' | 'account'
  /** The kitchen already went and the account step stopped — the failure says so. */
  kitchenGone?: boolean
  makerName: string | null
  submitted: boolean
  asking: boolean
  pending: boolean
  failed: boolean
  onOpen: () => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslations()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const openRef = useRef<HTMLButtonElement>(null)
  const wasAsking = useRef(asking)

  // Focus follows the step: the panel's heading on open (never the delete
  // button), the link again on cancel. Nothing moves on first render.
  useEffect(() => {
    if (asking && !wasAsking.current) headingRef.current?.focus()
    if (!asking && wasAsking.current) openRef.current?.focus()
    wasAsking.current = asking
  }, [asking])

  const account = variant === 'account'

  if (!asking) {
    return (
      <div className="mt-8 text-center">
        <button
          ref={openRef}
          type="button"
          onClick={onOpen}
          data-delete-kitchen
          className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          {t(account ? 'account.delete.open' : 'kitchen.delete.open')}
        </button>
      </div>
    )
  }

  // Mid-sentence, so the lower-case fallback ("…a tvoj izrađivač ih više…").
  const maker = makerName || t('kitchen.delete.yourMaker')

  return (
    <section
      aria-labelledby="delete-kitchen-title"
      data-delete-kitchen-panel
      className="mt-8 rounded-xl border border-border bg-muted/40 p-4"
    >
      <h2
        id="delete-kitchen-title"
        ref={headingRef}
        tabIndex={-1}
        className="text-sm font-semibold text-foreground outline-none"
      >
        {t(account ? 'account.delete.title' : 'kitchen.delete.title')}
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {account ? t('account.delete.body') : t('kitchen.delete.body').replace('{maker}', maker)}
      </p>
      {submitted && !account ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground" data-delete-sent-note>
          {t('kitchen.delete.sentNote')}
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="mt-3 text-xs leading-relaxed text-destructive">
          {t(kitchenGone ? 'kitchen.delete.failedAccount' : account ? 'account.delete.failed' : 'kitchen.delete.failed')}
        </p>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-10 rounded-xl text-sm" onClick={onCancel} disabled={pending}>
          {t('kitchen.delete.cancel')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="h-10 rounded-xl text-sm"
          onClick={onConfirm}
          disabled={pending}
        >
          {pending ? t('kitchen.delete.pending') : t('kitchen.delete.confirm')}
        </Button>
      </div>
    </section>
  )
}
