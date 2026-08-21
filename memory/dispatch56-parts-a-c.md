---
name: dispatch56-parts-a-c
description: Dispatch #56 Parts A and C, done. Part A -- a rule directory in the Security panel's Legend, rendered entirely from the live security_rules array (never hardcoded), collapsed by default, both domains shown, inactive rules listed not hidden. Part C -- inventory findings show the product name (qsr_variance_stat.descr) instead of a bare WRIN, joined on (loc, wrin, period) never (loc, wrin) alone. Parts B/D/E remain out of scope (investigation-first or a real build).
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #56 Parts A and C — rule directory, and a name instead of a WRIN

**2026-08-21**, immediately after dispatch #55 (both PRs merged). Executes Parts A and C of
`memory/dispatch-56.md` — the two parts the dispatch itself calls "cheap and independent," shipped
in one PR since both touch `src/views/security-panel.js` and neither depends on the other.
Parts B (employee start date — no such data exists, investigate first), D (instance/pattern/trend
+ subject history), and E (`transaction_detail`/`event_details` register-and-time pull) are **not**
built here — B is investigation work, D is a real feature (subject-history linking), E needs an
auth/endpoint investigation before any pull design.

## Part A — the rule directory

**Owner:** *"On the security tab in legend > Let's add directory of what each policy covers."*

Scoped against the code first, per the dispatch's own measurement: the per-rule plain-language
text already existed as `security_rules.description` (dispatch #46), already rendered under each
finding, and `loadSecurityRules()` already mapped every field the directory needed **except
`false_positives`** — one missing field, not a missing feature.

**`RuleDirectory`** (new component, `security-panel.js`), rendered inside `Legend` below its 8
vocabulary rows: collapsed by default (`useState(false)`, no new localStorage key — reuses the
legend's own remembered dismiss for the legend as a whole), grouped by domain (both shown
regardless of the panel's cash/inventory tab — this is reference material, "is there a rule that
covers X?", which a tab-filtered view can't answer). Per rule (`RuleDirectoryRow`): `method` (or
`ruleId`) + `ruleId`, `description`, `baselineType`, `logicType` + `windowDays`,
`investigationAction` ("say the number AND the decision" — CLAUDE.md's standing voice rule),
`falsePositives`, `severity`, and `active` — **an inactive rule is listed, not hidden**, marked
with the legend's own existing ⏸ wording (`CASH-003` is inactive today; omitting it would make a
reader wonder if it was removed rather than switched off).

**Renders entirely from the live `rules` array — never a hardcoded list.** This is the dispatch's
own stated risk: this repo paid for exactly this class of drift three times in one week (Job A's
stale `'Proj Workflow'` label, dispatch #52's 15 schema-drift columns, `proj`'s false
`section:'planning'`). The test suite's own anti-hardcode check adds a rule to the fixture that
exists in **no real schema file anywhere in this repo** (`ZZZ-999`, "Synthetic Anti-Hardcode
Rule") and asserts it renders — a component built from a literal list would pass every other
assertion in the suite and fail only this one.

**Free win, explicitly scoped into Part A by the dispatch's own text:** `security_rules`'s
`corroboration_rules`/`exoneration_rules` columns are populated but were dropped by
`loadSecurityRules()` — "which other rules strengthen or weaken this one," already authored,
invisible until now. Mapped alongside `false_positives` and surfaced in the directory as
"Corroborates with: X" / "Weakened by: Y". **The finding-level cross-link** (showing a
corroborating rule on an actual finding when it fired on the same subject) is Part D's own
deliverable, not built here — this is only the directory half of that free win.

## Part C — a product name, not a bare WRIN

**Owner:** *"For the Inventory policies, list the name of the product as well as any other
pertinent information the discovery."*

`security-panel.js` rendered every inventory subject as `` `Item ${group.wrin} (store
${group.loc})` `` — both in the row heading and in the decision-sentence subject label. The name
was already in the data (`qsr_variance_stat.descr`), just never joined in.

**New helper, `inventoryItemKey(group, domainRuleIds)`** — exported, pure: derives the
`(loc, wrin, period)` key for a wrin subject from its own latest inventory verdict's `windowEnd`,
sliced to `'YYYY-MM'` (`qsr_variance_stat.period`'s own grain). **Never `(loc, wrin)` alone** —
dropping `period` inflated a real join ~3.5x during the 0013113 investigation (658 rows vs the
correct 188, `memory/finding-store-13113-packaging-variance-2026-08-21.md`). This is the *same*
period derivation `SubjectDrilldown` (dispatch #52) already did inline for its population-baseline
fetch — factored out so the two can't drift apart; `SubjectDrilldown`'s own inline computation now
calls the shared helper instead of a second copy.

**`SecurityPanel` gained an `itemInfo` lookup** (`${loc}|${wrin}|${period}` → `{descr, cls}`),
populated by a `React.useEffect` that fires while viewing the Inventory tab: computes the distinct
periods actually present among the currently-visible groups, fetches
`loadQsrVarianceStat({period})` for any period not already resolved (a `loadedPeriodsRef` Set
guards against re-fetching when `groups` gets a new reference from an unrelated filter change —
scope/ruleFilter/minSignals), and merges the result into `itemInfo`. `SubjectRow` uses it to build
the heading (`descr` as the primary text, WRIN as a smaller secondary span) and the decision
sentence's subject label; falls back to the old bare-WRIN text when no `descr` resolves for that
period (period not yet loaded, or `qsr_variance_stat` genuinely has no row for it). `cls` (item
class) renders as a small badge next to the Store label when present. `lifecycle_category` needed
no new plumbing — it's already carried per-verdict from `security_findings.lifecycle_category`
and already routes to the Hygiene lane; the dispatch's ask was already met there.

### The one real behavior change, and why the pinned dispatch #52 test was updated, not weakened

This is a genuine, if small, departure from dispatch #43's "nothing fetches until a click"
discipline: viewing the Inventory tab now issues one `loadQsrVarianceStat({period})` call per
distinct period present, before any row is expanded. That discipline previously governed the
*drill-down's* population/history pull specifically (a much heavier multi-period fetch, still
genuinely gated behind "🔎 Investigate further"); Part C's fetch is a single bounded call for
whichever period(s) are already on screen, which is what the dispatch calls "nearly free."

The dispatch #52 test (`'inventory: clicking "Investigate further" fetches on demand...'`)
originally asserted `loadQsrVarianceStatMock` was **not called at all** before the click — that
assertion is now false, on purpose. Rather than loosen it to "called some number of times," it now
proves both halves explicitly: `toHaveBeenCalledTimes(1)` immediately after selecting the
Inventory tab (Part C's preload, and only that), still `toHaveBeenCalledTimes(1)` after merely
*expanding* the row (proving the drill-down does **not** eagerly fire on expand), then
`toHaveBeenCalledTimes(2)` only after the explicit "Investigate further" click. A test that only
loosened the original assertion would have stopped seeing the regression class dispatch #43's rule
exists to prevent; this one still sees it.

A defensive `(rows || [])` was added around the preload's row-merge loop — the real
`loadQsrVarianceStat` always resolves to an array (`return (data || []).map(...)`), but an
unconfigured test mock elsewhere in the suite (the dispatch #50 Part A scroll tests, which render
inventory-domain findings without ever setting up `loadQsrVarianceStatMock`'s resolved value)
returns `undefined` by default, which would otherwise throw inside the effect's async IIFE.

## What was NOT touched, and why

- **Parts B, D, E** — per the dispatch's own instruction, B is investigation-first (no hire-date
  field exists anywhere in this repo — a future session should check LifeLenz/QSRSoft Register
  Audit before building anything, and never label a derived "first seen" proxy as a real start
  date), D is subject-history linking (a real build reusing `security_findings` directly, not
  bundled here), E needs an auth-shape investigation (`event_details`/`transaction_detail`) before
  any pull can be designed. None of these were started.
- **The finding-level corroboration/exoneration cross-link** — Part D's own deliverable ("on a
  finding where a corroborating rule actually fired on the same subject"). Only the directory's
  static list of which rules relate to which was built here.
- **A shared population-rows cache across the preload and the drill-down** — considered (having
  `SubjectDrilldown` reuse the same `loadQsrVarianceStat({period})` result Part C's preload already
  fetched, avoiding the duplicate network call entirely) but would have required threading a new
  prop through `SubjectRow` → `SubjectDetail` → `SubjectDrilldown`, three components deep, for a
  fetch the dispatch itself already called "nearly free." Deferred rather than gold-plated; a
  future session revisiting the drill-down's own performance can add loader-level caching
  (mirroring `loadQsrVarianceHistoryAll`'s existing `_varHistCache` TTL pattern) if the duplicate
  call ever matters in practice.

## Verification

`src/__tests__/security-panel.test.js`: 6 net new tests. Part A — collapsed by default (no rule
text in the DOM until opened), all 10 fixture rules render by `ruleId` (counted, not
spot-checked), the anti-hardcode fixture rule renders, an inactive rule is listed with ⏸,
`investigationAction`/`false_positives` render, `corroboration_rules`/`exoneration_rules` render.
Part C — a descr-bearing fixture shows the product name as the heading with the WRIN still visible
as a secondary identifier, and the old bare-`Item CUP` text is gone; the pre-existing dispatch #52
drill-down test updated per above.

1880/1880 tests. Build clean, entry chunk 1717.61 KB / 510.69 KB gz vs. 1717.49 KB / 510.68 KB gz
on `main` before this PR — essentially flat (`security-panel.js` is already lazy-loaded).
