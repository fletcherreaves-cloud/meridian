# Smart Targets: vs-Official math + FOB % component breakdown (2026-09-14)

Owner request, two parts, off a screenshot of Smart Targets on FOB % (food cost):
1. "figure out the vs. official math" — explain/verify what `VS OFFICIAL` computes.
2. Add the 6 components of FOB to the view, guaranteed to sum to the Smart FOB target.

## Part 1 — vs Official (no code change; confirmed correct)

`src/views/smart-targets.js`'s model memo:
```js
const vsOff = (smart != null && official > 0) ? (smart / official - 1) * 100 : null;
```
A relative **percent** difference of Smart vs. Official — not a percentage-**point** gap.
Direction-aware coloring (`vsGood`) treats negative as good for a `direction:'lower'` metric
(FOB, labor %, speed) and positive as good for `direction:'higher'` (sales).

Spot-checked every row in the screenshot against `(smart/official-1)*100` using the *displayed*
2-decimal-rounded Official/Smart percentages: every value fell within the plausible rounding
envelope (e.g. Freeport: displayed −2.55%, recomputed from rounded inputs −2.42%, but the true
inputs carry more precision than the 2-dp display — official∈[3.295,3.305], smart∈[3.215,3.225]
brackets −2.12%..−2.72%, which contains −2.55%). Two rows (Ponce de Leon, Duncan) matched to the
hundredth exactly. **No bug** — the column is computed correctly from full-precision values; a
manual recompute off the rounded 2-decimal display will differ by a few hundredths to a few
tenths of a point purely from that rounding, which is expected, not evidence of an error. Owner
confirmed understanding mid-session; no code change made for this part.

## Part 2 — FOB % component breakdown

### What was already true

- `DEFAULT_TARGETS` (`constants.js`) already carries per-store OFFICIAL component fields —
  `tCompWaste`/`tRawWaste`/`tCondiment`/`tEmpFood`/`tStatLoss`/`tUnex` — and these 6 already sum
  **exactly** to `tFOBTarget` for every store checked (e.g. store 3708: .002+.0035+.0205+.002+
  .0105+0 = .0385 = tFOBTarget). So the Official side of the breakdown needed no computation at
  all, just a direct field read — confirmed by a new test that sums all 6 for store 3708.
- `fobMonthly()` (the FOB metric's `fetch`) already reads all 6 raw dollar fields
  (`compWasteAmt`/`rawWasteAmt`/`condimentsAmt`/`empMgrMealsAmt`/`statVarianceAmt`/
  `unexplainedAmt`) off `qsr_fob`, just to sum them into one `v` (%) per month — the components
  were being computed and discarded.

### The hard part: guaranteeing the sum, not just approximating it

The Smart FOB % target itself is `weightedRecencyLevel` (Σvalue·weight/Σweight across trailing
90/42/21-day windows, MAD-anomaly-excluded) blended toward a peer-quartile anchor. Naively running
that SAME pipeline independently on each of the 6 components would NOT sum back to the total: each
component's own MAD-based anomaly exclusion runs on ITS OWN ratio series, so it drops different
days than the total's exclusion did (e.g. a day that's anomalous for `unexplained` — often near
zero — isn't necessarily anomalous for `condiments`), and the peer-anchor blend is a nonlinear
function of the starting value, so independently blending each component's own anchor wouldn't
sum to the already-blended total either.

**Fix: `allocateShares()`** (new, `engine/smart-targets.js`) sidesteps this by never normalizing
against the total or against any other externally-computed number — only against the actual sum
of the per-component levels it just computed:
```js
shares[key] = sum !== 0 ? levels[key] / sum : (1 / n);   // sum = Σ levels, computed in this call
```
Since `Σ shares === 1` is true by construction (whatever `levels` turned out to be), `total *
shares[key]` summed over every key equals `total` exactly (mod float rounding) — regardless of how
the per-component MAD exclusion drifted from the total's own. Falls back to an equal `1/N` split
if every component's level is null/zero (still sums to 1). Proven directly: `total*shares` summing
to `total`, an even split under an all-null input, a single-component 100% share, and a
"4x-larger-component gets ~4x the share" monotonicity check (not just "more", the actual ratio).

The view (`src/views/smart-targets.js`) wires this in only for FOB (via a new `metric.components`
extension point on the `METRICS` registry — any future ratio metric can opt in the same way):
- `fobMonthly()` now attaches `comps: {compWaste, rawWaste, condiment, empFood, statLoss, unex}`
  (each dollar-field ÷ sales) to every monthly point, alongside the existing total `v`/`w`.
- The hist-loop carries `comps` through into `entries` (previously only `{d,v,w}` survived).
- In the ratio branch, once `smart`/`current` are computed as before (unchanged), if
  `metric.components`: `allocateShares(entries, keys, weightedRecencyLevel, {asOf})` for the Smart
  shares, `allocateShares(last28entries, keys, weightedLevel, {})` for the Current shares — same
  levelFn/window each already-computed total uses, just applied per component. Each component's
  `{official, smart, current}` is attached to the row as `r.components`.
- UI: 6 new columns (Comp Waste / Raw Waste / Condiments / Emp/Mgr Meals / Stat Variance /
  Unexplained) inserted right after Smart, each cell showing its Smart figure with Official/Current
  in its hover title. Row tooltip, CSV export, and the panel's footer explainer all extended too.
  Columns render ONLY when `metric.components` is set (i.e. only for FOB) — Sales/Labor/OEPE/etc.
  are unaffected.

### Tests

- `src/__tests__/smart-targets.test.js` — 7 new `allocateShares` cases (sum-to-1 + total*shares
  identity via both `weightedLevel` and `weightedRecencyLevel`, equal-split fallback, single-key
  100% share, null/empty degradation, proportionality check).
- `src/__tests__/dispatch-smart-targets-fob-components-2026-09-14.test.js` — 2 `fobMonthly` cases
  (comps sum exactly to `v`; correct latest-row-per-month collapse with comps intact), 2
  `METRICS`-registry cases (components declared; officialComponent sums to `tFOBTarget` for a real
  store), and 3 cases rendering the ACTUAL `SmartTargetsPanel` (not just the engine function, per
  the standing "would this verification still pass if reverted" rule) — selecting FOB % via its
  real `<select>`, confirming the 6 component headers render and their displayed values sum to the
  displayed Smart value within display-rounding tolerance; confirming Official/Current appear in a
  component cell's hover title; confirming Sales (no `components`) renders none of the FOB labels.

All 17 new/extended assertions confirmed to fail against pre-fix code (`git stash` round-trip on
the 2 changed source files).

Full suite 510/510 files, 4873/4873 tests. Build clean, 543.21 KB / 850 KB eager-payload budget.
