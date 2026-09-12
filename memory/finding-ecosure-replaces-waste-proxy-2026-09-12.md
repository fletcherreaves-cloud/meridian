# Visit Readiness — real EcoSure result now replaces the waste/variance proxy (2026-09-12)

Follow-on to `memory/finding-ecosure-propel-api-2026-08-22.md`'s explicit instruction: *"replace
the proxy entirely rather than relabelling it"* once real EcoSure data exists. Dispatch #231
(2026-09-05) had already measured the proxy near-uncorrelated with real outcomes (Spearman
r=0.07, n=240, `backtestFoodSafetyProxy`/`res.fsBacktest`) and confirmed the live counterexample
(Ardmore-Broadway: proxy said `elevated`, the real EcoSure audit scored 86/100 and passed clean).
That measurement sat unused — the composite's `fsFlag` still came from the waste proxy alone,
even for a store with a current real EcoSure result on file. This closes that gap.

## What existed already (mapped before building, per "check whether a helper exists" rule)

- `parseEcoSureVisit()` (`src/parsers/graded-visits.js`) — full parser, wired to a real
  drag/drop upload panel (`GradedVisitsPanel`, `src/views/graded-visits.js`), plus bulk-backfill
  scripts. Produces `{score, pass, modules:{criticalFailCount, citedItems:[...], sections, ...}}`.
- `graded_visits` Supabase table, RLS'd, round-tripped via `saveGradedVisits`/`loadGradedVisits`.
- `computeVisitReadiness`'s `lastVisitByLoc` already surfaced `criticalFailCount` per store
  (dispatch #231 follow-on) — but only for whichever visit was MOST RECENT of any type, and only
  as a display-only badge. Nothing computed a flag from it.
- `backtestFoodSafetyProxy` / `res.fsBacktest` — the leak-free validation card. Untouched by this
  change; it's a district-wide model-check, not a per-store live signal.

**Nothing previously computed a food-safety FLAG from real EcoSure data at all.** `fsFlag` was
100% the waste proxy, regardless of whether a real, current EcoSure visit existed for that store.

## What changed

`src/engine/visit-readiness.js`, inside `computeVisitReadiness`:

1. A new per-store lookup, `lastEcoSureByLoc`, built in the same pass as `lastVisitByLoc` but
   filtered to `reportType` resolving to `'EcoSure'` (reuses the existing `_cadenceKey` classifier)
   — independent of `lastVisitByLoc`, which tracks the most recent visit of ANY type and is often
   a CFV or RGR, not an EcoSure.
2. "Current" is defined the same way the panel already defines "overdue" for any visit type:
   `daysSince(eco.ms) <= overdueThresholdDays('EcoSure')` (≈364 days, 2× the ~182-day EcoSure
   cadence). A pass/fail from over a year ago isn't trusted as still true today — the proxy fills
   that gap instead, exactly as it always did.
3. When current, `fsFlag`/`fsScore` are computed from the REAL visit: `criticalFailCount > 0` →
   `'elevated'` (always, regardless of overall score — the one thing the original finding warned
   must never be hidden); else `pass === false` → `'watch'`; else `pass === true` → `'low'`;
   falls back to the same 75/55 score cut the proxy uses only if `pass` itself is absent.
4. When no current EcoSure exists, behavior is **unchanged**: `fsFlag`/`fsScore` from the waste
   proxy (`FOODSAFETY` sub-score), exactly as before.
5. New per-store fields: `fsSource` (`'ecosure'|'proxy'|'unknown'`), `fsAsOf` (the EcoSure visit
   date, when source is ecosure), `fsEcoSure` (the EcoSure record itself — present even when
   stale, `fresh: boolean`, so a caller can say "on file but not current" rather than just "no
   data"; `null` only when the store has no EcoSure visit of any age on record).
   `fsDrivers`/`fsMissing` are **unchanged in meaning** — always the proxy's own metrics,
   regardless of which source actually won — so the proxy stays visible as background/diagnostic
   depth even when it isn't what decided the flag (the standing "voice by role" rule: depth is
   preserved, not hidden).

`buildWhy`/`buildVerdict` now share one helper (`_fsNote`) that phrases the tack-on note
correctly for whichever source produced the flag — a real critical reads *"Its most recent
EcoSure Food Safety visit (date) had N critical fail(s) — this is a real result, not a proxy"*,
never the old generic "waste & variance proxies are elevated" wording, which would now be false.

`READINESS_GAPS`'s 'Food Safety criticals' entry rewritten to say what's actually true today
(real result used when current; proxy fills the gap between visits) instead of "not predicted —
proxy flag only". 'EcoSure calibration' entry kept as-is (the r=0.07 measurement is still
accurate and is exactly why the proxy was demoted) with one added sentence connecting it to this
change.

## UI (`src/views/visit-readiness.js`, `src/views/visit-readiness-report.js`)

- New badge map `FS_ECO` (`'EcoSure: Pass'/'Watch'/'CRITICAL'`), picked via `fsBadge(s)` instead
  of the old bare `FS[s.fsFlag]` lookup, wherever the badge renders (collapsed row, coaching
  one-pager, printed audit report pill/summary table). Reusing the "W&V ..." label for a real,
  dated audit result would UNDER-state a genuine finding the same way the proxy used to
  OVER-state a fake one — so the wording has to change, not just the color.
- `StoreAudit`'s calibration footer (`FsExplainer`) branches: real-EcoSure mode leads with the
  visit date, score, and cited items (`fsEcoSure.citedItems`); the waste proxy still prints
  underneath, explicitly labeled "background only — a current EcoSure result always takes
  priority." Proxy-only mode is the original explanation, byte-identical to before.
- CSV export gets a new `Food-safety source` column and, when present, a dedicated EcoSure-visit
  row (date, score, critical count, fresh/stale) alongside the existing proxy-metric rows.
- Printed audit report: pill and summary row append the source; per-store detail gets an
  `ecoBlock` (real visit + cited items) ahead of the (now explicitly labeled "background only")
  proxy table when `fsSource === 'ecosure'`.

## What did NOT change (deliberately)

- The readiness composite (Speed/Accuracy/Quality/Leadership) is untouched — EcoSure criticals
  stay excluded from it, same as before this change. Cook-temp/pest criticals are still not
  operational-metric-inferable; they just no longer need to be inferred for a store with a
  current real result.
- `backtestFoodSafetyProxy`/`fsBacktest` — the leak-free calibration card — is unchanged. It
  validates the proxy's own predictive power in the abstract; this change is about which signal
  actually drives a live store's flag, a different question.
- Ingestion (parser, upload panel, storage) — already fully built (see "what existed already"
  above); this dispatch only consumes it differently. See
  `memory/finding-ecosure-propel-api-2026-08-22.md` for why real-time automated EcoSure pulls
  remain impossible (SSO + enforced MFA) and manual/on-demand capture is the permanent design,
  not a temporary gap.

## Tests

`src/__tests__/dispatch-ecosure-real-signal-2026-09-12.test.js`, 7 tests:
- The Ardmore-Broadway counterexample reproduced directly: bad waste-proxy data + a current clean
  EcoSure pass → `fsFlag: 'low'`, `fsSource: 'ecosure'`.
- The reverse: good waste-proxy data + a current EcoSure critical → `fsFlag: 'elevated'`,
  `fsSource: 'ecosure'` — a real critical always wins.
- No EcoSure on record at all → falls back to the proxy exactly as before (regression).
- A stale EcoSure visit (older than `overdueThresholdDays('EcoSure')`) → falls back to the proxy,
  `fsEcoSure.fresh === false`.
- `lastEcoSureByLoc` resolves independently of `lastVisitByLoc` when a more recent CFV exists.
- `READINESS_GAPS`' wording no longer claims proxy-only.
- A real render of `VisitReadinessPanel` (not just the engine) showing "EcoSure: CRITICAL" for
  one store and the honest "W&V ..." label for a sibling store with no EcoSure on file — per the
  standing "would this verification still pass if reverted" rule.

All 7 confirmed to fail against pre-fix code (`git stash` round-trip). Full suite 505/505 files,
4770/4770 tests. Build clean, 541.49 KB / 850 KB eager-payload budget.
