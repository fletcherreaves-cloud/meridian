---
name: finding-phase0-identity-match-rate-2026-08-21
description: Dispatch #49's Phase 0 gate, measured. 85.7% of employee names resolve to exactly one empID, row 5 is proven a coverage artifact rather than a real ID-less population, and rows 3-4 quantify a defect nobody had measured - 40 names currently merging distinct humans into one token and 14 IDs split across name variants. Recommendation is proceed, after closing a 48-day backfill tail.
metadata:
  node_type: memory
  type: finding
---

# Phase 0 — the identity match rate, measured

**2026-08-21.** Dispatch #49's gate, run as plain SQL against `audit_rows` after dispatch #51 added
`emp_id` (53,103 rows, up from 36,631). Measurement only — no Phase 1 work started.

## The five numbers

| # | question | count | % |
|---|---|---:|---:|
| 1 | distinct names (denominator) | 1,140 | — |
| 2 | name → exactly one `emp_id` (clean core) | 977 | **85.7%** |
| 3 | name → **multiple** `emp_id`s (merged) | 40 | 3.5% |
| 4 | `emp_id` → **multiple** names (split) | 14 of 1,043 | 1.3% |
| 5 | name → no `emp_id` anywhere | 123 | 10.8% |

`977 + 40 + 123 = 1,140`. Checks out.

## Row 5 is a coverage artefact — resolved, not left ambiguous

The backfill completed **6 of 9 chunks** (2026-03-01 → 2026-07-04, ~22,667 rows, 27/27 stores)
before tripping a 403. So row 5 could have meant "genuinely ID-less" or "outside the covered
window," and the whole proceed-vs-fallback decision hangs on which.

**Checked, and it is categorical: zero of the 123 have any row dated on or before 2026-07-04.**
Every one exists only in the unbackfilled tail. There is an even cleaner reason than coverage —
those tail rows were pulled *before the `emp_id` column existed*, so their null is **structural**,
not informative. A genuinely ID-less population would scatter across the whole window rather than
sitting entirely behind the boundary.

**Within the covered window the clean rate is 977 of 1,017 — 96.1%.**

**Still an inference, not a measurement.** Row 5's real value is unknown until the 48-day tail
(2026-07-05 → 2026-08-21) is backfilled.

## Rows 3 and 4 are a finding in their own right

Independent of the re-key, and **nobody had measured this before**:

- **40 names resolve to multiple `emp_id`s.** The vault merges distinct humans into **one token**
  today. Their findings are co-mingled — in a system that names people and can lead to discipline.
- **14 `emp_id`s resolve to multiple names.** One person's history split across name variants
  (typos, a name change, an added initial), so their pattern is invisible in either half.

**54 live identity defects.** These are not a reason for caution about the re-key — they are the
strongest argument for it. The name-as-identity design is actively producing wrong attributions
right now, and the only reason it was invisible is that nobody had counted.

## Recommendation: proceed to Phase 1, after closing the tail

**Proceed.** The deciding factor is rows 3–4, not the 85.7%. Row 5 — the one number that could have
forced option B — is demonstrably an artefact.

**But measure the tail first.** The gate was designed around row 5, and a strong inference is not a
measurement. Two or three chunks. Cheap insurance against discovering a real ID-less population
mid-migration, and it converts a caveated green light into a clean one.

**Not immediately.** The 403 is a **new failure mode** — an explicit-deny IAM policy, distinct from
the 401 login flakiness seen earlier. It reads as a rate/anti-abuse trip after heavy login volume
across two days. Let it rest before resuming; the tail is not urgent.

## Auth-path note worth keeping

Three distinct failure modes on this endpoint in two days:
1. **401** — cached token rejected, re-mint, usually recovers
2. **`token captured: false`** — Playwright login succeeds but the page's own call carries no token;
   intermittent, worked hours before it failed
3. **403 explicit-deny IAM** — *new*, appeared after ~6 chunks of a 9-chunk run

(3) is the one to plan around: it is volume-triggered, not credential-triggered, so retrying harder
makes it worse. Chunk future backfills across separate runs rather than one long job.
