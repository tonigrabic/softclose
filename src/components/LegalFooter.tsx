'use client'

import { useTranslations } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * The quiet legal line every shell carries (IMP-09): today one link, the
 * privacy notice at /privatnost. An impressum joins it once the operator's
 * identity exists — see the TODO in app/privatnost/page.tsx; until then there
 * is nothing true to put on it.
 *
 * `newTab` is for the journey (AppShell): a homeowner who checks the notice
 * mid-intake must not lose their place, so the link opens beside it.
 */
export function LegalFooter({ newTab = false, className }: { newTab?: boolean; className?: string }) {
  const { t } = useTranslations()
  return (
    <nav aria-label={t('legal.nav')} className={cn('text-[0.6875rem] text-muted-foreground', className)}>
      <a
        href="/privatnost"
        {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
      >
        {t('legal.privacy')}
      </a>
    </nav>
  )
}
