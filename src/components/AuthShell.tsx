'use client'

import type { ReactNode } from 'react'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { LogoutButton } from '@/components/LogoutButton'
import { MockBadge } from '@/components/MockBadge'
import { cn } from '@/lib/utils'

/**
 * Chrome for the pages that exist outside the journey — sign in, verify, and
 * the maker's own screens.
 *
 * Deliberately not AppShell: that one carries a progress bar and a journey nav
 * rail, which would be nonsense on a login form and actively misleading on the
 * maker's dashboard. One centred column, the language toggle, nothing else.
 */
export function AuthShell({
  children,
  wide = false,
  signedIn = false,
}: {
  children: ReactNode
  /** The maker's list needs room; a sign-in form does not. */
  wide?: boolean
  /** Shows the sign-out control. Off on /login, where it would be nonsense. */
  signedIn?: boolean
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <span className="text-sm font-semibold tracking-tight text-foreground">softclose</span>
        <div className="flex items-center gap-2">
          <MockBadge />
          <LanguageSwitcher />
          {signedIn ? <LogoutButton /> : null}
        </div>
      </header>
      <main className={cn('mx-auto flex w-full flex-1 flex-col px-5 pb-16 sm:px-8', wide ? 'max-w-5xl' : 'max-w-md justify-center')}>
        {children}
      </main>
    </div>
  )
}
