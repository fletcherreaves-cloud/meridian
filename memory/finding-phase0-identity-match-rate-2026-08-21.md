---
name: finding-phase0-identity-match-rate-2026-08-21
description: Dispatch #49's Phase 0 gate, measured. Row 5's ambiguity resolved rather than passed up with a caveat -- every one of 123 no-emp_id names has its only audit_rows history in the unbackfilled tail (post-2026-07-04), so genuinely ID-less is 0 as measured so far, not 123. Rows 1-4 are settled and real. Feeds dispatch #53's gate decision once the tail closes.
metadata:
  node_type: memory
  type: finding
---

# Phase 0 measured — rows 1–4 settled, row 5 pending the backfill tail

**Measured 2026-08-21**, via a pure SQL aggregation against `audit_rows` (dispatch #51's `emp_id`
column), after a partial backfill: 6 of 9 chunks landed (`2026-03-01 → 2026-07-04`, ~22,667 rows,
27/27 stores) before chunk 7 hit a **403 explicit-deny IAM policy** — a different failure mode
from the two earlier 401 auth-flakiness failures, and volume-triggered rather than intermittent.
Stopped at the one-retry limit rather than attempting a third run.

## The five numbers

`audit_rows`: 53,103 total rows, **1,140 distinct names** (the denominator, unchanged from the
earlier banked figure).

| # | question | count | % |
|---|---|---:|---:|
| 1 | distinct names | **1,140** | — |
| 2 | name → exactly one `emp_id` (clean core) | **977** | **85.7%** |
| 3 | name → multiple `emp_id`s (merged collisions) | **40** | **3.5%** |
| 4 | `emp_id` → multiple names (split identities) | **14** of 1,043 distinct `emp_id` | **1.3%** |
| 5 | name → no `emp_id` anywhere | **123** | **10.8%** |

Sanity check: 977 + 40 + 123 = 1,140. ✅

## Row 5, resolved rather than left as a caveat

A name with no `emp_id` could be genuinely ID-less (manual-only / departed) or simply absent from
the backfilled window — dispatch #49/#51 both required saying which, not passing the ambiguity up
unresolved. Checked directly: for each of the 123 row-5 names, does it have **any** `audit_rows`
row dated on or before `2026-07-04` (the boundary of what actually backfilled)?

**Zero of 123 do.** Every row-5 name's entire `audit_rows` history falls in the unbackfilled tail
(`2026-07-05 → 2026-08-21`, ~48 days never pulled with `emp_id` capture). This is not a genuinely
ID-less population — it is a clean window artifact. **Genuinely ID-less, as measured so far: 0.**
Real row 5 will very likely be much smaller once the tail is covered, possibly near zero.

## Why rows 3–4 are the real finding here

**Row 3 (40 names, 3.5%) means the identity vault, as it exists today, merges 40 distinct real
people into one shared token** — a correction to make, not an optimization to consider. Row 4 (14
`emp_id`s mapping to multiple names, 1.3%) is the mirror case: the same real person's cash and
inventory findings currently split across separate tokens for typo/name-change reasons. Both are
real regardless of whether the re-key (Phase 1) ever happens — they're the first actual
measurement of how many findings in this build are already attributed to the wrong person, or
fragmented across two identities for one.

## What this does NOT settle yet

The gate decision (dispatch #53 Phase C: `G ≤ 25` proceed / `26–57` owner decides / `> 57` option
B) reads off the **genuinely-ID-less** count, not raw row 5. That number needs the unbackfilled
tail closed first — dispatch #53 Phase A/B. This finding is the input to that gate, not the gate
result itself.

## PII discipline held

Every query behind these numbers ran as an in-memory aggregation (names/IDs never left the
process as anything but a count) — no individual name or `emp_id` value was logged at any point,
matching dispatch #49/#51's own standing rule.
