import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/dal'
import { homePathForRole, safeNextPath } from '@/lib/auth/redirect'
import { LoginForm } from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  // Already signed in: send them where they were going, or home. Without this
  // a bookmarked /login is a dead end that looks like being logged out.
  const session = await getSession()
  const { next } = await searchParams
  const safeNext = safeNextPath(next, '')
  if (session) redirect(safeNext || homePathForRole(session.role))

  return <LoginForm next={safeNext || undefined} />
}
