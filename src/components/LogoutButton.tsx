'use client'

import { useTranslations } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * A form, not a link — on purpose.
 *
 * Next prefetches <Link> targets on hover, so pointing one at /logout would
 * sign people out for moving their mouse. /logout has no GET handler either,
 * so this stays true even if someone later "simplifies" this component.
 */
export function LogoutButton({ className }: { className?: string }) {
  const { t } = useTranslations()
  return (
    <form action="/logout" method="post">
      <button
        type="submit"
        className={cn(
          'rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          className
        )}
      >
        {t('auth.logout')}
      </button>
    </form>
  )
}
