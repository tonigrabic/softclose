/**
 * A front elevation that shows what a profile means — ravna / s ukladom /
 * reljef — drawn in the homeowner's chosen colour, plus the aluminium + glass
 * front. Testers asked for an example picture next to the words; a drawing in
 * the actual colour says more than a stock photo in someone else's.
 */
import type { MdfProfile } from '@/lib/builder/inventory'

const SHADE = 'rgba(0,0,0,0.28)'
const LIGHT = 'rgba(255,255,255,0.55)'

export function FrontProfileDiagram({
  kind,
  hex = '#EDEBE4',
  className,
}: {
  kind: MdfProfile | 'alu_glass'
  hex?: string
  className?: string
}) {
  return (
    <svg viewBox="0 0 60 80" className={className} aria-hidden>
      {kind === 'alu_glass' ? (
        <>
          <rect x="2" y="2" width="56" height="76" rx="2" fill="#A7ACB1" stroke="currentColor" strokeOpacity="0.3" />
          <rect x="8" y="8" width="44" height="64" rx="1" fill="rgba(170,205,215,0.55)" stroke={SHADE} />
          <path d="M14 30 L30 14 M14 44 L40 18" stroke={LIGHT} strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <rect x="2" y="2" width="56" height="76" rx="2" fill={hex} stroke="currentColor" strokeOpacity="0.3" />
          {kind === 'flat' && (
            // A soft sheen is all a flat lacquered front has.
            <path d="M8 10 L8 40" stroke={LIGHT} strokeWidth="2" strokeLinecap="round" />
          )}
          {kind === 'inset' && (
            // Frame around a recessed panel: shadow on the panel's top/left
            // edge, light on its bottom/right — the step reads as depth.
            <>
              <rect x="12" y="12" width="36" height="56" fill={hex} />
              <path d="M12 68 L12 12 L48 12" fill="none" stroke={SHADE} strokeWidth="2" />
              <path d="M12 68 L48 68 L48 12" fill="none" stroke={LIGHT} strokeWidth="1.5" />
            </>
          )}
          {kind === 'relief' && (
            // A routed decorative profile: two grooves, the outer arched.
            <>
              <path
                d="M10 70 L10 22 Q10 10 30 10 Q50 10 50 22 L50 70 Z"
                fill="none"
                stroke={SHADE}
                strokeWidth="2"
              />
              <path
                d="M15 65 L15 25 Q15 16 30 16 Q45 16 45 25 L45 65 Z"
                fill="none"
                stroke={LIGHT}
                strokeWidth="1.5"
              />
            </>
          )}
        </>
      )}
    </svg>
  )
}
