/**
 * The re-render cap survives a restore (IMP-06 review).
 *
 * RerenderPanel used to count re-renders in its own `useState(0)`. Once the
 * build's re-renders persisted (IMP-06), a reload or a remount brought back N
 * paid re-renders and a panel offering five more — one build could pile up
 * paid renders and stored images without bound, past the five-a-session cap
 * (AGENTS.md rule 2). The count now comes from the build itself, so every
 * path a build comes back by — the reducer, the IndexedDB copy, the
 * image-free server copy, the page-hide record — carries it.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fromShapePreset, makeFeature, validate } from '@/lib/floor-plan'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { builderReducer, hydrateFromHypothesis, relockBuilderState, type BuilderAction } from '@/lib/builder/state'
import { hypothesisFixtureById } from '@/lib/builder/hypothesis-fixtures'
import type { BuilderState } from '@/lib/builder/inventory'
import { MAX_RERENDERS_PER_SESSION, rerendersRemaining, rerendersUsed } from '@/lib/builder/rerender-cap'
import { visibleRerenders } from '@/lib/builder/autosave'
import { composePendingRecord, mergePendingRecord, parsePendingRecord } from '@/lib/builder/unload-save'
import { OMITTED_IMAGE, stripImages } from '@/lib/project/checkpoint'
import type { ProjectSnapshot } from '@/lib/project/snapshot'
import type { StoredSnapshot } from '@/lib/session-store'
import { RerenderPanel } from '@/components/builder/RerenderPanel'
import { hrHR } from '@/lib/i18n/locales/hr-HR'

const plan = fromShapePreset('l_shape')
plan.features.push(makeFeature('sink', 'top', plan.room))
const CONTRACT = floorPlanToLayout(validate(plan))
const HYPOTHESIS = hypothesisFixtureById('decor').build(CONTRACT)

const render = (seed: string) => `data:image/jpeg;base64,${seed}AAAA`
const apply = (s: BuilderState, ...actions: BuilderAction[]) => actions.reduce(builderReducer, s)

function withRerenders(n: number): BuilderState {
  const s = hydrateFromHypothesis(HYPOTHESIS, { layoutContract: CONTRACT })
  s.layoutConfirmed = true
  const pushes: BuilderAction[] = Array.from({ length: n }, (_, i) => ({
    type: 'push_rerender',
    trigger: 'door decor',
    imageDataUrl: render(`R${i}`),
  }))
  return apply(s, ...pushes)
}

const LIMIT = hrHR['builder.rerender.limit'].replace('{n}', String(MAX_RERENDERS_PER_SESSION))

function panel(state: BuilderState): string {
  return renderToStaticMarkup(
    createElement(RerenderPanel, { state, anchorPhotoDataUrl: render('anchor'), onRendered: () => {} })
  )
}

describe('rerendersUsed / rerendersRemaining', () => {
  it('a fresh build has all five; every paid re-render takes one; never below zero', () => {
    expect(MAX_RERENDERS_PER_SESSION).toBe(5)
    expect(rerendersRemaining(withRerenders(0))).toBe(5)
    expect(rerendersUsed(withRerenders(3))).toBe(3)
    expect(rerendersRemaining(withRerenders(3))).toBe(2)
    expect(rerendersRemaining(withRerenders(5))).toBe(0)
    expect(rerendersRemaining(withRerenders(7))).toBe(0)
    expect(rerendersUsed({ rerenders: undefined })).toBe(0)
  })
})

describe('a restored build keeps its count', () => {
  it('a reload from the local copy (with pixels) and its relock still count every re-render', () => {
    const before = withRerenders(4)
    const restored = relockBuilderState(structuredClone(before), { layoutContract: CONTRACT, hypothesis: HYPOTHESIS })
    expect(rerendersRemaining(restored)).toBe(1)
  })

  it('the image-free server copy (a second device) counts its marker re-renders, though none is shown', () => {
    const fromServer = JSON.parse(JSON.stringify(stripImages(withRerenders(5)))) as BuilderState
    expect(fromServer.rerenders!.every((r) => r.imageDataUrl === OMITTED_IMAGE)).toBe(true)
    expect(visibleRerenders(fromServer)).toEqual([])
    expect(rerendersRemaining(fromServer)).toBe(0)
  })

  it('the page-hide record, merged over the local copy on load, keeps the count — pixels or not', () => {
    const build = withRerenders(4)
    const stored: StoredSnapshot<ProjectSnapshot> = {
      version: 1,
      savedAt: new Date(1_000).toISOString(),
      data: { currentStepId: 'builder', profile: {} } as unknown as ProjectSnapshot,
    }
    // Over the storage quota the record drops every pixel; the entries stay.
    const rec = composePendingRecord(build, 'backsplash', new Set(), 2_000, { withPixels: false })
    const { rec: merged } = mergePendingRecord(stored, parsePendingRecord(JSON.stringify(rec)))
    expect(rerendersRemaining(merged!.data.profile.builderState as BuilderState)).toBe(1)
  })
})

describe('RerenderPanel reads the cap from the build, not from its own state', () => {
  it('mounted on a restored build that used all five, it shows the limit and no button', () => {
    const fromServer = JSON.parse(JSON.stringify(stripImages(withRerenders(5)))) as BuilderState
    const html = panel(fromServer)
    expect(html).toContain(LIMIT)
    expect(html).not.toContain('<button')
  })

  it('with one left it does not claim the limit', () => {
    expect(panel(withRerenders(4))).not.toContain(LIMIT)
  })
})
