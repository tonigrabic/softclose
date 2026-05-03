/**
 * Pick-driven inference. Given a Schachermayer product, return a partial
 * patch the calling group can merge into its BuilderState slice. Each
 * inference is keyword-based against name + brand + shortSpec — null when no
 * rule matches so the call site can keep the existing value.
 *
 * Picking a SKU is an explicit homeowner action, so inferred fields land
 * with `provenance: 'homeowner-edited'` and `confidence: 'H'` at the call site.
 */

import type { SchachermayerProduct } from '@/lib/catalog/hardware'
import type {
  ApplianceSelection,
  DrawerSystemTier,
  HandleFinish,
  SinkBowls,
  SinkMaterial,
  SinkMount,
  TapType,
} from './inventory'

function haystack(p: SchachermayerProduct): string {
  return `${p.brand ?? ''} ${p.name} ${p.shortSpec ?? ''}`.toLowerCase()
}

export function inferDrawerSystemTier(p: SchachermayerProduct): DrawerSystemTier | null {
  const h = haystack(p)
  if (/(legrabox|tandembox|movento|blum)/.test(h)) return 'premium'
  if (/(nova\s*pro|grass)/.test(h)) return 'mid'
  if (/(generic|basic|economy|standard)/.test(h)) return 'budget'
  return null
}

export function inferSinkAttributes(
  p: SchachermayerProduct
): Partial<{ bowls: SinkBowls; mount: SinkMount; material: SinkMaterial }> | null {
  const h = haystack(p)
  const out: Partial<{ bowls: SinkBowls; mount: SinkMount; material: SinkMaterial }> = {}

  if (/(keramik|ceramic|keramičk|keramicki)/.test(h)) out.material = 'ceramic'
  else if (/fragranite/.test(h)) out.material = 'fragranite'
  else if (/(granit|composite|kompozit)/.test(h)) out.material = 'granite_composite'
  else if (/(inox|nehrđaj|nehrdaj|stainless)/.test(h)) out.material = 'stainless'

  if (/(1\.5|jednoipo|1\s*1\/2)/.test(h)) out.bowls = 'one_and_half'
  else if (/(2\s*korita|double|dvodjeln|dvodelan|dvostruk)/.test(h)) out.bowls = 'double'
  else if (/(jedno\s*korit|single)/.test(h)) out.bowls = 'single'

  if (/undermount|podgradni|podugrad/.test(h)) out.mount = 'undermount'
  else if (/(flush|u\s*ravnini|ravna\s*ploha)/.test(h)) out.mount = 'flush'
  else if (/belfast|farmhouse/.test(h)) out.mount = 'belfast'
  else if (/(nadgradni|inset|usadni)/.test(h)) out.mount = 'inset'

  return Object.keys(out).length > 0 ? out : null
}

export function inferTapAttributes(
  p: SchachermayerProduct
): Partial<{ type: TapType; finish: HandleFinish }> | null {
  const h = haystack(p)
  const out: Partial<{ type: TapType; finish: HandleFinish }> = {}

  if (/(pull[- ]?out|izvlač|izvlac|izvod)/.test(h)) out.type = 'pull_out'
  else if (/(kipuća|kipuca|boiling)/.test(h)) out.type = 'boiling_water'
  else if (/(filtered|filter|tri\s*načina|tri\s*nacina)/.test(h)) out.type = 'filtered_three_way'
  else if (/(jednoručn|jednorucn|single[- ]?lever)/.test(h)) out.type = 'single_lever'

  if (/(crna|black|matt\s*black|matte\s*black)/.test(h)) out.finish = 'matte_black'
  else if (/(mesing|brass)/.test(h)) out.finish = 'brass'
  else if (/(brushed\s*steel|brušen|brusen)/.test(h)) out.finish = 'brushed_steel'
  else if (/(chrom|krom)/.test(h)) out.finish = 'chrome'

  return Object.keys(out).length > 0 ? out : null
}

export function inferApplianceFields(
  type: ApplianceSelection['type'],
  p: SchachermayerProduct
): Partial<Pick<ApplianceSelection, 'config' | 'integrated' | 'widthMm'>> {
  const h = haystack(p)
  const out: Partial<Pick<ApplianceSelection, 'config' | 'integrated' | 'widthMm'>> = {}

  // Width: "60 cm" / "90 cm" / "60cm".
  const widthMatch = h.match(/(\d{2,3})\s*cm/)
  if (widthMatch) {
    const cm = Number(widthMatch[1])
    if (cm >= 30 && cm <= 120) out.widthMm = cm * 10
  }

  // Integrated: "ugradn" or "integrated" / "built-in".
  if (/(ugradn|integrated|built[- ]?in)/.test(h)) out.integrated = true

  if (type === 'hob') {
    if (/indukcij|induction/.test(h)) out.config = 'induction'
    else if (/plinsk|gas/.test(h)) out.config = 'gas'
    else if (/staklokeram|ceramic/.test(h)) out.config = 'ceramic'
  } else if (type === 'oven') {
    if (/(kombi|parn|combi|steam)/.test(h)) out.config = 'combi'
    else if (/(dvostruk|double)/.test(h)) out.config = 'double'
    else if (/jednostruk|single/.test(h)) out.config = 'single'
  } else if (type === 'extractor') {
    if (/otoč|otoc|island/.test(h)) out.config = 'island'
    else if (/recirkul|recirculat/.test(h)) out.config = 'recirculating'
    else if (/downdraft|izvlačn|izvlacn/.test(h)) out.config = 'downdraft'
    else if (/strop|ceiling/.test(h)) out.config = 'ceiling_recessed'
    else if (/dimnjak|chimney/.test(h)) out.config = 'chimney'
  }

  return out
}
