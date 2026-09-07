---
name: finding-fl-fob-ytd-normalized-2026-09-06
description: Closes backlog-master-2026-08-19.md §8's "FL FOB yearly total read ~14.88% against an expected ~4%" item. Re-measured live against production qsr_fob using the actual fobByRange() function (not a re-implementation) — FL district FOB% YTD 2026 is 4.03%, dollar-weighted, every individual FL store in a sane 3-5% range. The anomaly is gone.
metadata:
  node_type: memory
  type: finding
---

# FL FOB yearly total — re-measured 2026-09-06, resolved

## What was asked

`backlog-master-2026-08-19.md` §8 / `backlog-open-2026-09-06.md` §8: Leadership One-Pager's FL
FOB yearly total read ~14.88% against an expected ~4% (FL) when the owner reviewed the shipped
panel live on 2026-07-28 — flagged twice in `notes-31-queue.md`/`notes-32-queue.md`, deferred
because Supabase egress wasn't allowlisted at the time. Question to settle: does FL normalize
over a full month/YTD range now that `fobByRange` (`src/engine/one-pager-data.js`) has the
`prodSalesAmt<=0` guard + per-month snapshot-differencing that shipped since?

## What was measured

Pulled all 2026 `qsr_fob` rows (raw snake_case component fields) for the 7 FL stores (6178, 6838,
10034, 35242, 37566, 38609, 43701) via the service-role key, paginated to avoid PostgREST's
1000-row default cap (1684 rows total, full YTD Jan 1 – Sep 6 coverage confirmed for all 7 locs).
Mapped to the exact camelCase shape `src/lib/supabase.js`'s real loader produces, then ran the
**actual, unmodified `fobByRange()` function** imported straight from `src/engine/one-pager-data.js`
against it — not a re-implementation of its logic, the real function, over the real data, matching
this repo's "measure it" standing rule (a live-data claim must name the credential and the
observation).

## Result

| Store | FOB% YTD |
|---|---|
| 6178 Chipley-St Rd 77 | 3.68% |
| 6838 Defuniak Springs | 4.47% |
| 10034 Bonifay | 4.23% |
| 35242 Cottondale | 4.06% |
| 37566 Mossy Head | 4.28% |
| 38609 Freeport | 3.05% |
| 43701 Ponce de Leon | 5.07% |
| **FL district (dollar-weighted)** | **4.03%** |

Every store is in a sane 3-5% range; the district figure matches the owner's ~4% expectation
almost exactly. **The ~14.88% anomaly is gone** under the current `fobByRange` implementation.

## Verdict

✅ **RESOLVED — do not re-open.** The fix this item was waiting on (the `prodSalesAmt<=0` guard
+ per-month snapshot-differencing, both already in `fobByRange` per its own header comments dated
2026-08-03/2026-08-27) has already closed this specific anomaly. No further code change needed.
The Leadership One-Pager panel itself was not separately re-tested in a live browser session (this
was a data/engine-level measurement), but since the panel calls this same `fobByRange` function
with no separate FOB math of its own, there is no remaining mechanism for the panel to still show
the old ~14.88% figure.
