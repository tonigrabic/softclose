import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/dal'
import { homePathForRole, safeNextPath } from '@/lib/auth/redirect'
import { LoginForm } from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; deleted?: string }>
}) {
  // Already signed in: send them where they were going, or home. Without this
  // a bookmarked /login is a dead end that looks like being logged out. The
  // DAL decides, not the cookie's signature: a cookie it refuses gets the form
  // here, because the pages it would be sent to send it straight back.
  const session = await getSession()
  const { next, deleted } = await searchParams
  const safeNext = safeNextPath(next, '')
  if (session) redirect(safeNext || homePathForRole(session.role))

  // ?deleted=1 is where "Izbriši moju kuhinju" lands (IMP-09), signed out:
  // a calm confirmation instead of the form; ?deleted=account is where
  // "Izbriši moj račun" lands. It reveals nothing — anyone can type the
  // parameter, and the notice says only what deleting does.
  return (
    <LoginForm
      next={safeNext || undefined}
      deleted={deleted === '1' ? true : deleted === 'account' ? 'account' : false}
    />
  )
}
