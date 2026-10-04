/**
 * The builder's last change survives a reload or a closed tab (IMP-06 review).
 *
 * The reviewer measured it in Chromium: an IndexedDB write started in
 * pagehide never lands — open-per-call, already-open or explicitly committed —
 * while a localStorage write in the same handler does. So the old hide flush
 * (an IndexedDB write of the composed snapshot) saved nothing on a reload,
 * and a pick, a Continue or a paid re-render in the last ~1.3 s came back as
 * the build from before it.
 *
 * These run the real path: the builder's debouncer and the intake's page-hide
 * listener on plain EventTargets (subscribePageHide), the guard over a fake
 * localStorage, and an IndexedDB model whose writes land only if the page
 * lives on. The intake glue is mirrored line for line, like the shell's
 * effect in builder-autosave.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fromShapePreset, makeFeature, validate, type FeatureKind } from '@/lib/floor-plan'
import type { WallSide } from '@/lib/types'
import { floorPlanToLayout, type LayoutContract } from '@/lib/contract/layout-contract'
import { builderReducer, hydrateFromHypothesis, relockBuilderState, type BuilderAction } from '@/lib/builder/state'
import { hypothesisFixtureById } from '@/lib/builder/hypothesis-fixtures'
import type { BuilderScreenId, BuilderState } from '@/lib/builder/inventory'
import { BUILDER_AUTOSAVE_MS, builderSaveKey, createSaveGate, visibleRerenders } from '@/lib/builder/autosave'
import {
  composePendingRecord,
  createBuilderUnloadGuard,
  parsePendingRecord,
  pendingBuilderKey,
  type StorageLike,
} from '@/lib/builder/unload-save'
import { createDebouncer } from '@/lib/debounce'
import { subscribePageHide, type PageHideTargets } from '@/lib/page-hide'
import { OMITTED_IMAGE, snapshotFingerprint, stripImages } from '@/lib/project/checkpoint'
import type { ProjectSnapshot } from '@/lib/project/snapshot'
import { SNAPSHOT_VERSION, type StoredSnapshot } from '@/lib/session-store'

/* ───────────────────────────── fixtures ───────────────────────────── */

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
])
const HYPOTHESIS = hypothesisFixtureById('decor').build(CONTRACT)
const PROJECT = 'p-unload'

/** A ~300 KB JPEG data URL, the size RerenderPanel produces. */
const fakeRender = (seed: string) => `data:image/jpeg;base64,${seed}${'A'.repeat(300 * 1024)}`
const apply = (s: BuilderState, ...actions: BuilderAction[]) => actions.reduce(builderReducer, s)

/** Picks through group 3 and one paid re-render — what IndexedDB holds when the test starts. */
function savedBuild(): BuilderState {
  const s = hydrateFromHypothesis(HYPOTHESIS, { layoutContract: CONTRACT })
  s.layoutConfirmed = true
  return apply(
    s,
    { type: 'patch_doors', patch: { decorCode: 'U702' } },
    { type: 'patch_worktop', patch: { family: 'quartz' } },
    { type: 'push_rerender', trigger: 'door decor, worktop material', imageDataUrl: fakeRender('R1') }
  )
}

function journey(builderState: BuilderState, builderGroupId: BuilderScreenId): ProjectSnapshot {
  return {
    currentStepId: 'builder',
    profile: { contractConfirmedAt: 1_759_000_000_000, builderState },
    transcript: [],
    isDone: false,
    wrapUpData: null,
    spacePhotos: ['data:image/jpeg;base64,PHOTO'],
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
    builderGroupId,
  }
}

/** localStorage: synchronous, survives the reload; an optional quota in characters. */
function fakeLocalStorage(quota = Infinity): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (v.length > quota) throw new DOMException('quota', 'QuotaExceededError')
      map.set(k, v)
    },
    removeItem: (k) => void map.delete(k),
  }
}

/* ─────────────────────── one visit to the page ─────────────────────── */

/**
 * A page visit: the intake (guard, page-hide listener, local copy) and the
 * builder (gate + debouncer + its own page-hide flush), mounted in that order
 * — the order the real listeners are registered in.
 */
function visit(storage: StorageLike, idb: { rec: StoredSnapshot<ProjectSnapshot> | null }) {
  const page: PageHideTargets = { win: new EventTarget(), doc: Object.assign(new EventTarget(), { visibilityState: 'visible' }) }
  const guard = createBuilderUnloadGuard(storage, pendingBuilderKey(PROJECT))
  // IndexedDB writes in progress: they land only if the page lives on.
  const inProgress: ProjectSnapshot[] = []

  const persistLocal = (snap: ProjectSnapshot) => void inProgress.push(snap)

  // ── load (the intake's mount effect)
  const { rec, merged } = guard.restore(idb.rec)
  let snapshot = rec!.data
  if (merged) {
    // adoptMergedBuild: track it, and the first render writes it to IndexedDB at once (localSaveNow).
    guard.track(snapshot.profile.builderState as BuilderState, snapshot.builderGroupId!)
    persistLocal(snapshot)
  }
  subscribePageHide(() => guard.writeNow(), page)

  // ── the intake's persistence
  function saveBuilderProgress(builderState: BuilderState, groupId: BuilderScreenId, { urgent }: { urgent: boolean }) {
    snapshot = { ...snapshot, profile: { ...snapshot.profile, builderState }, builderGroupId: groupId }
    guard.track(builderState, groupId)
    if (urgent) guard.writeNow()
    // Timer path: the next render writes the local copy at once (localSaveNow);
    // urgent path: the composed snapshot is written through. Either way, started now.
    persistLocal(snapshot)
  }

  // ── the builder, mounted with the restored build (relocked, as the shell does)
  let state = relockBuilderState(snapshot.profile.builderState as BuilderState, {
    layoutContract: CONTRACT,
    hypothesis: HYPOTHESIS,
  })
  let groupId: BuilderScreenId = snapshot.builderGroupId!
  const gate = createSaveGate()
  const autosave = createDebouncer<[BuilderState, BuilderScreenId]>(
    (cause, s, g) => saveBuilderProgress(s, g, { urgent: cause !== 'timer' }),
    BUILDER_AUTOSAVE_MS
  )
  const effect = () => {
    if (gate(builderSaveKey(state, groupId))) autosave.run(state, groupId)
  }
  effect()
  subscribePageHide(() => autosave.flush('hide'), page)

  return {
    guard,
    get snapshot() {
      return snapshot
    },
    get mounted() {
      return { state, groupId }
    },
    dispatch(...actions: BuilderAction[]) {
      state = apply(state, ...actions)
      effect()
    },
    goTo(next: BuilderScreenId) {
      groupId = next
      effect()
    },
    /** The IndexedDB writes in progress finish (the page lived on). */
    settle() {
      for (const snap of inProgress.splice(0)) {
        idb.rec = { version: SNAPSHOT_VERSION, savedAt: new Date().toISOString(), data: structuredClone(snap) }
        guard.landed(snap)
      }
    },
    /** Cmd-R / closing the tab: hidden, pagehide — and every IndexedDB write still in progress is lost. */
    leave() {
      page.doc.visibilityState = 'hidden'
      page.doc.dispatchEvent(new Event('visibilitychange'))
      page.win.dispatchEvent(new Event('pagehide'))
      inProgress.length = 0
    },
    /** A tab switch: hidden, then back. The page lives on. */
    switchAway() {
      page.doc.visibilityState = 'hidden'
      page.doc.dispatchEvent(new Event('visibilitychange'))
    },
  }
}

const picks = (s: BuilderState) => ({ doors: s.doors.decorCode, worktop: s.worktop.family, backsplash: s.backsplash.kind })

/* ─────────────────────────────── tests ─────────────────────────────── */

describe('a reload inside the save window keeps the last change', () => {
  let storage: ReturnType<typeof fakeLocalStorage>
  let idb: { rec: StoredSnapshot<ProjectSnapshot> | null }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-04T09:00:00Z'))
    storage = fakeLocalStorage()
    idb = {
      rec: { version: SNAPSHOT_VERSION, savedAt: new Date().toISOString(), data: journey(savedBuild(), 'worktop') },
    }
    vi.setSystemTime(new Date('2026-10-04T18:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a pick 300 ms before Cmd-R comes back — the IndexedDB write on the way out is lost, the record is not', () => {
    const first = visit(storage, idb)
    first.goTo('backsplash')
    first.dispatch({ type: 'patch_backsplash', patch: { kind: 'glass' } })
    vi.advanceTimersByTime(300)
    first.leave()

    const second = visit(storage, idb)
    expect(picks(second.mounted.state).backsplash).toBe('glass')
    expect(second.mounted.groupId).toBe('backsplash')
    // The earlier re-render keeps its pixels (from the IndexedDB copy).
    expect(visibleRerenders(second.mounted.state)).toHaveLength(1)
  })

  it('a pick 1 s before Cmd-R comes back — autosave fired, its IndexedDB write still on the way', () => {
    const first = visit(storage, idb)
    first.goTo('backsplash')
    first.dispatch({ type: 'patch_backsplash', patch: { kind: 'glass' } })
    vi.advanceTimersByTime(1_000)
    // The builder has nothing pending: only the intake's listener can save it.
    first.leave()

    const second = visit(storage, idb)
    expect(picks(second.mounted.state).backsplash).toBe('glass')
    expect(second.mounted.groupId).toBe('backsplash')
  })

  it('Continue from group 3 to group 4, then a reload, reopens at group 4', () => {
    const first = visit(storage, idb)
    first.goTo('backsplash')
    vi.advanceTimersByTime(200)
    first.leave()
    expect(visit(storage, idb).mounted.groupId).toBe('backsplash')
  })

  it('a paid re-render that lands just before the tab closes comes back with its pixels', () => {
    const first = visit(storage, idb)
    first.dispatch({ type: 'push_rerender', trigger: 'worktop', imageDataUrl: fakeRender('R2') })
    vi.advanceTimersByTime(BUILDER_AUTOSAVE_MS + 50)
    first.leave()

    const restored = visit(storage, idb).mounted.state
    expect(visibleRerenders(restored).map((r) => r.imageDataUrl.slice(23, 25))).toEqual(['R1', 'R2'])
    expect(restored.activeRenderId).toBe(restored.rerenders![1].id)
  })

  it('the record lives until IndexedDB holds the build: a second reload before that still has it', () => {
    const first = visit(storage, idb)
    first.dispatch({ type: 'patch_backsplash', patch: { kind: 'glass' } })
    vi.advanceTimersByTime(100)
    first.leave()

    vi.advanceTimersByTime(5_000)
    const second = visit(storage, idb)
    second.leave() // reloaded again before the merged journey's IndexedDB write landed

    const third = visit(storage, idb)
    expect(picks(third.mounted.state).backsplash).toBe('glass')
    third.settle()
    expect(storage.map.size).toBe(0)
    expect((idb.rec!.data.profile.builderState as BuilderState).backsplash.kind).toBe('glass')
  })

  it('once IndexedDB holds the build the record is gone, and the reload restores from IndexedDB as is', () => {
    const first = visit(storage, idb)
    first.dispatch({ type: 'patch_backsplash', patch: { kind: 'glass' } })
    vi.advanceTimersByTime(BUILDER_AUTOSAVE_MS)
    first.settle()
    expect(storage.map.size).toBe(0)
    first.leave()
    expect(storage.map.size).toBe(0)

    const stored = idb.rec
    const second = visit(storage, idb)
    expect(second.snapshot).toBe(stored!.data)
    expect(picks(second.mounted.state).backsplash).toBe('glass')
  })

  it('a tab switch inside the window saves everything and leaves no record behind', () => {
    const first = visit(storage, idb)
    first.dispatch({ type: 'patch_backsplash', patch: { kind: 'tile' } })
    vi.advanceTimersByTime(200)
    first.switchAway()
    first.settle()
    expect(storage.map.size).toBe(0)
    expect((idb.rec!.data.profile.builderState as BuilderState).backsplash.kind).toBe('tile')
  })
})

describe('no spurious writes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-04T09:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opening a restored build and leaving writes no record — nothing changed', () => {
    const storage = fakeLocalStorage()
    const idb = { rec: { version: SNAPSHOT_VERSION, savedAt: new Date().toISOString(), data: journey(savedBuild(), 'worktop') } }
    vi.setSystemTime(new Date('2026-10-04T18:00:00Z'))
    const page = visit(storage, idb)
    vi.advanceTimersByTime(10_000)
    page.leave()
    expect(storage.map.size).toBe(0)
  })

  it('a merged restore fingerprints like the server copy the hide flush wrote: the reload sends no checkpoint', () => {
    const storage = fakeLocalStorage()
    const idb = { rec: { version: SNAPSHOT_VERSION, savedAt: new Date().toISOString(), data: journey(savedBuild(), 'worktop') } }
    vi.setSystemTime(new Date('2026-10-04T18:00:00Z'))
    const first = visit(storage, idb)
    first.dispatch({ type: 'push_rerender', trigger: 'worktop', imageDataUrl: fakeRender('R2') })
    vi.advanceTimersByTime(100)
    first.leave()
    // What the urgent checkpoint flush sent, had it landed: the composed snapshot, stripped.
    const serverCopy = stripImages(first.snapshot)

    const second = visit(storage, idb)
    expect(snapshotFingerprint(stripImages(second.snapshot))).toBe(snapshotFingerprint(serverCopy))
  })

  it('a record older than the IndexedDB copy is dropped, not merged', () => {
    const storage = fakeLocalStorage()
    const old = savedBuild()
    storage.setItem(pendingBuilderKey(PROJECT), JSON.stringify(composePendingRecord(old, 'doors', new Set(), Date.now())))
    vi.setSystemTime(new Date('2026-10-04T18:00:00Z'))
    const stored = { version: SNAPSHOT_VERSION, savedAt: new Date().toISOString(), data: journey(savedBuild(), 'worktop') }
    const guard = createBuilderUnloadGuard(storage, pendingBuilderKey(PROJECT))
    const { rec, merged } = guard.restore(stored)
    expect(merged).toBe(false)
    expect(rec).toBe(stored)
    expect(storage.map.size).toBe(0)
  })

  it('Start over (or a discarded resume offer) forgets the build and its record', () => {
    const storage = fakeLocalStorage()
    const guard = createBuilderUnloadGuard(storage, pendingBuilderKey(undefined))
    guard.track(savedBuild(), 'doors')
    guard.writeNow()
    expect(storage.map.has('softclose:builder-unsaved:anon')).toBe(true)
    guard.clear()
    expect(storage.map.size).toBe(0)
    guard.writeNow()
    expect(storage.map.size).toBe(0)
  })
})

describe('the record itself', () => {
  it('is image-free but for a re-render the local copy has no pixels for', () => {
    const build = apply(savedBuild(), { type: 'push_rerender', trigger: 'worktop', imageDataUrl: fakeRender('R2') })
    const localIds = new Set([build.rerenders![0].id])
    const rec = composePendingRecord(build, 'worktop', localIds, 1)
    expect(rec.builderState.rerenders!.map((r) => r.imageDataUrl.slice(0, 25))).toEqual([
      OMITTED_IMAGE,
      fakeRender('R2').slice(0, 25),
    ])
    // Everything but that one render: a few KB.
    const withoutNew = composePendingRecord(build, 'worktop', new Set(build.rerenders!.map((r) => r.id)), 1)
    expect(JSON.stringify(withoutNew)).not.toContain('data:image/')
    expect(JSON.stringify(withoutNew).length).toBeLessThan(64 * 1024)
  })

  it('over the storage quota it still keeps the picks and the group, without the pixels', () => {
    const storage = fakeLocalStorage(100 * 1024)
    const guard = createBuilderUnloadGuard(storage, pendingBuilderKey(PROJECT))
    const build = apply(savedBuild(), { type: 'patch_backsplash', patch: { kind: 'glass' } })
    guard.track(build, 'backsplash')
    guard.writeNow(5)
    const rec = parsePendingRecord(storage.getItem(pendingBuilderKey(PROJECT)))
    expect(rec?.builderGroupId).toBe('backsplash')
    expect(rec?.builderState.backsplash.kind).toBe('glass')
    expect(rec?.builderState.rerenders?.[0].imageDataUrl).toBe(OMITTED_IMAGE)
  })

  it('a broken, foreign or retired record is ignored', () => {
    const good = composePendingRecord(savedBuild(), 'doors', new Set(), 1)
    expect(parsePendingRecord(JSON.stringify(good))?.builderGroupId).toBe('doors')
    for (const raw of [null, '', '{', '"x"', 'null', JSON.stringify({ ...good, v: 2 }), JSON.stringify({ ...good, builderGroupId: 'layout' }), JSON.stringify({ ...good, savedAt: 'now' })]) {
      expect(parsePendingRecord(raw)).toBeNull()
    }
  })

  it('blocked storage degrades to a no-op, never an error', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
      removeItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
    }
    const guard = createBuilderUnloadGuard(throwing, pendingBuilderKey(PROJECT))
    guard.track(savedBuild(), 'doors')
    expect(() => guard.writeNow()).not.toThrow()
    expect(() => guard.clear()).not.toThrow()
    const stored = { version: SNAPSHOT_VERSION, savedAt: '2026-10-04T09:00:00Z', data: journey(savedBuild(), 'doors') }
    expect(guard.restore(stored)).toEqual({ rec: stored, merged: false })
  })
})

describe('subscribePageHide', () => {
  it('fires on pagehide and on a hidden tab — not on becoming visible — and unsubscribes', () => {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    const win = new EventTarget()
    const calls: string[] = []
    const off = subscribePageHide(() => calls.push(doc.visibilityState), { win, doc })
    doc.dispatchEvent(new Event('visibilitychange'))
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    win.dispatchEvent(new Event('pagehide'))
    expect(calls).toEqual(['hidden', 'hidden'])
    off()
    win.dispatchEvent(new Event('pagehide'))
    expect(calls).toHaveLength(2)
  })
})
