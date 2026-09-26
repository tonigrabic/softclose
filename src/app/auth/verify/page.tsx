import { VerifyForm } from './VerifyForm'

export const dynamic = 'force-dynamic'

/**
 * The landing page of every magic link.
 *
 * It deliberately does NOT consume the token: this is a GET, and GETs are
 * fetched by mail scanners and link previewers. It only hands the token to a
 * form that posts it. See actions.ts.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  return <VerifyForm token={token ?? ''} />
}
