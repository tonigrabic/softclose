import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/dal'
import { currentProjectForCustomer } from '@/lib/auth/projects'
import { AuthShell } from '@/components/AuthShell'
// Server component: the i18n *core*, never @/lib/i18n (that one is 'use client').
import { DEFAULT_LOCALE, isLocale, t } from '@/lib/i18n/core'

export const dynamic = 'force-dynamic'

/**
 * The root is now a signpost, not a page.
 *
 * Makers go to their inbox; customers go to the kitchen they were invited to.
 * A customer with no project is a real state — their invite was revoked, or
 * their account outlived the project — so it gets an honest panel rather than
 * a 404 that reads like the product is broken.
 */
export default async function Home() {
  const session = await requireSession()
  if (session.role === 'maker') redirect('/dashboard')

  const project = await currentProjectForCustomer(session.accountId)
  if (project) redirect(`/kitchen/${project.id}`)

  const locale = isLocale(session.locale) ? session.locale : DEFAULT_LOCALE

  return (
    <AuthShell>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">{t('auth.noProject.title', locale)}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('auth.noProject.body', locale)}</p>
      </div>
    </AuthShell>
  )
}
