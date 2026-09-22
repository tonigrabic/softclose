'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Check, Copy, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n'
import { inviteCustomer, type InviteState } from './actions'

const inputClass =
  'w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 hover:border-foreground/10 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

function Submit() {
  const { pending } = useFormStatus()
  const { t } = useTranslations()
  return (
    <Button type="submit" size="lg" className="h-10 shrink-0 rounded-xl px-4 text-sm" disabled={pending}>
      {pending ? t('dashboard.invite.sending') : t('dashboard.invite.submit')}
    </Button>
  )
}

/**
 * The invite link is always shown, and always copyable — including in
 * production. The maker is the one who issued it, so there is nothing here to
 * keep from them, and in this trade a link gets sent over WhatsApp far more
 * often than by email. Email is the convenience, not the mechanism.
 */
function LinkBox({ url, emailed, customerName }: { url: string; emailed: boolean; customerName?: string }) {
  const { t } = useTranslations()
  const [copied, setCopied] = useState(false)

  return (
    <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
      <p className="text-sm font-medium text-foreground">
        {t(emailed ? 'dashboard.invite.sent' : 'dashboard.invite.ready').replace('{name}', customerName ?? '')}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t('dashboard.invite.shareHint')}</p>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground">
          {url}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            } catch {
              // Clipboard blocked (insecure context / permission) — the link is
              // on screen and selectable, so there is nothing to report.
            }
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {t(copied ? 'dashboard.invite.copied' : 'dashboard.invite.copy')}
        </button>
      </div>
    </div>
  )
}

export function InviteForm() {
  const { t } = useTranslations()
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState<InviteState, FormData>(inviteCustomer, { status: 'idle' })

  if (!open && state.status !== 'created') {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
      >
        <Plus className="size-4" />
        {t('dashboard.invite.open')}
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1">
          <label htmlFor="invite-name" className="mb-1 block text-xs font-medium text-muted-foreground">
            {t('dashboard.invite.name')}
          </label>
          <input id="invite-name" name="name" type="text" className={inputClass} placeholder="Ana Kovač" />
        </div>
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="invite-email" className="mb-1 block text-xs font-medium text-muted-foreground">
            {t('dashboard.invite.email')}
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            className={inputClass}
            placeholder="ana@primjer.hr"
          />
        </div>
        <Submit />
      </form>

      {state.status === 'error' ? (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {t(
            state.message === 'invalidEmail'
              ? 'dashboard.invite.err.email'
              : state.message === 'selfInvite'
                ? 'dashboard.invite.err.self'
                : state.message === 'notACustomer'
                  ? 'dashboard.invite.err.isMaker'
                  : state.message === 'tooMany'
                    ? 'dashboard.invite.err.tooMany'
                    : 'dashboard.invite.err.generic'
          )}
        </p>
      ) : null}

      {state.status === 'created' && state.link ? (
        <LinkBox url={state.link} emailed={Boolean(state.emailed)} customerName={state.customerName} />
      ) : null}
    </div>
  )
}
