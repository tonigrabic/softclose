'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n'
import { requestLoginLink, type LoginState } from './actions'

const inputClass =
  'w-full rounded-xl border border-input bg-card px-4 py-3.5 text-[0.9375rem] text-foreground shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 hover:border-foreground/10 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

function SubmitButton() {
  const { pending } = useFormStatus()
  const { t } = useTranslations()
  return (
    <Button type="submit" size="lg" className="h-11 w-full rounded-xl text-sm" disabled={pending}>
      {pending ? t('auth.login.sending') : t('auth.login.submit')}
    </Button>
  )
}

export function LoginForm({ next }: { next?: string }) {
  const { t } = useTranslations()
  const [state, formAction] = useActionState<LoginState, FormData>(requestLoginLink, { status: 'idle' })

  // Sent or not, this branch says the same thing. Whether an account exists for
  // that address is not something a stranger gets to learn from us.
  if (state.status === 'sent') {
    return (
      <AuthShell>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">{t('auth.login.sent.title')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t('auth.login.sent.body').replace('{email}', state.email ?? '')}
          </p>
          {state.devLink ? (
            <div className="mt-5 rounded-xl border border-dashed border-amber-500/50 bg-amber-500/5 p-3">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                {t('auth.login.devLink')}
              </p>
              <a href={state.devLink} className="mt-1 block break-all text-xs text-foreground underline underline-offset-2">
                {state.devLink}
              </a>
            </div>
          ) : null}
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">{t('auth.login.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('auth.login.subtitle')}</p>

        <form action={formAction} className="mt-5 space-y-3">
          <input type="hidden" name="next" value={next ?? ''} />
          <label htmlFor="email" className="sr-only">
            {t('auth.login.email')}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={state.email}
            placeholder={t('auth.login.email')}
            className={inputClass}
          />
          {state.status === 'error' ? (
            <p role="alert" className="text-xs text-destructive">
              {t(
                state.message === 'invalidEmail'
                  ? 'auth.login.invalidEmail'
                  : state.message === 'notConfigured'
                    ? 'auth.login.notConfigured'
                    : 'auth.login.error'
              )}
            </p>
          ) : null}
          <SubmitButton />
        </form>

        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{t('auth.login.noAccount')}</p>
      </div>
    </AuthShell>
  )
}
