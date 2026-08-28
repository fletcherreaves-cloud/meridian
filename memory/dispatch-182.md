# Dispatch #182 — avgCheck: investigate whether the DAR-based derive can safely outrank the emailed sources

## Context

Dispatch #165's audit (`memory/audit-emailed-stream-redundancy-2026-08-27.md`, the chain table)
flagged `avgCheck`: *"Three emailed sources stacked ahead of an always-available DAR-based derive.
Functionally low-risk to reorder, but not touched — out of this audit's contained-fix bar."* This
is the last unaddressed row in that table (every other flagged row — `dtMixPct`, `posOverAmt`/
`Cnt`, `promoAmt`/`Pct`, `empMealAmt`/`mgrMealAmt` — has since been fixed or investigated by
dispatches #165/#175/#180/#181).

**This one is NOT a simple array reorder — read the resolver before touching anything.**
Confirmed live in `src/engine/metric-source.js`:

```js
avgCheck: { mode: 'pos', direction: 'higher',
  srcs: [['glimpseRows','avgCheck'], ['cashRows','avgCheck'], ['salesLedgerRows','avgCheck'], ['laborRows','avgCheck']],
  derive: { inputs: ['sales','gc'], fn: (s,g) => (g>0 ? s/g : null), kind:'ratio' } },
```

`metricSeriesWithSource()`'s `_derive()` helper (`metric-source.js`, search `const _derive =`)
only fills a day's value `if (into[dk] != null) continue` — i.e. **the `derive` is structurally a
last-resort gap-fill AFTER every entry in `srcs` has been checked for that day, regardless of
`srcs`' own internal order.** There is no way to make the derive "win" over `laborRows` (the
weakest, manual source in the chain) just by reordering the `srcs` array — `laborRows` will always
be checked before the derive no matter where it sits in that array, because `srcs` as a whole runs
before `derive` unconditionally.

So the audit's "low-risk to reorder" undersold what an actual fix requires: either (a) a targeted,
`avgCheck`-specific change to how this one metric resolves (not touching the shared `_derive`
mechanism every other `derive`-using metric in this file also relies on), or (b) concluding the
real fix needs a broader resolver change and is NOT a contained, low-risk dispatch after all.
**Do not modify the shared `_derive`/`metricSeriesWithSource` resolution order — that affects
every other metric in this file using `derive` (a long list: `oepe`, `r2p`, `laborPct`, `spph`,
`cashOSPct`, `discPct`, `tRedAPct`/`tRedBPct`, `fobPct`, and more) and is far outside this
dispatch's contained scope.**

## Task

1. Confirm the above by reading the resolver yourself, not just trusting this doc — `measure it,
   don't reason about it` applies to dispatch docs too, per this repo's own standing rule.
2. Evaluate whether a narrow, `avgCheck`-specific fix is possible without touching the shared
   resolver — e.g., restructuring `avgCheck`'s OWN entry so `laborRows` (the one purely-manual
   source in its chain) is checked LAST, after a value equivalent to today's derive is attempted
   first for that metric specifically. One option worth evaluating: since `sales` and `gc` both
   already resolve auto-first through their own chains (per the existing code comment), consider
   whether `avgCheck`'s `srcs` list itself could lead with a derived-equivalent computed inline
   (NOT via the shared `derive` field, which is unconditionally last) — but only if this doesn't
   require duplicating logic in a way that could drift from the shared `derive`'s math. If no
   clean, narrow approach exists, that's a legitimate finding — don't force a workaround that adds
   real complexity for a "low-risk redundancy" item the original audit itself didn't rate urgent.
3. If a clean, narrow, low-risk fix is found: ship it, matching this session's established
   auto-first pattern and test rigor.
4. If not: write up why in a `memory/finding-*.md` file (what was tried, why it doesn't fit the
   shared resolver's shape without broader change) and leave the code untouched. This is a
   legitimate, valuable outcome — matching #172/#177/#178's precedent of not forcing a fix that
   doesn't have a clean, narrow shape.

## Verification

- If a fix ships: a test proving `avgCheck` now resolves via the auto/derived path ahead of
  `laborRows` specifically (the actual gap identified), a regression test confirming
  `glimpseRows`/`cashRows`/`salesLedgerRows` still resolve correctly when they cover a date, and
  confirmation that NO OTHER metric's `derive` behavior changed (run the full suite — if anything
  outside `avgCheck`'s own tests changes, treat that as a sign the fix leaked into shared code and
  stop).
- If no fix ships: the finding write-up is the deliverable.
- Standard suite + build either way.

## Out of scope

- Any change to `metricSeriesWithSource()`'s shared `_derive()` logic or resolution order for
  metrics OTHER than `avgCheck`.
- Any other row in #165's audit table — all others are already resolved.
