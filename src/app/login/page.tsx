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
  // a bookmarked /login is a dead end that looks like being logged out.
  const session = await getSession()
  const { next, deleted } = await searchParams
  const safeNext = safeNextPath(next, '')
  if (session) redirect(safeNext || homePathForRole(session.role))

  // ?deleted=1 is where "Izbriši moju kuhinju" lands (IMP-09), signed out:
  // a calm confirmation instead of the form. It reveals nothing — anyone can
  // type the parameter, and the notice says only what deleting does.
  return <LoginForm next={safeNext || undefined} deleted={deleted === '1'} />
}
