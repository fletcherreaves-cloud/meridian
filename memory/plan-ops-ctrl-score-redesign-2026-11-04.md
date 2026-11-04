---
name: plan-ops-ctrl-score-redesign-2026-11-04
description: Owner question — are the Ops/Controls scorecards (opsScore/ctrlScore, src/engine/pipeline.js) built for additional users (GMs, future operators) or mainly for him, and should they be revised to blend actual-vs-target with trend? Audited the real scoring code first. Finding — they're already actual-vs-target banded and already GM-visible today, not freshness-penalized as the owner suspected; the real gap for a non-owner audience is no trend/momentum component and owner-only-tunable thresholds. Proposes a concrete trend-blend redesign, not yet built.
metadata:
  node_type: memory
  type: plan
scope: tenant
sensitivity: open
---

# Ops/Controls scoring — audit + redesign proposal (2026-11-04)

**Owner's question, verbatim:** *"Do they serve, in your assessment, any purpose that would be
pertinent for additional users to actually need or are they geared more for someone like me? ...
the freshness of data is probably not something anyone else needs as a factor for the rating...
Should incorporate a combination of actual results vs targets and or a blend of trends."*

## 1. What the scores actually do today (measured, not assumed)

`computeOpsScore`/`computeCtrlScore` (`src/engine/pipeline.js:220,262`) are **already
actual-vs-target, tier-banded point systems** — not freshness-based:

- **Ops**: OEPE, KVST, KVSU, TPPH, Labor% — each compared against its own target (`t.tOepe`,
  `t.tTpph`, etc.) through 2-3 tiers (full points / partial points / lower tier), summed and
  normalized to 0-100.
- **Controls**: cash O/S %, T-Red After %, OT hours, cash refund count, discount % — same
  tier-banded shape against fixed thresholds (`sc.cashT1-T4`, etc.), weighted to a 40-point max.

**The "freshness" premise doesn't match the current code.** Checked directly: `computeCtrlScore`
reads `p._cov` (`forecast.js`'s `compute6wk`) to decide whether a component has ANY real
observations in the trailing 6-week window — if not, that component is **excluded** (denominator
shrinks by its point-share), never scored as a penalty. A store with genuinely missing data isn't
punished for it; it's left out of the grade entirely. This was itself a real bug until 2026-10-13
(mass-review notes 70) — before that fix, missing data silently graded as a flat 75/100 regardless
of real performance, the opposite failure from "penalized for something outside your control."

**What `_cov` does NOT catch**: it counts *how many days had data somewhere in the 6-week window*,
not *how recent the last day is*. A feed that went completely dark 3 weeks ago still shows
`cov>0` from the first 3 weeks and keeps contributing to the score — so a genuinely stale store
today would NOT be flagged by the score at all, which is arguably the opposite problem from what
the owner described (not "penalized for staleness," but "a dead feed can hide inside a stable-
looking score"). Worth knowing either way, since it changes what the actual fix should be if data
freshness matters here at all (see §4).

## 2. "Geared for someone like me" — checked against who can actually see it

Confirmed against this session's own GM `disabledPanels` work (task #77): the Store Dashboard
panel (where `opsScore`/`ctrlScore` render, `store-dash.js`) is **not** in the GM-disabled list —
GMs already see their own store's Ops/Controls scorecards today. The five Ops components
(OEPE/KVS/TPPH/Labor%) and five Controls components (cash O/S/T-Red/OT/refunds/discounts) are all
GM-actionable levers, not district-level diagnostics — this is, if anything, one of the more
"built for the operator, not just the owner" surfaces already in the app. So the honest answer to
"is this for me or for them" is: **the mechanics already are for them** — the gap is elsewhere.

## 3. What's actually weak for a non-owner audience (the real finding)

1. **No trend/momentum in the score itself.** A separate `vel.opsScore`/`vel.ctrlScore` field
   (period-over-period score delta) exists and renders as a small badge (`store-dash.js:1925`),
   but it's a secondary indicator, not blended into the grade. A GM improving fast but not yet at
   target reads the identical number as a GM who's been flat for months — exactly the
   demotivating failure mode a trend-aware score avoids, and exactly what the owner is asking for.
2. **Thresholds are owner-only, hardcoded config**, not something a GM (or a future second
   operator) could see explained anywhere. `sc.oepeT1pts`/`sc.cashT1`-type values live as static
   constants (`constants.js`), tuned by whoever edits source — no in-app surface explains "why
   these five metrics, why these cut points" to the person being graded by them.
3. **`normalizeScores`'s `'relative'`/`'optimistic'` modes** (`pipeline.js:285`) can reshape the
   same underlying performance into a different displayed number — fine for the owner's own
   district-wide analysis, but if a GM-facing score can silently shift mode, the number stops
   meaning anything fixed to compare over time. Worth confirming `'absolute'` is what GMs actually
   see, not assuming it.

## 4. Proposed redesign — reuse the pattern just validated on the sales forecast

The owner's own ask ("actual vs targets and/or a blend of trends") is literally the same shape as
`src/engine/owner-sales-forecast.js` (task #80, shipped this session): a point-in-time
actual-vs-target read, blended with a damped recency-weighted trend term. Recommend reusing that
exact philosophy rather than inventing a new one:

- **Keep the existing tier-banded actual-vs-target scoring as the base** — it's sound, it's
  already GM-actionable, don't rebuild it.
- **Add a trend term**: compute each component's own direction/magnitude of change over the last
  few periods (same shape as the sales model's Level+Momentum, or simpler — a slope over 4-6
  periods) and blend it in as a bonus/penalty on top of the banded base score, damped so one good
  or bad week can't swing it — a store moving the right way should score meaningfully better than
  an identically-positioned flat store.
- **Separate "data confidence" from "grade."** If freshness/recency should matter at all, surface
  it as a caveat ("this score reflects data through Oct 28") rather than folding it into the
  number — keeps a GM from being penalized for a sync outage while still being honest that the
  grade might be stale.
- **Document the thresholds in-app**, at least as a tooltip/explainer on the score itself, once
  it's something a second operator's GMs might actually be graded against.

## 5. Not built yet — this is the proposal, not the implementation

Owner explicitly invited "let's see what we can come up with" — this doc is that first pass.
Scope/architecture decision belongs to the owner before building: whether to proceed, and at what
weight the trend term should carry relative to the existing banded base (a judgment call, not an
execution detail — this score is already live, used daily, and comparable store-to-store and
period-to-period today; changing its shape changes what "80/100" has meant historically).
