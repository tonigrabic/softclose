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

import { Fragment, createContext, useContext, useSyncExternalStore } from 'react'
import { DEFAULT_LOCALE, isLocale, t, tDynamic, type Locale, type TranslationKey } from './core'

// The framework-free core (dictionaries, t/tDynamic, Locale, DEFAULT_LOCALE)
// lives in ./core so server code can import it. Re-exported here so existing
// client call sites keep working unchanged.
export { DEFAULT_LOCALE, SUPPORTED_LOCALES, t, tDynamic } from './core'
export type { Locale, TranslationKey } from './core'

/* ───────────────────────── React context ────────────────────────────── */

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)
const SetLocaleContext = createContext<(locale: Locale) => void>(() => {})

const STORAGE_KEY = 'softclose.locale'


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

/**
 * Fill a translated sentence's `{slot}` placeholders with React nodes — for
 * sentence-style UIs where a chip or a bold value sits mid-sentence and each
 * language needs its own word order ("Otok je {length} × {width}, {seating}.").
 * A slot missing from `slots` renders as the literal `{name}`, so a typo in a
 * locale file shows up on screen instead of silently dropping a control.
 */
export function fillSlots(template: string, slots: Record<string, React.ReactNode>): React.ReactNode[] {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1]
    return <Fragment key={i}>{name !== undefined && name in slots ? slots[name] : part}</Fragment>
  })
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
