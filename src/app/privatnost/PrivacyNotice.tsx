'use client'

import type { ReactNode } from 'react'
import { AuthShell } from '@/components/AuthShell'
import { fillSlots, useTranslations, type TranslationKey } from '@/lib/i18n'

/**
 * The privacy notice itself (IMP-09). A client component only so the language
 * switch works here as everywhere else; the server render is hr-HR. The date
 * is literal text in the copy, so no Intl formatting can make the server and
 * client renders disagree.
 */
export function PrivacyNotice({ contactEmail }: { contactEmail: string | null }) {
  const { t } = useTranslations()

  return (
    <AuthShell wide>
      <article className="mx-auto w-full max-w-2xl py-6" data-privacy-notice>
        <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('privacy.current')}
        </p>
        <h1 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-foreground">
          {t('privacy.title')}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t('privacy.intro')}</p>

        <Section title={t('privacy.collect.title')}>
          <List
            keys={[
              'privacy.collect.account',
              'privacy.collect.phone',
              'privacy.collect.photos',
              'privacy.collect.inspiration',
              'privacy.collect.answers',
              'privacy.collect.progress',
              'privacy.collect.cookie',
            ]}
          />
        </Section>

        <Section title={t('privacy.who.title')}>
          <p>{t('privacy.who.maker')}</p>
          <p>{t('privacy.who.services')}</p>
          <List keys={['privacy.who.openai', 'privacy.who.supabase', 'privacy.who.vercel', 'privacy.who.resend']} />
          <p>{t('privacy.who.productImages')}</p>
          <p>{t('privacy.who.nobodyElse')}</p>
        </Section>

        <Section title={t('privacy.ai.title')}>
          <p>{t('privacy.ai.body')}</p>
        </Section>

        <Section title={t('privacy.retention.title')}>
          <p>{t('privacy.retention.body')}</p>
        </Section>

        <Section title={t('privacy.delete.title')}>
          <p>{t('privacy.delete.body')}</p>
          <p>{t('privacy.delete.leftovers')}</p>
        </Section>

        <Section title={t('privacy.contact.title')}>
          <p>{t('privacy.contact.maker')}</p>
          {/* Only a real, configured address — never a placeholder. */}
          {contactEmail ? (
            <p data-privacy-operator>
              {fillSlots(t('privacy.contact.operator'), {
                email: (
                  <a
                    href={`mailto:${contactEmail}`}
                    className="text-foreground underline underline-offset-2 hover:text-primary"
                  >
                    {contactEmail}
                  </a>
                ),
              })}
            </p>
          ) : null}
        </Section>
      </article>
    </AuthShell>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

function List({ keys }: { keys: TranslationKey[] }) {
  const { t } = useTranslations()
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-border">
      {keys.map((key) => (
        <li key={key}>{t(key)}</li>
      ))}
    </ul>
  )
}
