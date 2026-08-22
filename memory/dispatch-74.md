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

---

## Resolution (2026-08-22)

**Imported.** `scripts/import-cfv-history.mjs` upserted all 217 seed visits into live Supabase
`graded_visits` (170 new + 47 that already existed from PDF uploads, refreshed in place). Table
now carries 221 CFV rows total — the 217 imported plus 4 newer real visits (2026-08-19 through
2026-08-21) uploaded from PDFs after this seed's 2026-08-18 capture cutoff, which is expected and
correct, not a discrepancy.

**The three named/discovered traps, all measured against the live table before writing upsert
logic (not assumed):**

1. **loc padding.** `graded_visits.loc` is 5-digit zero-padded ("NSN, zero-padded as in report"
   per the table's own schema comment); `getCfvHistory` returns bare NSNs ("3708", not "03708").
   Confirmed live: all 27 existing locs are uniformly 5 digits. Without padding, every 4-digit
   loc in the seed would have silently created a duplicate row next to its real PDF-sourced
   counterpart instead of updating it. Fixed with `padLoc()`.
2. **daypart/weekpart null-overwrite.** Not present in `getCfvHistory` at all, and Supabase's
   `upsert(..., {onConflict})` does a full-row replace on conflict, not a column-level coalesce —
   a blind import would have nulled out a PDF-sourced row's real values on every key collision.
   Measured live: 51/67 pre-existing rows carried a real daypart. Fixed by reading the existing
   row (keyed on padded loc + visit_date + report_type) before building each upsert row and
   carrying its daypart/weekpart forward untouched. **Extended beyond the dispatch's explicit
   naming**: a live query showed owner/manager/visit_by are the identical risk — 100% PDF-only,
   0% present in the Propel payload — so all five fields are preserved the same way.
3. **channel vocabulary.** `getCfvHistory` returns camelCase (`driveThru`/`curbside`/
   `inRestaurant`); measured the live table's actual values rather than trusting the PDF parser's
   own source comment (which lists `'Front Counter'` as a possible value) — the real, only three
   values in this dataset are `'Drive Thru'` / `'Curbside'` / `'In Restaurant'`. `'Front Counter'`
   never occurs. Mapped explicitly; an unrecognized value passes through unmapped with a console
   warning rather than being silently dropped.

`pass` is derived, not sourced (`score >= 80`), matching the PDF parser's own `parseCFV()` rule
verbatim — recorded as a derivation in the code and in this doc, per the dispatch's own warning.

**Verification bar, all met:**
- Re-running the import's own end-to-end check (bounded to the seed's own capture window,
  `visit_date <= 2026-08-18`, not open-ended — see the "measure, don't reason" episode below)
  reads **n=47, meeting80=55.3%, below80=44.7%**, matching the dispatch's Propel-card validation
  exactly.
- **Panel-level check, not loader-level**: `src/__tests__/dispatch-74-cfv-import-panel.test.js`
  renders the actual `VisitPatterns` component with the real 47-visit 2026 subset from the
  committed seed file (not a synthetic fixture) and asserts the panel's own header text —
  `"47 actual visits"` and `"55.32% pass"` (the panel's own `pr()` formats to 2 decimals, so the
  exact rendered string is 55.32%, not the dispatch prose's 1-decimal 55.3% — measured from the
  seed, not assumed from the rounding in the brief).
- **Idempotency confirmed**: running the import a second time reported 0 new rows / 217 existing
  rows refreshed, and a direct count query before/after held at 221 CFV rows — no duplication.

**A "measure, don't reason" episode worth recording**: the first live run's own built-in
verification step failed (n=51, meeting80=56.9%, below80=43.1%, not the expected 55.3/44.7%).
Per the standing rule, this did NOT get treated as "the import is broken" — a direct query
confirmed the write itself was correct (all 217 rows present, right values), and the mismatch was
traced to the verification query's own date filter being open-ended through year-end instead of
bounded to the seed's `to` field, which was pulling in 4 genuine newer PDF-sourced CFV visits
dated after the Propel snapshot was captured. Fixed the verification query, not the import.

**Additional tests**: `src/__tests__/dispatch-74-import-cfv-history.test.js` unit-tests the
script's pure helpers (`padLoc`, `mapChannel`, `buildRow`) directly, including a test that pins
the daypart/weekpart/owner/manager/visit_by preservation trap explicitly.

**Untouched, as scoped**: RGR/EcoSure history, the Model Check rebuild, and the CFV predictability
ceiling (ρ=+0.023 / ICC=0.087). This is a one-time backfill — not added to
`sync-failure-watch.yml`. No credentials in the committed seed file.
