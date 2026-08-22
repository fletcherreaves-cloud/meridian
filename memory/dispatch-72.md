# Dispatch #72 — `no-undef` across `src/`: 25 sites, at least 3 are live bugs

**Status:** written, awaiting the owner's call on scope (see "The decision" below).
**Origin:** fell out of #563's guard for `scripts/`. Not a lint-hygiene chore.

---

## Why this exists

`eslint.config.js` scopes its only block to `**/*.{ts,tsx}`, and this project is plain JS by
design (CLAUDE.md: *"No TypeScript — plain JS with `// @ts-nocheck`"*). **So `npm run lint` matches
zero files and has always been a silent no-op**, and `ci.yml` runs only `npm test` and
`npm run build`.

That hole let `rawWaste` sit undefined in `qsrsoft-variance-pull.mjs` for two days, failing 100% of
stores (#563). Running the same `no-undef` check over `src/` finds **25 sites across 9 files**.

📌 **I first estimated this as "likely a flood" and said so. It is 25 — measure, don't reason.**

## 🔴 Three verified live bugs — checked at the call site, not inferred from the list

### 1. `src/views/labor-tools.js:518` — `_masgnInvalidate` is never imported here

```js
const clearOvr = (loc,hz) => {
  try{ …localStorage.setItem(MODEL_ASSIGNMENT_KEY,JSON.stringify(o));
    _masgnInvalidate();}catch{}          // ← ReferenceError, swallowed
  _pushModelAssignments(); refresh();
};
```

`_masgnInvalidate` is exported by `engine/forecast.js` and imported in `app/App.js:26` and
`engine/backtest.js:6` — **but not in `labor-tools.js`.** The call sits inside `try{…}catch{}`, so
the ReferenceError is **swallowed silently**.

**Effect:** clearing a per-store model override writes localStorage but **never invalidates the
in-memory assignment cache**. The override looks cleared and the old model keeps being used until
a reload. Fix is one import.

### 2. `src/views/analytics.js:5044` — `generateReviewPack` is never imported

It is the `onClick` for the **📤 Pack** button, and it is **not** inside a try/catch.

**Effect: the button throws on click and does nothing.** Straightforwardly broken in the UI.

### 3. `src/views/store-analytics.js:1802` — `saveSettings` is not defined

```js
calibrateStore(...).then(result => { … saveSettings(next); }).catch(()=>{});
```

Inside a promise chain terminated by `.catch(()=>{})` — **swallowed again.**

**Effect:** auto-calibration computes a better MAPE and **never persists it**. Silent.

⚠️ **Two of these three are hidden by a bare `catch{}` / `.catch(()=>{})`.** That is the pattern
worth taking from this dispatch: an undefined identifier inside a swallowing handler produces
*no symptom at all* — the feature just quietly doesn't work. It is the same failure shape as #66's
swallowed navigation error and #71's silent 200-with-no-rows.

## The remaining 22 — triage required, NOT assumed to be bugs

| file:line | identifier |
|---|---|
| `app/App.js:2532,2534` | `setShowDev`, `setShowInsights` |
| `engine/pipeline.js:42,43,77` | `filename` |
| `engine/pipeline.js:69,75` | `file` |
| `engine/why.js:40,46,47` | `loc` |
| `engine/why.js:113` (×2) | `wind` |
| `features/projections.js:616` | `DEF_SETTINGS` |
| `features/projections.js:1816` | `loc` |
| `views/analytics.js:5966` (×4) | `selectedLocs`, `allLocs` |
| `views/fob-eom.js:292` | `period` |
| `views/store-dash.js:2059,2070` | `priceChanges` |

⚠️ **Do not batch-fix these.** Each needs the same treatment the three above got — read the call
site and establish whether the code is reachable and what the symptom is. Some may be genuinely
dead branches. **A "fix" that invents a plausible variable name is worse than the bug**, and
`priceChanges`/`selectedLocs` in particular look like they may want a value that no longer exists
in scope rather than a missing import.

## The decision — owner's call, two parts

1. **Turn the gate on?** Adding `src/**/*.js` to the `no-undef` guard means **CI starts blocking**
   on it. That cannot happen until the 25 are resolved (or explicitly waived), so it is a
   sequencing decision, not just a yes/no.
2. **Who fixes them?** The three verified bugs are one-line import fixes and could land
   immediately. The other 22 are a triage pass.

**Recommendation: split it.** Land the three verified fixes now with a test each (they are small,
confident and user-visible), and take the remaining 22 as a separate triage dispatch that ends with
the `src/` gate switched on. Turning the gate on is the only part that makes the fix permanent —
without it this recurs the moment someone deletes another line in a refactor.

## Verification bar

Same as #563: each fix must be **revert-sensitive**. For the three above that means a test that
exercises the actual consumer — clearing an override and asserting the cache invalidated, clicking
Pack, persisting a calibration result — **not** merely asserting the import exists. An import-
presence assertion passes with the feature still broken.
