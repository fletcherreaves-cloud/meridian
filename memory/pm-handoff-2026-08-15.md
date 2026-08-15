---
name: pm-handoff-2026-08-15
description: HANDOFF — full PM state as of 2026-08-15 15:30 UTC. Role, disciplines, PR board, engineer queue, owner action list, in-flight analysis threads, security debts, and the corrections register. Read this first if you are picking up the PM seat.
metadata:
  type: handoff
---

# PM handoff — 2026-08-15

Written at the owner's request because the PM session had grown too long and compacted badly (one
compaction retry lost the whole window). **Everything a successor PM needs to keep the tag-team with
the senior engineer running is in this file or linked from it.** Nothing here is inferred; every
number was measured or read off the repo/API.

---

## 1. The arrangement

Fletcher Reaves (**he/him**) owns and builds Meridian, a BI platform for ~27 McDonald's stores
(20 Oklahoma / 7 Florida, org **RKT Inc.**). He runs a two-session split:

- **PM (this seat)** — plans, prioritizes, scopes, writes issues and dispatches, reviews PRs by
  **independent measurement**, merges, and keeps `memory/`.
- **Engineer (separate session)** — implements, opens **draft** PRs, never self-merges.
- **Fletcher relays between the two.** He brings notes/screenshots/captures to the PM first; the PM
  writes the dispatch; he pastes it to the engineer.

Full rules, file ownership table, and the PM review checklist: **`memory/feedback-pm-worker-split.md`**
— read it, it is short and it is binding. The parts that get violated first:

- **PM never pushes to `main`.** PM lands its own docs by opening a PR from its branch and merging
  that (precedent: #293, #264, #258). Standing merge clearance is granted.
- **PM never writes `MERIDIAN_CHANGELOG`.** The engineer owns it. PM only verifies an entry exists.
- **One engineer task in flight at a time.** Queue the rest.
- **Before any merge: re-fetch `main`, read the DIFF, not the PR body.** Spot-check at least one
  concrete factual claim per PR.
- Build must pass and stay within **2.8 MB / 850 KB gzip** entry budget. Last measured on the #293
  merge: **509.64 KB gzip, 340.36 KB headroom**, 1370/1370 tests.

### Disciplines that carry forward (CLAUDE.md standing rules — do not relitigate)

Measure it, don't reason about it · no second guesses (a disproven hypothesis is followed by a
measurement, not another hypothesis) · data depth is never the limiter, backfill it · API over email
(email ingestion is forward-only) · auto/emailed-first, freshest-wins; manual is last-resort fill ·
never average averages, dollar-weight aggregates · source metrics through `metric-source.js` /
`vs-ly.js`, never raw rows in a panel · commit every `memory/` file in the same commit as the work
citing it · a commit body is the durable handoff — spell out what was deferred and why · never break
working features · speed check on every change.

**PM-specific discipline that has repeatedly mattered:** when the PM asserts something with a tidy
justification, the engineer should check it. Four times on 2026-08-10 a five-minute look would have
settled something the PM asserted from inference. See the corrections register in §7.

---

## 2. Where the code stands

**Merged in the last two days:** #280 (v5.011), #284, #282 (v5.012), #293 (docs).

### Open PRs — the live board

| PR | What | PM state |
|---|---|---|
| **#298** | v5.014 — #295 Bullseye tile invisible in light mode | **NEW, unreviewed** |
| **#301** | v5.015 — #296 step 1: border/stroke `rgba(255,255,255,X)` → tokens | **NEW, unreviewed** |
| **#297** | #294 — retention probe drops a reconfirmed correction's history | **NEW, unreviewed** |
| **#292** | #291 Product Mix real pull | **HELD** — primary-key blocker, see below |
| **#286** | v5.013 — #276 step 2, lone-red → `var(--crit)` | **HELD** — needs rebase onto latest `main` |
| **#269** | #263 + #265 pull-failure detection + completeness ledger | **HELD** — owner must run the SQL; plus one residual |

**#292's blocker, quantified (this is the review note to repeat):** a primary key of
`(loc, date, item)` drops **127 of 441 rows (29%)** and retains only **42% of dollars**,
non-deterministically — and the rows it drops are exactly the **price tiers the issue exists to
measure**. The PK must include the price point. Do not merge until the rebuild lands.

**#269's residual:** in `scripts/check-data-completeness.mjs`,
`if (inc.date_start < startDate || inc.date_end > endDate) continue;` means an out-of-window incident
can **never** close. `DAYS_BACK` defaults to 60; `printRanking()` lists *all* open incidents ordered
by `detected_at` ascending.

### Engineer queue (dispatch order, as sent)

#295 ✅ → #296 step 1 ✅ → **#292 PK rebuild** → **#286 rebase** → **#269 residual** → #294 ✅

So the next three engineer items are **#292, #286, #269**, in that order. The first three are already
in PRs #298/#301/#297 awaiting PM review.

---

## 3. What the owner owes (his action list — keep it in front of him)

1. **Cycle the QSRSoft session — URGENT.** He has pasted a live `x-auth-token` in plaintext at least
   **four** times. Strip `x-auth-token` from every capture; never write one to a file or a commit.
2. **Run `supabase/schema-data-completeness.sql`** — this is the only thing blocking #269.
3. Rate the **remaining 12 stores** — the cohort closes **2026-09-03**.
4. **Reconcile the 5-of-20 binary to exactly five** *before* looking at scheduling data.
5. Send the **marketing-calendar archive URL** (weekly, archived; #290).
6. **Confirm actual price actions and effective dates** — he has said participation was minimal:
   *"WE DID NOT PARTICIPATE IN THE WHOLE PRICE CHANGE STRATEGY."*
7. Find the **1-800 external source**; assign the **CRCP designee** (`customerfeedback@myqsrsoft.com`).
8. **Delete the roster workbooks** — they carry SSNs, DOBs, addresses.

**WITHDRAWN — do not re-ask:** "send a capture with `discAmt` in `selectCols`." There is no `discAmt`
field. The identity is **`adjPmixSales = dollarsSold − offerAmt`**, verified at two levels on the real
export (Hamburger subtotal 777.91 − 15.76 = 762.15; the $1.89 tier 253.26 − 5.67 = 247.59). Select
`adjPmixSales` and the subtraction happens server-side.

**Also closed:** "one capture with `poo` ≠ Combined" — his UI screenshot answered it. `poo` is
**Combined / Delivery / Non-Delivery**, a delivery flag. It is **not** point-of-origin; Product Mix
cannot split drive-thru vs front counter vs kiosk. That line of inquiry is closed negatively.

---

## 4. The captures he sent just before the session died — all processed

Three commits, all on this branch or `main`. Read the commit bodies; they are the record.

- **`a0d9c7e`** (on `main` via #293) — `product-mix-bundles` / `menuitems` / `qtr-hr-sales`.
  Endpoint `/reporting/v2/product/product-mix-bundles`, `catalogType=productMix`. Grain is
  **(item, price point)**, not item — 441 rows over 314 item numbers, 116 items at >1 price. So
  **never** recover realized price as `dollars ÷ units`; it would read a mix shift as a price change.
  `dollarsSold == price × soldQty` exactly (0/441 exceptions) → gross, carries no discount, overstates
  net by 2.9% on that store-day and the overstatement *is* promotional intensity. `promoQty` and
  `offerAmt` are different measures (15 rows have one without the other and vice versa) — carry both.
  `promoQty` gives **direct free-item detection**, which turns the FBP monthly-GMA-offer confound from
  an assumption into a measurement. Volume: ~11,900 rows/day district-wide, ~4.3M/year; 21 rows per
  store-day are `soldQty 0` catalog placeholders (filter on ingest).
- **`6d732fd`** (this branch) — the UI filter surface and the **hierarchical Excel export**. Measured
  on 535 items / 4,539 rows: subtotal row + detail rows + a grand-total row. Naive summation gives
  Units Sold **311,769 vs a true 103,923 (×3.00)** and Units Wasted **13,911 vs 1,205 (×11.54)**.
  `parsePMixData` does exactly the naive thing. Detecting the subtotal by "Price contains a range"
  misses 80 single-price items — group by item number, take the first row, drop the grand total by its
  empty `Desc`.
- **`771b186`** (this branch) — **`api.sso.myqsrsoft.com/user/settings` returns EVERY report's
  `*/defaultColumns`**, not just the one requested. That is the canonical API field vocabulary for 13
  reports; read field names from there instead of reverse-engineering Excel headers (the export renders
  `priceRange` as "Price" and `adjPmixSales` as "Adj PMIX Sales", neither of which `selectCols` wants).
  Gap-closers found in it: `operationsReport/controls` carries **`overTimeHours`, `overTimeDollar`,
  `avgRate`, `actualVsNeeded`** — the exact inputs Labor Analytics is missing; `analysisSummary` carries
  per-position over/under; `mcDelivery3POReport` carries per-vendor `avgCSat`; `dailyGlimpse` carries
  `dtCars_*` peak car counts.
  **PII: `storePeoplePunches` lists `ssn`. Never select it, never let it reach Supabase, never log it.**

All of it lives in **`memory/qsrsoft-report-catalog.md`** (1,590 lines) — the single best artifact of
the last three days.

---

## 5. PM debts — owed work, none of it filed yet

1. **`parsePMixData` inflation issue is NOT filed**, despite commit `6d732fd` saying "Filed
   separately." That is a dangling claim. The shipped Product Mix panel's family totals are **~3×**
   reality and its waste **~11.5×**, and on a default export `Family Group` is absent so *every* row
   falls to `'Other'` and the by-family breakdown silently collapses into one bucket. Three of the
   four failure modes are live in production today. **File this first.**
2. **Labor Analytics OT false-zero is NOT filed.** `src/views/labor-tools.js:1764` —
   `const otCostEst = (otHrs||0)>0 && (avgRate||0)>0 ? … : 0;` renders **"$0"** for 27 locations while
   OT HRS/DAY correctly renders "—" from the same missing data. A false zero is worse than a blank.
   Pair it with At A Glance showing "No labor data" while Labor Analytics shows 22.47%, and with the
   `771b186` finding that `operationsReport/controls` already exposes the three fields needed.
3. **Promo/Discount ROI reads negative for every store** — suspected denominator artifact from
   promo-heavy classification. Investigate or file.
4. **Re-post consolidated #291/#292 guidance** covering the UI filter surface and the workbook
   structure.
5. **McValue FBP document edits before 25 August** — split B1 out, name the calendar events, state the
   LY-asymmetry bound. Workspace: `memory/project-mcvalue-2-fbp-document.md`. **This has a hard
   external deadline.**

Already filed and needing no further PM work: **#299** (FOB Root-Cause Matrix claims to exclude Base
Food, then ranks it #1/#3/#5 — `analytics.js:3178`, the `actionable` flag is set on zero of the 10
`FOB_COMP` entries; one-line fix) and **#300** (6-Week District Sales Trend has no completeness guard
on either window — one week reads **+391.69%** and flattens the other five; `at-a-glance.js:1349`).

---

## 6. In-flight analysis threads

- **McValue 2.0 FBP document — due 25 August 2026.** `memory/project-mcvalue-2-fbp-document.md`.
  Method: difference-in-differences on **14-day Wednesday-anchored blocks** against inline `ly_` twins,
  **364-day** LY alignment. Both headline findings are **overstated** by a confound the PM found: the
  monthly GMA free-item incentive ran continuously through 2025 but only Jan–Mar 2026, so it cancels in
  the pre-period and **not** in the post-period. FIFA World Cup HM was a **demand** failure, not an
  execution failure — owner confirmed. The +10.4¢ check gain is **1.05% of a $9.909 average check**
  (independently cross-validated against At A Glance's $9.94).
- **District OSAT decline.** Measurement-artifact explanations closed from both directions: volume
  (MoM r=0.137, ns) and channel mix (DT share recovered algebraically as
  `dtShare = (overall − fcPct)/(dtPct − fcPct)`, ~42% and flat, t=1.47, ns). Florida is **66.1% over
  7.5 months, 3.9pp below** its flat 0.70 target — and that flat 0.70 is a sheet-population artifact
  from initial target setting, not a considered decision. Targets are **per-store** (OK 0.82–0.92) and
  live in the yearly targets Excel; never grade VOICE against a flat threshold.
- **`store_assessments` rating schema — FINAL.** `loc, assessed_at, assessor, program, dimension,
  rating, note, tenant_id`; **immutable — corrections are new rows, never updates**. Three dimensions:
  GM engagement / Scheduling-manager engagement / Execution confidence, all three-valued. "Compared to
  average" was dropped. Multi-rater (DO/supervisors rating independently) is **deferred to a future
  program** — his decision. `memory/notes-66-staged-experiments-and-risk.md`.
- **Light-mode theme debt.** 427 hardcoded white-alpha values vs 1135 correct `var(--bdr…)` sites —
  **73% adoption**. Meridian is dark-first so the four light `html[data-theme][data-mode]` blocks are
  effectively unreviewed. #295/#296 came out of one phone screenshot.

---

## 7. Corrections register — mistakes already made, do not repeat them

Recorded because they are the cheapest thing a successor can inherit.

- **Graded VOICE against a flat ≥90% OSAT threshold.** Targets are per-store and in the workbook.
- **Concluded "Florida is at target" from 13 days.** Over 7.5 months it is 3.9pp below. Short windows
  land on the right number by chance; that is the exact trap.
- **Inferred Florida got 0.70 "because it had no history to individualize from"** — read an empty
  spreadsheet cell as a fact about the world. It has history.
- **Nearly reported Aug-vs-YTD +1.9pp as recovery** — n=723 → SE 1.52pp, so 1.25 SE, *and* YTD
  contains August.
- **Speculated `poo` was point-of-origin and called it "a bigger unlock than the price question."**
  Wrong; closed by a screenshot. An explicit ⚠️ CORRECTION is written into the catalog.
- **Suspected #282's dots would render black.** Measured with Playwright instead of asserting: `var()`
  resolves in the React attribute path too (`rgb(16,185,129)`). The engineer's *code* was right; only
  their *stated mechanism* was wrong. Recorded in the merge commit rather than silently dropped.
- **A script reported a global ×3.000 ratio while item 1 plainly showed ×2.** Printed the rows instead
  of theorising and found the grand-total row. That is the habit.
- **Could not measure Supabase contents** — the anon key returns zero rows under RLS. That is RLS, not
  absence. Never report an unverifiable count as confirmed.

---

## 8. Security constraints (verbatim intent — preserve on every future handoff)

- **Strip `x-auth-token` from every capture.** Never write one to a file or a commit. The owner must
  **cycle the QSRSoft session** — still outstanding after four exposures.
- **Never pull or persist `ssn`.** `geid` + `payrollID` identify a person adequately for every analysis
  Meridian performs. Roster workbooks carrying SSNs/DOBs/addresses are to be deleted.
- Supabase **anon/publishable key is public by design**; the **service-role key is exported into the
  owner's shell only** — never written to a file, never committed. **Never put a secret key in a
  `VITE_`-prefixed variable.**
- **The engineer must not execute production writes** even with service-role access — read-only
  measurement only. The owner executes any write.
- **PM never pushes to `main`; the engineer opens draft PRs and never self-merges.**
- Never disable TLS verification or unset `HTTPS_PROXY`.
- Do **not** put the model identifier in commits, PR titles/bodies, or any pushed artifact.

---

## 9. First actions for the successor PM, in order

1. **Review #298, #301, #297** — three engineer PRs are sitting unreviewed. Fetch `main`, read the
   diffs, build, test, spot-check one factual claim each, then merge.
2. **File the two owed issues** (`parsePMixData` inflation; Labor Analytics OT false-zero). #1 is
   already claimed as filed in a commit body, so it is also a correctness debt.
3. **Land this handoff and the two pending memory commits** (`6d732fd`, `771b186`) — they are on
   `claude/phone-disconnection-issue-di7ae9` and unmerged.
4. **Chase the owner's list in §3**, leading with the token cycle and the #269 SQL run.
5. **Dispatch #292's PK rebuild** to the engineer once #298/#301/#297 are merged (one task in flight).
6. **Start the McValue FBP edits** — 25 August is close and it is the only externally-dated item.

Related: [[feedback-pm-worker-split]] · [[feedback-measure-dont-reason]] ·
[[feedback-performance-budget]] · [[qsrsoft-report-catalog]] · [[project-mcvalue-2-fbp-document]] ·
[[notes-66-staged-experiments-and-risk]] · [[data-acquisition-shopping-list]]
