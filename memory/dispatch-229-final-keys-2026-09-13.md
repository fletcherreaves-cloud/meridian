# Metric Registry — manualRefAmt/discCnt/promoCnt closed (2026-09-13)

Closes the last 3 keys dispatch #229's own `AUTO_FIRST_KEY_MAP` comment in `signal-registry.js`
had named as "NO matching METRIC_SOURCES chain today" — `manualRefAmt`, `discCnt`, `promoCnt`.
After this, that comment's exception list is down to the 4 FOB sub-item %'s
(`baseFoodPct`/`discCoupon`/`pLFoodPct`/`pLPaperPct`) that genuinely have no $ leg loaded
anywhere yet.

## What was actually true, checked directly rather than trusted from the doc

- **`manualRefAmt`** already had a real chain — `{ mode: 'pos', srcs: [['ctrlRows',
  'manualRefAmt'], ['auditRows', 'manualRefAmt']] }` (`metric-source.js:650`). It was simply
  never added to `AUTO_FIRST_KEY_MAP`. No data change needed — a one-line registry addition.
- **`discCnt`** and **`promoCnt`** did NOT have chains, but their $ dollar siblings
  (`discAmt`/`discPct`, `promoAmt`/`promoPct`) already do, sourced from `opsCashRows`
  (`qsr_cash_sheet`, via `loadOpsCashSheet`). Checking that loader's actual body found
  `discount_qty` and `promo_qty` sitting in the raw `...r` spread the whole time — literally the
  same JSONB blob `discount_amt`/`promo_amt` already read from — just never given a camelCase
  alias. Confirmed live (service-role read of `qsr_cash_sheet.metrics`): both fields are real
  and populated (`discount_qty: 85`, `promo_qty: 63` in sampled rows).

## A stale/wrong comment caught and corrected, not just left

`metric-source.js`'s own comment on `promoAmt`/`promoPct` said: *"(promoCnt deliberately NOT
added: no auto/emailed stream emits it, so a chain would be single-source theatre.)"* That
claim was **wrong**, not merely stale-but-once-true — `promo_qty` was in `qsr_cash_sheet`'s raw
data the entire time the comment existed, just never surfaced. Per CLAUDE.md's "a rule that
describes code which no longer exists costs more than no rule" spirit (usually about CLAUDE.md
itself, but the same logic applies to in-code comments that assert a negative): corrected in the
same pass rather than left to mislead the next reader.

## What changed

- **`src/lib/supabase.js`** — `loadOpsCashSheet` gains 2 more camelCase aliases:
  `discCnt: r.discount_qty != null ? Number(r.discount_qty) : null` and `promoCnt:
  r.promo_qty != null ? Number(r.promo_qty) : null`, matching the exact pattern
  `posOverAmt`/`posOverCnt` (dispatch #175) already established for this same function.
- **`src/engine/metric-source.js`** — 2 new chains, `discCnt: { mode: 'any', srcs:
  [['opsCashRows','discCnt'], ['ctrlRows','discCnt']] }` and `promoCnt` (same shape, no
  `glimpseRows` leg since neither the emailed stream nor `promoAmt`'s own chain carries a count
  from it). The stale "single-source theatre" comment rewritten to state what's now true.
- **`src/engine/signal-registry.js`** — `manualRefAmt`/`discCnt`/`promoCnt` added to
  `AUTO_FIRST_KEY_MAP`; the map's own comment updated to drop all 3 from its "no chain" list.

## Tests

`src/__tests__/dispatch-229-auto-first-metrics.test.js` — 3 keys added to `DIRECT_SWAP_KEYS`
(mechanical chain-existence check) + 3 new behavior tests (one per key), each exercising
`extractMetricValues` — the real Trend Explorer/Scanner integration point — through a
stale-manual + fresh-auto fixture. All 5 new/extended assertions confirmed to fail against
pre-fix code (`git stash` round-trip on the 3 changed source files, tests left in place).
`metric-chains.test.js`'s regenerated `EMITS.opsCashRows` now lists `discCnt`/`promoCnt`.

Full suite and build numbers: see the corresponding changelog entry (v5.437).
