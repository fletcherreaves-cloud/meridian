---
name: dispatch-88
description: The three concrete correctness/performance bugs from notes-67 section 2 -- Food Cost's May-2026 date default, Speed of Service DT History taking 15+s, and Forecast Audit appearing greyed out. All three owner-reported. Two are already diagnosed here; the third is narrowed. No owner decision needed.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #88 — the three notes-67 bugs

**Reads first:** `memory/notes-67-queue.md` section 2 (the owner's own wording), and
`memory/feedback-performance-budget.md` before touching item 2.

**Status:** ready, no owner decision. Independent of each other — do them in any order, but
**item 2 is the one the owner actually feels**, so start there if you only get through one.

⚠️ **Every claim below was measured against `main` at `2d21fa5` on 2026-08-24.** Where I say
"already diagnosed," verify it still holds before building on it — that instruction exists because
six "open" items in this workstream turned out already-shipped when someone finally looked.

---

## Item 1 — Food Cost (Original)'s date selector defaults to May 2026

Owner: *"weird quirk… need to correct this."* Everything else on the panel shows correct data.

**Narrowed, not solved.** notes-67 guessed at "a hardcoded `'2026-05'`-shaped literal left in from
dev." **That guess is wrong** — I grepped `src/` for `'2026-05'` / `"2026-05"` / `2026-05-01` and
every hit is a comment, a JSON placeholder, or a parser docstring example. Nothing in the Food Cost
path hardcodes it.

So the default is **computed**, and the likely shapes are:
- a `max(date)` over a source whose rows genuinely stop in May (a dead or lapsed stream — check
  which stream feeds the selector's options before assuming the selector is at fault); or
- a default-month helper reading a different dataset than the one the panel renders from; or
- a month list built from one stream and a default index picked against another.

**Find which of those it is before changing anything.** If the answer turns out to be "the stream
really does end in May," that is a *data* bug wearing a UI costume, and the fix is a backfill
(standing authorization — `memory/dispatch-85.md` and CLAUDE.md's backfill rule), not a selector
tweak. Say which one it was in the commit body.

The panel is `fob-analysis` (`panel-registry.js`, label "Food Cost").

## Item 2 — Speed of Service: DT History takes 15+ seconds

Owner flagged it as **performance, not design**. This is the highest-value item here.

🔴 **Already diagnosed — the cause is arithmetic, not mystery.** `dt-speedofservice.js` calls
`loadDtHistory(days)` on mount, defaulting to 90 days. `loadDtHistory` (`src/lib/supabase.js`)
reads `qsr_daily_activity` at **hour-slot granularity**:

> 90 days × 27 stores × 24 slots ≈ **58,000 rows**, paged 1,000 at a time.

And it pages with **`fetchAll`, which is strictly sequential** — the comment inside `_pagedParallel`
says so in as many words. That is **~58 serial round-trips** before the panel can render. At a
routine ~250 ms per round-trip that is your 15 seconds, and it needs no further theory.

Two fixes exist, and **the helper you need is already written** (CLAUDE.md: check whether a helper
exists before writing one):

1. **`_pagedParallel`** — same file. Counts first, then fires the pages concurrently through a
   limiter, with a documented sequential fallback if the count query fails. Swapping
   `loadDtHistory` onto it is the small fix and should be most of the win.
2. **`qsr_daily_activity_daily`** — a daily rollup view exists in
   `supabase/schema-qsr-daily-summary.sql`, and `supabase/diagnose-schema-state.sql` already checks
   whether it has been applied. If the panel's History section only ever renders daily aggregates,
   this collapses 58,000 rows to ~2,400 and beats fix 1 outright.

**Do fix 2 only if the panel genuinely doesn't need hour-slot detail — read what it renders, don't
assume.** And run `diagnose-schema-state.sql`'s check first: the view may not be applied in this
project, in which case fix 1 is the answer today and fix 2 is a follow-up.

**Verification bar (perf rule, non-negotiable):** measure the load time before and after, put
**both numbers in the commit body**, and state the row count each version fetched. "Feels faster"
is not a result. If you take fix 1, also confirm the parallel path's partial-failure handling still
surfaces `_recordDataError` — a fast, silently-truncated read is worse than a slow complete one,
and that file says so.

## Item 3 — Forecast Audit appears greyed out

🔴 **Already diagnosed, and it is NOT a bug — which changes what to build.** notes-67 guessed
"permissions? a data-readiness check firing false?" Neither. `panel-registry.js` declares:

```js
{ id:'forecast-audit', …, disabledWhen:'noStore' }
```

`shell.js` maps that to `{ disabled: !selStore }`. **The panel is disabled by design until a store
is selected**, and it does exactly what it was built to do.

So the defect is an **affordance** one: the panel greys out and says nothing about why, and the
owner — who wrote the app — could not tell disabled-by-design from broken. That is the bug.

**Fix the explanation, not the gate.** A `title`/tooltip or an inline hint on the disabled item
naming the precondition ("Select a store first"). Keep it to the shared disabled-item path so any
future `disabledWhen` panel inherits it rather than needing its own copy — there is exactly one
other consumer today, so this is a small generalisation, not a framework.

⚠️ **Do not remove `disabledWhen:'noStore'`** to "fix" the grey. The gate is correct; the silence
is not.

## Verification bar (all three)

- Item 1: state in the commit body which of the three shapes it actually was, with the evidence.
- Item 2: before/after milliseconds **and** row counts, both in the commit body.
- Item 3: revert-sensitive at the call site — render the nav with `selStore` unset and assert the
  hint text is present; an assertion on the registry field alone would pass with the rendering
  path broken (the `section:` promotion-test lesson, CLAUDE.md).

## Do NOT

- Do **not** "fix" item 3 by ungating the panel.
- Do **not** ship item 2 on a row-count reduction alone — if the wall-clock doesn't move, you found
  a different bottleneck and should say so rather than claiming the fix.
- Do **not** assume item 1 is a UI bug. Check whether the underlying stream actually stops in May
  first; if it does, backfill it (standing authorization) and say so.
- Do **not** widen into notes-67 section 1 (the navigation/IA reorganization) or section 3 (new
  capability asks). Those need owner decisions; these three do not.
