# Dispatch #219 — EOM email polish: real item descriptions, FOB-as-table with actual %, labeled On-Hand links

## Context — three owner-reported polish items, all pre-diagnosed, none are guesses

Owner feedback (2026-08-30 morning) on the live EOM count-completion email:
1. *"I still would like to see the item description alongside the wrin for any missed counted
   items."* — **Root cause found and confirmed live** (not the rendering code, which has been
   correct since #213): `scripts/qsrsoft-onhand-pull.mjs`'s `main()` loop builds `ohForEngine`
   (the per-item shape fed into `diagnoseIncompleteCount()`) at the line starting `const
   ohForEngine = deduped.map(r => ({...}))` — it copies `wrin, cls, onHandAmt, unitPrice,
   totalUnits, cases, packs, loose, lastCounted, lastSubmitted` from `deduped` (the DB-shaped rows
   from `mapOnHandRow()`) but **never copies `descr`**, even though `mapOnHandRow()` itself
   already captures it correctly (`descr: item.long_desc ?? null`) and `diagnoseIncompleteCount()`
   already reads it (`descr: r.descr || r.desc`, `src/engine/eom-inventory.js` line ~287). Live-
   confirmed via a real service-role read of recent `eom_count_notifications` rows: every
   `uncounted_items.items[]` entry has `wrin`/`cls`/`onHandAmt`/etc. but **zero have a `descr`
   key at all**. `resend-notify.mjs`'s "show descr+wrin together, fall back to wrin alone" logic
   (#213) has been working exactly as designed the whole time — it just never receives a
   description. **The fix is a one-line addition to the `ohForEngine` mapping, not a rendering
   change.**
2. *"In the FOB and components, add the result as a percent also. If possible, present this
   section as a table. It would look great."* — the ACTUAL percent-of-sales per component
   **already exists and is already computed**, just never rendered: `buildFobTargetReport()`
   (`qsrsoft-onhand-pull.mjs`) calls `buildStoreFobReport()` (`src/engine/fob-report.js`), whose
   `comps` array already carries `{key, label, actualPP, tgtPP, deltaPP}` per component —
   `actualPP` is the real actual-percent-of-sales, computed the exact same way the FOB
   headline % is. `resend-notify.mjs`'s `fobSectionHtml()` currently only renders `c.tgtPP`/
   `c.deltaPP` (the target annotation) and never `c.actualPP`. No new math needed anywhere — this
   is a rendering-only change: show `actualPP` per component, and restructure the whole FOB
   section from a `<ul>` list into an HTML `<table>`.
3. *"under helpful links, and the classes out beside On-Hand"* — `onHandLink(nsn, cls, dateStr)`
   (`qsrsoft-onhand-pull.mjs`) builds one link per triggered FOB class (Food and/or Condiment),
   but titles ALL of them identically: `'On-Hand Inventory (this store)'` — so a `food_condiment`
   trigger's email shows the exact same-looking link TWICE with no way to tell which is which.
   #214's `fobToolLinks()` already established the right convention for this exact situation
   (`'Variance Stat/Yields (F)'`, `'Inventory Analysis (F)'`) — apply that same pattern here:
   `'On-Hand Inventory (F)'` / `'On-Hand Inventory (C)'` etc., using the same `CLASS_LETTER` map
   already used everywhere else in this file (don't redefine it).

## Task 1 — `ohForEngine` gets `descr` (small, `scripts/qsrsoft-onhand-pull.mjs`)

Add `descr: r.descr,` to the `ohForEngine` mapping object. That's the whole data-side fix — no
other function needs to change; `diagnoseIncompleteCount()` and `resend-notify.mjs`'s rendering
already handle a real `descr` correctly once it's actually present on the row.

## Task 2 — FOB section becomes a table, with each component's own actual %

In `scripts/lib/resend-notify.mjs`'s `fobSectionHtml()`: replace the `<ul>` of component lines
with an HTML `<table>` (inline styles, matching this file's existing email-HTML conventions — no
external CSS, tables need `border-collapse` etc. set inline the way the rest of this file already
does). Columns: **Component | Actual $ | Actual % | Target % | Δ (gap, pp)**. Source every value
from what's already on `row.fob_target.comps[i]` (`actualPP`, `tgtPP`, `deltaPP`) and
`row.fob_snapshot[k]` (the dollar amount) — do not add a second computation of `actualPP`
anywhere, it already exists. When `row.fob_target` is absent (no resolvable target, #215's
existing "no target" fallback), the table should still render with Component/Actual $/Actual %
columns populated and Target %/Δ showing `—` — don't lose the actual-$-and-%-only case #213
originally shipped, just reshape it into a table row instead of a list item. Keep the headline
paragraph above the table (FOB% of sales, target comparison, total $) as prose — the "present as
a table" ask is specifically about the per-component breakdown, not the headline.

## Task 3 — On-Hand link titles carry their class letter

In `scripts/qsrsoft-onhand-pull.mjs`'s `onHandLink(nsn, cls, dateStr)`: change the title from the
static `'On-Hand Inventory (this store)'` to include the resolved class letter, e.g. `` `On-Hand
Inventory (${classLetter})` `` — reuse the SAME `CLASS_LETTER` lookup this function already does
for the URL's `class=` param, don't add a second mapping. Matches `fobToolLinks()`'s existing
`'Variance Stat/Yields (F)'`-style convention exactly (dispatch #214) — for consistency, consider
whether that dispatch's title style (`(F)`/`(C)`) or a spelled-out `(Food)`/`(Condiment)` reads
better in an email a human actually opens; #214 already chose letters for its own two link types,
matching that existing choice is the simpler, more consistent call unless you have a concrete
reason not to — state your call either way.

## Verification

- Unit test: a synthetic `ohForEngine`-shaped row WITH a `descr` value flows through
  `diagnoseIncompleteCount()` → `buildNotificationRow()` → `buildEmailContent()` and the real
  description text appears in the rendered HTML alongside the WRIN (an end-to-end test through
  the real pipeline, not just re-asserting `resend-notify.test.js`'s already-passing unit test in
  isolation — per this repo's "would this verification still pass if the change were reverted"
  rule, prove the DATA now flows, not just that the rendering logic is still correct).
- Unit tests for the FOB table: renders a `<table>` (not a `<ul>`) with all 4 columns per
  component when `fob_target` is present; renders Actual $/% with `—` for Target %/Δ when
  `fob_target` is absent; still renders nothing at all when `fob_snapshot` itself is absent
  (unchanged #213 behavior).
- Unit test: `onHandLink()`'s title includes the correct class letter for each of food/condiment/
  paper/nonproduct, and two different classes produce two visibly different titles (not just two
  different URLs) — this is the actual bug being fixed, assert the user-visible symptom directly.
- A real live measurement per this repo's "measure it, don't reason about it" rule: after the
  fix, trigger (or wait for) a real notification and confirm via a service-role read of the
  freshly-inserted `eom_count_notifications` row that `uncounted_items.items[]` now actually
  carries a non-null `descr` for at least one real item — the diagnosis above is strong but this
  closes the loop with a genuine post-fix observation, not just "the code looks right now."
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing).

## Out of scope

- Any change to `buildStoreFobReport()`'s or `buildFobTargetReport()`'s math — `actualPP` already
  exists and is already correct, this dispatch only renders it.
- Any change to the "Investigate further" tool-links section (#214) beyond what Task 3 already
  covers for On-Hand specifically — Variance Stat/Yields and Inventory Analysis already carry
  their class letter correctly, don't touch them.
- Redesigning the email's overall visual style beyond what these three specific asks require.
