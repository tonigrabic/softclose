'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/button'
import { useTranslations, type TranslationKey } from '@/lib/i18n'
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

/** The words for an error state: what went wrong, said so the reader can act. */
function errorKey(message: string | undefined): TranslationKey {
  switch (message) {
    case 'invalidEmail':
      return 'auth.login.invalidEmail'
    case 'notConfigured':
      return 'auth.login.notConfigured'
    // The mail did not go out (IMP-08): said plainly, with the way in that
    // still works — the maker's link.
    case 'notSent':
      return 'auth.login.notSent'
    default:
      return 'auth.login.error'
  }
}

export function LoginForm({ next, deleted = false }: { next?: string; deleted?: boolean | 'account' }) {
  const [state, formAction] = useActionState<LoginState, FormData>(requestLoginLink, { status: 'idle' })
  return <LoginFormView state={state} formAction={formAction} next={next} deleted={deleted} />
}

/** The form for a given action state — split from the hook so each state can
 *  be rendered on its own (tests/login-send-honest.test.ts). */
export function LoginFormView({
  state,
  formAction,
  next,
  deleted = false,
}: {
  state: LoginState
  formAction: (formData: FormData) => void
  next?: string
  /** Landed here from "Izbriši moju kuhinju" (/login?deleted=1, IMP-09), or
   *  from "Izbriši moj račun" (/login?deleted=account). */
  deleted?: boolean | 'account'
}) {
  const { t } = useTranslations()

  // After deleting an account (no kitchen was left on it): the same calm
  // notice, without the link back — there is nothing left to sign in to.
  if (deleted === 'account' && state.status === 'idle') {
    return (
      <AuthShell>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm" data-account-deleted>
          <h1 className="text-lg font-semibold text-foreground">{t('auth.deletedAccount.title')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('auth.deletedAccount.body')}</p>
        </div>
      </AuthShell>
    )
  }

  // After deleting a kitchen: say it is done, calmly, instead of a sign-in
  // form nobody came here for. The link back is for a homeowner with a second
  // kitchen; it reloads /login without the parameter.
  if (deleted && state.status === 'idle') {
    return (
      <AuthShell>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm" data-kitchen-deleted>
          <h1 className="text-lg font-semibold text-foreground">{t('auth.deleted.title')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('auth.deleted.body')}</p>
          <a
            href="/login"
            className="mt-5 inline-block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {t('auth.deleted.signIn')}
          </a>
        </div>
      </AuthShell>
    )
  }

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
              {t(errorKey(state.message))}
            </p>
          ) : null}
          <SubmitButton />
        </form>

        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{t('auth.login.noAccount')}</p>
      </div>
    </AuthShell>
  )
}
