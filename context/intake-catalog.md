# Intake Catalog: What We Can Collect From a Homeowner

*Draft: 2026-05-01 (revised 2026-05-01) | Companion to `product-foundations.md` — covers the conversation surface*

This document inventories what the homeowner-facing chat can ask about, how each topic branches, and how we degrade gracefully when the homeowner doesn't know. It's organised by topic area to feed **two outputs**:

- **The spec** — the structured brief the designer/maker receives. Aims to skip as much discovery back-and-forth as possible so the designer arrives at a follow-up call already aligned on vision, scope, and constraints.
- **A ±20% cost estimate** — generated internally from the same intake. May or may not be surfaced to the homeowner; if shown, it is always framed as a range, with the explicit promise that *the designer will follow up to refine into a final quote*. The AI never produces a final number.

The catalog mirrors the brief schema in `product-foundations.md` so each prompt maps to a field, and it adds the cost-model alignment categories needed to hit ±20% (scope of work, trades, structural changes, lighting, logistics).

**Reading guide:**
- **Primary prompt** — the plain-language opener the chat uses. Conversation-first (Principle 3).
- **Branches** — the follow-ups conditional on the answer.
- **Mini-form** — when precision matters and we drop into Pattern B (embedded structured input).
- **"I don't know" path** — the graceful exit. Never punish the homeowner for not knowing (Principle 7).
- **Cost-model role** — what this field contributes to the ±20% estimate (and how much uncertainty it injects when missing).
- **Maker-side surfacing** — how this lands in the brief, including confidence + provenance (Principle 6).

The catalog is **kitchen-only at MVP**. Wardrobes, vanities, and built-ins are Phase 2 ontology forks.

---

## 1. Project Meta

### 1.1 Decision-maker

- **Primary prompt:** *"Who's making the call on this project — just you, or is someone deciding with you?"*
- **Branches:**
  - *Sole* → continue.
  - *Joint* → *"Got it. Want me to send a copy of what we put together to your partner too?"* → optional second contact.
  - *Needs consultation* → flag for maker; suggest scheduling a follow-up after homeowner aligns.
- **"I don't know" path:** Default to *sole*; surface as low confidence.
- **Maker-side surfacing:** Single field; affects how the maker schedules the follow-up call.

### 1.2 Timeline

- **Primary prompt:** *"When are you hoping to have this done?"*
- **Mini-form (Pattern B):** Bands — `<3mo`, `3–6mo`, `6–12mo`, `>12mo`, `Just exploring`.
- **Branches:**
  - Hard deadline mentioned (e.g., "before Christmas," "before the baby arrives") → capture as `hard_deadline`, mark high confidence.
  - *Just exploring* → don't drop the conversation; still collect enough to produce a brief, but tag it `exploratory` for the maker.
- **"I don't know" path:** *Just exploring* is a valid first-class option, not a fallback.
- **Cost-model role:** No direct cost impact, but a hard deadline driving overtime can shift estimate +5–10%.
- **Maker-side surfacing:** Drives queue priority in the maker dashboard.

### 1.3 Location

- **Mini-form:** Country (required), city, postal/ZIP code (optional but recommended for delivery feasibility and regional cost rates).
- **Branches:**
  - Outside the maker's service area → soft handoff: *"Your maker primarily serves [region]. I'll still send the brief, but they may suggest a referral."*
- **Cost-model role:** Critical. Regional labour rates, material delivery, and trade-cost data all key off location. Without this, the estimate falls back to a national average and the band widens significantly.
- **Maker-side surfacing:** Filter on the maker dashboard; flag out-of-area leads.

### 1.4 Budget

- **Primary prompt:** *"Do you have a sense of budget? Even a rough range helps your maker know what's realistic."*
- **Mini-form:** Bands — `<25k`, `25–50k`, `50–80k`, `80–120k`, `120k+`. Currency auto-detected from location.
- **Branches:**
  - Band selected → *"How firm is that?"* → `firm`, `±10%`, `±25%`, `still exploring`.
  - *I don't know* → ask what they've seen they liked and roughly what those projects cost (anchor via references).
- **"I don't know" path:** Skip with a note: *"No worries — your maker can help you understand what your space and style usually run."* Mark low confidence.
- **Cost-model role:** A stated budget anchors expectations against the model output (e.g., flag if model output is 2x the stated budget). The cost model produces an estimate independently — it does not start from the budget.
- **Maker-side surfacing:** Band + flexibility + provenance + side-by-side with the model estimate.

### 1.5 Budget priorities & trade-off appetite

- **Primary prompt:** *"If we had to trim, where could you flex? And if you had room to spend more, where would it go?"*
- **Branches:** Free-text or quick chooser across major categories (cabinets / worktops / appliances / lighting / structural / install).
- **"I don't know" path:** Skip; default to even priority across categories.
- **Cost-model role:** Doesn't shift the estimate band but feeds the "options" the designer can come back with.
- **Maker-side surfacing:** Lets the designer prepare alternatives ("drop to mid-tier hardware, save ~$X") instead of a flat decline.

---

## 2. Scope of Work — What's INCLUDED

⚠️ *The single largest source of estimate variance. The same kitchen can mean $30k or $130k purely on what's in scope. This section is non-optional for the cost model.*

### 2.1 Project scope checklist

- **Primary prompt:** *"When you picture this project, what's included? Just the cabinets and worktops, or the whole space — flooring, walls, lighting too?"*
- **Mini-form (Pattern B):** Multi-select — `Cabinets`, `Worktops & splashback`, `Sink & taps`, `Appliances`, `Flooring`, `Walls (paint/tile)`, `Ceiling`, `Lighting`, `Plumbing relocation`, `Electrical work`, `Structural changes`, `Demolition & disposal`, `Installation`.
- **Branches:** For each unchecked item → *"OK — your maker won't quote on that. Are you handling it yourself or with someone else?"* (captures so the maker knows the project context, even if not in scope).
- **"I don't know" path:** Default to *Cabinets + Worktops + Appliances + Installation + Demolition* (typical bespoke-cabinet scope) and flag for designer confirmation.
- **Cost-model role:** Determines which sub-models contribute to the estimate. Without this, the estimate is meaningless. Each item checked adds a contribution; each item unchecked is excluded with an explicit caveat.

### 2.2 Demolition & disposal

- **Primary prompt:** *"Is the existing kitchen still in there? Who's tearing it out?"*
- **Branches:**
  - *Already gutted* → no demo line.
  - *Needs to come out, you handle it* → no demo line, flag.
  - *Needs to come out, maker handles* → demo + skip + disposal line in estimate.
- **Cost-model role:** Demo + disposal is typically $1.5–5k depending on size and access; commonly forgotten and a frequent source of "but you didn't tell me about that" friction.

### 2.3 Installation

- **Primary prompt:** *"Will your maker also install, or do you have someone for that?"*
- **Branches:** *Maker installs* / *I have my own fitter* / *Not sure yet*.
- **Cost-model role:** Install is typically 15–25% of the cabinet line. Excluding it (without realising) is a common source of "estimate looked great, then I needed an installer" surprises.

---

## 3. Space

### 3.1 Layout

- **Primary prompt:** *"Tell me about your kitchen. What shape is it, and is there an island or anything you want to keep?"*
- **Branches:**
  - Free text → AI proposes a layout type (galley / L / U / island / peninsula / open) and asks for confirmation.
  - Photo upload → AI infers layout from the photo, surfaces its guess, asks the homeowner to confirm.
- **Mini-form fallback:** Visual chooser with the six layout types.
- **"I don't know" path:** *Unsure* is a valid option; the maker will resolve on the site visit.
- **Cost-model role:** Combines with dimensions to derive linear meters of cabinetry (a primary cost driver).

### 3.2 Dimensions

- **Primary prompt:** *"Do you have rough measurements? If not, that's fine — we can ballpark from a photo."*
- **Mini-form (Pattern B):** Length / width / ceiling height (mm or ft+in based on locale). Each field has an *I don't know* toggle.
- **Branches:**
  - *Self-measured* → high confidence.
  - *Professional-measured* → very high confidence; ask for the survey doc if available.
  - *AI-estimated from photo* → medium/low confidence; surface caveat to maker.
  - *Unknown* → ask for any reference object in a photo (cooker width, fridge, door); estimate; mark low.
- **Cost-model role:** Linear meters drive cabinetry cost; sq m drive worktop and flooring cost. Low-confidence dimensions are the single biggest reason estimates widen beyond ±20%.
- **Maker-side surfacing:** Always show `measurement_method` next to the value. Critical for quote accuracy.

### 3.3 Existing constraints

- **Primary prompt:** *"Anything in the space you have to work around — windows, a load-bearing wall, the boiler, the gas line?"*
- **Branches:**
  - Photos help massively here. Encourage 1–2 wide shots.
  - Specific items to ask about if not raised: window positions, door swings, radiators, gas vs electric hob, where the extractor can vent.
- **"I don't know" path:** *"That's OK — your maker will check on the site visit."* Surface as a known unknown to the maker.

### 3.4 Existing condition + what's staying

- **Primary prompt:** *"Is anything staying — flooring, appliances, the worktop, anything you love?"*
- **Branches:**
  - Photos of items being kept.
  - Compatibility flags (e.g., "keeping the existing stone worktop" → constrains cabinet height to match).

### 3.5 Structural changes wanted

⚠️ *Often the largest single line in a remodel. Always ask, even if the homeowner doesn't volunteer.*

- **Primary prompt:** *"Are you thinking about taking down any walls, opening up to another room, or changing windows or doors?"*
- **Mini-form:** Multi-select — `Removing a wall`, `Opening up to dining/living`, `Removing soffit/bulkhead`, `Adding/enlarging window`, `Moving a door`, `None of the above`, `Maybe — want to discuss`.
- **Branches:**
  - Wall removal → *"Do you know if it's load-bearing?"* (if unsure, mark as significant unknown).
  - Soffit removal → flag; often reveals plumbing/electrical to reroute.
  - Window changes → flag; planning permission implications in some jurisdictions.
- **"I don't know" path:** *Maybe — want to discuss* is valid. Flag for the designer.
- **Cost-model role:** Wall removal alone can add $5–25k depending on engineering. The difference between *known structural work* and *unknown structural work* is the difference between a ±20% estimate and a ±50% one. If structural is *Maybe*, the estimate band widens explicitly.

---

## 4. Trades & Utilities

⚠️ *Typically 15–30% of total kitchen cost. Most homeowners can't answer with precision — that's OK; the estimate just widens proportionally.*

### 4.1 Plumbing changes

- **Primary prompt:** *"Are you keeping the sink and dishwasher in roughly the same spot, or moving them?"*
- **Mini-form:** `Same spot` / `Moving up to ~1m` / `Moving across the kitchen` / `Adding a second sink (island, prep)` / `Not sure`.
- **Cost-model role:** Sink relocation typically $500–3k depending on distance and floor type. Second sink adds more.

### 4.2 Electrical changes

- **Primary prompt:** *"What's the cooker — gas, electric, or induction? And do you know roughly where the fuse box / electrical panel is?"*
- **Branches:**
  - Gas → induction switch → significant electrical upgrade (induction draws ~7kW); capture panel location and proximity.
  - Adding island with seating + outlets → flag.
  - New circuits for high-draw appliances (steam oven, warming drawer).
- **"I don't know" path:** Default to "current configuration retained"; flag for designer.
- **Cost-model role:** Electrical upgrades can range $500–5k+ depending on panel capacity and runs.

### 4.3 Gas

- **Primary prompt:** *"If you have gas now, are you keeping it for cooking?"*
- **Branches:** Adding gas where there isn't any (rare, expensive); removing gas (cap-off cost, usually small); keeping (no impact).
- **Cost-model role:** Adding gas typically $1–4k.

### 4.4 Ventilation

- **Primary prompt:** *"Where does the extractor vent now — outside through a wall/ceiling, or just back into the room?"*
- **Mini-form:** `External duct (wall)` / `External duct (roof)` / `Recirculating only` / `No extractor` / `Not sure`.
- **Branches:**
  - Recirc only + induction → fine.
  - Recirc only + gas + apartment → flag (often a code/insurance issue).
  - Adding external duct where there isn't one → significant cost, sometimes infeasible.
- **Cost-model role:** Ventilation routing can be a $500 line or a $5k line depending on whether there's an existing duct path. Sometimes a project-killer if a duct can't be added.

### 4.5 HVAC implications

- **Primary prompt:** *"Does your kitchen have its own heating control, vent, or radiator that might need moving?"*
- Usually a flag-and-pass; sometimes catches a radiator that needs relocating ($300–800).

---

## 5. Style Direction

### 5.1 Style family

- **Primary prompt:** *"What kind of vibe are you going for? You can describe it, name a style, or just show me pictures — Pinterest, Instagram saves, anything."*
- **Branches:**
  - Pinterest URL → auto-import board, AI extracts dominant themes, presents back: *"I'm seeing a lot of warm wood and handleless doors — does that feel right?"*
  - Photo uploads → AI tags and clusters; same confirm-back pattern.
  - Free text only → propose 2–3 likely style families; let homeowner pick.
- **Style families (v1.0 ontology):** Shaker, slab, raised panel, contemporary handleless, transitional, traditional, Mediterranean, Scandi, Japandi, industrial, other.
- **"I don't know" path:** *"Want me to show you a few directions and you can react?"* — small visual chooser as a fallback.

### 5.2 Materials

For each material category, the same structure:

| Category | Options to surface | Notes |
|---|---|---|
| Door face | Solid wood, veneer, thermofoil, painted MDF, melamine, unsure | "Unsure" is fine; trade language, mark low confidence |
| Worktop | Quartz, quartzite, granite, marble, solid wood, sintered stone, laminate, unsure | Reference photos help here a lot |
| Backsplash | Tile, slab, painted, unsure | Often deferred to the maker |
| Flooring (kept vs new) | Existing / new / undecided | If existing, compatibility flag |

- **Primary prompt pattern:** *"Any thoughts on [material category]? If not, your maker can walk you through options."*
- **Branches:** If a reference photo shows the material clearly, AI infers and asks to confirm.
- **Cost-model role:** Material tier per category is one of the largest spread drivers — laminate worktop to marble is ~10x; painted MDF doors to solid wood is 2–3x. The estimate cannot hit ±20% without a tier per category, even if it's just *budget / mid / premium*.

### 5.3 Colour direction

- **Primary prompt:** *"Any colours you're drawn to — or any you definitely don't want?"*
- Capture both *liked* and *deal-breaker* colours separately.

### 5.4 Hardware tier

- **Primary prompt:** *"On hinges and drawer runners — do you care about brand, or do you just want it to feel solid and last?"*
- **Mini-form:** `Budget` / `Mid` / `Premium (e.g., Blum, Hafele)` / `Unsure`.
- **"I don't know" path:** Default to mid-tier with a note; many homeowners genuinely don't know and the maker decides.
- **Cost-model role:** ~1.5–2x spread between budget and premium hardware across the kitchen.

---

## 6. Appliances

> Note: gas/electric/induction choice, ventilation routing, and electrical implications are captured in §4 (Trades & Utilities), not here. This section captures the appliances themselves.

### 6.1 Keep vs new

- **Primary prompt:** *"For appliances — are you bringing the existing ones with you, buying new, or a mix?"*
- **Branches:**
  - *All existing* → for each appliance: *"Do you have the make, model, or rough dimensions?"* (encourage photo of the spec sticker).
  - *All new* → go to 6.2.
  - *Mix* → loop per appliance type, each tagged `existing | new | not_decided`.
- **"I don't know" path:** *Not decided yet* is a valid per-appliance state; brief surfaces it as an open decision.
- **Cost-model role:** Critical — appliance line is often $5–25k+ depending on tier; whether the homeowner is buying them or the project is needs to be unambiguous.

### 6.2 New appliances — do you know which?

- **Primary prompt:** *"For the new ones — do you already know what you want, or are you still figuring it out?"*
- **Branches:**
  - *Know exactly* → capture make + model + dimensions per appliance. Photo of the spec sheet is gold.
  - *Know the type but not the model* → capture type, integrated yes/no, any preferences (e.g., "induction not gas," "American-style fridge").
  - *No idea* → capture broad bands: budget vs premium, integrated vs freestanding, any non-negotiables.
- **Cost-model role:** For "know exactly" we can use list prices directly. For "know the type" we use a tier mid-point. For "no idea" we use the budget band tier or default to mid.

### 6.3 Per-appliance loop

For each appliance type the homeowner mentions or that the kitchen layout implies, capture:

| Field | Why it matters |
|---|---|
| `type` | Drives the cabinet carcass + cutout sizing |
| `existing | new | not_decided` | Drives the maker's quote line items |
| `integrated | freestanding | flexible` | Hugely affects cabinetry design + cost |
| `make`, `model`, `dimensions` (if known) | Cutout precision; reduces site-visit surprises |
| `tier` (`budget | mid | premium`) | Drives the cost-model line if model is unknown |
| `spec_notes` (free text) | Catches things like "must be left-hinged" |

**Appliance types covered at MVP:** Hob, oven (single / double / combi), extractor (overhead / downdraft / integrated), fridge (under-counter / tall / American-style), freezer, dishwasher (full / slim / integrated), microwave, wine cooler, warming drawer, coffee machine, boiling-water tap.

- **"I don't know" path:** For each field, *"Not decided"* is valid. The brief surfaces these as open decisions, not gaps. The cost model defaults to mid-tier for unspecified items and widens the band.

---

## 7. Cabinetry

### 7.1 Door / drawer style

- **Primary prompt:** *"Do you want mostly drawers, mostly cupboards, or a mix? Drawers cost more but are way easier to live with."*
- **Branches:**
  - *Mostly drawers* → ask about pan drawers (deep bottom drawers), cutlery insert preferences.
  - *Mostly cupboards* → ask about pull-outs, internal organisers.
  - *Mix* → estimate ratio.
- **Drawer count estimate:** Surface as a slider or band; pure number is too precise to be meaningful at intake.
- **Cost-model role:** Drawer ratio meaningfully affects cabinetry cost (drawers are typically 20–40% more than equivalent cupboard).

### 7.2 Construction style (trade language, gently introduced)

- **Primary prompt:** *"Do you have a preference between inset doors (set flush into the frame) and overlay (sitting on top)? Not everyone does — pictures help if you're not sure."*
- **Branches:**
  - Inset → premium tier signal; flag for maker. Also a meaningful cost premium.
  - Overlay (full vs partial) → most common.
  - *No idea* → default to *no preference*; let the maker propose.
- **Cost-model role:** Inset typically adds 20–40% to cabinetry vs overlay.

### 7.3 Soft-close

- **Primary prompt:** *"Soft-close drawers and doors? They're now standard at most price points but it's worth confirming."*
- **Mini-form:** `Yes` / `No` / `Flexible`.

### 7.4 Specialty cabinet features

Loop through, but only if the homeowner hasn't already covered them:

| Feature | Prompt fragment |
|---|---|
| Pantry / larder | *"Tall pantry cupboard or larder?"* |
| Island | *"Island? With seating?"* |
| Open shelving | *"Any open shelving, or all closed?"* |
| Glass fronts | *"Any glass-front cabinets you'd like?"* |
| Wine storage | *"Wine storage — built-in cooler, rack, or none?"* |
| Bin pull-out | *"Where do you want the bins to live? Pull-out under the sink works for most people."* |
| Corner solutions | *"Any awkward corners? Magic corner / Le Mans pull-outs are options."* |
| Plinth drawers | *"Toe-kick drawers? Useful for trays and baking sheets."* |

Each feature is `yes / no / maybe`. *Maybe* surfaces to the maker as an open decision.

### 7.5 Internal organisation

- **Primary prompt:** *"Anything specific about the inside — cutlery dividers, spice pull-outs, mixer lifts, that kind of thing?"*
- Capture as free-text `must_haves` / `nice_to_haves` (feeds § 10).

---

## 8. Lighting

⚠️ *Often forgotten at intake; can be a $2–10k line by itself. Always ask, even briefly.*

### 8.1 Lighting layers

- **Primary prompt:** *"Lighting — are you keeping the existing setup, or planning new? People usually think in three layers: task lighting (over worktops), ambient (overall), and accent (under-cabinet, in glass cabinets, etc.)."*
- **Mini-form:** Per layer — `Keeping existing` / `New, plan included` / `New, leave to designer` / `Not in scope`.
- **Branches:**
  - Under-cabinet lighting → almost always becomes a "must-have" once raised.
  - Pendants over island → confirm count + style.
  - Recessed/downlights → confirm count or "throughout."
- **Cost-model role:** Lighting is a notorious budget surprise. New plan with under-cabinet + pendants + downlights typically $3–8k; smart controls add more.

### 8.2 Switching & smart controls

- **Primary prompt:** *"Anything fancy on the controls — dimmers, smart switches, scenes?"*
- Quick capture; cost-model implication is small per item but compounds.

### 8.3 Existing electrical capacity

Already covered in §4.2; cross-referenced here. If the lighting plan is significantly more than existing, the trades section captures the additional electrical work.

---

## 9. References

### 9.1 Pinterest

- **Primary prompt:** *"Got a Pinterest board? Drop the link and I'll pull what I see."*
- AI auto-imports, extracts themes, surfaces top images back to the homeowner for confirmation.
- **Fallback:** Manual paste of pin URLs; or screenshot upload.

### 9.2 Photos

- **Primary prompt:** *"Any photos — of your current kitchen, or of kitchens you love?"*
- Per upload, capture: `image_id`, AI description, AI tags, optional homeowner caption.
- Tag whether the image is *current state*, *aspiration*, or *specific feature reference*.

### 9.3 AI moodboards / renders

- **Primary prompt (only if homeowner mentions):** *"If you've got AI-generated mood images, drop them too — I'll use them as direction, but your maker will design the real thing."*
- Tag clearly as `ai_generated` so the maker knows to interpret loosely.
- **Hard rule:** We *consume* renders, never produce them. Never generate a kitchen image back. (Red line.)

---

## 10. Functional Requirements

### 10.1 Must-haves

- **Primary prompt:** *"What are the things this kitchen has to have? The 'if I don't get this, I'll be sad' list."*
- Free-text capture; AI clusters into trade-relevant tags where possible (storage / appliances / layout / aesthetic).

### 10.2 Nice-to-haves

- **Primary prompt:** *"And the wishlist — things that'd be lovely if budget allows?"*
- Same capture pattern. Drives the maker's upsell conversation.

### 10.3 Deal-breakers

- **Primary prompt:** *"Anything you definitely don't want? Anything from your current kitchen you're escaping?"*
- Often the most useful field — strong signal at low cost.

### 10.4 How they cook / live in the kitchen

- **Primary prompt:** *"How do you actually use the kitchen? Big cook? Lots of entertaining? Kids doing homework at the island?"*
- Free-text; AI surfaces relevant tags (e.g., entertaining → seating, prep zones; baking → pan drawers, mixer lift; multi-cook household → second sink, two ovens).

### 10.5 Decision confidence map

- **Primary prompt:** *"Of everything we've talked about, what feels locked in and what's still up for grabs?"*
- **Mini-form:** Per major category (style, materials, appliances, layout, scope) — `Locked` / `Flexible` / `Undecided`.
- **Cost-model role:** Undecided items widen the estimate band. Locked items tighten it. If the estimate is shown to the homeowner, the UI can visually convey which inputs are pinning the range.
- **Maker-side surfacing:** Designer immediately knows where to push and where to leave alone on follow-up.

---

## 11. Logistics & Site Access

⚠️ *Affects install cost and timeline. Often forgotten until install day surprises.*

### 11.1 Site access

- **Primary prompt:** *"How easy is it to get into the kitchen? Apartment? Stairs? Lift?"*
- **Mini-form:** `Ground floor, easy access` / `Upper floor with lift` / `Upper floor, stairs only` / `Listed building / restricted access` / `Other`.
- **Branches:**
  - Stairs-only + tall larder cabinets → may need on-site assembly (cost up).
  - Listed building → flag for designer; sometimes drives material choices.
- **Cost-model role:** Difficult access can add 5–15% to install.

### 11.2 Living in it during the build

- **Primary prompt:** *"Will you be living in the home during the build? If so, do you have a plan for cooking?"*
- **Branches:**
  - *Living in, no temp kitchen* → most common; designer may suggest a sink station + microwave setup.
  - *Living in, want a temp kitchen set up* → adds cost.
  - *Moving out* → simpler logistics; potentially faster build.
- **Cost-model role:** Small to medium impact on cost; bigger impact on timeline.

### 11.3 Timeline phasing

- **Primary prompt:** *"Does it all need to happen at once, or can it be phased?"*
- Usually all-at-once for kitchens; capture if it's anything else.

### 11.4 Building rules / permits

- **Primary prompt:** *"Anything we need to clear with a building manager, HOA, or local council?"*
- Flag for designer; rarely affects cost directly but can affect timeline significantly.

---

## 12. Handoff & Contact

### 12.1 Contact details

- **Primary prompt:** *"How should your maker reach you?"*
- **Mini-form:** Name, email (required), phone (optional), preferred channel (email / phone / SMS / in-app).

### 12.2 Best time to be reached

- Optional. Captured as free text or weekday/time-of-day bands.

### 12.3 Anything else?

- **Primary prompt:** *"Anything I haven't asked about that your maker should know?"*
- Catch-all; often surfaces lifestyle context, accessibility needs, pet considerations, allergies (e.g., latex-free finishes), etc.

---

## Cross-cutting rules

These apply to every section:

1. **Every field carries confidence + provenance.** `H/M/L` and `stated | inferred-from-photo | inferred-from-references | inferred-from-default`. Surfaced to the maker (Principle 6, Pattern E).
2. **"I don't know" is always a first-class answer.** Never punish, never re-prompt. Mark low confidence and move on (Principle 7).
3. **The chat confirms before assuming.** AI infers → states the inference → asks for confirmation. Never silently assigns a value.
4. **The estimate is a range, not a number — and the designer always has the final word.** The cost model produces a band (typically ±20% when intake is complete; wider when key categories are missing). If shown to the homeowner, framing is always: *"This is a rough range based on what you've told me. Your maker will follow up to refine into a final quote."* The system never produces a single-figure quote and never commits the designer to a number. *Whether to surface the estimate to the homeowner at all is a positioning decision currently being worked through (see open questions).*
5. **Multimodal in, structured out.** Photos and links are interpreted; the brief and the cost model are the only outputs (Principle 2).
6. **Conversation length target:** 8–15 turns, ~7–10 minutes. Longer than the original 6–12 because the cost-model alignment categories add weight. If the homeowner is engaged, can extend; if disengaging, prioritise the *Outputs-ready threshold* fields and submit (see below).

---

## Outputs-ready threshold

Both outputs — the spec for the designer and the ±20% estimate — require this floor of fields. Below this threshold, the brief is held back and the homeowner is invited to continue later.

**Spec-ready (minimum to surface to designer):**
- Decision-maker (1.1)
- Timeline (1.2)
- Location (1.3)
- Budget band (1.4)
- Scope of work (2.1)
- Layout (3.1) + at least rough dimensions or a usable photo (3.2)
- Style direction — at minimum a style family or 2+ reference images (5.1)
- Appliance keep-vs-new stance (6.1)
- Contact details (12.1)

**Additional fields needed to hit ±20% on the estimate:**
- Scope of work full breakdown (2.1) — the single biggest variance source
- Demolition + install scope (2.2 + 2.3)
- Structural changes wanted (3.5)
- Plumbing / electrical / ventilation impact (4.1, 4.2, 4.4) — even at low confidence is fine
- Cabinet construction style + material tier (7.2 + 5.2)
- Worktop material tier (5.2)
- Appliance tier per item (6.3)
- Lighting scope (8.1)
- Site access (11.1)

If cost-model fields are missing or low-confidence, the estimate band widens (e.g., ±35% instead of ±20%) and the brief flags this to the designer. The spec is still produced — only the estimate is degraded.

---

## Open questions for this catalog

1. **Whether to show the estimate to the homeowner at all.** The cost model can run silently — surfacing only to the designer (who then communicates the number on follow-up) — or it can be shown to the homeowner with the ±20% framing. Both are technically supported. This is a positioning decision still being worked through and is currently in tension with `product-foundations.md` Principle 6 ("never AI-priced quotes") and the red-line table entry on "AI-priced quotes." Either the foundations doc relaxes that line (carving out estimate-as-range from quote-as-number), or the estimate stays internal to the designer and the homeowner-facing value prop becomes "your designer will come back with a real number, fast."
2. **Order of topics.** Conversational order should probably lead with style/vibe (lowest cognitive load) before pivoting to logistics (budget, scope of work, dimensions). Validate with first 50 design-partner conversations.
3. **How aggressively to push for dimensions.** Quote accuracy depends on it, but it's also the highest-friction question. Test photo-only-with-AI-estimate vs always-ask.
4. **Trade vocabulary introduction.** Inset vs overlay, integrated appliances, etc. — when to use the trade term vs the plain-language paraphrase. Likely: paraphrase first, term in parens.
5. **How to handle multi-room projects.** Homeowner says "kitchen plus utility room plus pantry." MVP scope is kitchens; do we expand the brief to cover adjacent rooms, or split into multiple briefs? Probably split, but needs UX validation.
6. **Per-maker customisation.** Should a maker be able to add/remove topics from the catalog (e.g., a maker who only does inset Shaker can collapse 5.1 + 7.2)? Phase 2 at earliest; MVP is one ontology for all makers.
7. **Regional cost-model accuracy.** ±20% requires regional rate data (NYC vs Manchester vs Cleveland). Data source TBD — maker-provided rate cards, scraped industry data, or a hybrid. This is a Phase-1 engineering question, not just a data one.
8. **Defining "±20%" operationally.** ±20% on what? Total project cost? Per-line? Measured how (back-tested against final invoices)? The number is great in conversation but needs an internal definition the model can be tuned against.
