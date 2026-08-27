# Dispatch #156 — Fix Custom-period panel-blanking bug in `OperatorSummaryPanel`
# (`labor-tools.js`) — controls bar must never be hidden by the empty-data gate

**Context (2026-08-27):** Found (documented, not fixed) by dispatch #155's own PR (#820, merged
v5.200) while writing `dispatch-155-labor-tools-tpph-rate.test.js` — that test's own header
comment flags it as "a real, pre-existing, unrelated bug" it had to work around via a mock rather
than driving the real UI, because the bug blocks the one built-in path to reach the code the test
actually needed to exercise. Not part of the Performance Review redesign thread — unrelated,
next in the queue.

**⚠️ Verify against the live code before starting — the originating description names BOTH
panels; only ONE of them actually has this bug (measured below).** Read
`src/views/labor-tools.js`'s `OperatorSummaryPanel` and `LaborAnalyticsPanel` in full before
writing any fix, per this project's "measure it, don't reason about it" standing rule — don't
just restate the #155 test comment.

## The bug — confirmed live in `OperatorSummaryPanel` only

`OperatorSummaryPanel`'s `PERIODS` array includes a `'custom'` entry whose range comes from two
`useState` hooks, `cStart`/`cEnd`, both initialized to `''`. The moment a user clicks the "Custom"
period pill, `selPeriod` becomes `'custom'` **before either date input has a value** — `range`
(the `useMemo` combining `curP.fn()` with a null/NaN/ordering guard) evaluates to `null`, which
makes `opStats` (the per-group stats `useMemo`, gated `if(!range||!ds) return []`) evaluate to
`[]`.

The panel's ONLY top-level empty-data gate is:
```
if(!ds||!ds.loaded||opStats.length===0)
    return div({...'No Data Loaded' full-screen dialog...});
```
This single condition folds two genuinely different situations together — "no data source is
loaded at all" (a real empty state) and "the currently-selected range happens to resolve zero
rows" (true every single time `'custom'` is freshly selected, since `cStart`/`cEnd` start empty)
— and gates the ENTIRE panel body on it, including the header, the Period/Group/Focus/Sort
controls bar, and the two `<input type="date">` fields the user needs to actually populate a
custom range. Selecting "Custom" therefore replaces the whole panel with a dead-end "No Data
Loaded" screen with no period selector and no date inputs on it — the only way out is the ✕ that
closes the entire panel, losing whatever period/group/focus/sort selection was active before.

This exact mechanism is independently confirmed by
`src/__tests__/dispatch-155-labor-tools-tpph-rate.test.js`'s header comment (written while
building an unrelated test, dispatch #155): *"selecting 'Custom' in these two panels blanks the
ENTIRE panel (the 'No Data Loaded' gate fires because cStart/cEnd start empty, so opStats/locStats
-> [] the instant 'custom' is selected) before the date inputs a user would need are ever
reachable in the DOM."* That comment's own reasoning about the mechanism is correct for
`OperatorSummaryPanel` — verify its "these two panels" claim against `LaborAnalyticsPanel`
specifically, since the next section found it does not hold there.

## `LaborAnalyticsPanel` does NOT have this bug — read before assuming it does

`LaborAnalyticsPanel` has the identical `cStart`/`cEnd`/`'custom'`/`range` shape, but its **one**
top-level empty-data gate is different in kind, not just in wording:
```
const hasData = ds && ((ds.laborRows||[]).length>0 || (ds.ctrlRows||[]).length>0
  || (ds.qsrActSummaryRows||[]).length>0 || (ds.opsLaborRows||[]).length>0);
if(!hasData) return div({...'No Labor Data Loaded'...});
```
`hasData` checks whether `ds` holds ANY of these row arrays at all — it does **not** depend on
`range`, `locStats`, or the selected period in any way. Selecting `'custom'` with empty
`cStart`/`cEnd` leaves `hasData` unchanged, so this gate never fires because of period selection.
Past that gate, the controls bar (`periodBar`, defined further down in the function, containing
the same Period-pills + date-inputs pattern) renders **unconditionally** in the panel's single
`return` — it is not itself gated on `locStats`/`range`. Downstream, an empty `locStats` for the
selected range already degrades gracefully and locally: `kpiCards()` returns `null` (renders
nothing, doesn't blank the panel) and each tab's own content shows an inline
`'No labor data for this period and location. Try widening the date range.'` message inside the
results area only, leaving the header, controls bar, and tab bar fully visible and interactive.

**This is exactly the pattern `OperatorSummaryPanel` needs to be brought into line with** — don't
invent a new pattern, mirror this sibling panel's already-correct structure.

## Scope for this dispatch

1. **Split `OperatorSummaryPanel`'s single gate into two**, mirroring `LaborAnalyticsPanel`'s
   shape exactly:
   - A `hasData`-style check independent of `range`/`opStats` (e.g. `ds && ds.loaded` plus
     whatever minimal signal distinguishes "nothing to work with at all" — read what data sources
     `opStats` actually draws from — `ds.fobRows`, `autoFirstTotal`/`metricAvg`/`metricRate`'s
     underlying streams, etc. — before deciding the exact condition; don't just drop the
     `ds.loaded` check, keep an equivalent "truly nothing loaded" full-panel empty state for that
     genuine case).
   - Move the range-dependent "nothing resolved for this period" case out of the top-level early
     return entirely. The panel's own render already has a placeholder for this
     (`sortedOps.length===0 ? div(...'No data for selected period.'...) : ...` inside the "Group
     cards" section) — it is currently unreachable dead code because the outer gate returns before
     it can ever run. Wire it up instead of adding a new message.
2. **Result:** selecting "Custom" with empty date inputs must leave the header, the full Period /
   Group / Focus / Sort controls bar (including the two now-visible `<input type="date">` fields),
   and the panel's close button all visible and interactive; only the "Group cards" results area
   shows the existing "No data for selected period." placeholder until the user fills in both
   dates. Once a valid range resolves data, results render normally — no behavior change for any
   non-custom period, which already works correctly today.
3. **Tests**: a new test file (suggested name
   `src/__tests__/dispatch-156-operator-summary-custom-period.test.js`, mirroring the render-based
   style of `dispatch-155-labor-tools-tpph-rate.test.js` and `dispatch-152-ui-crash-guard.test.js`
   — render the REAL `OperatorSummaryPanel`, not an isolated helper) that:
   - Renders `OperatorSummaryPanel` with a `ds` carrying real data (so the panel starts on its
     default period with visible results).
   - Clicks the "Custom" period pill.
   - Asserts the Period pills (including "Custom" itself, still selectable) and the two
     `<input type="date">` elements are present and interactive in the DOM immediately after —
     this is the assertion that actually fails against the current code and must pass after the
     fix (per this project's "would this verification still pass if the change were reverted?"
     standing rule: reverting the fix must make this specific assertion fail, not just leave a
     vaguer test un-exercised).
   - Optionally also assert that typing values into both date inputs then resolves and displays
     results, closing the loop end-to-end (nice-to-have, not required if the interactivity
     assertion above already proves the fix).
   - Also add (or extend an existing test) a quick assertion that `LaborAnalyticsPanel` selecting
     "Custom" already keeps its controls visible today, as a regression guard on the sibling panel
     this dispatch is explicitly NOT changing — cheap insurance against a future edit accidentally
     introducing the same bug there.

## Explicitly OUT of scope

- `LaborAnalyticsPanel` — confirmed above to not have this bug; do not touch its gate logic. If,
  while implementing, you find a DIFFERENT bug in it, note it in the PR body as a follow-up
  candidate, do not fix it here.
- Any broader refactor of `OperatorSummaryPanel` or `LaborAnalyticsPanel` — this is a small,
  contained UI fix. Do not restructure the stats `useMemo`s, the period logic, or the export
  functionality.
- The OEPE/R2P/TPPH completeness work (dispatches #153–#155) — unrelated, already shipped, do not
  re-touch `metricRate`/`metricSumRatio` call sites in this file.
- Any change to how `'custom'` periods are constructed/validated for OTHER panels in the app
  (e.g. `LaborAnalyticsPanel`'s own custom period, other views' date pickers) — scoped strictly to
  `OperatorSummaryPanel`'s gate structure.

## Verification bar

- New/changed unit tests pass; full `npx vitest run --exclude "**/.claude/**"` suite passing at
  the same or higher count as `main`.
- `npm run build` clean, report before/after entry-chunk gzip (this is a small structural change
  inside an existing panel file, not a new import — should be near-zero impact; flag if it isn't).
- PR body must state: (a) confirmation, from reading the code directly, that `LaborAnalyticsPanel`
  does NOT share this bug and exactly why (the `hasData` vs. range-dependent-gate distinction
  above) — don't just assert it, show the read; (b) the exact before/after gate structure for
  `OperatorSummaryPanel`; (c) that the new test fails against the pre-fix code and passes after
  (state this explicitly, e.g. by describing what you observed when checking out the diff
  reverted, not just asserting it should).
