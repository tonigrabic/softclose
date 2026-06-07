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

import { createContext, useContext, useSyncExternalStore } from 'react'
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
const SetLocaleContext = createContext<(locale: Locale) => void>(() => {})

const STORAGE_KEY = 'softclose.locale'

function isLocale(value: unknown): value is Locale {
  return value === 'hr-HR' || value === 'en-US'
}

/* ── Tiny external store for the active locale ──────────────────────────────
 * Backed by localStorage so the homeowner's choice survives reloads, read via
 * useSyncExternalStore so the server render stays deterministic at the default
 * (hr-HR — Croatian is the priority market) and the client reconciles after
 * hydration without a setState-in-effect. A module singleton: there is exactly
 * one app-wide locale. */
const localeListeners = new Set<() => void>()
let localeSnapshot: Locale | null = null

function readStoredLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (isLocale(saved)) return saved
  } catch {
    /* localStorage unavailable */
  }
  return DEFAULT_LOCALE
}

function subscribeLocale(callback: () => void): () => void {
  localeListeners.add(callback)
  return () => localeListeners.delete(callback)
}

function getLocaleSnapshot(): Locale {
  // Memoize so useSyncExternalStore sees a stable reference between renders.
  if (localeSnapshot === null) localeSnapshot = readStoredLocale()
  return localeSnapshot
}

function getServerLocaleSnapshot(): Locale {
  return DEFAULT_LOCALE
}

function setLocaleGlobal(next: Locale): void {
  localeSnapshot = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
    document.documentElement.lang = next.slice(0, 2)
  } catch {
    /* non-fatal */
  }
  localeListeners.forEach((l) => l())
}

/**
 * Root provider — surfaces the active locale (and the switcher) to the whole
 * journey. Mount ONCE near the app root; funnel + builder read from it, and the
 * language switcher writes to it.
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(
    subscribeLocale,
    getLocaleSnapshot,
    getServerLocaleSnapshot
  )
  return (
    <LocaleContext.Provider value={locale}>
      <SetLocaleContext.Provider value={setLocaleGlobal}>{children}</SetLocaleContext.Provider>
    </LocaleContext.Provider>
  )
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}

export function useSetLocale(): (locale: Locale) => void {
  return useContext(SetLocaleContext)
}

/** Hook returning a `t(key)` bound to the active locale, plus the locale switcher. */
export function useTranslations() {
  const locale = useLocale()
  const setLocale = useSetLocale()
  return {
    t: (key: TranslationKey) => t(key, locale),
    tDynamic: (key: string) => tDynamic(key, locale),
    locale,
    setLocale,
  }
}
