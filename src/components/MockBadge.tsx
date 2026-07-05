/**
 * "MOCK AI" pill — visible whenever the app runs with mocked AI routes
 * (`npm run dev:mock`), so nobody mistakes canned fixtures for real reads.
 * Dev-only affordance; hardcoded English is fine.
 *
 * Bottom-RIGHT (bottom-left is taken by the Next.js dev-tools button). Raised
 * above the mobile live-range dock below `lg`; purely informational, so clicks
 * pass through. The /builder harness chip stacks above it (bottom-14).
 */
export function MockBadge() {
  if (process.env.NEXT_PUBLIC_MOCK_AI !== '1') return null
  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-[70] rounded-full border border-amber-500/50 bg-amber-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-600 shadow-sm backdrop-blur lg:bottom-4 dark:text-amber-400">
      Mock AI
    </div>
  )
}
