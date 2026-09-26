'use client'

import { useActionState, useEffect, useRef } from 'react'
import { AuthShell } from '@/components/AuthShell'
import { Button, buttonVariants } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { completeSignIn, type VerifyState } from './actions'

/**
 * Auto-submits on mount, so the person sees a spinner for ~150 ms rather than a
 * screen asking them to click again. The form exists because the sign-in must
 * happen on POST — see the comment in actions.ts about mail scanners.
 *
 * <noscript> keeps it usable without JavaScript.
 */
export function VerifyForm({ token }: { token: string }) {
  const { t } = useTranslations()
  const [state, formAction] = useActionState<VerifyState, FormData>(completeSignIn, { failed: false })
  const formRef = useRef<HTMLFormElement>(null)
  const submitted = useRef(false)

  useEffect(() => {
    if (submitted.current) return
    submitted.current = true
    formRef.current?.requestSubmit()
  }, [])

  if (state.failed) {
    return (
      <AuthShell>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">{t('auth.verify.failed.title')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('auth.verify.failed.body')}</p>
          <a
            href="/login"
            className={cn(buttonVariants({ size: 'lg' }), 'mt-5 h-11 w-full rounded-xl text-sm')}
          >
            {t('auth.verify.failed.cta')}
          </a>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <form ref={formRef} action={formAction} className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <input type="hidden" name="token" value={token} />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t('auth.verify.working')}
        </p>
        <noscript>
          <Button type="submit" size="lg" className="mt-4 h-11 w-full rounded-xl text-sm">
            {t('auth.verify.submit')}
          </Button>
        </noscript>
      </form>
    </AuthShell>
  )
}
