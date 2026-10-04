/**
 * Builder autosave (IMP-06): a reload at group 4 restores the picks, the
 * re-renders and the group — and nothing but a real homeowner change saves.
 *
 * Two copies of the journey come back on a reload, and they treat images
 * differently, so both round trips are checked:
 *  - the local copy (IndexedDB) is a structured clone of the snapshot WITH the
 *    re-render data URLs — that is what a same-device reload restores from;
 *  - the server checkpoint is image-free (`stripImages`, and the route refuses
 *    any `data:image/`), so a second device gets the picks and the group, and
 *    marker re-renders the shell must hide.
 *
 * The "no stray save" half wires the gate and the debouncer exactly as the
 * shell's effect does. It matters beyond thrift: the maker's "changed since
 * you got the brief" flag is `updated_at > brief.created_at`, so a save on
 * mount would flag every resumed project as edited.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fromShapePreset, makeFeature, validate, type FeatureKind } from '@/lib/floor-plan'
import type { WallSide } from '@/lib/types'
import { floorPlanToLayout, type LayoutContract } from '@/lib/contract/layout-contract'
import { builderReducer, confirmGroupMetas, hydrateFromHypothesis, relockBuilderState } from '@/lib/builder/state'
import { hypothesisFixtureById } from '@/lib/builder/hypothesis-fixtures'
import type { BuilderAction } from '@/lib/builder/state'
import type { BuilderScreenId, BuilderState } from '@/lib/builder/inventory'
import {
  BUILDER_AUTOSAVE_MS,
  builderSaveKey,
  createSaveGate,
  resumeBuilderGroup,
  visibleRerenders,
} from '@/lib/builder/autosave'
import { createDebouncer } from '@/lib/debounce'
import { MAX_CHECKPOINT_BYTES, OMITTED_IMAGE, snapshotFingerprint, stripImages } from '@/lib/project/checkpoint'
import { migrateSnapshot, SNAPSHOT_VERSION, type ProjectSnapshot } from '@/lib/project/snapshot'
import { resumeStepId } from '@/lib/flow'

function contractOf(
  shape: Parameters<typeof fromShapePreset>[0],
  features: { kind: FeatureKind; wall: WallSide }[]
): LayoutContract {
  const plan = fromShapePreset(shape)
  for (const f of features) plan.features.push(makeFeature(f.kind, f.wall, plan.room))
  return floorPlanToLayout(validate(plan))
}

const CONTRACT = contractOf('l_shape', [
  { kind: 'sink', wall: 'top' },
  { kind: 'hob', wall: 'top' },
  { kind: 'fridge', wall: 'left' },
  { kind: 'dishwasher', wall: 'top' },
])
const HYPOTHESIS = hypothesisFixtureById('decor').build(CONTRACT)

/** A ~300 KB JPEG data URL — the size RerenderPanel's 1024 px / q0.85 re-compress produces. */
function fakeRender(seed: string): string {
  return `data:image/jpeg;base64,${seed}${'A'.repeat(300 * 1024)}`
}

const apply = (s: BuilderState, ...actions: BuilderAction[]) => actions.reduce(builderReducer, s)

/** Hydrated as the intake does it, then the homeowner's picks through group 4 and two paid re-renders. */
function buildToGroup4(): BuilderState {
  const s = hydrateFromHypothesis(HYPOTHESIS, { layoutContract: CONTRACT })
  s.layoutConfirmed = true
  return apply(
    s,
    { type: 'patch_doors', patch: { decorCode: 'U702' } },
    { type: 'patch_worktop', patch: { family: 'quartz' } },
    { type: 'push_rerender', trigger: 'door decor, worktop material', imageDataUrl: fakeRender('R1') },
    { type: 'patch_backsplash', patch: { kind: 'glass' } },
    { type: 'push_rerender', trigger: 'backsplash', imageDataUrl: fakeRender('R2') }
  )
}

/** The intake's snapshot of a journey sitting in the builder, at `backsplash` (group 4). */
function builderSnapshot(builderState: BuilderState): ProjectSnapshot {
  return {
    currentStepId: 'builder',
    profile: { contractConfirmedAt: 1_759_000_000_000, builderState },
    transcript: [],
    isDone: false,
    wrapUpData: null,
    spacePhotos: [],
    spaceVision: null,
    floorPlan: null,
    unitEdits: null,
    inspirationStyles: [],
    inspirationRefs: [],
    inspirationVision: null,
    conceptRenders: [],
    chosenRenderId: null,
    productReferences: [],
    siteAccess: null,
    contactDraft: { name: '', contactType: 'email', contactValue: '' },
    mustHavesText: '',
    niceToHavesText: '',
    dealBreakersText: '',
    builderHypothesis: HYPOTHESIS,
    builderStartedNoAI: false,
    builderGroupId: 'backsplash',
  }
}

const picksOf = (s: BuilderState) => ({
  doors: s.doors.decorCode,
  worktop: s.worktop.family,
  backsplash: s.backsplash.kind,
})

describe('reload at group 4 — the local copy (same device)', () => {
  it('restores the picks, both re-renders with their pixels, the active one, and the group', () => {
    const build = buildToGroup4()
    // IndexedDB stores a structured clone; the shell relocks it on mount.
    const local = structuredClone(builderSnapshot(build))
    const restored = relockBuilderState(local.profile.builderState as BuilderState, {
      layoutContract: CONTRACT,
      hypothesis: HYPOTHESIS,
    })

    expect(picksOf(restored)).toEqual({ doors: 'U702', worktop: 'quartz', backsplash: 'glass' })
    expect(restored.rerenders?.map((r) => r.imageDataUrl)).toEqual(build.rerenders?.map((r) => r.imageDataUrl))
    expect(restored.activeRenderId).toBe(build.activeRenderId)
    expect(restored.activeRenderId).toBe(build.rerenders?.[1].id)
    expect(visibleRerenders(restored)).toHaveLength(2)

    // …and it reopens in the builder, at group 4 — not group 1, not the confirm screen.
    expect(resumeStepId(local.currentStepId, { roomMeasured: true, contractConfirmed: true })).toBe('builder')
    expect(resumeBuilderGroup(local.builderGroupId)).toBe('backsplash')
    expect(restored.layoutConfirmed).toBe(true)
  })
})

describe('reload at group 4 — the server copy (another device)', () => {
  it('is small and image-free, and restores the picks, the group and the re-render list', () => {
    const build = buildToGroup4()
    const body = JSON.stringify(stripImages(builderSnapshot(build)))
    expect(body).not.toContain('data:image/')
    expect(body.length).toBeLessThan(MAX_CHECKPOINT_BYTES)
    // The two re-renders alone are ~600 KB; stripped, the whole journey is a fraction of that.
    expect(body.length).toBeLessThan(100 * 1024)

    const migrated = migrateSnapshot(JSON.parse(body), SNAPSHOT_VERSION)
    expect(migrated.ok).toBe(true)
    if (!migrated.ok) return
    const snap = migrated.snapshot
    expect(snap.builderGroupId).toBe('backsplash')
    const server = snap.profile.builderState as BuilderState
    expect(picksOf(server)).toEqual(picksOf(build))
    expect(server.rerenders?.map((r) => [r.id, r.trigger])).toEqual(build.rerenders?.map((r) => [r.id, r.trigger]))
    expect(server.activeRenderId).toBe(build.activeRenderId)
    expect(server.rerenders?.every((r) => r.imageDataUrl === OMITTED_IMAGE)).toBe(true)
  })

  it('hides marker re-renders, so the preview falls back to the Original', () => {
    const server = stripImages(buildToGroup4())
    const restored = relockBuilderState(server, { layoutContract: CONTRACT, hypothesis: HYPOTHESIS })
    expect(restored.rerenders).toHaveLength(2)
    expect(visibleRerenders(restored)).toEqual([])
    // What BuilderShell does with the active id: no visible match → the Original.
    expect(visibleRerenders(restored).find((r) => r.id === restored.activeRenderId)).toBeUndefined()
  })

  it('a stored group that is not a live builder screen opens the first group', () => {
    for (const v of [undefined, null, 'layout', 'hardware', 'bogus', 4]) {
      expect(resumeBuilderGroup(v)).toBe('cabinetBoxes')
    }
    expect(resumeBuilderGroup('finishing')).toBe('finishing')
  })
})

describe('autosave fires only on real homeowner changes', () => {
  type Save = { state: BuilderState; groupId: BuilderScreenId; urgent: boolean }

  /** The shell's wiring: the gate in front of the debouncer, saving through onStateChange. */
  function shell() {
    const saves: Save[] = []
    const gate = createSaveGate()
    const autosave = createDebouncer<[BuilderState, BuilderScreenId]>(
      (cause, state, groupId) => saves.push({ state, groupId, urgent: cause !== 'timer' }),
      BUILDER_AUTOSAVE_MS
    )
    /** BuilderShell's effect on [state, currentId]. */
    const effect = (state: BuilderState, groupId: BuilderScreenId) => {
      if (gate(builderSaveKey(state, groupId))) autosave.run(state, groupId)
    }
    return { saves, effect, autosave }
  }

  /** A stored build, relocked as the shell does on every resume — later in time. */
  function resumed(): { stored: BuilderState; mounted: BuilderState } {
    vi.setSystemTime(new Date('2026-10-01T09:00:00Z'))
    const stored = buildToGroup4()
    vi.setSystemTime(new Date('2026-10-04T18:30:00Z'))
    const mounted = relockBuilderState(structuredClone(stored), { layoutContract: CONTRACT, hypothesis: HYPOTHESIS })
    return { stored, mounted }
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('the relock on mount changes the stored state — which is why the gate exists', () => {
    const { stored, mounted } = resumed()
    expect(snapshotFingerprint(mounted)).not.toBe(snapshotFingerprint(stored))
    expect(mounted.lastUpdatedAt).not.toBe(stored.lastUpdatedAt)
  })

  it('mounting a restored, relocked build saves nothing — not on a timer, a hide, or an unmount', () => {
    const { saves, effect, autosave } = shell()
    const { mounted } = resumed()
    // StrictMode runs the mount effect twice.
    effect(mounted, 'backsplash')
    effect(mounted, 'backsplash')
    vi.advanceTimersByTime(10_000)
    autosave.flush('hide')
    autosave.flush('unmount')
    expect(saves).toEqual([])
  })

  it('the same content again saves nothing: a no-op replace, a group confirmed twice', () => {
    const { saves, effect } = shell()
    const { mounted } = resumed()
    const confirmed = apply(mounted, { type: 'replace', state: confirmGroupMetas(mounted, 'backsplash') })
    effect(confirmed, 'backsplash')

    // Same content, fresh timestamp.
    vi.advanceTimersByTime(1_000)
    effect(apply(confirmed, { type: 'replace', state: confirmed }), 'backsplash')
    // Continue past a group that is already confirmed (then Back to it).
    effect(apply(confirmed, { type: 'replace', state: confirmGroupMetas(confirmed, 'backsplash') }), 'backsplash')
    vi.advanceTimersByTime(10_000)
    expect(saves).toEqual([])
  })

  it('a real pick saves once, 500 ms after the last tap, with the latest state', () => {
    const { saves, effect } = shell()
    const { mounted } = resumed()
    effect(mounted, 'backsplash')

    const tap1 = apply(mounted, { type: 'patch_backsplash', patch: { kind: 'tile' } })
    effect(tap1, 'backsplash')
    vi.advanceTimersByTime(100)
    const tap2 = apply(tap1, { type: 'patch_backsplash', patch: { kind: 'matching_slab' } })
    effect(tap2, 'backsplash')

    vi.advanceTimersByTime(BUILDER_AUTOSAVE_MS - 1)
    expect(saves).toEqual([])
    vi.advanceTimersByTime(1)
    expect(saves).toHaveLength(1)
    expect(saves[0]).toEqual({ state: tap2, groupId: 'backsplash', urgent: false })
    vi.advanceTimersByTime(10_000)
    expect(saves).toHaveLength(1)
  })

  it('a paid re-render saves, with its pixels (the intake keeps them for the local copy)', () => {
    const { saves, effect } = shell()
    const { mounted } = resumed()
    effect(mounted, 'backsplash')
    const rendered = apply(mounted, { type: 'push_rerender', trigger: 'backsplash', imageDataUrl: fakeRender('R3') })
    effect(rendered, 'backsplash')
    vi.advanceTimersByTime(BUILDER_AUTOSAVE_MS)
    expect(saves).toHaveLength(1)
    expect(saves[0].state.rerenders?.[2].imageDataUrl.startsWith('data:image/jpeg')).toBe(true)
    expect(saves[0].state.activeRenderId).toBe(saves[0].state.rerenders?.[2].id)
  })

  it('a group change on its own saves (so a reload reopens there)', () => {
    const { saves, effect } = shell()
    const { mounted } = resumed()
    effect(mounted, 'backsplash')
    effect(mounted, 'appliances')
    vi.advanceTimersByTime(BUILDER_AUTOSAVE_MS)
    expect(saves.map((s) => s.groupId)).toEqual(['appliances'])
  })

  it('Continue (confirm + next group, one batch) is one save', () => {
    const { saves, effect } = shell()
    const { mounted } = resumed()
    effect(mounted, 'backsplash')
    effect(apply(mounted, { type: 'replace', state: confirmGroupMetas(mounted, 'backsplash') }), 'appliances')
    vi.advanceTimersByTime(BUILDER_AUTOSAVE_MS)
    expect(saves).toHaveLength(1)
    expect(saves[0].state.backsplash.meta.kind.provenance).toBe('homeowner-confirmed')
  })

  it('a tab hidden inside the window saves at once, marked urgent, and the timer does not save again', () => {
    const { saves, effect, autosave } = shell()
    const { mounted } = resumed()
    effect(mounted, 'backsplash')
    const picked = apply(mounted, { type: 'patch_backsplash', patch: { kind: 'tile' } })
    effect(picked, 'backsplash')
    vi.advanceTimersByTime(200)
    autosave.flush('hide')
    expect(saves).toEqual([{ state: picked, groupId: 'backsplash', urgent: true }])
    vi.advanceTimersByTime(10_000)
    autosave.flush('unmount')
    expect(saves).toHaveLength(1)
  })

  it('handing off (onComplete / the escape hatch) cancels the pending save, so the unmount flush cannot overwrite it', () => {
    const { saves, effect, autosave } = shell()
    const { mounted } = resumed()
    effect(mounted, 'finishing')
    const picked = apply(mounted, { type: 'patch_backsplash', patch: { kind: 'tile' } })
    effect(picked, 'finishing')
    autosave.cancel()
    autosave.flush('unmount')
    vi.advanceTimersByTime(10_000)
    expect(saves).toEqual([])
  })
})
