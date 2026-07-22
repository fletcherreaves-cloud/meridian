---
name: handoff-smarttargets-graded-accuracy
description: Dense session handoff (2026-07-22) — Graded Visits rework, Accuracy layer, Smart Targets v2, Projections current-month actuals, Phase-2 bug fixes, LifeLenz self-heal. For a fresh Claude Code session to resume without context loss.
metadata:
  node_type: memory
  type: project
---

# Handoff — Smart Targets / Graded Visits / Accuracy sprint (2026-07-22)

Branch: **`claude/status-data-refresh-strategy-u88lz9`** · PR **#12** (open draft) ·
current version **v4.457** (version lives ONLY in commit messages, not in a file;
bump `v4.xxx` each commit). Full suite **104 tests, all green**. `npm run build`
must pass clean before every commit. (There is an older, unrelated handoff at
`memory/handoff-data-refresh-sprint.md` from 2026-07-12 — keep both.)

---

## 1. Key decisions & owner's stated preferences

- **Auto/emailed-first, freshest-wins is law.** Every tile/column is fed by an
  auto-pulled or emailed cloud stream. Manual uploads (`laborRows`/`ctrlRows`/
  `opsRows`/FOB Excel) are **last-resort fill only** — may fill a loc/date the
  cloud hasn't covered yet, but must **never override** auto/emailed data or be a
  tile's primary source. Manual data is device-local IDB (blank on other devices,
  stale past last upload). This is exactly why the MTD-actual bug (§3) was real.
- **Accuracy is the moat / non-negotiable.** Correct math, **never average
  averages**, **dollar-weight aggregates** (Σ$/Σbase, never mean-of-store-%s),
  self-audit every generated report with a visible ✓/⚠ badge.
- **Smart Targets — owner's projection method (IMPORTANT intent correction, stated
  2026-07-22):** the owner's proven method is a **weighted-recency blend of
  trailing windows — T3M (3 months) + T6W (6 weeks) + T3W (3 weeks), most weight
  on most recent** — with **anomalies excluded** and **known events (+/-)
  accounted for**. He wants **BOTH** his method AND our `forecast.js` models run
  together, with **per-store tracking of which method wins** (that scoreboard is
  itself valuable insight data). His method is a first-class projector, NOT a
  fallback. Do not reduce "own trajectory" to plain baseline×trend.
- **Smart Targets purpose:** setting targets for an **upcoming period** (e.g.
  August). Wants clear labels, horizon options **out to yearly**, use of our
  forecast models + auto-calibration (prompt him for judgment calls inline),
  export/print, and eventually an **"apply as Official"** flow feeding Monthly
  Projections.
- **Naming (he was briefly confused — keep crisp):** nav "Monthly Targets" →
  **"Monthly Projections"** (📅). "Smart Targets" (🧭) is a **separate new panel**.
  There is ALSO a **separate** "Projections" (▦) panel. Three distinct things.
- **"Put it in both":** current-month actuals-vs-target belongs in BOTH the
  Monthly Projections panel and the Projections panel.
- **Graded Visits: channel-only.** App/Traditional flag fully removed — use only
  channel (Drive Thru, Curbside, Delivery, In-Store).
- Working agreement: suggest better prompts when they'd help; flag scope drift; he
  thinks fast and fires several ideas at once — confirm intent, don't lose it.

---

## 2. Architecture / design choices + reasoning

- Stack: Vite + React 19 vanilla JS, `// @ts-nocheck` everywhere, `h =
  React.createElement` hyperscript. Supabase (Postgres + magic-link + Deno Edge
  Fns). Vercel. No TypeScript in src/.
- **Supabase 1000-row cap is the #1 recurring footgun.** `.limit(N)` above the
  server max is a **no-op** — you MUST paginate with `.range()`. Use `fetchAll` /
  count-then-parallel-pages. Several loader-cap bugs found + fixed this sprint (§3).
- **Accuracy layer** `src/lib/accuracy.js` (NEW, P0) — shared primitives so no
  panel re-rolls its own wrong average: `weightedRate` (Σnum/Σden), `weightedMean`
  (Σvw/Σw), `pctToFraction`/`fractionToPct`/`asFraction`, `perUnitSeconds`,
  `padLoc`, `reconcile`, `check`, `audit`, `checkRowsSumToTotal`, `checkInRange`,
  `checkDateCoverage`, `fetchAllPages`. 20 tests. Consumed in analytics.js via
  `AuditBadge` + `fobAudit` + `salesRecon` (DAR-vs-Ledger reconciliation badge).
- **Smart Targets** split: pure engine `src/engine/smart-targets.js` (median, mad,
  quantile, trendSlope, robustBaseline, likeSizedPeers, peerAnchor, blend,
  confidence, computeSmartTarget — 18 tests) + panel `src/views/smart-targets.js`
  (`SmartTargetsPanel`). Design + intent correction in `memory/vision-and-
  roadmap.md`. FL and OK peer sets computed **separately** (different markets).
- **Fast load pattern:** `loadDailySales(days)` in `src/lib/supabase.js` does
  count-then-parallel-page fetch of `loc,dt,product_sales` from
  `qsr_daily_activity`, deterministic order (`dt,loc,hour_slot`), aggregate per
  (loc,date). Replaced a 75-second sequential fetch. Panel prefers in-memory
  `ds.salesLedgerRows` (≥8 stores/≥20 days), else `loadDailySales`. Effect dep was
  narrowed to `ds.salesLedgerRows.length` to kill flicker.
- **CurrentMonthPaceSection** (exported from analytics.js, shared by both
  Projections panels) — **self-detects the latest-actuals month** with a `‹ ›`
  stepper, loads targets on demand via `loadMonthlyTargets`. Built because July was
  empty and owner wants pace to pull the correct month regardless of what's loaded
  or today's date.

---

## 3. Open threads / unfinished work / TODOs

- **Smart Targets multi-projector (owner's #1 next ask, NOT STARTED):** implement
  his T3M/T6W/T3W weighted-recency projector as a pure fn; run alongside
  `forecast.js` models on the same series; record each method's projection +
  realized error per store; surface a "which-wins-per-store" scoreboard. All with
  anomaly-exclusion + known-event (+/-) adjustment. He hasn't picked an order for
  remaining Smart Targets phases (①multi-projector+horizons+calibration ②extend to
  Labor%/FOB/Speed ③Smart-vs-Official-vs-Actual grading ④apply-to-official) — said
  "move forward however is best."
- **Smart Targets horizons:** currently 60/90/180d lookback; wants forward horizons
  **out to yearly**, clearer "target for [upcoming month]" labeling, auto-
  calibration, export/print (added — verify), eventual tie-to-Official.
- **LifeLenz (JUST FIXED in code, v4.457 — needs merge + token refresh):** see §4.
- **⚠️ Pending USER action (still unconfirmed):** run the `forecast_snapshots` SQL
  block from `supabase/schema.sql`.
- **EcoSure graded-visit adapter** — awaiting sample files from owner.
- **R2P / CTP columns show "—"** in Graded Visits until owner runs a DAR backfill
  (field-name case fix landed v4.430; historical rows predate it).
- Decide whether to retire dormant Smart Targets **v1** (`src/features/
  smart-targets.js`, `SmartTargetPanel`, modal `smart-targets`, no nav). v2 does
  NOT reuse it.
- Roadmap remaining: P2 UX coherence pass + panel scorecard; P3 Graded-Visit
  Predictor (ingest CFV/RGR/Ecosure) + composite indices; P4 multi-user →
  multi-tenant.

---

## 4. LifeLenz sync failure — diagnosis + fix (v4.457)

**Symptom:** `LifeLenz Daily Sync` (`.github/workflows/lifelenz-pull.yml`) failing
Jul 19–22; last success Jul 18. Job log:
```
[auth] token validation → 404
[auth] token validation non-200 but not auth error — proceeding with token
[schedules] REST → 422: {"error":{"code":"INVALID_SESSION_ERROR","detail":"Session expired"}}
```
**Two root causes:** (1) `LIFELENZ_TOKEN` expired (rotates ~monthly). (2) Resilience
was broken: the token sanity-check hit a **wrong endpoint** (`/workforce/
business/.../schedules` → 404, false confidence) and only invalidated on
**401/403** — but LifeLenz signals expiry with **422 `INVALID_SESSION_ERROR`**, so
it "proceeded with the bad token" and hard-exited instead of falling back to
Playwright login.

**Fix landed in `scripts/lifelenz-pull.mjs`:**
- New `isSessionExpired(status, body)` — true on 401/403/**422** OR body containing
  `invalid_session_error` / `session expired` / `sign in again`.
- New `reauth()` — direct REST login → Playwright browser fallback.
- Token validation now hits the **real** discovery endpoint (`/api/admin/
  businesses/${BUSINESS_ID}/schedules`) and uses `isSessionExpired`.
- `getStoreSchedules` wrapped in try/catch: on a session-expired throw, `reauth()`
  once and retry → sync now **self-heals** when the token rotates (creds
  `LIFELENZ_USERNAME`/`LIFELENZ_PASSWORD` are set).

**⚠️ Two things still required for live relief:**
1. **Scheduled workflows run from the DEFAULT branch (main)** — this fix on the
   feature branch does NOT affect the live cron until PR #12 merges (or is
   cherry-picked to main).
2. **Immediate relief regardless:** refresh the `LIFELENZ_TOKEN` GitHub Secret —
   DevTools → Network → any `us01-connect.lifelenz.com` request → copy the
   `X-Auth-Token` header → update the secret. Runbook: `memory/lifelenz-session.md`.

---

## 5. Gotchas / dead-ends / "don't do X"

- **Don't push without `npm run build` + `npm test` green.** A dayAgg
  ReferenceError shipped once (v4.433) because a destructure was missed — owner
  caught it via screenshot. Build clean ≠ runtime clean; check destructures.
- **Don't `.limit(N)` past Supabase's 1000-row max** — silently no-ops. Use
  `.range()` pagination / count-then-parallel.
- **Don't average ratios.** Store roll-up = Σnum/Σden. FOB = dollar-weight
  (Σfood$/ΣprodSales).
- **loc padding:** STORE_NAMES keys are **unpadded** ("3708"); DAR/report loc is
  **zero-padded to 7** ("0003708"). Normalize with `String(parseInt(x,10))` before
  joining. `padLoc` helper in accuracy.js.
- **`getStoreOrg(l)==='emerald'` = the 7 FL panhandle stores** (counter-intuitive;
  "emerald" ≠ Oklahoma Emerald Arches here).
- **QSRSoft DAR API** (`api.reports.myqsrsoft.com`) needs browser session cookies —
  server-side Node fetch with token alone → 401. Use Playwright in-browser fetch,
  one `page.evaluate()` per date (single evaluate with an internal loop hangs).
- **LifeLenz dead end:** do NOT re-investigate GraphQL
  `GetPdfReportsBusinessOfficeLocations` — returns location IDs, not schedule IDs.
- **React memo TDZ:** dep arrays evaluate at definition — place a `useMemo` AFTER
  its deps are defined or you crash (bit us with gcCrossCheck / weekDays).
- **Full-screen modals:** `position:fixed; inset:0`. Removing `viewport-fit=cover`
  from index.html insets content below the iPhone notch automatically (v4.445);
  don't re-add it.
- **DAR column formulas are exact** — `memory/project-qsrsoft-dar-columns.md`. Raw
  times are **ms sums**, `/1e3` = seconds. **R2P is a FRONT-COUNTER metric**
  (`(fc_untilserve−fc_untilclosedrawer)/fc_trans_cnt/1000`), NOT drive-thru.
- **`lifelenz_schedule`** is singular — there is NO `lifelenz_schedules` table.
- Don't put the model identifier `claude-opus-4-8` in commits/PRs/code — chat only.

---

## 6. Conventions established

- **Tables (Supabase):** `qsr_daily_activity` (DAR hourly, PK `(loc,dt,hour_slot)`,
  loc = NSN 0-padded-7, hour_slot = `endQtrHourTime`, LY fields `ly_`-prefixed:
  `ly_product_sales`/`ly_transactions`), `qsr_fob`, `qsr_ebos_daily`,
  `lifelenz_schedule`; emailed: `sales_ledger_daily`, `daily_glimpse_daily`,
  `cash_sheet_daily`, `monthly_targets`. Every new persistent data type → Supabase
  (save on upload + load on startup).
- **File layout:** engines (pure, tested) in `src/engine/`; shared primitives in
  `src/lib/`; panels in `src/views/`; features in `src/features/`; all parsers in
  `src/parsers/index.js`; Supabase I/O in `src/lib/supabase.js`; tests in
  `src/__tests__/`.
- **Versioning:** `v4.xxx` in the commit-message subject (no version file).
- **Commits:** heredoc message ending with `Co-Authored-By: Claude Opus 4.8
  <noreply@anthropic.com>`. Push `git push -u origin
  claude/status-data-refresh-strategy-u88lz9` with retry/backoff. PRs are draft.
  Be frugal with GitHub replies. GitHub via MCP tools (no `gh` CLI).
- **Weighted-agg naming:** `weightedRate`/`weightedMean` from accuracy.js — reuse,
  don't hand-roll.
- **Metric registry pattern:** Smart Targets METRICS array is the extension point
  (`{key, direction:'higher'|'lower', official, monthly, mem, fetch, daily, fmt}`).

---

## 7. Files touched this sprint (quick map)

- `src/parsers/graded-visits.js` — channel-only (removed appUsed).
- `src/views/graded-visits.js` — full rework: hour-context highlighting, real DAR
  formula columns (METRICS array), two-row Day/Visit-hour bar, print/CSV,
  `storeLabel` "3708 — Name", modal 1500px.
- `src/lib/accuracy.js` (NEW) + `src/__tests__/accuracy.test.js`.
- `src/engine/smart-targets.js` (NEW) + `src/__tests__/smart-targets.test.js`.
- `src/views/smart-targets.js` (NEW panel).
- `src/lib/supabase.js` — `loadDailySales`, graded-visit completion_time persist,
  3 loader-cap fixes (loadLifeLenzSchedule/loadDailyActivityRange/loadDtHistory).
- `src/views/analytics.js` — accuracy imports, AuditBadge, fobAudit, salesRecon,
  `CurrentMonthPaceSection` (exported), v4.456 MTD fix (product-sales basis, not
  manual labor).
- `src/engine/forecast.js` — `fetchRow` null-idx guard (fixed 9 tests), export
  gcCrossCheck.
- `src/features/projections.js` — import gcCrossCheck, weekDays[last] fix, render
  CurrentMonthPaceSection.
- `src/views/dt-speedofservice.js` — DtTrendChart avg/store/patch modes.
- `src/views/signals.js` — mobile modal close fix.
- `src/app/App.js` + `src/app/shell.js` — Smart Targets v2 wiring + nav rename.
- `index.html` — notch safe-area fix (removed viewport-fit=cover).
- `scripts/lifelenz-pull.mjs` — self-heal auth (v4.457, §4).
- `scripts/qsrsoft-dar-pull.mjs` — field-name case fixes (v4.430).
- memory: `project-qsrsoft-dar-columns.md` (NEW), `project-accuracy-layer.md`
  (NEW), `vision-and-roadmap.md` (Smart Targets intent correction), this file.
