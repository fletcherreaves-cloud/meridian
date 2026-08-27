# Dispatch #176 — EOM diagnosis: "FOB components vs target" check never fires (two-layer wiring bug)

## Owner context (2026-08-27, EOM inventory-count audit, count starts Sat 2026-08-29)

Item #2 from a PM-run audit of pending EOM/inventory items: the `fob-components` check
(`src/engine/eom-diagnosis.js`, `id:'fob-components'`, `order:10` — first in the registry, the
owner's own documented "ALWAYS start with FOB" step) is registered and enabled, but never
produces a finding for any store. Owner approved fixing this before Saturday.

**Mitigating factor, so scope this correctly:** the report text the owner actually reads
(`formatDiagnosisReport`'s FOB driver line, fed by `fobComponentDeltas()`) already surfaces the
same "which component is over target" story through a DIFFERENT, correctly-wired path — so
nothing is silently missing from the report. The bug is specifically that this never shows up as
a structured `Finding` in `result.findings`/`result.systemic` (used by the systemic-patterns
section and any future "editable check registry" threshold tuning the owner does).

## Root cause — TWO separate bugs stacked, both confirmed by reading the code, not assumed

**Bug 1 — `ctx.data.targets` is never populated.** The check (line ~53) reads
`const t = ctx.data.targets || {};`. `buildEomReport()` (`src/engine/eom-report-build.js`,
~line 34-52) receives a `targets` parameter and DOES use it elsewhere in the same function (line
~63-64, `tg.tFOBTarget` for the narrative FOB target line) — but the `data:` object it builds and
passes into `runDiagnosis()` (lines ~46-51: `fob`, `onHand`, `variance`, `waste`, `transfers`,
`unmatchedTransfers`, `selfServeTower`, `rawItems`) never includes `targets`. So `t` is always
`{}` inside the check, for every store, every time.

**Bug 2 — even with Bug 1 fixed, the key names don't match.** The check's own `COMPONENTS` array
(line ~55-58) uses the SAME long-form keys as `ctx.data.fob` (`compWaste`, `rawWaste`,
`condiments`, `empMgrMeals`, `statVariance`, `unexplained` — these match `ctx.data.fob`'s shape,
built at `eom-report-build.js` ~line 47, correctly). But it looks up the TARGET using
`t[key]` — i.e. `t.compWaste`, `t.rawWaste`, etc. The real target field names, per
`FOB_COMPONENTS` (`eom-diagnosis.js` ~line 771-774, the tuple array `fobComponentDeltas()` — the
ALREADY-WORKING sibling function — uses) are `tCompWaste`, `tRawWaste`, `tCondiment`, `tEmpFood`,
`tStatLoss`, `tUnex`. `t.compWaste` on a `DEFAULT_TARGETS`-shaped object is always `undefined`
regardless of Bug 1.

So fixing only Bug 1 would still produce zero findings — both must be fixed together.

## Task

1. Fix Bug 1: add `targets: targets || {}` (or equivalent) to the `data:` object
   `eom-report-build.js`'s `buildEomReport()` passes into `runDiagnosis()`.
2. Fix Bug 2: make the `fob-components` check use the REAL target key names. The cleanest fix —
   not mandatory, but strongly preferred per this repo's "check whether a helper exists before
   writing one" rule — is to have the check reuse `FOB_COMPONENTS`'s existing `[key, label, tk]`
   tuples (or `fobComponentDeltas()` itself) instead of maintaining a second, independently-named
   component list that can drift out of sync with the first the way it just did. If reusing
   `fobComponentDeltas()` directly isn't a clean fit (it expects `components` in SHORT-key form —
   `comp`/`raw`/`cond`/`emp`/`statv`/`unex` — not `ctx.data.fob`'s long-key form), at minimum add
   the correct `tk` mapping inline and use `t[tk]`, not `t[key]`. Use your judgment on which is
   cleaner; either is acceptable as long as the two component-target mappings can't independently
   drift again.
3. Do not change the check's threshold/severity logic (the `band` param, the `over > 0.01` high/
   medium split) — only the target lookup.

## Verification

- A test proving the `fob-components` check DOES produce a finding when a real component is over
  its real target, using realistic `DEFAULT_TARGETS`-shaped target data (not synthetic key names
  invented to make the test pass) — i.e. call `runDiagnosis`/`buildEomReport` the same way the
  real app does, with `targets` containing `tCompWaste`/`tRawWaste`/etc., and confirm a finding
  with `checkId:'fob-components'` appears in `result.findings`.
- A test confirming it does NOT fire when every component is within its target (no false
  positives introduced).
- Confirm `formatDiagnosisReport`'s existing FOB driver-line behavior (the path that already
  worked) is unchanged — this fix must not touch or regress that.
- Standard suite + build.

## Out of scope

- Any other check in `DEFAULT_CHECKS` — this is `fob-components` only.
- The `purchases-posted` stub (a separate dispatch, #177 — different root cause: no data source
  wired at all, not a key-mismatch).
