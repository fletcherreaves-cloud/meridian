# Dispatch #74 — Meridian cannot see 3½ years of CFV history. Import it.

**Status:** ready to start. Data is committed; no capture needed.
**Reads:** `memory/finding-cfv-predictability-ceiling-2026-08-22.md`,
`memory/finding-ecosure-propel-api-2026-08-22.md`.
**Data:** `memory/data/cfv-history-2023-2026.json` — **217 CFV visits, 2023-01-18 → 2026-08-18,
all 27 stores**, committed so this dispatch is reproducible without a live Propel session.

---

## Why

Everything else queued behind Visit Readiness needs graded-visit history, and the app has almost
none. `ds.gradedVisits` is fed only by manually-dropped CFV/RGR **PDFs**; Propel holds the full
series and the client has never seen it.

Concretely, with this loaded:

| today | after |
|---|---|
| Visit Patterns' channel / DOW / weekpart breakdowns run on whatever PDFs were uploaded | 217 real visits across 3½ years |
| Model Check pairs against a handful of visits | the full per-store series |
| the 2026 deterioration is invisible in-app | see below — it is the most actionable thing in the dataset |

### 🔴 The finding this surfaces

| year | n | mean | below 80% |
|---|---|---|---|
| 2023 | 59 | 82.0 | 27.1% |
| 2024 | 46 | 82.9 | 26.1% |
| 2025 | 65 | 84.3 | 23.1% |
| **2026** | **47** | **80.5** | **44.7%** |

**2026's below-80 rate is nearly double the prior three years.** Nobody can see this in Meridian
today. ⚠️ The *quarterly* series is far too noisy to read (2024Q2 hit 66.7%), so present the annual
figure and resist drawing a quarterly trend line.

⚠️ The 11:00–17:00 visit-window change began **August 2026** and only 6 visits fall in 2026Q3 — it
does **not** explain the drop, which is already present in Q1. Do not attribute it.

## The data

```json
{"loc":"3708","visitDate":"2026-07-07","reportType":"CFV","overallPct":75,
 "channel":"driveThru","channelPct":60.7,"behindTheCounterPct":100,
 "visitId":8636334,"visitTypeId":104}
```

**Validated before commit:** the 2026 subset reproduces Propel's own published Customer First card
**exactly** — 55.3% meeting 80% / 44.7% below. That check is the reason to trust the file; re-run
it after import against what the app then shows.

## The import

`saveGradedVisits(rows)` (`src/lib/supabase.js:2646`) already takes this shape and upserts on
`(loc, visit_date, report_type)`, so **it is idempotent and safe against whatever PDFs are already
loaded** — re-running cannot duplicate.

Field mapping:

| seed | `saveGradedVisits` |
|---|---|
| `loc` | `store` |
| `visitDate` | `dateISO` |
| `reportType` | `reportType` (`'CFV'`) |
| `overallPct` | `score` |
| `channel` | `channel` |
| — | `pass` ← **see below** |

⚠️ **`pass` is a judgement, not a field in the source.** Propel's Customer First card reports
*"% Meeting 80%"*, so 80 is the programme's own bar and `score >= 80` is the defensible mapping —
but **the API never returns a pass flag**, so record the derivation in the code rather than letting
it look like source data. If that reading is wrong the whole pass-rate column is wrong.

📌 **`daypart` and `weekpart` are NOT in this endpoint.** The existing PDF parser extracts both
(`src/parsers/graded-visits.js:80,81`); `getCfvHistory` does not. **Leave them null — do not
invent them, and do not let the import overwrite a PDF-sourced row's real daypart with null.**
Check the upsert's behaviour on that before running: a null-overwrite would destroy better data.

## Constraints

- 🔒 **Manual is correct here and is not a rule violation.** Propel is SSO+MFA; no automated pull
  is possible (`memory/finding-ecosure-propel-api-2026-08-22.md`). The standing "name the intended
  auto source" requirement is satisfied by that finding — a persistent authenticated browser
  profile is the theoretical path and is explicitly not worth building for ~81 visits/year.
  **This is a one-time backfill, not a stream. Do not add it to `sync-failure-watch.yml`.**
- No credentials are in the seed file — scores, dates, locs, visit ids only. Keep it that way.
- `visitId` is retained deliberately: it is the join key to PEAK's `RoipSurvey/<VisitId>` if
  per-question detail is ever wanted. It has no other use today.

## Out of scope

- **RGR and EcoSure history.** Both are reachable the same way and neither is captured yet. One
  instrument at a time; CFV is the highest-volume and the only one with real spread in outcomes.
- **Rebuilding the Model Check on the new pairs.** A pair needs *predicted readiness as of the
  visit date*, which needs historical ops data this import does not provide. Loading the actuals
  is a prerequisite, not the analysis.
- ⚠️ **Do not re-derive the ceiling from this.** ρ=+0.023 / ICC 0.087 are already measured on this
  exact dataset and recorded. Importing it changes nothing about them.

## Verification bar

- **Re-run the validation:** after import, the app's own 2026 CFV figures must read 55.3% / 44.7%.
  That is the end-to-end check — it proves the rows landed, parsed, and aggregate correctly.
- Revert-sensitive test per the standing rule: assert against the **panel**, not the loader. A test
  that only checks `saveGradedVisits` was called cannot tell "imported" from "imported and
  displayed".
- Confirm idempotency by running the import twice and asserting the row count is unchanged.
