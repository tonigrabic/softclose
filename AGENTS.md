<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Project Context

**softclose** is an AI proposal builder for custom kitchen makers. Two-sided product:

1. **Homeowner-facing chat** — interviews them about their kitchen project (multimodal: Pinterest + photos + sketches in, conversation + embedded mini-forms).
2. **Maker-facing dashboard** — receives a structured brief plus a confidence-bounded ±20% cost range.

The wedge is replacing the paid design-fee filter ($300–$3,500 most makers charge today) without scaring off real buyers. The timing tailwind is marketplace fatigue (Angi -13% YoY, Houzz Pro 1.03/5 BBB, contractor exodus). 12–18-month execution window before Cyncly / Houzz Pro ship competing intake.

## Context files (read on demand based on the task)

All under `context/`:

| File | When to read it |
|---|---|
| `product-foundations.md` | **Every product / feature decision.** Design principles, mental model, schema sketch, UX patterns, MVP scope, what NOT to build, integration roadmap, open questions. |
| `intake-catalog.md` | **Every conversation-flow / question-design / cost-model decision.** Topic-by-topic catalog of what we ask, branches, mini-forms, "I don't know" paths, cost-model role per field, outputs-ready threshold. |
| `positioning-doc.md` | When deciding category, target customer, messaging direction, or competitive framing. The 5+1 Dunford positioning. |
| `positioning-statement.md` | When writing copy for hero pages, sales decks, cold outbound, taglines. Moore + Onliness statements; channel-specific one-liners. |
| `competitive-alternatives.md` | When designing against a specific competitor (Houzz Pro, Cyncly, LeadTruffle, Sweeten, etc.) or evaluating switching costs. Full alternatives map with per-alternative win/lose breakdown. |
| `market-category-analysis.md` | When choosing pricing tier, integration priorities, or category claim. 8 candidate categories evaluated; 1 chosen, 7 rejected with reasoning. |
| `messaging-implications.md` | When writing UI copy or marketing copy. Words to use / avoid; messaging hierarchy; trust scaffold; channel patterns; pricing framing. |

## Non-negotiable product rules (from `product-foundations.md`)

These come up often enough that they belong here. For full context read the foundations doc.

1. **The artifacts ARE the product.** The brief (for the maker) and the cost range (±20%, for the maker, optionally for the homeowner) are what the product produces. The chat is the means.
2. **Multimodal in, structured out — plus one anchored render.** We accept photos / Pinterest / sketches as input. We produce ONE kind of render: img2img anchored to the homeowner's actual space photo, framed as concept (not commitment), capped at 5/session, tied to a brief + cost range. We never produce standalone "kitchen renders."
3. **Conversation first, forms second — but use both.** Pure chat loses precision; pure forms lose users at field 7. Hybrid.
4. **Two surfaces, one source of truth.** Homeowner chat ↔ maker dashboard read the same brief object. Translation layer is the IP.
5. **Spec ontology is the moat — built like a database product, not a chat product.** Cabinet-trade vocabulary, branching logic, validation rules.
6. **Confidence-graded fields and ranges, never single-number quotes.** Every field carries H/M/L confidence + provenance. The AI may produce a *range*; never a committed single-number quote.
7. **Anxiety reduction beats generation.** Calming UX, not flashy. *"Reduced my stress level"* is the emotional outcome.
8. **End the ghosting — both ways, every time.** Status visibility is a P0 design constraint.

## Red lines — don't build

- Standalone AI kitchen renders disconnected from real space + brief
- AI-committed single-number quotes
- A homeowner-direct destination at launch (Modsy precedent)
- A marketplace at launch (capital-intensive, wrong shape)
- A CAD tool / 3D renderer (Cyncly's lane)
- A general-purpose AI receptionist (Avoca/LeadTruffle's lane)
- A 30-question form (>67% abandon at 7+ fields)
- Urgency / dark-pattern UX
- Fake testimonials / placeholder social proof

## Top integrations to prioritize

1. Houzz Pro CRM — turns the most likely incumbent threat into a partner
2. Email + webhooks
3. Builder Prime
4. 2020 DesignFLEX export — major moat in EU/NA kitchen studio market
5. Zapier/Make bridge

## Glossary (vocabulary to use, not to use)

- ✅ Use: brief, quote-ready, trade language, studio / shop / maker, intake / discovery, embed / branded, integrates with, custom kitchen / built-in / bespoke, homeowner, AI assistant
- ❌ Avoid: AI chatbot (pulls pricing to $50/mo), AI-generated kitchen, AI-priced quote, replaces your designer, automates the design process, all-in-one platform, streamline / boost / empower (generic SaaS-speak)
