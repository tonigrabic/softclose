# Product Foundations: AI Proposal Builder for Custom Kitchen Makers

*Generated: 2026-05-01 | Revised: 2026-05-01 to add a second output (cost-range estimate) alongside the brief | Translates positioning research into product & engineering direction*

This document is the bridge from positioning to product. It distills what the customer-intelligence, alternative-mapping, and trend research uncovered into design principles, a mental model, a schema sketch, UX patterns, and an MVP scope. It is meant as a starting point for engineering and design — not the final spec.

**On the revision:** the original document framed the product as producing a single output — the brief. The product now produces **two** outputs: the brief (for the maker) and a confidence-bounded cost range (typically ±20%, internally generated, optionally surfaced to the homeowner with strict framing). This shifts Principle 6 and the "AI-priced quotes" red line meaningfully — see those sections for the carved-out language. The intake conversation that feeds both outputs is documented in `intake-catalog.md`.

For the *why* behind each decision, see `positioning-doc.md` and `competitive-alternatives.md`.

---

## North Star

> **From a homeowner's first conversation, the product produces two artifacts: a maker-quotable structured brief and a confidence-bounded cost range — speaking to the homeowner in plain language and to the maker in trade language, on the maker's branded site.**

If a feature does not contribute to that sentence, it is out of scope at MVP. The brief always ships when intake clears the spec-ready threshold; the cost range ships when intake also clears the cost-model threshold (see `intake-catalog.md` § Outputs-ready threshold).

---

## Design Principles

Eight principles, each grounded in a specific research finding. These are non-negotiable trade-offs the team should reach for when an engineering or design decision is unclear.

### 1. The artifacts ARE the product

The brief the maker receives — and the cost range that arrives alongside it — are what the maker pays for. The chat is the *means*, not the end. Backwards-engineer everything from "what does the maker need to receive in their inbox to immediately quote?" and "what does the homeowner need to feel oriented enough to commit to a follow-up call?"

> *Why:* Configurators produce CAD; Pinterest produces images; forms produce strings; ChatGPT produces prose. *Nobody produces a quote-ready brief paired with an honest cost range.* That gap is the wedge — and it only stays a wedge if the brief is genuinely quotable on arrival and the range is genuinely honest about its bounds.

### 2. Multimodal in, structured out — plus one anchored render

The conversation accepts photos, Pinterest links, sketches, AI-generated moodboards, screenshots — as input. The product also produces ONE specific kind of render: an **img2img concept anchored to the homeowner's actual space photo**, framed explicitly as concept (not commitment), tied to a structured brief + cost range that goes to a real maker. This is distinct from standalone "wonky AI" kitchen renders — ours is grounded in the real space, embedded in a brief, and clearly disclosed as AI-generated. Every render carries a `conceptOnly: true` flag in the handoff and stores its prompt + chip nudges so the maker can see what shaped it.

> *Why:* Homeowners arrive with vibes (Pinterest is the universal opener — *"I have a Pinterest board"* is verbatim across every research source). Image generation has commoditized (GPT-5.5/Gemini 3/Claude 4.7 all 81–83% MMMU-Pro April 2026); the "wonky AI" cluster (cabinets floating, proportions off) is a category-killer narrative *for renders that exist in isolation*. We avoid that cluster by anchoring to the real space, framing as concept, and tying every render back to a brief a real maker quotes against. The render is a feature of the brief, not a substitute for it.

### 3. Conversation first, forms second — but use both

Pure chat loses precision on dimensions and budget. Pure forms lose 67% of users past 7 fields. The right pattern is *conversational orchestration* with *embedded structured input* when precision matters (dimensions, budget bands, must-haves checklist, decision-maker info).

> *Why:* Customer-confirmed in our intake — *"forms inside a conversation but conversation first."* Validates the research finding from the Formstack 2025 study via Brixon.

### 4. Two surfaces, one source of truth

The homeowner sees a friendly chat (jargon-free, calming, anxiety-reducing). The maker sees a trade-grade dashboard with the structured spec, confidence scores, and source links back to the conversation. Same brief, two skins. The translation layer between the two is the IP.

> *Why:* "Ghosted" is shared vocabulary on both sides. Houzz mediates the marketplace; generic AI render tools speak only to consumers and stop there; CAD speaks only to designers. We hold all three: a space-anchored concept render (homeowner-facing), a structured brief + cost range (both surfaces), and a maker-tuned spec ontology (designer-facing). Our render is a feature of the brief, not a substitute for it — that's the dual-tone differentiator.

### 5. The spec ontology is the moat — build it like a database product, not a chat product

Cabinet-trade vocabulary (inset vs. overlay, Shaker vs. slab, Blum vs. Hafele tier, soft-close, integrated appliances, plinth/cornice, joinery details), validation rules, branching logic, and the *vibes-→-spec mapping* are the IP that doesn't commoditize. GPT-5.5 is a commodity; your ontology is not.

> *Why:* Generic chatbots (Tidio, Drift, Avoca, LeadTruffle) are *vertical-blind* — they don't know to ask "Inset or overlay? Solid wood or veneer? Quartzite or quartz?" The vertical specificity is what protects you from horizontal AI receptionists encroaching from HVAC/plumbing.

### 6. Confidence-graded fields and ranges, never single-number quotes

Every field in the brief carries a confidence score (High / Medium / Low) and a provenance trail (homeowner stated / AI inferred from photo / AI inferred from references). The maker decides what to trust. The AI may also produce a **cost range** (typically ±20% when intake is complete; wider when key categories are sparse) — but it never produces a single-number quote, never one the maker is committed to, and never one without the explicit "your maker will follow up to refine this into a final quote" framing. The maker always has the final word; the range is a starting point for their follow-up, not a substitute for it.

> *Why:* *"A contractor committed to transparency can generate an accurate quote for your job. An AI chatbot cannot."* [Spokesman 2026]. 18% of consumers trust AI to take action; 68% worry about misleading advice. The line between a hallucinated quote (trust-killer) and a confidence-bounded estimate (decision-enabler) is *uncommitted, ranged, and explicitly handed off to a human*. We work strictly on the right side of that line. One pretend-precise number kills trust in a $50k purchase; an honest range with assumptions on the table builds it.

> *Open positioning question:* whether the cost range is surfaced to the homeowner at all, or stays internal to the maker who delivers the number on follow-up, is still being worked through. The cost-model engine is built either way — the carve-out above governs only what is technically permitted, not what the product chooses to show. See § Open Questions Q9.

### 7. Anxiety reduction beats generation

The homeowner UX should be calming, not flashy. *"Reduced my stress level"* (Sweeten verbatim) is the emotional outcome they pay for. No countdown timers, no urgency dark patterns, no "your dream kitchen in 60 seconds." Slow, friendly, grounded.

> *Why:* The Modsy gravestone is right there. Pure-consumer e-design failed when output looked nothing like reality and the experience felt rushed. The homeowner's emotional job is *anxiety reduction*; the product that delivers it wins.

### 8. End the ghosting — both ways, every time

Every conversation has a clear next step. Homeowner always knows: "Your maker will review this and respond by X." Maker always knows: "Brief from Y is ready; here's what's missing." Both sides see status; nobody is left hanging.

> *Why:* "Ghosted" is the shared emotional vocabulary on both sides. The product's tagline angle ("end the ghosting") is hollow if the UX itself recreates ghosting. Status visibility is a P0 design constraint.

---

## Mental Model — Five Core Concepts

### The Brief
The structured artifact the maker receives. Production-ready spec the maker can quote against. Maker-grade language. Includes:

- **Project meta** (location, timeline, decision-maker, budget band, priorities)
- **Scope of work** (what's IN — cabinets, worktops, appliances, flooring, walls, lighting, plumbing relocation, electrical, structural, demo, install)
- **Space spec** (room dimensions, layout type, existing constraints, structural changes wanted)
- **Style direction** (style family, materials with tier, hardware tier, references)
- **Functional requirements** (appliances, integrated/freestanding, must-haves, deal-breakers)
- **Trades & utilities** (plumbing changes, electrical changes, gas, ventilation, HVAC implications)
- **Lighting** (task / ambient / accent layers)
- **Logistics** (site access, living-in-during-build, phasing, permits)
- **Decision confidence map** (which categories are locked / flexible / undecided)
- **References** (uploaded photos, Pinterest links, AI moodboards) with relevance tags
- **Confidence map** (per-field confidence + provenance)
- **Conversation snapshot** (the relevant homeowner turns the maker can review)

### The Cost Model
The internal engine that turns the brief into a confidence-bounded cost range (typically ±20% when intake is complete). Has its own data dependencies — regional labour rates, material price tiers, trade-cost estimates — separate from the conversation engine. The cost model is the **second** product output; the brief is the **first**. They are produced together; either can ship without the other (the brief always ships if it clears the spec-ready threshold; the estimate is suppressed or widened if cost-model fields are too sparse). Whether its output is shown to the homeowner is a positioning decision (see Principle 6 and Open Questions); the engine is built regardless because the maker uses the estimate for prep even when the homeowner doesn't see it.

### The Spec Ontology
The kitchen-trade vocabulary, branching logic, and validation rules. Maintained like a versioned database. The conversation engine consults it; the brief is generated through it; the cost model maps from it to price categories. The ontology is what survives when GPT-X gets replaced by GPT-X+1.

### The Two Surfaces
The homeowner-facing chat (friendly, jargon-free, multimodal-friendly). The maker-facing dashboard (trade language, confidence-graded, integration-ready, includes the cost-model output and the assumptions behind it). Both read from the same brief object; the maker dashboard additionally consumes the cost-model output.

### The Trust Scaffold
A handful of UX patterns that pre-empt the AI-skepticism objections — visible AI disclosure, mandatory maker review, "estimate range, not a quote" disclaimer (when the range is shown to the homeowner), EU AI Act Article 50 compliance posture, GDPR-ready data handling. Hygiene, not differentiator. Built in, never marketed on.

---

## The Brief — Schema Sketch

Engineering should treat this as a *starting* schema, not a final one. Each field needs validation logic and (where applicable) a question-flow generator entry.

```yaml
brief:
  id: uuid
  created_at: timestamp
  status: draft | submitted | maker-reviewing | clarification-requested | ready-to-quote | quoted | declined
  language: en-US | en-GB | de-DE | it-IT | ...

  homeowner:
    name: string
    contact:
      email: string
      phone: string (optional)
      preferred_channel: email | phone | sms | in-app
    decision_maker:
      sole | joint | needs_consultation
    location:
      country: string
      city: string
      postal_code: string (for delivery feasibility)
    timeline:
      target_install_window: enum [<3mo, 3-6mo, 6-12mo, >12mo, unknown]
      hard_deadline: date (optional, e.g., "before Christmas")
    confidence: { value: H|M|L, source: stated|inferred }

  budget:
    band: enum [<25k, 25-50k, 50-80k, 80-120k, 120k+]
    currency: ISO_4217
    flexibility: enum [firm, +/-10%, +/-25%, exploring]
    priorities:
      flex_categories: list[enum]   # where they'd cut if needed
      invest_categories: list[enum] # where they'd spend extra
    confidence: { value: H|M|L, source: stated|inferred|range_from_references }

  scope:
    cabinets: included | excluded
    worktops: included | excluded
    sink_taps: included | excluded
    appliances_supply: included | excluded | partial
    flooring: included | excluded
    walls: included | excluded
    ceiling: included | excluded
    lighting: included | excluded
    plumbing_relocation: included | excluded
    electrical_work: included | excluded
    structural: included | excluded
    demolition_disposal: included | excluded | self
    installation: included | excluded | self
    notes: free_text
    confidence: { value: H|M|L, source: stated|inferred }

  space:
    type: kitchen | wardrobe | built-in | bathroom-vanity | other
    layout:
      shape: galley | L-shape | U-shape | island | peninsula | open | unsure
      island: present | considering | none
    dimensions:
      length_mm: number
      width_mm: number
      ceiling_height_mm: number
      measurement_method: enum [self-measured, professional-measured, AI-estimated-from-photo, unknown]
    constraints:
      load_bearing_walls: list[wall_id]
      windows: list[{wall, dimensions, sill_height}]
      doors: list[{wall, swing}]
      utilities: { gas, water, electrical_panel_location, vent_path }
      structural_notes: string
    structural_changes_wanted:
      wall_removal: yes | no | maybe
      wall_load_bearing: yes | no | unknown
      soffit_removal: yes | no | maybe
      window_changes: yes | no | maybe
      door_changes: yes | no | maybe
      notes: string
    existing_state: photo_set + transcript

  trades:
    plumbing:
      sink_position: same | moved_short | moved_long | second_sink | unsure
      notes: string
    electrical:
      cooker_type: gas | electric | induction | unsure
      panel_proximity_m: number | unsure
      new_circuits_needed: list[string]
      notes: string
    gas: adding | removing | retaining | none | unsure
    ventilation:
      current_path: external_wall | external_roof | recirculating | none | unsure
      desired_path: same | external_wall | external_roof | recirculating | unsure
      feasibility_flag: ok | needs_check | blocker
    hvac:
      notes: string

  lighting:
    task_layer: keep | new_planned | new_designer_choice | not_in_scope
    ambient_layer: keep | new_planned | new_designer_choice | not_in_scope
    accent_layer: keep | new_planned | new_designer_choice | not_in_scope
    smart_controls: yes | no | flexible
    notes: string

  logistics:
    site_access: ground_floor | upper_with_lift | upper_stairs_only | listed_restricted | other
    living_during_build: yes_no_temp | yes_with_temp | moving_out
    phasing: all_at_once | phased
    permits: none | hoa | building_manager | council | unsure

  decision_confidence:
    style: locked | flexible | undecided
    materials: locked | flexible | undecided
    appliances: locked | flexible | undecided
    layout: locked | flexible | undecided
    scope: locked | flexible | undecided

  style:
    style_family: enum [shaker, slab, raised_panel, contemporary_handleless, transitional, traditional, mediterranean, scandi, japandi, industrial, other]
    color_direction: list[color_token + free_text]
    material_preferences:
      door_face: solid_wood | veneer | thermofoil | painted_mdf | melamine | unsure
      worktop: quartz | quartzite | granite | marble | solid_wood | sintered_stone | laminate | unsure
      backsplash: tile | slab | painted | unsure
    hardware_tier: budget | mid | premium | unsure
    finish_preferences: list[finish_token]
    references:
      pinterest_links: list[url]
      uploaded_images: list[image_id + ai_description + tags]
      ai_moodboards: list[moodboard_id]
    confidence: { value: H|M|L, source: stated|inferred }

  functional:
    appliances:
      - type: hob | oven | extractor | fridge | dishwasher | microwave | wine_cooler | other
        integrated: yes | no | flexible
        spec_notes: string
        existing | new | not_decided
    cabinetry:
      drawer_count_estimate: number
      pantry: yes | no | maybe
      island_seating: yes | no | maybe
      open_shelving: yes | no | accent
    soft_close: yes | no | flexible
    must_haves: list[free_text]
    nice_to_haves: list[free_text]
    deal_breakers: list[free_text]

  references:
    pinterest: { board_url, ai_extracted_themes }
    photos: list[{ image_id, ai_description, ai_tags, homeowner_caption }]
    ai_renders_received: list[{ source, image_id }]                  # third-party renders the homeowner uploaded as input
    ai_renders_generated: list[{                                       # our concept renders, with provenance
      id,
      image_id,
      prompt_summary,
      anchor_photo_id,
      nudges: list[string],
      generated_at,
    }]
    ai_render_chosen_id: string                                       # the one the homeowner approved; surfaces in the brief preview + handoff

  conversation:
    transcript: list[turn]  # for maker review
    duration_minutes: number
    completion: enum [completed, abandoned-with-partial-data, in-progress]
    drop_off_point: string (if abandoned)

  ai:
    disclosure_shown: timestamp
    model_version: string
    inference_log: list[{ field, source, confidence, model_call_id }]

  cost_model_output:
    estimate_low: number
    estimate_high: number
    currency: ISO_4217
    band_width_pct: number              # e.g. 20 means ±20%
    breakdown:
      cabinets: { low, high }
      worktops: { low, high }
      appliances: { low, high }
      installation: { low, high }
      trades: { low, high }
      structural: { low, high }
      lighting: { low, high }
      contingency: { low, high }
    assumptions: list[string]           # e.g. "existing flooring stays"
    sensitivities: list[{ category, swing_low, swing_high, reason }]
    confidence_overall: H | M | L
    surfaced_to_homeowner: yes | no
    generated_at: timestamp
    model_version: string
```

The schema serves four jobs at once: it's the maker's quoting tool input, the conversation engine's progress tracker, the trust-scaffold provenance log, and the input to the cost model. **Confidence + provenance per field** is what lets the maker trust the brief without re-doing the discovery call. **The cost model output sits separately** so it can be suppressed without affecting the brief, and so its assumptions and sensitivities are first-class fields the maker can review.

---

## Core UX Patterns

### Pattern A — The Multimodal Opener

Default first homeowner interaction: *"Tell me what you have so far. You can describe it, share Pinterest links, or drop in photos."*

- Accepts: free text, image upload (drag/drop or paste), URL paste (auto-fetch Pinterest boards, Houzz idea books, Instagram saves where allowed), AI-generated moodboard imports.
- The AI summarises what it understood and asks one clarifying question. Never assumes.
- Sets the tone: "I'm helping you think, not judging your taste."

### Pattern B — Branching with structured collection

When the conversation reaches a precision-required field (dimensions, budget, timeline), the chat presents an embedded mini-form:

> *Got it — the layout sounds like an L-shape with an island. To pass this to your maker, can you give me a rough sense of the space?*
>
> [Embedded form: length / width / ceiling height / "I don't know" toggle]

Mini-forms keep precision without breaking conversational flow. The "I don't know" toggle is critical — never punish the homeowner for not knowing.

### Pattern C — The handoff preview

Before the homeowner submits, they see a homeowner-facing summary of the brief — and, if the positioning decision lands on "show the estimate," the cost range immediately after (see Pattern H):

> *Here's what I'll send to your maker. Anything I got wrong?*

This:
- Reduces "ghosted by my own brief" anxiety
- Catches misinterpretations before they reach the maker
- Sets expectations ("brief, not quote" — and if the range is shown, "range, not quote")
- Builds trust in the handoff

### Pattern D — Maker review loop

The maker sees the brief in their dashboard with:
- A confidence map (which fields are H/M/L)
- A "request clarification" action (sends a follow-up question to the homeowner without leaving the platform)
- A "this is quote-ready" action (moves to their CAD/CRM/quoting flow)
- A "decline politely" action (canned, branded, never silent)

The maker can never "do nothing." Decline is an action, not a default. **This is the design principle that ends ghosting.**

### Pattern E — The confidence-graded brief

Every field in the maker view shows:
- Value
- Confidence (H/M/L) as a small badge
- Hover/click for provenance ("Homeowner said this in turn 7" / "AI inferred from uploaded photo")

This pattern lets the maker decide what to verify on the first call instead of re-doing the whole interview.

### Pattern F — The "always know what's next" status bar

Both surfaces show a persistent status of the brief. Homeowner sees: "Submitted to your maker. They typically respond within 24 hours." Maker sees: "Awaiting your review for 6 hours." Nobody is ever in limbo.

### Pattern G — The trust scaffold (visible, every conversation)

- AI disclosure on every conversation start: *"You're chatting with an AI assistant. Your maker will personally review what we discuss."*
- Persistent footer: *"Privacy & how this works"* link
- Every output sent to the maker is labeled "AI-assisted brief, draft for review" — never "AI-approved" or "AI-generated."
- If a cost range is surfaced to the homeowner, it carries the same scaffold: *"This is a rough range based on what you've shared. Your maker will follow up to refine into a final quote."*
- Compliance posture: EU AI Act Article 50 disclosure, GDPR data export, EU data residency option, no third-party data sharing without explicit opt-in.

### Pattern H — The estimate range (conditional on the positioning decision)

*This pattern only ships if the positioning question — "do we show the homeowner a number?" — lands on yes. The cost-model engine is built either way; this pattern governs only the homeowner surface.*

If surfaced, the cost range appears at the end of the conversation, after the handoff preview, with strict framing rules:

- **Always a range, never a single number.** "$48k–$62k", never "$55k". The width of the range is itself a signal.
- **Always with explicit assumptions surfaced underneath.** "Based on: existing flooring stays, sink stays in current location, no wall removal, mid-tier hardware." Each assumption that flips on the maker call moves the range.
- **Always with a breakdown.** Cabinets / worktops / appliances / installation / trades / structural / lighting / contingency, each as a sub-range. Black-box numbers are the thing makers fear; transparent ones are something they can argue with line-by-line.
- **Always with the handoff promise.** "Your maker will follow up to refine this into a final quote, typically within 24 hours."
- **Visually distinct from the brief itself.** This is the AI's estimate; the brief is what the maker will work from. Not the same thing.
- **Always opt-out-able.** The user can request the brief without seeing the range. Some homeowners genuinely don't want a number until the maker says it.
- **Never repeated as a smaller range.** If a homeowner asks "but what would it actually be?", the AI declines and points to the maker call. Pretend-precision is the failure mode.

---

## MVP Scope (first 6 months — to ship before the 12–18-month window closes)

### MVP must-haves

- **Embeddable widget** (script tag, iframe fallback) with maker-customizable theme (logo, primary color, copy snippets)
- **Multimodal opener** (text + image + URL paste)
- **Conversation engine** with the spec ontology v1.0 (kitchens only at MVP), covering the full intake catalog including scope of work, trades, structural changes, lighting, and logistics
- **Embedded mini-forms** for dimensions, budget band, timeline, scope-of-work checklist, structural changes, site access
- **Brief generation** with confidence scoring per field
- **Cost model engine v1** — converts the brief into a confidence-bounded range (target ±20% with full intake; widens automatically when intake is sparse). Includes regional rate data for at least the launch market, per-category breakdown, explicit assumptions and sensitivities. Always exposed to the maker; surfaced to the homeowner only if the positioning question lands on yes (Pattern H)
- **Maker dashboard** with brief review, **cost-model output and assumptions side-by-side with the homeowner-stated budget**, request-clarification, mark-quote-ready, decline-with-canned-message
- **Email handoff** (maker receives a notification with brief preview link, including the cost-model output)
- **Brief export** as PDF (maker-branded) and structured JSON, including cost-model output
- **AI disclosure** + **GDPR data export** + **EU AI Act Article 50 compliance**

### MVP should-haves (ship if budget allows; otherwise weeks 1–10 of post-launch)

- **Houzz Pro CRM integration** — push the brief into Houzz Pro lead pipeline. *Highest-leverage integration; this is the moat that makes Houzz Pro a partner, not a competitor.*
- **Builder Prime integration** — cabinet-shop CRM specifically, mid-market US bespoke shops
- **Pinterest board auto-import** — the homeowner pastes a board URL; AI extracts themes and key images

### Phase 2 (post-MVP, 6–12 months)

- **2020 DesignFLEX / Cyncly export** — write brief into 2020-compatible format. Major moat once shipped; non-trivial engineering.
- **Voice fallback** — homeowner can call in and the AI runs the same flow over phone. (Note: many makers' inbound *is* a phone call. Skipping voice forever locks out a real segment.)
- **Other vertical ontologies** — wardrobes, built-ins, vanities. Same conversational engine; different ontology v1.0 fork.
- **Multi-language** — UK English (terminology differs: "fitted kitchen" not "remodel"); Italian, German, French as separate ontology+UX work, not translation.
- **Conversation templates** for common project types
- **Maker analytics dashboard** — conversion rates, time-saved, brief quality

### Phase 3 (12–24 months — Series-A-funded territory)

- **Homeowner-direct destination** with maker-matching (the marketplace expansion the founder explicitly committed to as Phase 2). Only ship after the B2B SaaS revenue is healthy and the maker network is large enough to provide marketplace liquidity.
- **JobTread, Buildertrend, native QuickBooks integrations**
- **CAD round-trip** — receive a 2020 CAD output from the maker and use it to refine subsequent briefs (closed-loop learning)
- **Spec-ontology API** — open the ontology to third-party integrators

---

## What NOT to Build (red lines)

These are research-grounded "don't even start" items.

| Don't build | Why |
|---|---|
| **Standalone AI kitchen renders disconnected from real space + brief** | The "wonky AI" content cluster (Decor Cabinets, Prefinished Cabinets, etc.) targets renders that exist in isolation — proportions off, cabinets floating, no relationship to a real space or buildable spec. We avoid that cluster by anchoring every render to the homeowner's actual space photo, explicitly framing it as concept (not commitment), capping iterations at 5/session, and tying it to a structured brief + cost range that goes to a real maker. The render is one feature of the brief, with its own `conceptOnly: true` flag so the maker treats it as homeowner direction, not binding spec. See Principle 2. |
| **AI-committed single-number quotes** | *"A contractor committed to transparency can generate an accurate quote for your job. An AI chatbot cannot."* [Spokesman 2026]. The AI may produce a confidence-bounded **range** (see Principle 6 and the Cost Model concept), but never a single-number quote, never one the maker is committed to, and never one without the explicit "your maker will follow up to refine this" framing. The brief itself never contains a number — the cost range is a separate output with its own assumptions, sensitivities, and surfacing rules. |
| **A homeowner-direct destination at launch** | Modsy raised $72M and died in 18 months trying this. The homeowner uses *the maker's* embedded chat. Phase-3 territory. |
| **A marketplace at launch** | Capital-intensive; Sweeten/Block/Houzz already there with deep moats. Phase-3 territory. |
| **A CAD tool / 3D renderer** | Cyncly, 2020 DesignFLEX, ProKitchen own this. We feed them, we don't replace them. |
| **A general-purpose AI receptionist** | Avoca AI, LeadTruffle, ApexChat, AnswerForce already there. Vertical specificity is our moat — going horizontal kills it. |
| **A generic "build any furniture" intake at launch** | The kitchen vertical alone is enough TAM; broad ontology = shallow ontology. Wardrobes/built-ins/vanities come in Phase 2 as ontology forks, not at launch. |
| **A 30-question form** | >67% abandon at 7+ fields. The conversational engine plus embedded mini-forms is non-negotiable. |
| **Urgency/dark-pattern UX** | Anxiety reduction is the emotional value theme. Countdown timers, "Limited slots!" framing, etc. are off-strategy. |
| **Fake testimonials / placeholder social proof** | Universal across positioning research: real quotes earn trust; fake ones obliterate it. Ship without testimonials until you have real ones. |

---

## Integration Roadmap (priority order)

| # | Integration | Why this priority |
|---|---|---|
| 1 | **Houzz Pro CRM** | Highest-leverage moat. Houzz Pro is the most likely incumbent to ship competing intake; if you're already integrated, you become a partner instead of a target. |
| 2 | **Email + Webhooks** (generic) | Universal compatibility; lowest engineering lift |
| 3 | **Builder Prime** | Cabinet-shop CRM specifically; sweet-spot ICP |
| 4 | **Zapier / Make** bridge | Buys time on broader integrations without building each one |
| 5 | **2020 DesignFLEX export** | Major moat in EU/NA kitchen studio market; long engineering tail |
| 6 | **JobTread / Buildertrend** | Mid-market remodelers — adjacent, not core ICP, but expand reach |
| 7 | **HubSpot / QuickBooks** | Operational tooling; useful but not differentiating |
| 8 | **Mozaik / Cabinet Vision** | Production-side; phase 2/3 territory |

The integration moat is what survives when Cyncly or Houzz Pro ships their own intake feature in Q4 2027. **Treat integrations as P0 product, not P3 plumbing.**

---

## Compliance & Trust Requirements (table-stakes, not features)

- **EU AI Act Article 50 disclosure** — visible "you're talking to an AI" on every conversation start (effective Aug 2026)
- **GDPR posture** — data export, deletion, processing-purpose disclosure, EU data residency option (especially for DE / FR / IT / NL)
- **AI-content marking** for any output sent to the homeowner — including the cost range when surfaced and the concept render (visible "AI concept" badge in the UI; `conceptOnly: true` flag in the handoff with prompt + chip nudges so the maker can see what shaped the render)
- **No autonomous actions** — the AI never books, never commits the maker to a number, never produces a single-figure quote. A range with assumptions is permitted; a quote is not. The concept render is anchored to the homeowner's actual space photo and capped at 5 generations per session.
- **Audit log** — every AI inference and every cost-model run logged with model version, inputs, output, assumptions, confidence; needed for both EU compliance and internal quality work (especially for back-testing the ±20% claim)
- **Rate limit + abuse protection** — prevent the chat from being used as a generic GPT wrapper
- **PII separation** — homeowner identifying info partitioned from conversation content for GDPR right-to-erasure

These are hygiene. They don't appear in marketing copy. They appear in the architecture.

---

## Open Questions for Engineering / Design Leads

These are things research couldn't fully answer. Resolving them is part of the first 30 days of product work.

1. **What's the right model + cost structure?** GPT-5.5 / Claude 4.7 / Gemini 3 are all functionally capable. Choice depends on per-conversation cost target, latency requirement, and whether you want to fine-tune on the spec ontology. Likely answer: GPT-5.5 default + structured-output mode + ontology in system prompt; revisit at 1k conversations/month.
2. **Conversation length target?** Research suggests homeowners abandon at 7+ form fields. What's the equivalent for adaptive conversations? Hypothesis: 6–12 turns, ~5–7 minutes. Validate with first 50 design-partner conversations.
3. **Brief minimum-viable threshold?** What's the minimum field-coverage at which the brief is "submittable" to a maker? Probably budget band + timeline + dimensions + style direction + must-haves are the floor. Less than that = don't surface to the maker; flag homeowner for follow-up.
4. **Maker review SLA?** What's the default "we expect a response within X" the system commits to on the homeowner's behalf? 24 hours is the conservative baseline; some makers will want 48; some will want instant. Make it a maker-config setting with a sensible default.
5. **Pinterest API / scraping legality?** Pinterest's API and ToS evolve. Plan for a fallback (manual paste of board contents) if board-import becomes legally fraught.
6. **EU launch sequence?** UK/IE first (English, smaller bespoke joinery culture, less Cyncly saturation), then NL/BE (English-friendly, mid-market) — the user has a real interested party in EU. Whichever country that party is in becomes the launch market by default.
7. **Onboarding model for makers?** Self-serve sign-up + Stripe + auto-embed code, or sales-led with implementation help? Custom cabinet shops are slow software adopters (60–120 day cycle); a self-serve free trial with a guided embed-and-test flow probably wins. White-glove for first 10 design partners.
8. **Pricing model (subscription vs per-brief vs hybrid)?** Recommended in `messaging-implications.md`; needs validation with actual willingness-to-pay calls.
9. **Surface the cost range to the homeowner — yes or no?** The cost-model engine is built either way; this question is about Pattern H. Showing it: stronger user-facing value prop ("know what you can afford in 10 minutes") and stronger lead qualification (homeowners self-filter on budget); higher trust risk if the maker's eventual quote sits outside the band. Hiding it: safer, the maker controls the number conversation; weaker homeowner-facing value (closer to a sophisticated lead form). Likely answer is configurable per-maker with a sensible default, but the default is the real decision. Validate with first 10 design-partner makers and first 50 homeowner conversations.
10. **Regional cost-model data source.** ±20% requires regional rate data (NYC vs Manchester vs Cleveland). Three plausible paths: maker-provided rate cards (low effort, narrow coverage), licensed/scraped industry data (high effort, broad coverage), hybrid (most realistic). This is a Phase-1 blocker for the cost-model engine, not a Phase-2 polish.
11. **Operational definition of "±20%."** ±20% on the total project? Per line? Measured how — back-tested against final invoices, against the maker's first quote, against actuals at handover? Without an internal definition the model can't be tuned and the marketing claim can't be defended. Likely answer: ±20% on the total, measured against the maker's first formal quote (not the final invoice), with a published back-test methodology.
12. **What the cost model does about scope it can't see.** When the homeowner says "and probably the dining room ceiling needs redoing too" — does the model widen the band to absorb it, or carve out an "out of scope" line and price only what it sees? Probably the latter, but needs a clear UX for surfacing the carve-out.

---

## Definition of Done — for MVP

The MVP is "done" when a maker can:

1. Sign up, embed the chat on their website with one line of code (or via Houzz Pro CRM connection), and customize basic branding inside 15 minutes.
2. Receive a first brief from a real homeowner inquiry within 24 hours of going live.
3. Read the brief in their dashboard — including the cost-model output, its breakdown, and its assumptions — and decide *quote-ready / clarify / decline* in under 5 minutes.
4. Export the brief as PDF or push it into their CRM.
5. Tell us — qualitatively or with a measurement — that the brief saved them time vs. a discovery call.
6. (For the cost model) See, across their first 10 quoted briefs, that the model's cost range contained their first formal quote at least 8 out of 10 times. ±20% with 80% hit rate is the working definition; it gets revised as data accrues.

If the maker says *"I'd cancel my Houzz Pro Lead Generation tomorrow if I had this"* — that's the unprompted quote that means the wedge works.

If they say *"this is interesting but the estimate is way off"* — that's a signal to recalibrate the cost model regionally before scaling, not to abandon the output. The brief still has to be valuable on its own.

If they say *"this is interesting but…"* anything else — read the next 30 words carefully; it's the next product cycle.

---

## Source Material

This document distills:
- `positioning-doc.md` — the 5+1 positioning and strategic recommendations
- `competitive-alternatives.md` — what the product must NOT replicate or compete with directly
- `raw/customer-intelligence.md` — the verbatim language the product must respect
- `raw/alternative-mapping.md` — the alternatives the brief output must clearly outperform
- `raw/trends-timing.md` — the 12–18-month execution window framing
- `intake-catalog.md` — the conversation surface that feeds both outputs (brief + cost model)
- Founder confirmation of unique attributes (this conversation, plus the 2026-05-01 revision adding the cost-model output)

For evidence behind any specific claim, follow the source link in the underlying file.
