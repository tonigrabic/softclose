'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'

/**
 * The Konva editor depends on `window`. We dynamic-import it with `ssr: false`
 * so the rest of the intake page stays SSR-safe (and its ~150 KB bundle only
 * loads on the space step).
 */
const FloorPlanEditorImpl = dynamic(
  () => import('./Editor').then((m) => ({ default: m.FloorPlanEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        Loading editor…
      </div>
    ),
  }
)

export type FloorPlanEditorProps = ComponentProps<typeof FloorPlanEditorImpl>
export const FloorPlanEditor = FloorPlanEditorImpl

export { ShapePicker } from './ShapePicker'
