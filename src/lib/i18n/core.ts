/**
 * Framework-free i18n core — dictionaries + lookup, NO React, NO 'use client'.
 *
 * Anything that can run on the server (API routes, the BOM calculator, the
 * handoff bundle) must import from HERE, never from `@/lib/i18n` (which is a
 * client module because of the locale context/hooks). Importing a 'use client'
 * module's functions from a route handler throws at runtime in Next 16
 * ("Attempted to call tDynamic() from the server") while unit tests stay green —
 * `tests/server-client-boundary.test.ts` guards the import graph.
 */

import { hrHR, type TranslationKey } from './locales/hr-HR'
import { enUS } from './locales/en-US'

export type { TranslationKey }
export type Locale = 'hr-HR' | 'en-US'

export const DEFAULT_LOCALE: Locale = 'hr-HR'
export const SUPPORTED_LOCALES: Locale[] = ['hr-HR', 'en-US']

const DICTS: Record<Locale, Record<TranslationKey, string>> = {
  'hr-HR': hrHR,
  'en-US': enUS,
}

export function isLocale(value: unknown): value is Locale {
  return value === 'hr-HR' || value === 'en-US'
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
