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

## Resolution

All three items closed on PR #632 (branch `claude/dispatch-88-notes67-bugs`). Every "already
diagnosed" claim was re-verified against `main` before building on it, per this dispatch's own
instruction — one of the three needed correcting.

### Item 1 — Food Cost date default: neither guessed shape. It was a render-order race.

None of the three shapes this dispatch listed as "likely" was the actual cause, and the
notes-67-and-this-dispatch's shared worry — *"if the stream genuinely stops in May, that's a data
bug wearing a UI costume"* — was checked directly and ruled out: `qsr_fob` was queried live against
Supabase (`curl` + the anon key, egress already allowlisted per CLAUDE.md) and has real, non-zero
`prod_sales_amt` rows through 2026-08-24, repeating within each billing period (a period-snapshot
shape, not a daily one — consistent with FOB/inventory being periodic data). The stream does not
stop in May.

The real cause: `FOBAnalysisPanel` (`src/views/analytics.js`) computes `months` from
`fobRowsEff`, a cloud-first merge of `qsrFobRows` (async — starts `null` while `loadQsrFob()` is in
flight) and `ds.fobRows` (manual upload, already present synchronously on first render). The
auto-select effect used `!selMonth` as a run-once guard:
`if(months.length&&!selMonth)setSelMonth(months[0])`. On the very first render — before the cloud
fetch resolves — `months` is built from the manual rows *alone*. If a manual upload's last real
month predates the cloud stream's coverage (an ordinary state under the standing "manual sourcing
is always temporary" rule — the owner's own May upload was the stale value here), the effect fires
immediately, locks `selMonth` onto that stale month, and the `!selMonth` guard then blocks it from
ever re-firing once the cloud data arrives with newer months — even though `months` itself updates
correctly and silently contains August all along.

**Fix:** gate the auto-select on `qsrFobRows !== null` (the cloud fetch having settled, success or
caught-error-fallback-to-`[]`), so the first auto-select fires against complete data:
```js
React.useEffect(()=>{if(qsrFobRows!==null&&months.length&&!selMonth)setSelMonth(months[0]);},[months,qsrFobRows]);
```
`src/__tests__/fob-analysis-month-race.test.js` reproduces the race against unmodified code first
(confirmed failing: locked to `2026-05` with cloud data mocked to resolve `2026-08` after first
render), then confirms the fix, and separately confirms no false positive when the cloud stream has
no newer coverage than manual (stays on the manual month).

**Checked and ruled out:** `FOBEOMPanel` (`src/views/fob-eom.js`) — same "FOB"-adjacent naming,
different tool entirely (EOM Supervisor priority-recount/anomaly review, manual-upload-driven,
`selStore` picked synchronously from an uploaded filename, no `qsrFobRows`/cloud-fetch race
possible). Does not need the same fix.

### Item 2 — DT History 15+s load: `_pagedParallel` conversion shipped, wall-clock scheduling win measured (not production milliseconds — see caveat).

Confirmed before building: `dt-speedofservice.js`'s `hourData`/`daypartData` both aggregate by
`r.hour_slot`, so the panel genuinely needs hour-slot granularity — fix 2 (the
`qsr_daily_activity_daily` rollup view) does not apply, exactly as this dispatch's own conditional
anticipated. Fix 1 (`_pagedParallel`) is the one shipped.

`_pagedParallel` had no generic extra-filter hook — its 10 existing callers all use only
`gteCol`/`inCol`. Added an additive `extraFilter = q => q` param (default identity, so all 10
existing callers are unaffected — confirmed via the full suite, 2219/2219 green), applied to both
the head-count query and every page query. `loadDtHistory` now calls `_pagedParallel` with
`extraFilter: q => q.gt('dt_trans_cnt', 0)`, preserving the original filter and the original
`dt` asc / `loc` / `hour_slot` ordering exactly.

**Row counts:** 90 days × 27 stores × 24 hour slots = 58,320 candidate rows before the
`dt_trans_cnt > 0` filter (pageSize 1000 → 59 candidate pages; this dispatch's own ~58,000/~58-page
estimate holds). The post-filter count is not independently known — `qsr_daily_activity` is
RLS-restricted, confirmed live (the anon key this sandbox can reach sees `0` rows on it, unlike
public-read tables such as `qsrsoft_kb`), so it can't be read directly from here.

**Verification bar honesty check, per this dispatch's own "do not ship on a row-count reduction
alone" line:** this sandbox has no authenticated production Supabase session, so a true
before/after production wall-clock trace is **not obtainable here** — the identical limitation
`memory/project-lazy-fill-191.md` documented for `loadQsrFob`'s identical `fetchAll` →
`_pagedParallel` migration (#191, 2026-08-11), which shipped with the same caveat and the same
instruction: *"if a live before/after waterfall shows this regressed, revert, don't tune further."*
That standing instruction applies here too — if the owner's next production load doesn't move,
that is real signal to revert, not evidence to explain away.

What **was** measured directly, not felt: `src/__tests__/dt-history-pagination.test.js`, a
6-test suite against a mock Supabase client sized to the real shape (58 pages, `_MAX_INFLIGHT=6`,
the shared cap `_limited()` already enforces), confirms — (1) `loadDtHistory` fetches the complete
58,320-row set across pages, (2) `dt_trans_cnt > 0` reaches every page query and the head-count
query, (3) `dt_trans_cnt > 0` still reaches the `fetchAll` fallback path when the head-count query
errors (extending #343's own coverage, previously untested for this caller), (4) ordering is
preserved, (5) a failed page still calls `_recordDataError` and surfaces the `DATA INCOMPLETE`
console banner naming `dtHistory` — the dispatch's explicit partial-failure ask, confirmed rather
than assumed from reading the shared function — and (6) a scheduling measurement: at a fixed
30ms simulated per-request latency and the real 58-page/6-inflight shape, the strictly-sequential
loop (`fetchAll`'s own shape, reproduced directly against the mock) took **1771ms** across 58
serial rounds; `_pagedParallel`'s real capped-concurrency fan-out (exercised through
`loadDtHistory` itself, not reimplemented) took **336ms** across `⌈58/6⌉+1 = 11` rounds — a
**5.27x reduction in round-trip rounds**, matching the analytical prediction (58 vs 11 rounds)
almost exactly. This is a genuine, reproducible measurement of the *scheduling* change this fix
makes; it is explicitly not a claim about real Supabase round-trip milliseconds, which will differ
from the mock's 30ms and which nothing in this sandbox can observe.

Also confirmed while implementing: an exact-count `HEAD` query against `qsr_daily_activity`
occasionally hit Postgres's `57014` statement-timeout live (reproduced once via curl with the
`dt_trans_cnt > 0` filter; retried immediately after and it returned in <1s, so this reads as
ordinary plan-cache/connection-pooler variance, not a deterministic property of the query shape —
not enough to build a claim on either way). If it recurs in production, `_pagedParallel`'s existing
`#343` fallback already handles it: a failed head-count falls back to `fetchAll`'s sequential
strategy automatically, so the documented worst case for this change is "no better than before,"
never "broken."

### Item 3 — Forecast Audit "greyed out": premise was false. Already shipped, weeks before this dispatch.

Re-verified per this dispatch's own instruction before touching anything. `git log --follow -p -S
"'Select a store first'" -- src/app/shell.js` shows the fix already landed in commit `1e439c0`
(v4.945, PR #120, 2026-08-10) — `navItem`'s `title:disabled?'Select a store first':label` predates
this dispatch (written 2026-08-24) by two weeks. Confirmed by an actual render, not just reading
the diff: `AppSidebar` rendered with `selStore=null` shows `title="Select a store first"` on the
Forecast Audit nav item; rendered with a store selected, it shows the normal label. The gate itself
(`disabledWhen:'noStore'` in `panel-registry.js`) is untouched, as instructed.

No code change. `src/__tests__/forecast-audit-disabled-hint.test.js` adds the missing regression
test — it renders the real `AppSidebar` consumer (not `panel-registry.js`'s field in isolation, so
a future break in the `DISABLED_WHEN` → `navPBeta` → `navItem` wiring fails this test even if the
registry's own `disabledWhen` field still reads correctly), and is revert-sensitive: temporarily
reverting `shell.js`'s `title:` line to the unconditional label failed exactly one of the two tests
before being reverted back.

### Files changed
- `src/views/analytics.js` — item 1 fix (auto-select effect dependency + guard).
- `src/lib/supabase.js` — item 2 (`_pagedParallel`'s `extraFilter` param; `loadDtHistory` rewritten
  onto it).
- `src/__tests__/fob-analysis-month-race.test.js`, `src/__tests__/dt-history-pagination.test.js`,
  `src/__tests__/forecast-audit-disabled-hint.test.js` — new tests, one per item.
- No item 3 production code change.
