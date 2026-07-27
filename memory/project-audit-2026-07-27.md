---
name: project-audit-2026-07-27
description: Precautionary whole-project audit (owner-requested) across security/multi-tenant, correctness/wrong-numbers, consistency/standards, robustness/UX/perf, and build/test/deploy health. Prioritized findings with file:line evidence. Baseline for pre-widening hardening.
metadata:
  node_type: memory
  type: project
---

# Meridian Precautionary Audit — 2026-07-27

Five parallel read-only auditors. Nothing changed. Baseline for hardening before
Meridian widens to more operators. Consolidated + de-duped, ranked by severity.

## 🔴 CRITICAL

### A1 — Wide-open Supabase RLS (`using(true)`) on ~30 tables → anon key = full public read/write
`supabase/schema.sql` (qsr_* 1354-1514, labor_rows 618, ctrl_rows 733, ops/fob_rows 664-685,
monthly_targets 306, reviews-adjacent, employee_skills 1263 [PII], smg_comments 1323 [customer PII],
sales_ledger/daily_glimpse/cash 1006-1086, etc.). `for all using(true)` grants anon+authenticated;
the anon key ships in the browser bundle. **No login required to read/dump/overwrite nearly all data.**
Schema comment (line 309) admits it was deferred ("tighten after Vercel auth is live") — never done.
Plus **public storage buckets** with anonymous insert (schema 204-258: `reports` public read+insert).
→ **THE blocker for a second operator.** Fix = scope every policy to `auth.uid()` + `profiles.accessible_locs`
(as `reviews` read already does); make buckets private. Needs care + testing + owner involvement (changes auth behavior).

### A2 — loadGlimpse/loadCash/loadSalesLedger silently drop the NEWEST data (wrong dashboard numbers)
`src/lib/supabase.js:1520-1588` — `.select('*').gte('date',cutoff).order('date')` **ascending, no pagination**.
Supabase caps plain selects at ~1000 rows; 60d × 27 stores ≈ 1,620 → keeps the **oldest 1000**, discards the
**newest ~23 days**. Directly corrupts the freshest-wins At-A-Glance tiles (Digital Sales/Service/Controls/Labor)
and smart-targets training. **Live wrong numbers.** Easy fix: wrap in `fetchAll(...)` like the already-correct
loaders (loadQsrActSummary/loadDtHistory). → SAFE FIX-NOW.

## 🟠 HIGH

### B1 — Calendar Manager FL/OK pills read a non-existent `.state` field
`src/features/calendar.js:68-69` uses `STORE_COORDS[l].state` — STORE_COORDS has only {lat,lon,tz}. So FL pill
is **always empty**, OK includes all 27 (incl. FL). Same class fixed elsewhere v4.426; calendar.js missed.
Fix = use `INV_ORG_COORDS[l].state` (2 lines). → SAFE FIX-NOW.

### B2 — RBAC is client-side only, not backed by RLS
`src/engine/permissions.js` reads roles from localStorage; data tables ignore `profiles.role`. UI gating is
cosmetic while tables are `using(true)`. (No priv-escalation — profiles RLS blocks role self-write — but data
access is uncontained.) Falls out of fixing A1.

### B3 — `xlsx@0.18.5` (SheetJS) parses untrusted uploads; known CVEs, no npm fix
prototype pollution (CVE-2023-30533) + ReDoS (CVE-2024-22363). Used across src/parsers + sage.js on
manual/emailed Excel. Patched builds only on SheetJS CDN, not npm. Fix = pin CDN build or migrate parser.

### B4 — Core money/scoring engine `pipeline.js` (41 KB) has ZERO tests
Builds per-store scores, labor%, deposit-vs-sales, OT premium $, cash-diversion flag (pipeline.js:163/165/187).
0 test imports. A bug here = wrong numbers/flags everywhere. Fix = characterization tests (highest-ROI test to add).

### B5 — Data-pull scripts go green on zero-row / partial failures (silent staleness)
`qsrsoft-ebos-pull.mjs`, `lifelenz-people-pull.mjs` catch per-store errors → warn → exit 0 even if 0 rows saved.
A dead pull shows a green check. Fix = tally savedCount/failures, `process.exit(1)` (or notify) when 0 saved.

### B6 — Single global ErrorBoundary; "recover" loops
`src/features/session.js:13-26` — any throw in any of ~50 panels white-screens the WHOLE app, and "Try to
recover" only clears err → deterministic errors re-throw → stuck. Fix = per-panel/ per-modal boundaries.

## 🟡 MEDIUM

- **C1 — Unweighted rate aggregation** (violates dollar-weight rule). `src/engine/metric-source.js:96-104`
  `metricAvg` = straight mean of daily rates. Same in projections.js:345-348, store-analytics.js:429/435,
  scheduling.js:155/195/220/412. The codebase knows better (dt-speedofservice.js:317 trans-weights OEPE;
  eom-supervisor.js:116 $-weights labor). Fix = weight by sales/transactions.
- **C2 — Perf-review ratings stored by positional index** (`performance-reviews.js:766`, read
  review-engine.js:564/667). Reordering/insert/deactivate mid-cycle mis-maps ratings. **→ Phase C stable-IDs
  fixes this; do NOT ship drag-reorder without it.**
- **C3 — Print/export XSS sinks.** Unescaped interpolation in `document.write` HTML across sage.js:918
  (mdToHTML 609-642), performance-reviews.js:1313/1470/1650, smg-voice.js:93, store-dash.js, analytics.js:1216,
  eom-dashboard.js:51, graded-visits.js, etc. In-panel React render is safe (no dangerouslySetInnerHTML). Escape
  all interpolated values (employee names / SMG comments / SAGE output). Stored-XSS vector in multi-operator future.
- **C4 — sage-chat trusts client-supplied system prompt** (`supabase/functions/sage-chat/index.ts:619`). Contained
  today (RBAC block appended server-side; tools hard-scoped by profiles) but build the base prompt server-side.
- **C5 — reviews table write not scoped** (schema 143-147): any authenticated user can insert/overwrite any
  review (reads ARE scoped). Scope writes by owner/role+accessible_locs.
- **C6 — Stale in-app version/changelog** (App.js:214 `4.533`, ~13 behind real 4.552) + 3 divergent version
  mechanisms (morning-brief `v5.37a` dead; management.js reads unset `window.__MERIDIAN_VERSION__` → '—'). → SAFE FIX-NOW.
- **C7 — Metric-sourcing-standard slips**: projections.js:307-308 hand-rolls vs-LY from raw ds.laborRows (should
  use matchedVsLY); analytics.js:47-49, store-analytics.js:187/2430 raw-filter for metrics (verify vs helper).
- **C8 — `anyModalOpen` is an 80-term hand-maintained OR** (App.js:2257) — new modal forgetting its flag
  silently reintroduces the freeze bug. Fix = derive from a modal map/set.
- **C9 — Signals light-mode theme breaks** — hardcoded `#1a1f2e` backgrounds on inputs/selects
  (signals.js:208,214,255,257,258,393,400,902,1057,1233,1512). Use CSS vars.
- **C10 — Untested decision engines** (0 tests): permissions.js, insights.js (40KB), coaching.js (33KB),
  why.js, csat-opportunities.js. forecast.js (138KB) covered but thin.
- **C11 — Monolithic 3.78 MB bundle (1.08 MB gzip), no code-splitting.** Two `INEFFECTIVE_DYNAMIC_IMPORT`
  (supabase.js, parsers/graded-visits.js — dynamic+static). Route-level React.lazy; pick one import style.
- **C12 — `eval()` of fetched `/populate-demo-reviews.js`** (performance-reviews.js:2090-2094) — the build
  `[EVAL]` warning. Same-origin demo loader, low risk, but breaks under CSP + defeats minify. Gate dev-only + `import()`.
- **C13 — Clickable `div`s not buttons** — 32 sites (sage.js 7, store-analytics 4, signals/visit-readiness 3…).
  Not keyboard-focusable. Follow attention-now.js:110 button pattern.

## 🟢 LOW / cleanup
- **Dead cruft:** `Meridian_v4_217_wip.html` (1.82 MB, unreferenced), duplicate `Meridian Forecasting Reference.html`,
  orphan `populate-review.js` / `submit-event.html` (root+public). Delete. → SAFE FIX-NOW.
- **Debug logging in prod:** `[PERF]` on every Priority-Brief render (analytics.js:2006-2107), `[AE]` (App.js:2128/2168),
  ~45 `[Meridian]` load logs. Strip or gate behind DEBUG. → SAFE FIX-NOW ([PERF]/[AE] at least).
- **Three deploy configs** (vercel.json + netlify.toml + .github/workflows/deploy.yml GitHub-Pages-on-push).
  Confirm the real target, delete the others to stop drift/duplicate deploys.
- **money() sign drift** — Math.abs variants (attention-feed/analytics/eom-item-journey) vs signed variants
  (eom-dashboard/labor/signals). Signed-dollar values (cash O/S, variance) render loss==gain in the abs ones.
  Promote one `money(v,{signed})` to utils/fmt.js.
- **UTC date-parse off-by-one** — bare `new Date('YYYY-MM-DD')` at labor-tools.js:1701, graded-visits.js:259;
  only bites a positive-UTC-offset (future non-US) operator. Use `+'T00:00:00'`.
- **ErrorBoundary fallback hardcoded dark** (session.js:17-22).
- **⚠ onhand cron:** the health auditor suggested narrowing `qsrsoft-onhand-pull` cron to days 26-31.
  **DO NOT** — the hourly cron is now REQUIRED for the v4.549 year-round daily progress snapshot (runMode
  'progress' window 10-14 UTC). Narrowing to 26-31 would kill the two-modes feature. Leave hourly.

## ✅ Confirmed HEALTHY (no action)
Build passes clean; 355/355 tests; deps current (React 19/Vite 8); **no secrets committed** (.env* gitignored,
only clean .env.example); org mapping (MCDOK=OK / Emerald=FL) correct everywhere; no "MFR"/old-org strings;
vs-ly.js, eom-item-journey/eom-inventory, attention-feed math all correct + guarded; already-paginated loaders
correct; script auth resilience (token→Playwright fallback, fatal exit-1 on total auth failure) solid; idempotent
upserts; edge functions each independently authenticate (no SSRF).

## Recommended sequencing
1. **A2** (pagination — wrong numbers, safe) + **B1** (calendar pills) + **C6** (version) + cruft/debug — SAFE FIX-NOW batch.
2. **A1/B2** (RLS + RBAC) — the multi-tenant blocker; plan + owner-in-loop, before any second operator.
3. **B3** (xlsx), **B4/C10** (tests on pipeline/permissions/insights), **B5** (workflow failure surfacing).
4. **B6/C8** (error isolation + modal-open derivation), **C3** (escape print HTML), **C11** (code-split).
5. LOW cleanup.
