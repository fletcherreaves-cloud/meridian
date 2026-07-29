---
name: reference-r2p-formula
description: R2P (Receipt to Print) exact formula, reverse-engineered from the QSRSoft Daily Activity report + raw DAR JSON and reconciled to the penny. Plus the Avg Win TTL / Avg DT TTL mappings found alongside it.
metadata:
  node_type: memory
  type: reference
---

# R2P (Receipt to Print) — derivation

Reverse-engineered 2026-07-28 from BOTH the raw DAR JSON and the exported xlsx
(`Daily Activity Report 2026-07-28.xlsx`) for the SAME store+date (3708, 2026-07-28),
so it could be reconciled hour-by-hour. Confirmed exact across all 15 active hours.

```
R2P (seconds) = (fc_untilserve − fc_untilclosedrawer) / fc_trans_cnt / 1000
```

- All three inputs are **front-counter** fields (fc = front counter / "window" — McD's
  original walk-up-to-a-window order point). Owner confirmed R2P is a front-counter timing.
- Raw fields are in **milliseconds**; divide by 1000 for seconds.
- Day/scope total = **count-weighted**: (Σ fc_untilserve − Σ fc_untilclosedrawer) / Σ fc_trans_cnt / 1000.

### Proof (store 3708, 2026-07-28)
| Hour | fc_untilserve | fc_untilclosedrawer | fc_trans_cnt | derived | report R2P |
|---|---|---|---|---|---|
| 07:00 | 469446 | 30604 | 4 | 109.7 | 110 |
| 08:00 | 2226386 | 987791 | 13 | 95.3 | 95 |
| 11:00 | 5652131 | 893588 | 16 | 297.4 | 297 |
| 13:00 | 12836796 | 1752377 | 39 | 284.2 | 284 |

### Sibling mappings found in the same reconciliation
- **Avg Win TTL** = `fc_untilserve / fc_trans_cnt / 1000` (front-counter/window TOTAL time).
  This is the field we almost mismapped to R2P — it is NOT R2P (R2P subtracts drawer-close time).
- **Avg DT TTL** = `dt_untilserve / dt_trans_cnt / 1000` (drive-thru total).
- `fc_untilserve` ALONE ≠ R2P — owner flagged this earlier and was right.

## Where it's wired (v4.549)
- `src/lib/supabase.js` `loadQsrActSummary` — sums `_fcServe/_fcDrawer/_fcCnt` per (loc,dt),
  derives `r2p`. Added fc fields to the select. **No historical re-download needed** — the DAR
  pull already persists fc_untilserve/fc_untilclosedrawer/fc_trans_cnt to `qsr_daily_activity`.
- `src/engine/metric-source.js` `r2p` — `[['opsRows','r2p'], ['qsrActSummaryRows','r2p']]`
  (manual Ops Report wins first; DAR-derived fallback is cloud-fresh → current-day One-Pager).
- `src/engine/metric-provenance.js` `r2p` — provenance text carries the exact formula.
- DAR pulls ~8a/10a/2p CT, so current-day R2P populates without a manual upload.

See [[notes-33-queue]], [[feedback-metric-provenance]], [[reference-digital-app-formula]].
