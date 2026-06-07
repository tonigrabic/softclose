'use client'

import { cn } from '@/lib/utils'
import { SUPPORTED_LOCALES, useTranslations, type Locale } from '@/lib/i18n'

/** Short codes shown in the toggle. Croatian first — it's the priority market. */
const SHORT: Record<Locale, string> = {
  'hr-HR': 'HR',
  'en-US': 'EN',
}

const FULL: Record<Locale, string> = {
  'hr-HR': 'Hrvatski',
  'en-US': 'English',
}

/**
 * Two-state language toggle (HR | EN). Reads/writes the active locale from the
 * root LocaleProvider, so flipping it re-renders the whole journey — funnel and
 * builder alike — and the choice persists across reloads.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useTranslations()

  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-border bg-card/80 p-0.5 shadow-sm backdrop-blur',
        className
      )}
    >
      {SUPPORTED_LOCALES.map((l) => {
        const active = l === locale
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            aria-pressed={active}
            title={FULL[l]}
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {SHORT[l]}
          </button>
        )
      })}
    </div>
  )
}
