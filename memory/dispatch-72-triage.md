---
name: dispatch-72-triage
description: Per-site triage of all 25 no-undef findings in src/. Every one is a genuine out-of-scope read -- zero false positives. Graded by whether the throw is unconditional or short-circuit-guarded, and by whether a swallowing handler hides it. Four are unconditional throws on reachable paths, including one that breaks the Patch and Org nav views outright.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #72 — triage of all 25 `no-undef` sites in `src/`

Companion to `memory/dispatch-72.md`. Owner approved the permanent fix ("*Let's do the permanent
fix, whatever that is*") and left the plan to me.

## Verification standard used — read this before trusting a row

Each site was graded by **reading the enclosing function boundaries and the declaration site**, and
by checking whether the call path is reachable. That is the same standard the first three were
graded at.

⚠️ **Runtime confirmation was attempted and is INCOMPLETE.** I rendered `OrgView` in happy-dom to
prove the `priceChanges` throw; the probe died earlier on a different error
(`TypeError: Cannot read properties of undefined (reading 'filter')`) because my minimal fixture
was too thin to reach line 2059. **So the static case is strong and the runtime case is unproven.**
Each fix must carry a test that reaches the line — that is where the runtime proof belongs, not in
the triage.

📌 **Zero false positives.** All 25 are genuine out-of-scope reads. The rule earns its place.

---

## 🔴 Class A — unconditional throw on a reachable path

### A1. `src/views/store-dash.js:2059, 2070` — `priceChanges` · **worst of the set**

`priceChanges` is declared at **`:1937`, inside `DistrictGrid`** (`function DistrictGrid(...)` at
`:1876`). Lines 2059 and 2070 are inside **`OrgView`** (`function OrgView(...)` at `:2035`) — a
sibling function. Lines 2021/2029 use it legitimately and are *not* flagged; only the two inside
`OrgView` are.

**`OrgView` is a top-level nav view**, rendered from `App.js:2767` (`view==='patch'`) and
`:2768` (`view==='org'`). Line 2059 is in `GroupCard` (operator/patch views); line 2070 is the
`view==='all'` branch. **All three of its tabs touch it.**

⚠️ Its render is not wrapped in a try/catch, so this should surface as a React error boundary or a
blank panel — **which makes "nobody reported it" the surprising part.** Confirm against the live app
before assuming the severity; a possibility worth excluding is that these nav entries are
role-gated or rarely used.

### A2. `src/views/fob-eom.js:292` — `period` in `analyzeData`'s return

`analyzeData({contributors, onHand, summary, variance, pl})` (`:223`) returns
`{ …, period, … }` as a shorthand property. **`period` is not a parameter and not in scope.** The
file's own comment at `:230` says *"period is derived from filename in the calling component"* —
and the calling component does have it (`:860`), which is exactly how the reference got written.

Called at **`:850`**. Throws on **every** invocation.

### A3. `src/app/App.js:2532, 2534` — `setShowDev`, `setShowInsights` never existed

Both appear **only** at these two lines — there is no `useState` pair for either. They are
leftovers from removed panels.

They sit in a long "close everything" sequence
(`setShowDataManager(false);setShowDev(false);setShowDialedIn(false);…`). **A throw partway through
aborts every setter after it**, so panels later in the list stay open. The symptom is not "an
error" — it is *"closing didn't fully work"*, which is exactly the kind of thing a user works
around instead of reporting.

### A4. `src/views/analytics.js:5966` — `selectedLocs`, `allLocs` out of scope

`allLocs` is declared at `:2043` and `:2898` — both in **other** components. `selectedLocs` has no
declaration in scope here.

The line builds the download filename **after** `a.href = URL.createObjectURL(...)` and **before**
`a.click()`. So the blob is created, the throw lands, and **the download never fires** — a
CSV-export button that does nothing.

---

## 🟠 Class B — real, but short-circuit-guarded (throws only sometimes)

### B1. `src/features/projections.js:616` — `DEF_SETTINGS`
`settings.operators || DEF_SETTINGS.operators || {}` — only evaluated when `settings.operators` is
falsy. Almost certainly just a missing import from `constants.js`; verify it is the right symbol
rather than assuming.

### B2. `src/features/projections.js:1816` — `loc`
`fetchLY(ds.laborIdx, ds.laborRows, r.loc || loc, r.date)` — only evaluated when `r.loc` is falsy.
⚠️ **Do not "fix" by inventing a fallback.** Establish whether `r.loc` can ever be empty; if it
cannot, the correct change is to drop `|| loc`, not to define one.

### B3. `src/engine/why.js:113` — `wind`
`… : wind>30 ? 'high winds ('+wind+'mph)' : ''` inside a ternary chain. Reached only when rain
≤ 0.25 **and** 35 ≤ tmax ≤ 95 — **ordinary weather, so this fires often.** `wRow.wmax` is the
field used for wind at `:39`; that is the likely intent, but confirm.

---

## 🟡 Class C — reachable, needs a call-path read before deciding

### C1. `src/engine/why.js:40, 46, 47` — `loc` in `lookupMissEvent`
`async function lookupMissEvent(date, affectedStores, wRow, setResult, affectedLocs)` — **`loc` is
not a parameter.** Used for `STORE_COORDS[loc]` and as a fallback in two more places. Being `async`,
the throw rejects the returned promise, so **whether anything surfaces depends entirely on the
caller**. Read the caller before choosing between adding a parameter and removing the references.

### C2. `src/engine/pipeline.js:42, 43, 77` (`filename`) and `:69, 75` (`file`)
Enclosing function is **`buildDS(workbooks)`** (`:16`); neither identifier is a parameter. The three
blocks that use them — `type==='projections'`, `type==='dar'`, `type==='pmix'` — are **indented
differently from the surrounding `else if` chain** (2 spaces vs 6), the signature of code pasted in
from a function that *did* have them in scope.

⚠️ These are on **file-upload paths**. If they throw, dropping a projections / DAR / PMix workbook
fails. **Check each for an enclosing try/catch before grading severity** — the neighbouring
`parseCtrlData`/`parseFOBData` calls at `:37-38` are wrapped, these may not be.

---

## Recommended sequence

1. **A1–A4 first**, each with a test that reaches the line and fails without the fix.
2. **B1–B3**, and for B2 resolve intent rather than inventing a fallback.
3. **C1–C2**, reading callers first.
4. **Only then extend the `no-undef` guard to `src/**/*.js`** — the same test added in #563,
   widened. That is the part that makes it permanent; without it this recurs on the next refactor.

⚠️ **Do not widen the guard before the list is clear** — it would block every merge from that
moment.

📌 **The pattern worth carrying out of this:** of the 25, the ones that survived longest are the
ones inside `try{}catch{}`, `.catch(()=>{})`, or a short-circuit. An undefined identifier that
throws loudly gets fixed; one that is swallowed becomes a feature that quietly does not work.
Same shape as #66's swallowed navigation error, #71's silent 200-with-no-rows, and #563's own

---

## Resolution (2026-08-22)

All 25 sites fixed, sequenced exactly as prescribed (A → B → C → widen), each with a
revert-sensitive test (stashed the fix, confirmed the test fails with the ORIGINAL pre-fix
error text, restored, confirmed it passes) before moving on. 8 new test files, 16 new tests.

**A1** (`store-dash.js` `OrgView` — `priceChanges`): threaded `ds` through from `App.js`'s two
`h(OrgView,{...})` call sites (`view==='patch'`/`view==='org'`), added `OrgView`'s own
`priceChanges` `useMemo` reusing the already-imported `lastPriceChangeByStore`, identical to
`DistrictGrid`'s own pattern. Test renders `OrgView` directly (exported), fixture with a
confirmed 14/14-day price step, asserts "Last price change" text + no throw on both the
operator-grouped and All-Stores views (the two read sites). Reverting reproduced the exact
`ReferenceError: priceChanges is not defined`.

**A2** (`fob-eom.js` `analyzeData` — `period`): threaded `period` through as an explicit
parameter; the caller's own `period` useMemo (filename-parsing) was reordered to compute before
`analysis`'s useMemo so it could be passed in. `analyzeData` exported for the test (module-
private otherwise, pure function). Reverting reproduced `ReferenceError: period is not defined`
at the exact original line.

**A3** (`App.js` Universal Escape hatch — `setShowDev`/`setShowInsights`): removed both calls;
neither state ever existed anywhere in the file (confirmed by grep). Because this is one
function body with no try/catch, the ReferenceError at `setShowDev(false)` — the SECOND
statement in the sweep — was aborting every setter after it, meaning Escape was silently broken
for nearly all ~70 modals in the sweep, not just these two. Verified via a file-scoped
`no-undef` ESLint check (same technique as #563, scoped to `App.js` alone) — reverting
reproduced both original ReferenceErrors by name.

**A4** (`analytics.js` `DateRangeReport.exportCSV` — `selectedLocs`/`allLocs`): neither ever
existed; the component's real selection state is `selLocs` (array, with `'all'` as a sentinel,
not a same-length-array convention). Rewrote the scope label as
`selLocs.includes('all') ? 'AllStores' : ...`, matching `buildReport`'s own resolution logic two
lines above. Renders the real `DateRangeReport` consumer, clicks Generate Report then Export
CSV, asserts the download actually fires (`a.click()` intercepted) with the right filename.
Reverting: the ReferenceError fires after the blob/`<a>` are built but before `.click()`, so the
pre-fix test correctly shows zero clicks recorded (React logs the error; nothing else observes
it) — the exact "silent" symptom the triage predicted.

**B1** (`features/projections.js` — `DEF_SETTINGS`): was never imported; added to the existing
`../constants.js` import. Renders `ProjectionWorkflow` with `settings.operators` absent
(exercises the fallback branch) — reverting reproduced `ReferenceError: DEF_SETTINGS is not
defined`.

**B2** (`features/projections.js:1820` — `r.loc||loc`): traced every row in
`weekData[deepStore]` back to `computeWeek`'s `rows.push({...r,date:d,loc,...})`, where `loc`
comes from `for(const loc of ALL_LOCS)` and `ALL_LOCS` is `stores` filtered through `/^\d+$/` —
never empty. So `r.loc` can never be falsy for any row this table actually renders; the `||loc`
fallback was dead code masking the bug, not a real guard. Per the triage's own instruction,
removed rather than given a second invented fallback. Because the buggy branch is provably
unreachable through the real pipeline, a render test can't discriminate pre/post-fix (the free
`loc` is never evaluated either way) — verified via the same file-scoped `no-undef` check as B1
(shares the file). Reverting reproduced both `'DEF_SETTINGS' is not defined` and `'loc' is not
defined` by name and line.

**B3** (`engine/why.js:113` — bare `wind` in the weather-description ternary chain): `wRow`'s
wind field is `wmax` (confirmed by this same file's own line 39 usage). Added
`const wind=wRow?wRow.wmax||0:0;` before the ternary. `diagnoseMiss` (already exported, pure)
called directly with a fixture reaching the wind branch (rain≤0.25, 35≤tmax≤100, wmax>30) —
asserts the real wind speed appears in the text, not just no-throw. Reverting reproduced
`ReferenceError: wind is not defined`.

**C1** (`engine/why.js` async `lookupMissEvent` — bare `loc` at 3 spots): its one real call site
(`store-dash.js:746`) passes the caller's own `loc` positionally as `affectedStores` — the
function was already deriving the same value further down as `firstLoc`, just too late to help
`thisCoord` above it, and still falling back to the nonexistent `loc`. Computed once, up front,
from `affectedStores`; `firstLoc` collapsed into the same variable. Because the function is
`async`, the synchronous ReferenceError doesn't throw at the call site — it silently rejects the
returned promise, which the fire-and-forget `onClick` never awaits or catches. Test calls
`lookupMissEvent` directly, asserts the returned promise RESOLVES (`.resolves.toBeUndefined()`)
rather than rejecting. Reverting reproduced the promise rejecting with `ReferenceError: loc is
not defined`.

**C2** (`engine/pipeline.js` `buildDS` — `filename`/`file.name`): `mergeDS` (the function this
codebase actually calls with real workbooks) already takes `filename` as an explicit parameter
and handles the identical four types (`projections`/`inventory`/`dar`/`pmix`) the same way.
Threaded `filename` through `buildDS`'s own `for(const{wb,type,filename}of workbooks)`
destructure and replaced the two `file.name` reads with `filename`. `buildDS` is currently only
ever called with an empty array (`App.js:2066`), so these branches are unreachable in production
today — but the loop's own `try/catch` (line ~94, `console.warn('Parse error:',...)`) would
silently swallow the error and drop the file the moment anything calls `buildDS` with real
workbooks. Test spies on `console.warn` (the catch's own logger — only fires on a real
exception) and asserts it's never called across all four fixed types, plus checks
`ds.pmixData` keys off the real filename. Reverting reproduced all four original errors by name
(`'filename' is not defined` ×2, `'file' is not defined` ×2).

**Widened guard**: `src/__tests__/src-no-undef.test.js` runs ESLint's `no-undef` over
`src/**/*.js`, mirroring #563's `scripts/`-scoped test. Added only after every known site was
fixed and verified, per the explicit sequencing warning above.

**3 more sites found while sequencing the fix** (discovered when the widened guard first ran
clean-except-for-these, i.e. NOT part of the original 25 — the sweep tool that found the
original 25 evidently didn't cover these three files/lines, unclear why; measured, not
theorized about further):
- `analytics.js:5044` — `generateReviewPack` (📤 Pack button's onClick): defined in
  `features/calendar.js` but never exported or imported into `analytics.js`. Exported it and
  added the import.
- `labor-tools.js:518` — `_masgnInvalidate` (Model Assignment "clear override" button, inside a
  bare `catch{}`): exported from `engine/forecast.js` and correctly imported by `App.js` and
  `backtest.js`, but never imported here. Added to the existing import. Silent effect: the
  model-assignment cache (`_masgnCache` in forecast.js) never invalidated after a cleared
  override, so `getModelAssignment` could keep serving the stale model until an unrelated write
  happened to reset the cache.
- `store-analytics.js:1802` — `saveSettings` (StoreDash's auto-calibration effect, deep inside
  `dialedInEnabled && (10+ new rows || first run) && improved MAPE`, wrapped in
  `.catch(()=>{})`): never a prop or local of `StoreDash`; App.js's own `saveSettings`
  useCallback never crossed the `h(StoreDash,{...})` boundary at `App.js:2772`, unlike
  `DialedInPanel`'s identical `onUpdateSettings:saveSettings` wiring a few hundred lines away.
  Added `onUpdateSettings` as an explicit prop (threaded from `App.js`), matching the
  `DialedInPanel` convention. Per the dispatch16 sharpened "would this verification still pass
  if reverted" rule (#366's engine-vs-wiring gap), a static no-undef check alone can't tell "the
  prop is threaded end-to-end" from "the prop exists but the call site forgot to pass it" — so
  this one got a full render test (mocks `calibrateStore` + `forecastRangeAsync`, asserts
  `onUpdateSettings` is actually invoked with the calibrated result). Reverting the
  `store-analytics.js` half alone reproduced the exact silent-failure symptom: the mock is
  called 0 times, no thrown error visible anywhere (swallowed by the internal `.catch(()=>{})`).

**Final verification**: 188 test files / 2064 tests, full suite green. Build clean, entry-eager
payload 516.95 KB gzipped (budget 850 KB, 333 KB headroom) — no meaningful chunk-size change
from this PR (all edits are inside already-lazy-loaded panels or shared engine files with no new
imports added to `App.js`'s static graph, except `_masgnInvalidate` and `generateReviewPack`,
both of which were already inside their consumers' existing lazy chunks).
