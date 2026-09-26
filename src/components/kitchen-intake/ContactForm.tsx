'use client'

import { useTranslations } from '@/lib/i18n'
import type { ContactValue } from '@/lib/types'

export type { ContactValue }

interface ContactFormProps {
  value: ContactValue
  onChange: (value: ContactValue) => void
  /** The signed-in customer's account email. When set, it IS the contact —
   *  shown, not asked for — and a phone becomes an optional extra. */
  accountEmail?: string | null
}

const inputClass =
  'w-full rounded-xl border border-input bg-card px-4 py-3.5 text-[0.9375rem] text-foreground shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 hover:border-foreground/10 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground'

export function ContactForm({ value, onChange, accountEmail }: ContactFormProps) {
  const { t } = useTranslations()
  const nameField = (
    <div>
      <label htmlFor="intake-name" className={labelClass}>
        {t('contact.name.label')}
      </label>
      <input
        id="intake-name"
        type="text"
        autoComplete="name"
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        placeholder={t('contact.name.placeholder')}
        className={inputClass}
      />
    </div>
  )

  if (accountEmail) {
    return (
      <div className="space-y-5">
        {nameField}

        <div>
          <label htmlFor="intake-email" className={labelClass}>
            {t('contact.emailLabel')}
          </label>
          {/* Read-only: it is the address they sign in with, so changing it
              here would only make the brief disagree with the account. */}
          <input
            id="intake-email"
            type="email"
            value={accountEmail}
            readOnly
            aria-describedby="intake-email-note"
            className={`${inputClass} cursor-default bg-muted/50 text-foreground/80 hover:border-input`}
          />
          <p id="intake-email-note" className="mt-1.5 text-xs text-muted-foreground">
            {t('contact.account.note')}
          </p>
        </div>

        <div>
          <label htmlFor="intake-phone" className={labelClass}>
            {t('contact.phoneLabel')}{' '}
            <span className="font-normal normal-case tracking-normal text-muted-foreground/70">
              · {t('common.optional')}
            </span>
          </label>
          <input
            id="intake-phone"
            type="tel"
            autoComplete="tel"
            value={value.phone ?? ''}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
            placeholder={t('contact.phone.placeholder')}
            aria-describedby="intake-phone-note"
            className={inputClass}
          />
          <p id="intake-phone-note" className="mt-1.5 text-xs text-muted-foreground">
            {t('contact.phone.hint')}
          </p>
        </div>
      </div>
    )
  }

  // Anonymous funnel: no account, so ask for one way to reach them.
  return (
    <div className="space-y-5">
      {nameField}

      <div>
        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t('contact.bestWay')}
        </span>
        <div
          className="mb-3 flex rounded-xl border border-input bg-muted/60 p-1 shadow-inner"
          role="group"
          aria-label={t('contact.method')}
        >
          {(['phone', 'email'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onChange({ ...value, contactType: type })}
              className={`relative flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all duration-200 ${
                value.contactType === type
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {type === 'phone' ? t('contact.phone') : t('contact.email')}
            </button>
          ))}
        </div>
        <label htmlFor="intake-contact" className="sr-only">
          {value.contactType === 'email' ? t('contact.emailLabel') : t('contact.phoneLabel')}
        </label>
        <input
          id="intake-contact"
          type={value.contactType === 'email' ? 'email' : 'tel'}
          autoComplete={value.contactType === 'email' ? 'email' : 'tel'}
          value={value.contactValue}
          onChange={(e) => onChange({ ...value, contactValue: e.target.value })}
          placeholder={value.contactType === 'email' ? t('contact.email.placeholder') : t('contact.phone.placeholder')}
          className={inputClass}
        />
      </div>
    </div>
  )
}
