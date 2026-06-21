# Design brief — softclose app information architecture & navigation

**For:** a design-focused pass (fresh eyes, no prior context). Read this top to
bottom; it is self-contained.

**Ask:** rethink the app's *information architecture, navigation model, and
overall flow* so the two halves of the product feel like one coherent journey.
This is **not** a visual reskin — the visual language is fine. It's about
structure: how a homeowner moves from "tell us about your kitchen" to "here's
your priced offer," and how the navigation makes that legible the whole way.

---

## 1. What softclose is

An **AI proposal builder for custom kitchen makers**. Two-sided:

1. **Homeowner-facing flow** (what this brief is about) — interviews a homeowner
   about their kitchen project (photos, inspiration, a floor plan, then a
   component-by-component build), and produces a structured brief + a
   confidence-bounded **price range** (±20%, never a single committed number).
2. **Maker-facing dashboard** (out of scope here) — receives the brief + range.

The wedge: replace the $300–$3,500 paid "design fee" most makers charge to
filter serious buyers, without scaring real buyers off. The homeowner's
emotional payoff we design for is **"this reduced my stress."**

### Non-negotiable design principles
- **Anxiety reduction beats generation.** Calm, reassuring, paced — not flashy,
  no urgency, no dark patterns. Stress reduction is the product.
- **End the ghosting — status visibility is P0.** The user should always know
  where they are, what's been captured, and what's left.
- **Confidence-graded, ranges not single numbers.** Prices are always a range,
  framed as "an estimate your maker will confirm," never a committed quote.
- **The artifacts are the product.** The brief (for the maker) and the price
  range (for the homeowner) are the output; the flow is the means.
- **Conversation first, forms second — but use both.** Hybrid: guided, friendly,
  with structured mini-inputs. Avoid 30-field forms (>67% abandon at 7+ fields).

### Red lines (don't propose these)
- A single committed AI price quote.
- Urgency / scarcity / dark-pattern UX.
- A 30-question monolithic form.
- Fake testimonials / placeholder social proof.

---

## 2. The product's core architecture (the "two parts")

The app has two halves connected by a **contract** (this is the technical IP and
it maps directly onto the user journey):

- **Part 1 — Capture.** The homeowner describes their *space*: uploads photos,
  pins inspiration, gets an AI concept render, and confirms a **floor plan**
  (room outline, walls, windows/doors, fixed appliances, an L/U/galley/island
  layout shape). Output: a frozen **layout contract** — runs (wall sections)
  with lengths, appliance positions, corners.
- **Part 2 — Build.** A **builder** consumes that contract and walks the
  homeowner through choosing every component of the kitchen — cabinets, doors,
  worktop, hardware, appliances, sink, lighting, finishing — with a **live price
  range** updating as they choose. The builder *renders the steps the user needs
  to go through based on the captured layout* (an L-shape with a corner shows a
  corner-cabinet step; a galley doesn't, etc.).

Mental model the founders use:
> **capture → builder consumes the capture output → user goes through build
> steps → contact → final offer.**

---

## 3. Current tech (keep proposals buildable in this)
- Next.js 16 (App Router, Turbopack), React 19, TypeScript.
- Tailwind CSS v4, shadcn / Base UI primitives, lucide-react icons.
- framer-motion for transitions; Konva for the floor-plan editor.
- AI SDK (OpenAI vision) for render + hypothesis; zod schemas.
- i18n: **Croatian (hr-HR) is the default locale**, English fallback. Copy must
  work in both; keep label counts modest.

---

## 4. Current flow (what exists today)

One linear funnel of **10 steps**, defined in `src/lib/flow.ts`, today rendered
inside a *single large component* (`src/components/kitchen-intake/index.tsx`) at
the route `/`:

| # | Step | Belongs to (founders' view) |
|---|---|---|
| 1 | space photos | Capture |
| 2 | inspiration | Capture |
| 3 | concept render | Capture |
| 4 | confirm look | Capture |
| 5 | **builder** | **Build** (a huge sub-app, see §6) |
| 6 | project basics (type / timeline / budget) | ambiguous |
| 7 | scope (demo, plumbing, electrical, flooring…) | ambiguous |
| 8 | wishlist (free-form wants) | ambiguous |
| 9 | logistics | Close |
| 10 | contact | Close |

There is also a **dead/orphan route `/builder`** — a standalone dev demo of the
builder with hardcoded data, not linked from anywhere.

---

## 5. How it looks today (visual language — this part is fine, keep it)

- **Palette (light):** a warm near-white paper background, deep desaturated
  indigo for text/primary, soft warm-grey borders, muted grey secondary text.
  Low-contrast, calm, "paper-like." A dark theme exists.
- **Type:** Plus Jakarta Sans (humanist sans) for everything; Geist Mono for
  numbers/code. Tiny uppercase tracked labels (11px, letter-spacing) for section
  eyebrows; generous line-height on body.
- **Shapes:** rounded cards (16–24px radius), hairline borders, soft shadows,
  lots of padding/whitespace. Pills/chips for choices. Tabular-nums for prices.
- **Motion:** gentle fade + 14px slide on step changes (~0.28s ease), nothing
  abrupt.

### The funnel chrome (steps 1–4, 6–10)
- A thin **progress bar** pinned to the top.
- A **fixed left side-menu** titled "Your brief" (desktop `lg+` only): the steps,
  grouped, each with a check / open-circle marker and a tiny **read-back** of
  what was captured ("Layout: L-shape · 380×320"). Past = checked, current =
  highlighted, future = dimmed. This is the "where am I" anchor.
- Centered single-column content for the current step.

### The builder chrome (step 5) — and the core problem
When the user reaches the builder, the component **early-returns a full-screen
takeover with completely different chrome**:
- **Left:** a sticky large **render preview** (their concept image) + the
  builder's *own* vertical stepper of ~10 component groups.
- **Middle:** the current group's controls (e.g. "Cabinet boxes", "Doors",
  "Worktop"…), opening with a **layout-counts confirmation** ("Check what we
  counted: runs, lengths, cabinets, corners, appliances").
- **Right:** a **live price range (BOM) panel** that updates as they choose.

So entering the builder, the funnel's progress bar + "Your brief" side-menu
**vanish**, replaced by a different layout. It feels like a *different app*.

---

## 6. The problems to solve

1. **Inconsistent navigation chrome.** The global "where am I" side-menu
   disappears the moment the user enters the builder (step 5 of 10) and is
   replaced by the builder's own three-column layout. The journey loses its
   spine exactly at its most important, longest stretch.
2. **`/` and `/builder` are disconnected.** Two entry points to the builder (one
   embedded in the funnel, one orphan demo route). No shared layout, no real
   navigation between phases, no deep-linking / refresh-safety.
3. **Flat 10-step list hides the real shape.** The journey is really **three
   acts** (Capture → Build → Close) but the nav presents 10 equal steps, and the
   builder secretly contains ~10 *more* sub-steps. There's no clear macro/micro
   navigation model.
4. **Ambiguous steps have no home.** project-basics, scope, wishlist, logistics —
   should some fold *into* the build (they affect price), some into the close?
5. **Two grain sizes of "step."** Funnel steps and builder groups are both
   called "steps" but behave totally differently. The nav should make the
   hierarchy obvious.
6. **Mobile.** The side-menu is desktop-only; the builder uses a sticky top
   render thumbnail on mobile. A coherent mobile navigation model is needed.

---

## 7. Our current hypothesis (challenge it freely)

We *think* the answer is a **3-act structure** with one persistent shell:

- **Act 1 — Your space** (Capture): photos → inspiration → concept render →
  confirm look. Produces the layout contract.
- **Act 2 — Build your kitchen** (Build): confirm the counted layout → the
  component groups → and possibly **scope** and **wishlist** fold in here, since
  they shape the kitchen and move the price. Live range visible throughout.
- **Act 3 — Your offer** (Close): logistics → contact → **final offer** (the
  ±20% range, framed as non-final, maker confirms).

Open question we're unsure about: **budget.** Our instinct is to *not* ask a
budget up front — the pitch is "render your dream kitchen and *we* tell you the
price," so the builder's live range should *be* the budget conversation rather
than anchoring on a stated number. Type/timeline could live in the close.

We're undecided on mechanism: keep it one page with a unified shell first, then
later promote each act to a real route (`/space`, `/build`, `/offer`) under a
shared layout for deep-linking. Propose what you think is right.

---

## 8. What we want from you (deliverables)

1. **An information architecture**: the act/phase structure, what each contains,
   and where the ambiguous steps (basics/scope/wishlist/logistics/budget) land —
   with your reasoning.
2. **A navigation model**: how macro (acts/phases) and micro (steps within an
   act, including the builder's component groups) coexist in one consistent,
   always-present nav. Desktop *and* mobile.
3. **A flow**: the screen-by-screen sequence, including how Part 1's output
   visibly hands off into Part 2, and how the journey resolves into the offer.
4. **Screen-level descriptions** (wireframe prose, not pixels) for the key
   surfaces: the shell, the capture steps, the builder, the offer. Show how the
   "live price range" and "where am I" stay present and calm.
5. **How it honors the principles**: anxiety reduction, status visibility,
   ranges-not-quotes, no urgency. Call out specific moments.
6. A short **build sequence** recommendation: what to change first to fix the
   broken chrome with least risk, versus what's a later refactor (e.g. real
   routes + lifting state out of the one big component).

Keep it buildable in the stack above, Croatian-first, and true to the calm
"reduce my stress" feeling. Challenge our 3-act hypothesis if you have a better
structure.
