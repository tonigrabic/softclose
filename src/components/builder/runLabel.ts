/**
 * A cabinet run's heading in the homeowner's language.
 *
 * The layout contract labels runs with the English side id ("Top", "Island")
 * unless the homeowner named the wall in the floor-plan editor — that label is
 * data (the vision prompt quotes it), so it stays English there and is only
 * translated where people read it. A name the homeowner typed is theirs and is
 * shown as written.
 */
export function runLabel(run: { id: string; label: string }, tDynamic: (key: string) => string): string {
  if (run.label.toLowerCase() !== run.id) return run.label
  const key = run.id === 'island' ? 'floorPlan.kind.island' : `floorPlan.wall.${run.id}`
  const word = tDynamic(key)
  return word === key ? run.label : word
}
