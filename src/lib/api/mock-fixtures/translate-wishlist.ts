/**
 * Deterministic wishlist "translation" for mock-AI mode: split each bucket on
 * commas / newlines / "i "-joins and echo every piece as its own
 * TranslatedField (trade == verbatim). No invention — just the split the real
 * prompt performs, so the wishlist UI renders realistic item lists for free.
 */
import type { TranslatedField } from '@/lib/types'

interface WishlistRequestBody {
  mustHaves?: string
  niceToHaves?: string
  dealBreakers?: string
  applianceNotes?: string
  additionalNotes?: string
}

function splitItems(text: string | undefined): TranslatedField[] | undefined {
  if (!text?.trim()) return undefined
  const items = text
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((s) => ({ trade: s, verbatim: s }))
  return items.length > 0 ? items : undefined
}

export function mockTranslate(body: WishlistRequestBody): {
  mustHaves?: TranslatedField[]
  niceToHaves?: TranslatedField[]
  dealBreakers?: TranslatedField[]
  applianceNotes?: TranslatedField
  additionalNotes?: TranslatedField
} {
  const single = (text: string | undefined): TranslatedField | undefined =>
    text?.trim() ? { trade: text.trim(), verbatim: text.trim() } : undefined
  return {
    mustHaves: splitItems(body.mustHaves),
    niceToHaves: splitItems(body.niceToHaves),
    dealBreakers: splitItems(body.dealBreakers),
    applianceNotes: single(body.applianceNotes),
    additionalNotes: single(body.additionalNotes),
  }
}
