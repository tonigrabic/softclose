/**
 * Standalone Builder route — for development & demo.
 *
 * Phase-1 outputs are simulated here:
 *  - Rendered concept image (loaded from /public/sample-renders/...). The user
 *    can drop any JPG named matte-black-l-kitchen.jpg into that directory and
 *    refresh; the builder auto-uses it.
 *  - L-shape layout with hard-coded run dimensions (380 × 240 cm).
 *  - BuilderHypothesis representative of the matte-black L-shape kitchen
 *    image (slab fronts, concrete-look worktop, integrated lighting).
 *
 * In production this route is replaced by the Phase-1 → Phase-2 hand-off
 * inside KitchenIntake (BuilderStepView).
 */

'use client'

import { useEffect, useState } from 'react'
import { BuilderShell } from '@/components/builder/BuilderShell'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'
import { fromShapePreset, makeFeature, validate } from '@/lib/floor-plan'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'

// We try multiple paths because the file's name was originally typo'd
// in /public on the main repo ("sample-renderers/matte-black-1-kitchen").
// Either folder, either filename works.
const SAMPLE_RENDER_PATHS = [
  '/sample-renders/matte-black-l-kitchen.jpg',
  '/sample-renderers/matte-black-1-kitchen.jpg',
  '/sample-renderers/matte-black-l-kitchen.jpg',
  '/sample-renders/matte-black-1-kitchen.jpg',
]

const DEMO_HYPOTHESIS: BuilderHypothesis = {
  usable: true,
  summary:
    'L-shaped kitchen with matte black slab fronts, light concrete worktop, no upper cabinets on the window wall.',
  layout: {
    shape: { value: 'l_shape', confidence: 'H', reason: 'two perpendicular runs visible' },
    hasIsland: { value: false, confidence: 'H' },
    ceilingHeightCm: { value: 270, confidence: 'L' },
    runs: [
      {
        id: 'main',
        label: 'Glavni zid',
        lengthCm: { value: 380, confidence: 'M', reason: 'window run with sink + hob' },
        hasBase: { value: true, confidence: 'H' },
        hasWall: { value: false, confidence: 'H', reason: 'window occupies the wall' },
      },
      {
        id: 'return',
        label: 'Povratni zid',
        lengthCm: { value: 240, confidence: 'M' },
        hasBase: { value: true, confidence: 'H' },
        hasWall: { value: true, confidence: 'H' },
      },
    ],
  },
  doors: {
    style: { value: 'slab', confidence: 'H', reason: 'flat handleless fronts' },
    decorCode: { value: 'U899', confidence: 'M', reason: 'matte black surface, no grain' },
    decorStructure: { value: 'ST9', confidence: 'M' },
    overlay: { value: 'full', confidence: 'H' },
    edgeProfile: { value: 'square', confidence: 'M' },
  },
  worktop: {
    family: { value: 'laminate', confidence: 'M', reason: 'concrete-textured surface' },
    decorCode: { value: 'F186', confidence: 'M' },
    decorStructure: { value: 'ST9', confidence: 'M' },
    thicknessMm: { value: 38, confidence: 'L' },
    edge: { value: 'square', confidence: 'M' },
  },
  backsplash: {
    kind: { value: 'matching_slab', confidence: 'M', reason: 'continuous concrete-look on splash' },
    decorCode: { value: 'F186', confidence: 'M' },
    decorStructure: { value: 'ST9', confidence: 'M' },
    heightCm: { value: 60, confidence: 'L' },
  },
  hardware: {
    handleStyle: { value: 'integrated_jpull', confidence: 'H', reason: 'no visible handles, J-profile shadow line' },
    handleFinish: { value: 'matched_to_door', confidence: 'M' },
  },
  lighting: {
    underCabinetLed: { value: true, confidence: 'H', reason: 'glow visible under the wall units' },
  },
}

// Simulated Part-1 hand-off: an L-shape plan with a sink + hob on the main run.
// In production the contract comes from the homeowner's confirmed FloorPlan.
const DEMO_CONTRACT = floorPlanToLayout(
  (() => {
    const p = fromShapePreset('l_shape')
    p.features.push(makeFeature('sink', 'top', p.room))
    p.features.push(makeFeature('hob', 'top', p.room))
    return validate(p)
  })()
)

export default function BuilderPage() {
  // Convert the static image to a data URL so the BuilderShell + downstream
  // BOM/render code can treat it like a Phase-1 render output (which is
  // normally a data URL from the OpenAI image API).
  const [renderDataUrl, setRenderDataUrl] = useState<string | undefined>()
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (const path of SAMPLE_RENDER_PATHS) {
        try {
          const res = await fetch(path)
          if (!res.ok) continue
          const blob = await res.blob()
          if (!blob.type.startsWith('image/')) continue
          const dataUrl = await blobToDataUrl(blob)
          if (!cancelled) setRenderDataUrl(dataUrl)
          return
        } catch {
          // try next candidate
        }
      }
      if (!cancelled) setLoadFailed(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      {loadFailed && (
        <div className="border-b border-amber-300 bg-amber-50 px-6 py-2 text-[12px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
          No sample render found. Tried:{' '}
          {SAMPLE_RENDER_PATHS.map((p, i) => (
            <code key={p} className="ml-1 rounded bg-background/60 px-1.5 py-0.5">
              {p}
              {i < SAMPLE_RENDER_PATHS.length - 1 && ','}
            </code>
          ))}
        </div>
      )}
      <BuilderShell
        hypothesis={DEMO_HYPOTHESIS}
        layoutContract={DEMO_CONTRACT}
        renderImageDataUrl={renderDataUrl}
        layoutSummary="L-oblik · 380 cm × 240 cm"
        locale="hr-HR"
        onComplete={(state) => {
          console.log('Builder complete', state)
        }}
      />
    </>
  )
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
