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
`rawWaste`.
