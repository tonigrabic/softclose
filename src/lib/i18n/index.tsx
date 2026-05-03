/**
 * Lightweight i18n. No external runtime dependency — locale dictionaries are
 * tree-shakeable TS files, looked up by key with a hr-HR primary and en-US
 * fallback. Swappable to next-intl / i18next later without changing call sites.
 *
 * Usage:
 *   import { t, useTranslations } from '@/lib/i18n'
 *   t('builder.groups.doors.label')                // hr-HR by default
 *   t('builder.groups.doors.label', 'en-US')       // explicit locale
 *   const tt = useTranslations()                   // React hook (locale from context)
 */

'use client'

import { createContext, useContext } from 'react'
import { hrHR, type TranslationKey } from './locales/hr-HR'
import { enUS } from './locales/en-US'

export type Locale = 'hr-HR' | 'en-US'

export const DEFAULT_LOCALE: Locale = 'hr-HR'
export const SUPPORTED_LOCALES: Locale[] = ['hr-HR', 'en-US']

const DICTS: Record<Locale, Record<TranslationKey, string>> = {
  'hr-HR': hrHR,
  'en-US': enUS,
}

export function t(key: TranslationKey, locale: Locale = DEFAULT_LOCALE): string {
  return DICTS[locale]?.[key] ?? DICTS[DEFAULT_LOCALE][key] ?? String(key)
}

/**
 * Translate a key that comes from a constants file (where the literal-string
 * type would otherwise widen). Falls back to the raw key if it's not a known
 * translation — useful for dynamic keys built up like `doors.style.${style}`.
 */
export function tDynamic(key: string, locale: Locale = DEFAULT_LOCALE): string {
  const dict = DICTS[locale] as Record<string, string>
  return dict[key] ?? (DICTS[DEFAULT_LOCALE] as Record<string, string>)[key] ?? key
}

/* ───────────────────────── React context ────────────────────────────── */

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale
  children: React.ReactNode
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}

/** Hook returning a `t(key)` bound to the active locale. */
export function useTranslations() {
  const locale = useLocale()
  return {
    t: (key: TranslationKey) => t(key, locale),
    tDynamic: (key: string) => tDynamic(key, locale),
    locale,
  }
}
