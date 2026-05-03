'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles, RefreshCw, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { findDecor } from '@/lib/catalog'
import type { BuilderState } from '@/lib/builder/inventory'

/**
 * Re-render panel.
 *
 * Watches for *substantial* visual changes in BuilderState — door decor,
 * worktop family/decor, door style — and offers a "Re-render with these picks"
 * affordance. Small changes (drawer count, sink material, lighting toggles)
 * don't trigger because the AI image won't reflect them anyway.
 *
 * Cap: hard-stop at MAX_RERENDERS_PER_SESSION so we don't spam the renderer.
 */

const MAX_RERENDERS_PER_SESSION = 5

interface RerenderPanelProps {
  state: BuilderState
  /** Anchor photo for img2img — required to call /api/render-concept. */
  anchorPhotoDataUrl?: string
  /** Most-recent render shown in the preview pane (data URL). */
  currentRenderDataUrl?: string
  /** Push a new render up to the parent so it can replace the preview. */
  onRendered: (imageDataUrl: string, trigger: string) => void
}

interface VisualSignature {
  doorStyle: string
  doorDecor: string
  worktopFamily: string
  worktopDecor: string
  backsplashKind: string
}

function visualSignature(state: BuilderState): VisualSignature {
  return {
    doorStyle: state.doors.style,
    doorDecor: `${state.doors.decorCode}-${state.doors.decorStructure}`,
    worktopFamily: state.worktop.family,
    worktopDecor: `${state.worktop.decorCode}-${state.worktop.decorStructure}`,
    backsplashKind: state.backsplash.kind,
  }
}

function whatChanged(prev: VisualSignature, next: VisualSignature): string[] {
  const changes: string[] = []
  if (prev.doorDecor !== next.doorDecor) changes.push('door decor')
  if (prev.doorStyle !== next.doorStyle) changes.push('door style')
  if (prev.worktopFamily !== next.worktopFamily) changes.push('worktop material')
  if (prev.worktopDecor !== next.worktopDecor) changes.push('worktop decor')
  if (prev.backsplashKind !== next.backsplashKind) changes.push('backsplash')
  return changes
}

export function RerenderPanel({
  state,
  anchorPhotoDataUrl,
  currentRenderDataUrl,
  onRendered,
}: RerenderPanelProps) {
  // Baseline = the signature at the moment of the *last* render the user
  // accepted. Diff measures "since the render you're looking at," not "since
  // you opened the builder." Stored as state so re-renders settle correctly.
  const [baseline, setBaseline] = useState<VisualSignature>(() => visualSignature(state))
  const [renderCount, setRenderCount] = useState(0)
  const [isRendering, setIsRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // When the active render changes (carousel switch / promote-to-original),
  // re-anchor the diff: the active thumb is now "the render you're looking at".
  const activeRenderId = state.activeRenderId
  const lastActiveIdRef = useRef(activeRenderId)
  useEffect(() => {
    if (lastActiveIdRef.current !== activeRenderId) {
      lastActiveIdRef.current = activeRenderId
      setBaseline(visualSignature(state))
    }
  }, [activeRenderId, state])

  const current = visualSignature(state)
  const changes = whatChanged(baseline, current)
  const hasSubstantialChange = changes.length > 0

  async function handleRerender() {
    if (!anchorPhotoDataUrl) {
      setError('Need an anchor photo to re-render — upload a space photo in step 1.')
      return
    }
    if (renderCount >= MAX_RERENDERS_PER_SESSION) {
      setError(`Reached the ${MAX_RERENDERS_PER_SESSION}-render limit for this session.`)
      return
    }
    setIsRendering(true)
    setError(null)
    try {
      const doorDecor = findDecor(state.doors.decorCode, state.doors.decorStructure)
      const worktopDecor = findDecor(state.worktop.decorCode ?? '', state.worktop.decorStructure)
      const res = await fetch('/api/render-concept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anchorPhoto: anchorPhotoDataUrl,
          // Map builder state to render-concept's existing prompt vocabulary.
          doorMaterial: state.doors.style === 'shaker' ? 'shaker_painted' : 'slab',
          worktopPreference: state.worktop.family,
          backsplashPreference: state.backsplash.kind === 'tile' ? 'tile' : state.backsplash.kind === 'glass' ? 'glass' : undefined,
          hardwareTier:
            state.hardware.drawerSystemTier === 'premium'
              ? 'premium'
              : state.hardware.drawerSystemTier === 'mid'
                ? 'mid_tier'
                : 'budget',
          materialHints: [
            doorDecor ? `${doorDecor.name} (${doorDecor.family} ${doorDecor.tone}, ${doorDecor.finish})` : null,
            worktopDecor
              ? `${worktopDecor.name} ${state.worktop.family} worktop`
              : `${state.worktop.family} worktop`,
          ].filter(Boolean),
          nudges: changes,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? `Render failed (${res.status})`)
      onRendered(data.imageDataUrl as string, changes.join(', '))
      setBaseline(current)
      setRenderCount((c) => c + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-render failed')
    } finally {
      setIsRendering(false)
    }
  }

  // Render cap reached — show a static badge, no button.
  if (renderCount >= MAX_RERENDERS_PER_SESSION) {
    return (
      <div className="rounded-2xl border border-border bg-card/50 px-4 py-3 text-[12px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <ImageIcon className="size-3.5" aria-hidden />
          <span>Reached the {MAX_RERENDERS_PER_SESSION}-render limit.</span>
        </div>
      </div>
    )
  }

  if (!hasSubstantialChange) return null

  return (
    <div className="space-y-2 rounded-2xl border border-amber-300/50 bg-amber-50/60 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
        <p className="text-[12px] leading-relaxed text-amber-900 dark:text-amber-100">
          You changed: <span className="font-semibold">{changes.join(', ')}</span>. The render above doesn&apos;t reflect this yet.
        </p>
      </div>
      <button
        type="button"
        onClick={handleRerender}
        disabled={isRendering || !anchorPhotoDataUrl}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-1.5 text-[12px] font-semibold text-background transition-all',
          (isRendering || !anchorPhotoDataUrl) && 'opacity-60'
        )}
      >
        {isRendering ? (
          <>
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-background/80" />
            Re-rendering…
          </>
        ) : (
          <>
            <RefreshCw className="size-3 stroke-[2]" aria-hidden />
            Re-render with these picks ({MAX_RERENDERS_PER_SESSION - renderCount} left)
          </>
        )}
      </button>
      {!anchorPhotoDataUrl && (
        <p className="text-[10.5px] text-amber-700/80 dark:text-amber-200/70">
          No anchor photo — re-render disabled.
        </p>
      )}
      {error && (
        <p className="text-[10.5px] font-medium text-destructive">{error}</p>
      )}
      {currentRenderDataUrl && (
        <p className="hidden">{currentRenderDataUrl.slice(0, 30)}</p>
      )}
    </div>
  )
}
