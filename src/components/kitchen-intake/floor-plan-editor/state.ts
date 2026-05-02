/**
 * Pure state for the floor-plan editor: the plan itself, the current
 * selection, and an undo/redo history. No DOM, no Konva — testable.
 */
import { useCallback, useMemo, useReducer } from 'react'
import {
  validate,
  confirmedBy,
  type FloorPlan,
  type Feature,
  type Island,
  type Opening,
  type Provenance,
  type SideKind,
} from '@/lib/floor-plan'
import type { WallSide } from '@/lib/types'

const HISTORY_CAP = 30

export type SelectionId =
  | { kind: 'none' }
  | { kind: 'room' }
  | { kind: 'side'; side: WallSide }
  | { kind: 'opening'; id: string }
  | { kind: 'feature'; id: string }
  | { kind: 'island'; id: string }

export interface EditorState {
  plan: FloorPlan
  selection: SelectionId
  history: FloorPlan[]
  future: FloorPlan[]
}

export type EditorAction =
  | { type: 'set_plan'; plan: FloorPlan; record?: boolean }
  | { type: 'patch_room'; patch: Partial<FloorPlan['room']> }
  | { type: 'patch_side'; side: WallSide; patch: Partial<FloorPlan['room']['sides'][WallSide]> }
  | { type: 'patch_opening'; id: string; patch: Partial<Opening> }
  | { type: 'patch_feature'; id: string; patch: Partial<Feature> }
  | { type: 'patch_island'; patch: Partial<Island> }
  | { type: 'add_opening'; opening: Opening }
  | { type: 'add_feature'; feature: Feature }
  | { type: 'add_island'; island: Island }
  | { type: 'remove_opening'; id: string }
  | { type: 'remove_feature'; id: string }
  | { type: 'remove_island' }
  | { type: 'select'; selection: SelectionId }
  | { type: 'set_units'; units: FloorPlan['units'] }
  | { type: 'set_measurement_method'; method: FloorPlan['measurementMethod'] }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset_to_initial'; initial: FloorPlan }

function pushHistory(state: EditorState, nextPlan: FloorPlan): EditorState {
  const history = [...state.history, state.plan].slice(-HISTORY_CAP)
  return { ...state, plan: validate(nextPlan), history, future: [] }
}

function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'set_plan': {
      if (action.record === false) return { ...state, plan: validate(action.plan) }
      return pushHistory(state, action.plan)
    }
    case 'patch_room': {
      const next: FloorPlan = {
        ...state.plan,
        room: bumpProvenance({ ...state.plan.room, ...action.patch }),
      }
      return pushHistory(state, next)
    }
    case 'patch_side': {
      const sides = {
        ...state.plan.room.sides,
        [action.side]: { ...state.plan.room.sides[action.side], ...action.patch },
      }
      return pushHistory(state, {
        ...state.plan,
        room: { ...state.plan.room, sides },
      })
    }
    case 'patch_opening': {
      const openings = state.plan.openings.map((o) =>
        o.id === action.id ? bumpProvenance({ ...o, ...action.patch }) : o
      )
      return pushHistory(state, { ...state.plan, openings })
    }
    case 'patch_feature': {
      const features = state.plan.features.map((f) =>
        f.id === action.id ? bumpProvenance({ ...f, ...action.patch }) : f
      )
      return pushHistory(state, { ...state.plan, features })
    }
    case 'patch_island': {
      if (!state.plan.island) return state
      const island = bumpProvenance({ ...state.plan.island, ...action.patch })
      return pushHistory(state, { ...state.plan, island })
    }
    case 'add_opening': {
      return pushHistory(state, { ...state.plan, openings: [...state.plan.openings, action.opening] })
    }
    case 'add_feature': {
      return pushHistory(state, { ...state.plan, features: [...state.plan.features, action.feature] })
    }
    case 'add_island': {
      return pushHistory(state, { ...state.plan, island: action.island, hasIsland: true })
    }
    case 'remove_opening': {
      const openings = state.plan.openings.filter((o) => o.id !== action.id)
      return pushHistory(state, { ...state.plan, openings })
    }
    case 'remove_feature': {
      const features = state.plan.features.filter((f) => f.id !== action.id)
      return pushHistory(state, { ...state.plan, features })
    }
    case 'remove_island': {
      return pushHistory(state, { ...state.plan, island: undefined, hasIsland: false })
    }
    case 'select':
      return { ...state, selection: action.selection }
    case 'set_units':
      return { ...state, plan: { ...state.plan, units: action.units } }
    case 'set_measurement_method':
      return pushHistory(state, { ...state.plan, measurementMethod: action.method })
    case 'undo': {
      if (state.history.length === 0) return state
      const prev = state.history[state.history.length - 1]
      return {
        ...state,
        plan: prev,
        history: state.history.slice(0, -1),
        future: [state.plan, ...state.future].slice(0, HISTORY_CAP),
      }
    }
    case 'redo': {
      if (state.future.length === 0) return state
      const [next, ...rest] = state.future
      return {
        ...state,
        plan: next,
        history: [...state.history, state.plan].slice(-HISTORY_CAP),
        future: rest,
      }
    }
    case 'reset_to_initial': {
      return {
        plan: validate(action.initial),
        selection: { kind: 'none' },
        history: [],
        future: [],
      }
    }
  }
}

/** Touched-by-homeowner provenance bump: any patch flips confidence to H + source homeowner. */
function bumpProvenance<T extends Provenance>(el: T): T {
  return { ...el, ...confirmedBy(el) }
}

export interface EditorApi {
  state: EditorState
  plan: FloorPlan
  selection: SelectionId
  canUndo: boolean
  canRedo: boolean
  // mutators
  setPlan: (plan: FloorPlan, opts?: { record?: boolean }) => void
  patchRoom: (patch: Partial<FloorPlan['room']>) => void
  patchSide: (side: WallSide, patch: { kind?: SideKind; label?: string }) => void
  patchOpening: (id: string, patch: Partial<Opening>) => void
  patchFeature: (id: string, patch: Partial<Feature>) => void
  patchIsland: (patch: Partial<Island>) => void
  addOpening: (opening: Opening) => void
  addFeature: (feature: Feature) => void
  addIsland: (island: Island) => void
  removeOpening: (id: string) => void
  removeFeature: (id: string) => void
  removeIsland: () => void
  select: (selection: SelectionId) => void
  setUnits: (units: FloorPlan['units']) => void
  setMeasurementMethod: (method: FloorPlan['measurementMethod']) => void
  undo: () => void
  redo: () => void
  resetToInitial: (initial: FloorPlan) => void
}

export function useEditor(initial: FloorPlan): EditorApi {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    plan: validate(initial),
    selection: { kind: 'none' as const },
    history: [],
    future: [],
  }))

  const setPlan = useCallback(
    (plan: FloorPlan, opts?: { record?: boolean }) =>
      dispatch({ type: 'set_plan', plan, record: opts?.record }),
    []
  )
  const patchRoom = useCallback((patch: Partial<FloorPlan['room']>) => dispatch({ type: 'patch_room', patch }), [])
  const patchSide = useCallback(
    (side: WallSide, patch: { kind?: SideKind; label?: string }) =>
      dispatch({ type: 'patch_side', side, patch }),
    []
  )
  const patchOpening = useCallback(
    (id: string, patch: Partial<Opening>) => dispatch({ type: 'patch_opening', id, patch }),
    []
  )
  const patchFeature = useCallback(
    (id: string, patch: Partial<Feature>) => dispatch({ type: 'patch_feature', id, patch }),
    []
  )
  const patchIsland = useCallback((patch: Partial<Island>) => dispatch({ type: 'patch_island', patch }), [])
  const addOpening = useCallback((opening: Opening) => dispatch({ type: 'add_opening', opening }), [])
  const addFeature = useCallback((feature: Feature) => dispatch({ type: 'add_feature', feature }), [])
  const addIsland = useCallback((island: Island) => dispatch({ type: 'add_island', island }), [])
  const removeOpening = useCallback((id: string) => dispatch({ type: 'remove_opening', id }), [])
  const removeFeature = useCallback((id: string) => dispatch({ type: 'remove_feature', id }), [])
  const removeIsland = useCallback(() => dispatch({ type: 'remove_island' }), [])
  const select = useCallback((selection: SelectionId) => dispatch({ type: 'select', selection }), [])
  const setUnits = useCallback((units: FloorPlan['units']) => dispatch({ type: 'set_units', units }), [])
  const setMeasurementMethod = useCallback(
    (method: FloorPlan['measurementMethod']) => dispatch({ type: 'set_measurement_method', method }),
    []
  )
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])
  const resetToInitial = useCallback(
    (init: FloorPlan) => dispatch({ type: 'reset_to_initial', initial: init }),
    []
  )

  const api = useMemo<EditorApi>(
    () => ({
      state,
      plan: state.plan,
      selection: state.selection,
      canUndo: state.history.length > 0,
      canRedo: state.future.length > 0,
      setPlan,
      patchRoom,
      patchSide,
      patchOpening,
      patchFeature,
      patchIsland,
      addOpening,
      addFeature,
      addIsland,
      removeOpening,
      removeFeature,
      removeIsland,
      select,
      setUnits,
      setMeasurementMethod,
      undo,
      redo,
      resetToInitial,
    }),
    [
      state,
      setPlan,
      patchRoom,
      patchSide,
      patchOpening,
      patchFeature,
      patchIsland,
      addOpening,
      addFeature,
      addIsland,
      removeOpening,
      removeFeature,
      removeIsland,
      select,
      setUnits,
      setMeasurementMethod,
      undo,
      redo,
      resetToInitial,
    ]
  )

  return api
}
