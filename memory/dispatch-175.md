# Dispatch #175 — cash-handling metrics: finish "API over email" for cashOS/posOver

## Owner's question (verbatim, 2026-08-27, follow-up to dispatch #172)

> "is this not #DATA that we're auto pulling through script now as well. Could it just be rewired
> to the auto [pull] rather than the email pull"

## Answer, measured live before drafting this — it's a real gap, but a small, already-scoped one

`qsr_cash_sheet` (the API-pulled table from `scripts/qsrsoft-ops-pull.mjs`, exposed in the app as
`ds.opsCashRows`) is confirmed live and fresh: `content-range: 0-0/25043`, latest `dt: 2026-08-27`
(today). Its `metrics` JSON already carries `cash_over_or_short`, `overring_amt`/`overring_qty`,
`cash_refunds_amt`/`qty`, `cashless_refunds_amt`/`qty` — everything the email pipeline (the one
dispatch #172 just fixed) was fighting to parse.

Checked `src/engine/metric-source.js` and `src/lib/supabase.js`'s `loadOpsCashSheet` — the picture
is per-metric, not all-or-nothing (same shape as dispatch #165's original redundancy audit):

1. **`cashRefAmt`/`cashRefCnt`/`cashlessRefAmt`/`cashlessRefCnt`** — ALREADY lead with
   `opsCashRows` (`metric-source.js` ~line 293-296). Nothing to do here.
2. **`cashOSAmt`/`cashOSPct`** (`metric-source.js` ~line 259-263) — `opsCashRows` IS in the chain
   but listed THIRD: `srcs: [['glimpseRows','cashOS'], ['cashRows','cashOS'], ['opsCashRows',
   'cashOSAmt'], ['ctrlRows','cashOSAmt']]`. Backwards from this repo's "API over email" standing
   rule even before #172 — and more clearly wrong now that #172 proved `glimpseRows.cashOS` was
   silently 0 on every row in the table's history until its fix landed. (Note: the comment directly
   above this chain, at line 261, says "manual Controls, then emailed Glimpse/Cash Sheet, then the
   auto-pulled..." — that does NOT match the actual array order either; fix the comment to match
   whatever order you land on, don't leave it describing a different order than the code.)
3. **`posOverAmt`/`posOverCnt`** (`metric-source.js` ~line 299-300) — no `opsCashRows` source at
   all: `srcs: [['glimpseRows','posOverAmt'], ['cashRows','posOverAmt'], ['ctrlRows','posOverAmt']]`.
   This is a **known, already-identified gap** — dispatch #165's own PR body (`src/app/changelog/
   5.207.js`) states promoAmt/promoPct and posOverAmt/posOverCnt reconcile 97-98% between
   `glimpseRows` and `qsr_cash_sheet`'s `promo_amt`/`overring_amt` (132-133/135 sampled), "but have
   no opsCashRows fallback wired, and the loader does not yet alias those fields to camelCase — a
   same-shape fix to the one just shipped, left separate to keep this PR's blast radius contained."
   It was never done. **Confirmed still true by reading `loadOpsCashSheet` directly**
   (`src/lib/supabase.js` ~line 2786-2823): every other `qsr_cash_sheet` metric this function
   aliases to camelCase (`cashOSAmt`, `cashRefAmt`, `tRedAAmt`, `discAmt`, `drawerOpens`, etc.) has
   an explicit aliasing line; `posOverAmt`/`posOverCnt` (which would read `r.overring_amt`/
   `r.overring_qty`) have none. `loadGlimpse`/`loadCash` (the TWO EMAIL loaders, same file, ~line
   2896/2924) already alias `pos_over_cnt`/`pos_over_amt` — it's specifically the ops/auto loader
   that's missing this, confirming #165's note exactly.

**promoAmt/promoPct** (also flagged reconciling well in #165) are explicitly OUT of scope here —
this dispatch is cashOS + posOver only, matching what the owner asked about. Leave promoAmt/
promoPct for a future dispatch if wanted.

## Task

1. `src/lib/supabase.js`'s `loadOpsCashSheet` (~line 2786-2823) — add the missing aliasing lines,
   same pattern as every other field in that function:
   ```js
   posOverAmt: r.overring_amt != null ? Number(r.overring_amt) : null,
   posOverCnt: r.overring_qty != null ? Number(r.overring_qty) : null,
   ```
2. `src/engine/metric-source.js`:
   - `posOverAmt`/`posOverCnt` (~line 299-300): add `['opsCashRows', 'posOverAmt']`/
     `['opsCashRows', 'posOverCnt']` as the FIRST source in each chain — matching the convention
     already used by `cashRefAmt`/`cashRefCnt` two blocks above (auto first, then the emailed
     sources, `ctrlRows` last, since `ctrlRows` doesn't carry this field per that block's own
     comment — verify whether it does or doesn't before deciding whether to keep or drop it here).
   - `cashOSAmt`/`cashOSPct` (~line 259-263): move `opsCashRows` to the FRONT of the `srcs` array,
     ahead of `glimpseRows`/`cashRows` — matching the same auto-first convention. Keep both email
     sources in the chain (don't remove them — they're correct now per #172's fix and still cover
     any gap the ops-pull hasn't reached). Update the stale comment at line 261 to describe the
     actual resulting order, not the order it currently misdescribes.
3. Regenerate the loader field map per the standing dev rule:
   `node scripts/gen-loader-emits.mjs --write` (you just changed a loader's emitted fields).
4. Update `src/__tests__/metric-chains.test.js`'s `opsCashRows` field list (~line 18) if the new
   `posOverAmt`/`posOverCnt` fields need adding there — check whether the test's field list is
   hand-maintained or derived; follow whatever the existing pattern requires.

## Verification

- A reconciliation-style test (matching #165's/#172's own style) proving `cashOSAmt`/`cashOSPct`
  and `posOverAmt`/`posOverCnt` now resolve from `ds.opsCashRows` when it's present, falling back
  to the email sources only when `opsCashRows` doesn't cover a given (loc, date) — same auto-first-
  per-day precedence every other chain in this file already has, not an all-or-nothing per-month
  choice.
- A regression test confirming a device with ONLY the email streams (no `opsCashRows` at all,
  e.g. #271's original bug class) still resolves both metrics unchanged — this must not regress
  the manual/email-only fallback path.
- `metric-source-order.test.js` and `metric-chains.test.js` — confirm both still pass, updating
  `metric-chains.test.js`'s field list per Task 4 if needed.
- Standard suite + build.

## Out of scope

- `promoAmt`/`promoPct` — same reconciliation quality per #165, but not what the owner asked about
  here; a future dispatch if wanted.
- Re-measuring the actual reconciliation rate live post-#172-fix — the dispatch #165 numbers
  (97-98% for posOver, pre-#172) and #172's own fix (cashOS's email side now correct) are enough
  grounding; a full new audit isn't needed to justify this ordering fix.
- Deprecating the email cash-sheet parsing entirely — per this repo's standing "keep a manual/
  emailed fallback" rule, both stay in the chain, auto just moves to the front.
