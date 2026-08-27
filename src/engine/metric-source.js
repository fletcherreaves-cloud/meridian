// @ts-nocheck
// ── Metric source resolver (auto-first, single global implementation) ─────────
// ONE place that knows, for each operational metric, WHERE its per-(loc,date) value
// comes from and in what priority.
//
// ORDER IS AUTO-FIRST. Every chain lists the auto/emailed cloud streams first and the
// manual-upload streams LAST, as last-resort fill only. This is the standing rule, and
// until 2026-08-08 the resolver violated it in 30 of its 35 chains — this header used to
// say the opposite ("manual uploads first... then the auto-synced streams as a fallback").
//
// WHY IT MATTERS, MEASURED: `labor_rows` (manual Labor Report) had no data newer than
// 2026-07-23 while `qsr_daily_activity_rollup` carried all 27 stores through 2026-08-08.
// With laborRows ahead of the auto stream, every metric it touched preferred a stale value
// on any day both covered, and went blank entirely on the 16 days only the cloud had.
//
// A manual row being IN Supabase does not make it auto. labor_rows / ops_rows / ctrl_rows /
// audit_rows all have loaders, but they are POPULATED by an upload, so they go stale the
// moment the owner stops uploading. What matters is what FEEDS the table, not where it lives.
//
// Panels should read metrics through metricDaily / metricAvg instead of each filtering
// `ds.laborRows`/`ds.ctrlRows` itself — which is exactly why "recent windows look empty"
// kept cropping up (a manual-only read shows blank when only auto data exists).
//
// This complements engine/vs-ly.js (which owns the matched-day CURRENT-vs-LAST-YEAR math
// for sales/gc). Together they are the standing global system for sourcing operating data.
//
// Adding a metric = add one line to METRIC_SOURCES. `mode`:
//   'pos' — a real value is > 0 (sales, gc, speed times, %s that are never legitimately 0)
//   'any' — 0 / negative are legitimate (cash O/S, T-Reds, OT hours, discounts)
//
// `direction` (dispatch #77, 2026-08-23) — the ONE place a metric's "which way is good" now
// lives. Before this, direction was declared independently in at least 8 places across the
// app (src/views/store-dash.js x2, analytics.js x2, store-analytics.js, one-pager-data.js,
// at-a-glance.js, bullseye-tile.js) under two flag names (`lowerBetter` and the inverse
// `higherBetter`), and three metrics contradicted themselves: Labor %, R2P, and Discount %
// each had at least one site claiming the opposite direction from every other site — R2P's
// own store-dash.js table even contradicted its OWN sibling table, whose label literally
// read "R2P (lower=better)". Owner-ruled 2026-08-23, all three: lower-better, no two-sided
// third state ("labor has a target, for simplification, at/below is good and over is bad").
// Full adjudication, the cross-reference table, and what was deliberately left unresolved:
// memory/dispatch-77.md.
//
// Two states only — `'lower' | 'higher'`, omitted (undefined) when direction genuinely isn't
// settled. Two metrics are DELIBERATELY left unset, not overlooked:
//   - `park` — 2 of the 4 sites that declared it treat it as a fixed lower-better metric, but
//     2 others already treat it as having NO single direction (`higherBetter:null` /
//     `'range'`). This isn't a guess call: `engine/pipeline.js` (#181, 2026-08-11) already
//     REMOVED park from readiness scoring after a real 27-store quadrant measurement (park% x
//     OEPE) showed the district's heaviest parkers also beat the median on flow, refuting a
//     single-axis "less parking is always better" read. Diagnosed via
//     `engine/park-oepe-quadrant.js`, not a direction flag — do not re-add one here without
//     redoing that measurement.
//     Owner-confirmed 2026-08-23, and this is WHY the two are consistent, not a coincidence:
//     McDonald's official target is a 12-16% BAND. "Generally at or near target on either side
//     is viewed as healthy. Too low, not good — not moving cars at the DT present window,
//     equates to slower service. Too much can be viewed as operations issues with getting food
//     ready or struggling to move cars (could be staffing, lack of manager floor control, or any
//     number of other issues)." Also: "it has been covered before and I don't want to introduce
//     yet another method" — so this stays excluded from ranking rather than getting a bespoke
//     band-aware treatment here; a range/target-relative method already exists elsewhere
//     (`store-analytics.js`'s `'range'` sentinel) for whoever needs it.
//   - `actVsNeed` — a SIGNED hour gap (actual − needed), not a monotone quantity: the file's
//     own comment above this key says overstaffed and understaffed are both worth seeing, and
//     "closer to zero" isn't expressible as lower/higher. The one site that declared it
//     (`store-dash.js`, `lowerBetter:false`) isn't corroborated anywhere else, so it was not
//     carried forward.
// Migration is explicitly out of scope for #77: the 4 existing panel-side direction tables
// (~86 sites) still carry their own flags and were NOT touched except the 3 owner-confirmed-
// wrong values above. What must not happen is a NINTH declaration site — any new consumer
// (the Top/Bottom Performers panel, and anything after it) reads `direction` from here.

// Streams POPULATED BY A MANUAL UPLOAD. Each has a Supabase loader and a table, so being
// cloud-readable is not the test — what feeds it is. These three are written by the parsers
// in src/parsers/index.js (parseLaborData / parseOpsData / parseCtrlData), and audit_rows by
// the Register Audit upload. Everything else (qsrActSummaryRows, glimpseRows, cashRows,
// salesLedgerRows, opsCashRows, opsLaborRows, opsServiceRows, schedRows) is auto-pulled or
// emailed and stays current without anyone touching it.
//
// This is the single source of truth for the ordering rule, and metric-source-order.test.js
// asserts against it: no chain may place a manual stream ahead of an auto one.
export const MANUAL_FED_SOURCES = Object.freeze(['laborRows', 'opsRows', 'ctrlRows', 'auditRows', 'fobRows']);

const _dk = d => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);

// srcs are tried in order; first source with a usable value for that day wins.
export const METRIC_SOURCES = {
  // Sales / guests — sales & gc also flow through vs-ly.js for the matched-day comparison.
  sales:     { mode: 'pos', direction: 'higher', srcs: [['qsrActSummaryRows', 'sales'], ['qsrActSummaryRows', 'allNetSales'], ['laborRows', 'sales']] },
  gc:        { mode: 'pos', direction: 'higher', srcs: [['qsrActSummaryRows', 'gc'], ['glimpseRows', 'gc'], ['laborRows', 'gc']] },
  // Projected (plan) guests / sales per day — QSRSoft's own forecast (DAR proj_total_transactions
  // / proj_sales_dollars). The "what the store should deliver" baseline. projSales drives the
  // One-Pager GC/sales-to-plan opportunity ($ shortfall vs plan — bounded + sane).
  projGC:    { mode: 'pos', srcs: [['qsrActSummaryRows', 'projGC']] },
  projSales: { mode: 'pos', srcs: [['qsrActSummaryRows', 'projSales']] },
  // Speed of service — manual Ops Report, else emailed Daily Glimpse.
  // ── Dispatch #153 (2026-08-27) — OEPE/R2P raw numerator/denominator legs ────────────────
  // qsrActSummaryRows already carries the exact raw components _finalizeQsrAct/oepeSeconds()
  // (src/utils/oepe.js) use to compute the precomputed `oepe`/`r2p` fields on that same row —
  // _dtTotal/_dtStore/_dtHeldTime/_dtCars (dt_untilserve/dt_untilstore/dt_heldtime/dt_trans_cnt,
  // summed per day) for OEPE, and _fcServe/_fcDrawer/_fcCnt (fc_untilserve/fc_untilclosedrawer/
  // fc_trans_cnt) for R2P. Exposed here as their own chains so metricSumRatio (below) can sum
  // the SAME raw legs across a range instead of averaging each day's already-divided rate —
  // the fix for the measured completeness bug: `qsr_daily_activity_rollup` always carries the
  // full 24-hour_slot shape even for a day still in progress (future hours zero-filled, not
  // absent), so an in-progress day is structurally indistinguishable from a complete one and
  // was blending into "this week" with FULL weight under mean-of-daily. Live-measured
  // 2026-08-27 (service-role Supabase REST, store 3708): dt_trans_cnt on 2026-08-26 sat at
  // 744 vs a projected 1,061 (70.1% of plan, an in-progress day) yet its own-day R2P read
  // 92.3s vs 129.7–255.6s the rest of that 8-day window — the exact completeness artifact.
  // mode:'any' throughout (not 'pos'): a genuine $0/zero-held-time day is common (most days
  // have no parked cars) and 'pos' would silently drop it from the derive's date set —
  // the same zero-discarding class already fixed for park/kvsHealthy (#150/#178) — corrupting
  // the sum by dropping days where the numerator component is legitimately 0, not missing.
  dtUntilServeUs: { mode: 'any', srcs: [['qsrActSummaryRows', '_dtTotal']] },
  dtUntilStoreUs: { mode: 'any', srcs: [['qsrActSummaryRows', '_dtStore']] },
  dtHeldTimeUs:   { mode: 'any', srcs: [['qsrActSummaryRows', '_dtHeldTime']] },
  dtTransCnt:     { mode: 'any', srcs: [['qsrActSummaryRows', '_dtCars']] },
  fcUntilServeUs:      { mode: 'any', srcs: [['qsrActSummaryRows', '_fcServe']] },
  fcUntilClosedDrawerUs: { mode: 'any', srcs: [['qsrActSummaryRows', '_fcDrawer']] },
  fcTransCnt:     { mode: 'any', srcs: [['qsrActSummaryRows', '_fcCnt']] },
  // Numerator legs, pre-scaled to seconds (÷1000 factors linearly through a later Σ, so summing
  // these across days then dividing by Σcnt is identical to summing the raw components first —
  // same "Σµs / Σtrans / 1000 = sec either way" property src/utils/oepe.js's own comment states).
  oepeNumSec: { mode: 'any', derive: { inputs: ['dtUntilServeUs', 'dtUntilStoreUs', 'dtHeldTimeUs'],
               fn: (tot, store, held) => (tot - store - held) / 1000 } },
  r2pNumSec:  { mode: 'any', derive: { inputs: ['fcUntilServeUs', 'fcUntilClosedDrawerUs'],
               fn: (serve, drawer) => (serve - drawer) / 1000 } },
  // OEPE — manual Ops Report, then emailed Daily Glimpse, then the cloud-fresh DAR-derived
  // OEPE = (dt_untilserve − dt_untilstore − dt_heldtime) ÷ dt_trans_cnt, excluding parked/held
  // time (#183, reconciled r=0.9958 against a real QSRSoft Service report, 2026-08-11) so
  // current-day / recent windows populate before the Glimpse email lands.
  // derive/kind:'ratio' (dispatch #153) — a genuine numerator/denominator pair (confirmed live,
  // see comment above), so metricSumRatio can compute the true Σnum/Σden period rollup instead
  // of metricAvg's mean-of-daily. The derive.fn is also a same-shape fallback for a day with raw
  // DAR components but no precomputed source, mirroring tpph's existing pattern — srcs still win.
  oepe:      { mode: 'pos', direction: 'lower', srcs: [['glimpseRows', 'oepe'], ['qsrActSummaryRows', 'oepe'], ['opsServiceRows', 'oepe'], ['opsRows', 'oepe']],
               derive: { inputs: ['oepeNumSec', 'dtTransCnt'], fn: (num, cnt) => (cnt > 0 ? num / cnt : null), kind: 'ratio' } },
  // KVS Time per GC (seconds) — manual Ops, then emailed Glimpse, then the cloud-fresh DAR
  // (= total MFY serve time ÷ total MFY trans, reconciled to the DAR report's KVS Time Per GC
  // column). The KVS stations are the MFY make-lines, so the DAR carries it without a new field.
  kvst:      { mode: 'pos', direction: 'lower', srcs: [['glimpseRows', 'kvst'], ['opsServiceRows', 'kvst'], ['qsrActSummaryRows', 'kvst'], ['opsRows', 'kvst']] },
  // KVS Healthy Usage (2nd-side) as a 0–1 fraction — manual Ops calls it `kvsu`, the emailed
  // Daily Glimpse calls it `kvsHealthy`, and the auto-pulled DAR derives it from healthy/unhealthy
  // order-health counts (cloud-fresh, so recent windows fill even when the Glimpse email lags/omits
  // KVS). Ordered Ops → Glimpse → DAR so a manual value still wins but auto always backstops.
  // #150/#178 item 6: mode:'pos' rejected a real 0% (a store legitimately never using the
  // 2nd-side KVS window) as "not found," so it fell through to the next source or resolved
  // to nothing — a genuine zero discarded as missing data. mode:'any' accepts it.
  kvsHealthy: { mode: 'any', srcs: [['glimpseRows', 'kvsHealthy'], ['opsServiceRows', 'kvsHealthy'], ['qsrActSummaryRows', 'kvsHealthy'], ['opsRows', 'kvsu']] },
  // Same fix — a genuine 0% DT park rate (no cars ever pulled forward) was being discarded as
  // missing under mode:'pos'.
  park:      { mode: 'any', srcs: [['glimpseRows', 'parkedPct'], ['opsServiceRows', 'park'], ['opsRows', 'park']] },
  // R2P (Receipt to Print) — manual Ops Report first, else the cloud-fresh DAR-derived
  // R2P = (fc_untilserve − fc_untilclosedrawer) ÷ fc_trans_cnt (reconciled exactly to the
  // QSRSoft Daily Activity R2P column). The DAR fallback populates current-day One-Pager.
  // derive/kind:'ratio' (dispatch #153) — same rationale as oepe just above; r2pNumSec/
  // fcTransCnt are the confirmed real numerator/denominator legs.
  r2p:       { mode: 'pos', direction: 'lower', srcs: [['qsrActSummaryRows', 'r2p'], ['opsRows', 'r2p']],
               derive: { inputs: ['r2pNumSec', 'fcTransCnt'], fn: (num, cnt) => (cnt > 0 ? num / cnt : null), kind: 'ratio' } },
  // Labor — PUNCHED Labor % for ALL locations (Notes 35 + 2026-08-03 correction). Glimpse FIRST,
  // then Controls, then manual Labor rows. Controls (ctrlRows.laborPct) was supposed to already
  // be punched, but parseCtrlData had a bug (fixed 2026-08-03) that preferred "Actual Labor %"
  // over "Punched Labor %" when a sheet had both columns — owner-verified via QSRSoft screenshot,
  // e.g. store 6178 read Actual 25.84% vs Punched 23.23% for the same period, a 2.6pp gap. The
  // parser fix only affects FUTURE uploads; rows already in ctrl_rows from before the fix are
  // permanently stuck holding the wrong (Actual-labeled) value until that period is re-uploaded.
  // Glimpse is independently confirmed genuinely punched and auto/cloud-fresh (no upload lag), so
  // ordering it first gets today's best available number without waiting on a re-upload, and
  // costs nothing once ctrlRows data is clean again (both sources should then agree).
  // laborDollar — crew (punched, hourly) labor $, the numerator laborPct's derivation below
  // needs. Auto-pulled from the Operations Report labor-summary stream (qsr_labor_summary ->
  // loadOpsLaborSummary, aliased crew_labor_dollars -> laborDollar, #327). mode:'pos' — a real
  // operating day never has $0 crew labor; a 0 here means the row is missing, not that the
  // store ran on zero hours.
  laborDollar: { mode: 'pos', srcs: [['opsLaborRows', 'laborDollar']] },
  // Labor % (#327) — closes the gap where the only 3 sources are emailed/manual (glimpseRows is
  // forward-only from 2026-07-01, ctrlRows/laborRows go stale the moment uploads stop), so a
  // window past the Glimpse floor with no manual upload resolved null district-wide (At A
  // Glance's "No labor data"), even though Labor Analytics' 4-week window (inside the Glimpse
  // floor) showed a real number. Derived = crew labor $ ÷ sales, where `sales` already resolves
  // DAR product_sales first (supabase.js's loadQsrActSummary, `sales: r.product_sales`) — NOT
  // net sales, which the fraction is NOT reconcilable against (see below). Both legs (numerator
  // AND denominator) were wrong in the initial approach and had to be corrected against real
  // data before this landed:
  //   - Numerator: gross_dollars (total labor incl. salaried managers) does NOT reconcile —
  //     only crew_labor_dollars (punched/hourly only) does, matching this chain's existing
  //     3 sources which are all the crew-only "Punched Labor %" (see loadOpsLaborSummary).
  //   - Denominator: net_sales_amt does NOT reconcile (systematic ~0.2-0.3pp low bias) —
  //     product_sales_amt does, for the ~90% of days that reconcile at all (see below).
  // MEASURED ACCURACY (2026-08-16, service-role, real metricSeries with glimpseRows/ctrlRows/
  // laborRows excluded so the comparison is genuinely against the derive path, not Glimpse
  // compared to itself — an earlier PR draft made exactly that mistake and reported a
  // tautological 192/192): 648 store-days, 27 stores, 2026-07-19 to 2026-08-11, crew_labor_dollars
  // ÷ DAR sales vs Daily Glimpse's real labor_pct. 582/648 (89.8%) match within 0.001. The other
  // 66 (10.2%) do NOT — mean signed diff +0.0050 (58 positive / 8 negative, i.e. the derivation
  // mostly runs HIGH), mean |diff| 0.0074, max 0.0276. Spread across 25 of 27 stores with no
  // store at 100% mismatch, so it is NOT a fixed per-store definitional gap (that would hit every
  // day for the affected store) — it is day-specific. One deep-dive (store 31357, 2026-07-19)
  // ruled out BOTH candidate denominators for that day: neither product_sales_amt nor
  // net_sales_amt implies Glimpse's 0.1876 from crew_labor_dollars=2270.67 — the NUMERATOR itself
  // disagrees with whatever Glimpse used, not just the sales denominator.
  // ✅ REFUTED 2026-08-27 (dispatch #164, CLAUDE.md #330): this comment used to carry an unverified
  // hypothesis that qsr_labor_summary's compType:'calendar' pull was on a DIFFERENT day boundary
  // than the sales denominator, explaining the mismatch. Measured false — compType:'calendar' on
  // labor-summary is 4am-business-day aligned (re-bucketed raw qsr_punch_times clock punches
  // against crew_labor_hours two ways: the 4am cut matched to 0.000 mean abs diff across 83
  // store-days / 5 stores; midnight never won a single store-day), i.e. the SAME boundary `sales`
  // already uses (DAR product_sales, compType:'trading', also business-day aligned). Both legs of
  // this derive are on the same boundary — a boundary mismatch is ruled out as the cause of the
  // 10.2% gap. Full measurement: memory/finding-comptype-calendar-labor-summary-2026-08-27.md. The
  // gap's real cause is still open — just not this.
  // Unit convention confirmed fraction (0-1), not percent (0.2428, not 22.47) —
  // glimpseRows.laborPct read directly off daily_glimpse_daily.labor_pct, and every render site
  // multiplies by 100 before display (labor-tools.js). A derive returning d/s*100 would have
  // shipped a number 100x too large.
  laborPct:  { mode: 'pos', direction: 'lower', srcs: [['glimpseRows', 'laborPct'], ['ctrlRows', 'laborPct'], ['laborRows', 'laborPct']],
               derive: { inputs: ['laborDollar', 'sales'], fn: (d, s) => (s > 0 && d > 0 ? d / s : null), kind: 'ratio' } },
  tpph:      { mode: 'pos', direction: 'higher', srcs: [['qsrActSummaryRows', 'tpph'], ['ctrlRows', 'tpph'], ['laborRows', 'tpph']],
                    derive: { inputs: ['gc', 'actHrs'], fn: (gc, hrs) => (hrs > 0 && gc > 0 ? gc / hrs : null), kind: 'ratio' } },
  // TPPH = transactions ÷ actual hours. TRANSACTIONS AND GUEST COUNTS ARE THE SAME THING
  // here (owner-confirmed 2026-08-08) — the DAR calls it `transactions`, Glimpse and the
  // labor report call it `gc`, and metric-source resolves both under the `gc` key. Stated
  // explicitly because the two names invite the assumption that they differ.
  // The derivation is a FALLBACK: a precomputed tpph from any source wins. It exists for
  // days covered by Glimpse (guest counts) and Controls (hours) but not the DAR, which
  // previously produced nothing despite both halves being present.
  // OT Hours — manual Controls, then manual Labor, then the auto-pulled Operations Report
  // labor-summary stream (qsr_labor_summary → loadOpsLaborSummary, daily, already aliased to
  // otHrs) — closes the labor-tools.js Operations Group Stats gap (cleanup-backlog Class 2,
  // 2026-08-06): otHrs read raw ctrlRows/laborRows only, with no auto backstop, unlike
  // laborPct/tpph/oepe/cashOS in the same panel which already route through this resolver.
  otHrs:     { mode: 'any', direction: 'lower', srcs: [['opsLaborRows', 'otHrs'], ['ctrlRows', 'otHrs'], ['laborRows', 'otHrs']] },
  // OT Dollars — otHrs's dollar sibling, same auto source and same gap: opsLaborRows
  // already aliases over_time_total_dollars -> otDollar (supabase.js loadOpsLaborSummary),
  // it just had no chain yet (#270 phase 1, closing it alongside otHrs for SAGE's labor
  // summary rather than leaving one of the two OT columns manual-only).
  otDollar:  { mode: 'any', srcs: [['opsLaborRows', 'otDollar'], ['ctrlRows', 'otDollar'], ['laborRows', 'otDollar']] },
  // Controls / loss-prevention — signed values (0 / negative are real).
  //
  // ── Numerator/denominator legs for the net-sales-weighted % metrics below (dispatch #77's
  // deferred item, resolved here) ─────────────────────────────────────────────────────────────
  // Net sales $ — the denominator loadOpsCashSheet's own inline math already divides
  // discount_amt/treds_before_amt/treds_after_amt/cash_over_or_short by (supabase.js). Exposed
  // as its own chain so a Sum/Sum rollup (metricSumRatio, below) can sum the SAME denominator the
  // precomputed %'s already use, instead of the general `sales` key — which resolves DAR product
  // sales, a DIFFERENT basis (see laborPct's own comment above on the crew_labor_dollars ÷
  // product_sales reconciliation gap this exact confusion already cost real debugging time on).
  // opsCashRows-only: it is the sole stream that carries a true net-sales-$ column here; ctrlRows
  // (Controls Excel) has no equivalent field, so a day covered only by the manual upload cannot
  // supply this leg and Sum/Sum simply skips that day (metricSumRatio's per-day both-legs rule).
  netSalesAmt: { mode: 'pos', srcs: [['opsCashRows', 'netSalesAmt']] },
  // Discount $ — manual Controls (already a real field, parseCtrlData), then the auto-pulled
  // Operations Report cash-sheet (aliased above from discount_amt).
  discAmt:   { mode: 'any', srcs: [['opsCashRows', 'discAmt'], ['ctrlRows', 'discAmt']] },
  // T-Red Before/After $ — opsCashRows only; ctrlRows carries the counts (tRedACnt/tRedBCnt) and
  // the pct but not a dollar amount for this specific upload, so no manual fallback exists yet.
  tRedAAmt:  { mode: 'any', srcs: [['opsCashRows', 'tRedAAmt']] },
  tRedBAmt:  { mode: 'any', srcs: [['opsCashRows', 'tRedBAmt']] },
  cashOSPct: { mode: 'any', direction: 'lower', srcs: [['glimpseRows', 'cashOSPct'], ['cashRows', 'cashOSPct'], ['ctrlRows', 'cashOSPct']],
               derive: { inputs: ['cashOSAmt', 'netSalesAmt'], fn: (a, s) => (s > 0 ? a / s : null), kind: 'ratio' } },
  // Cash Over/Short $ (dollar, not %) — manual Controls, then emailed Glimpse/Cash Sheet, then
  // the auto-pulled Operations Report cash-sheet. Closes EOM Supervisor's Cash +/- gap (#52).
  cashOSAmt: { mode: 'any', srcs: [['glimpseRows', 'cashOS'], ['cashRows', 'cashOS'], ['opsCashRows', 'cashOSAmt'], ['ctrlRows', 'cashOSAmt']] },
  // T-Reds Before/After % — manual Controls, then the cloud-fresh Operations Report cash-sheet
  // (treds $ ÷ net sales, same net-sales-weighted math as discPct). Closes #37 for T-Reds.
  tRedAPct:  { mode: 'any', direction: 'lower', srcs: [['opsCashRows', 'tRedAPct'], ['ctrlRows', 'tRedAPct']],
               derive: { inputs: ['tRedAAmt', 'netSalesAmt'], fn: (a, s) => (s > 0 ? a / s : null), kind: 'ratio' } },
  tRedBPct:  { mode: 'any', direction: 'lower', srcs: [['opsCashRows', 'tRedBPct'], ['ctrlRows', 'tRedBPct']],
               derive: { inputs: ['tRedBAmt', 'netSalesAmt'], fn: (a, s) => (s > 0 ? a / s : null), kind: 'ratio' } },
  // Drawer opens (count) — manual Controls, then the auto-pulled Operations Report cash-sheet.
  drawerOpens: { mode: 'any', srcs: [['opsCashRows', 'drawerOpens'], ['ctrlRows', 'drawerOpens']] },
  // Discount % — manual Controls, then the cloud-fresh Operations Report cash-sheet (discount $ ÷
  // net sales). Closes the stale-Controls discount gap without the manual upload (#37).
  discPct:   { mode: 'any', direction: 'lower', srcs: [['opsCashRows', 'discPct'], ['ctrlRows', 'discPct']],
               derive: { inputs: ['discAmt', 'netSalesAmt'], fn: (a, s) => (s > 0 ? a / s : null), kind: 'ratio' } },

  // ── Notes 57 Phase 1 (v4.845) ──────────────────────────────────────────────
  // The inventory (scripts/metric-inventory.mjs) found 29 metrics described in
  // signal-registry with NO resolution chain — resolving from one hard-coded source,
  // with no freshest-wins and no fallback. That is the population the recurring
  // "manual-only / blank tile" bugs came from (v4.808-v4.833).
  //
  // These 12 are the ones where an auto or emailed stream already emits the SAME field
  // name, so the chain is a pure addition — no loader change, no derivation. Every one
  // was previously pinned to a MANUAL upload (ctrlRows = Controls Excel, laborRows =
  // Labor Excel), meaning it went blank on any device that hadn't uploaded.
  //
  // Ordering follows the existing convention here: manual Controls/Labor first (the
  // authoritative uploaded report), then emailed, then auto-pulled.

  // Refunds — manual Controls, then the auto Operations Report cash-sheet, then the
  // emailed Cash Sheet. All three already emit these exact field names.
  cashRefAmt:     { mode: 'any', srcs: [['opsCashRows', 'cashRefAmt'], ['cashRows', 'cashRefAmt'], ['ctrlRows', 'cashRefAmt']] },
  cashRefCnt:     { mode: 'any', srcs: [['opsCashRows', 'cashRefCnt'], ['cashRows', 'cashRefCnt'], ['ctrlRows', 'cashRefCnt']] },
  cashlessRefAmt: { mode: 'any', srcs: [['opsCashRows', 'cashlessRefAmt'], ['cashRows', 'cashlessRefAmt'], ['ctrlRows', 'cashlessRefAmt']] },
  cashlessRefCnt: { mode: 'any', srcs: [['opsCashRows', 'cashlessRefCnt'], ['cashRows', 'cashlessRefCnt'], ['ctrlRows', 'cashlessRefCnt']] },

  // POS Over $ / count — manual Controls, then emailed Glimpse, then emailed Cash Sheet.
  posOverAmt:     { mode: 'any', srcs: [['glimpseRows', 'posOverAmt'], ['cashRows', 'posOverAmt'], ['ctrlRows', 'posOverAmt']] },
  posOverCnt:     { mode: 'any', srcs: [['glimpseRows', 'posOverCnt'], ['cashRows', 'posOverCnt'], ['ctrlRows', 'posOverCnt']] },

  // Promo $ / % — manual Controls, then emailed Glimpse. (promoCnt deliberately NOT
  // added: no auto/emailed stream emits it, so a chain would be single-source theatre.)
  promoAmt:       { mode: 'any', srcs: [['glimpseRows', 'promoAmt'], ['ctrlRows', 'promoAmt']] },
  promoPct:       { mode: 'any', srcs: [['glimpseRows', 'promoPct'], ['ctrlRows', 'promoPct']] },

  // T-Red Before/After COUNTS — the % versions already had chains to opsCashRows since
  // #37; the counts beside them did not, so the same tile could show a fresh % next to a
  // stale count.
  tRedACnt:       { mode: 'any', srcs: [['opsCashRows', 'tRedACnt'], ['ctrlRows', 'tRedACnt']] },
  tRedBCnt:       { mode: 'any', srcs: [['opsCashRows', 'tRedBCnt'], ['ctrlRows', 'tRedBCnt']] },

  // Average check — manual Labor, then emailed Glimpse / Cash Sheet / Sales Ledger.
  // 'pos' because a real avg check is never legitimately 0.
  // derive: sales ÷ gc — added for the Sum/Sum rollup (dispatch #77's numerator/denominator gap);
  // both inputs already resolve auto-first through their own chains, so this also gives avgCheck
  // a real fallback for any day covered by neither of the 4 precomputed sources above.
  avgCheck:       { mode: 'pos', direction: 'higher', srcs: [['glimpseRows', 'avgCheck'], ['cashRows', 'avgCheck'], ['salesLedgerRows', 'avgCheck'], ['laborRows', 'avgCheck']],
                    derive: { inputs: ['sales', 'gc'], fn: (s, g) => (g > 0 ? s / g : null), kind: 'ratio' } },

  // DT mix % of sales — manual Labor, then the emailed Sales Ledger (same field name), then
  // derived from the auto-pulled qsr_sales_mix (dispatch #165 — this chain had NO auto/API
  // fallback at all: salesLedgerRows was the sole non-manual source despite the emailed
  // stream's measured coverage gaps (e.g. #347: sales_ledger_daily held zero rows for a window
  // qsr_sales_mix fully covered). opsSalesMixRows.dtSalesAmt/netSalesAmt reconcile EXACTLY
  // against salesLedgerRows' own dtSales/allNetSales (see loadOpsSalesMix's comment) — same
  // report, two pull paths — so this derive is a like-for-like fallback, not an approximation.
  dtMixPct:       { mode: 'pos', srcs: [['salesLedgerRows', 'dtPctTotal'], ['laborRows', 'dtPctTotal']],
                    derive: { inputs: ['dtSalesAmt', 'mixNetSalesAmt'], fn: (dt, tot) => (tot > 0 ? dt / tot : null), kind: 'ratio' } },
  // Legs for dtMixPct's derive — opsSalesMixRows only (no other stream carries a drive-thru $
  // leg independent of dtMixPct's own precomputed sources above).
  dtSalesAmt:     { mode: 'pos', srcs: [['opsSalesMixRows', 'dtSalesAmt']] },
  mixNetSalesAmt: { mode: 'pos', srcs: [['opsSalesMixRows', 'netSalesAmt']] },

  // Actual punched hours — manual Controls, then the auto DAR rollup. Added 2026-08-08:
  // an audit of compute6wk found 14 of its 28 fields had no chain, and this was the ONLY
  // one with a real auto source sitting unused (qsr_daily_activity_rollup carries
  // actual_punched_hours, already loaded by loadQsrActSummary as `actHrs`).
  // ctrlRows.actHrs (supabase.js maps act_hrs) then the auto DAR rollup
  // (actual_punched_hours). laborRows is NOT in this chain — its loader emits only
  // loc/date/sales/laborPct/tpph/otHrs/otDollar, and the chain test caught that.
  actHrs:         { mode: 'pos', srcs: [['qsrActSummaryRows', 'actHrs'], ['ctrlRows', 'actHrs']] },

  // Actual vs needed hours — a SIGNED HOUR DIFFERENCE (actual − needed), not a percent.
  // mode:'any' is load-bearing: 'pos' would discard every NEGATIVE reading, i.e. exactly
  // the understaffed store-days worth seeing, and 0 (dead on target) is legitimate too.
  // Owner corrected an earlier assessment that this was manual-only — it is carried by
  // the Controls upload AND derivable from the DAR, which has both hour columns.
  actVsNeed:      { mode: 'any', srcs: [['qsrActSummaryRows', 'actVsNeed'], ['ctrlRows', 'actVsNeed']] },

  // ── FOB auto-pull $ amounts (dispatch #64) ──────────────────────────────────
  // qsr_fob (auto-pulled, see loadQsrFob in supabase.js) carries DOLLAR amounts, not the
  // %'s Visit Readiness and the manual FOB Excel upload actually score against. These are
  // the $ legs a %-deriving metric below divides by sales — analytics.js's own cloudFobRows
  // does the identical division for At A Glance/FOB Report, not invented here.
  // mode:'any': a real $0 comp/raw-waste day is legitimate (no waste at all), and
  // statVarianceAmt is signed — 'pos' would silently discard both as "not found," the
  // exact zero-discarding bug class #150/#178 already fixed for park/kvsHealthy.
  compWasteAmt:    { mode: 'any', srcs: [['qsrFobRows', 'compWasteAmt']] },
  rawWasteAmt:     { mode: 'any', srcs: [['qsrFobRows', 'rawWasteAmt']] },
  statVarianceAmt: { mode: 'any', srcs: [['qsrFobRows', 'statVarianceAmt']] },
  prodSalesAmt:    { mode: 'pos', srcs: [['qsrFobRows', 'prodSalesAmt']] },
  // The remaining 3 of the 6 components fobSnapshotByStore (eom-inventory.js) and
  // computeFOBMetrics (analytics.js's FOB_COMP) already sum into overall FOB $ — added
  // for dispatch #104's overall FOB % rankable metric, same qsrFobRows field names
  // loadQsrFob already aliases (src/lib/supabase.js), same mode:'any' as their 3 siblings
  // above (a real $0 condiment/meal day is legitimate, and none of these three are ever
  // negative in the source report, but 'any' costs nothing and matches the sibling pattern).
  condimentsAmt:   { mode: 'any', srcs: [['qsrFobRows', 'condimentsAmt']] },
  empMgrMealsAmt:  { mode: 'any', srcs: [['qsrFobRows', 'empMgrMealsAmt']] },
  unexplainedAmt:  { mode: 'any', srcs: [['qsrFobRows', 'unexplainedAmt']] },

  // FOB waste/variance %'s — the manual FOB Excel's own precomputed % stays the first
  // source (unchanged behaviour), with the qsr_fob-derived % (amount ÷ sales, above) as
  // the fallback for any day the manual upload doesn't cover. This closes the "auto not
  // reachable AT ALL" gap dispatch #64 exists to fix. It does not yet force the derived
  // value to outrank a manual one on a day BOTH exist for (srcs is always checked before
  // derive here) — a smaller, secondary imperfection than the one being closed; flagged
  // rather than silently accepted as correct.
  compWaste: { mode: 'any', direction: 'lower', srcs: [['fobRows', 'compWaste']],
               derive: { inputs: ['compWasteAmt', 'prodSalesAmt'], fn: (c, s) => (s > 0 ? c / s : null), kind: 'ratio' } },
  rawWaste:  { mode: 'any', direction: 'lower', srcs: [['fobRows', 'rawWaste']],
               derive: { inputs: ['rawWasteAmt', 'prodSalesAmt'], fn: (c, s) => (s > 0 ? c / s : null), kind: 'ratio' } },
  statVar:   { mode: 'any', direction: 'lower', srcs: [['fobRows', 'statVar']],
               derive: { inputs: ['statVarianceAmt', 'prodSalesAmt'], fn: (c, s) => (s > 0 ? c / s : null), kind: 'ratio' } },

  // ── Overall FOB % (dispatch #104) ───────────────────────────────────────────
  // "Food Over Base" — sum of the SIX controllable components ÷ sales, the same definition
  // fobSnapshotByStore's `fob`/`fobPct` (eom-inventory.js) and analytics.js's FOB_COMP-driven
  // computeFOBMetrics both already use (comp+raw+cond+emp+statv+unex)/sales — built on
  // dispatch #102's now-merged latest-snapshot fix to that qsr_fob aggregation, not the
  // ~24x-inflated raw-sum one it replaced (see computeFOBMetrics's own "Dispatch #102" comment).
  //
  // Not itself `kind:'ratio'` — it's a pure 6-way SUM (a numerator leg), not a division — so it
  // is deliberately absent from rollupCapableMetricKeys(). fobPct below is the ratio, with this
  // as its numerator input, mirroring how compWaste/rawWaste/statVar are built from their own
  // single-component Amt legs just above.
  fobTotalAmt: { mode: 'any', derive: {
    inputs: ['compWasteAmt', 'rawWasteAmt', 'condimentsAmt', 'empMgrMealsAmt', 'statVarianceAmt', 'unexplainedAmt'],
    fn: (comp, raw, cond, emp, statv, unex) => comp + raw + cond + emp + statv + unex,
  } },
  // direction:'lower' — FOB is a cost metric, lower is better, matching every sibling component
  // above (compWaste/rawWaste/statVar) and FOB_COMP's own `lower:true` for this exact metric.
  fobPct: { mode: 'any', direction: 'lower', derive: { inputs: ['fobTotalAmt', 'prodSalesAmt'],
            fn: (f, s) => (s > 0 ? f / s : null), kind: 'ratio' } },
};

// ── Deliberately manual-only ────────────────────────────────────────────────
// These metrics have NO auto or emailed stream that carries them — verified 2026-08-08
// against the live column lists of daily_glimpse_daily, cash_sheet_daily,
// sales_ledger_daily and qsr_daily_activity_rollup. They are listed explicitly so their
// absence from METRIC_SOURCES reads as a decision rather than an oversight, and so that
// anyone auditing coverage can tell "no chain yet" from "no source exists".
//
// Adding a chain for these requires a NEW upstream feed, not a code change. If one of
// these ever appears in an auto stream, move it into METRIC_SOURCES above.
//
// ⚠️ Consequence worth knowing: anything computed from these is manual-upload-only, so it
// goes stale the moment uploads stop and is blank on a device that never uploaded. The
// Controls scorecard renders '—' for them rather than 0 since v4.888.
// ── LifeLenz schedule chains (2026-08-08) ───────────────────────────────────
// The owner pushed back on these being "manual-only" and was right: LifeLenz carries the
// hours. ds.schedRows (lifelenz_schedule, 14,632 rows) has them, and coverage on COMPLETED
// days was measured before wiring — future-dated rows are mostly null because the schedule
// is not built yet, which would have looked like a dead source if sampled naively.
//
//   need_floor    400/400 rows populated
//   sch_vlh       400/400
//   sch_fix_hrs   391/400
//   need_vlh      346/400
//   sch_floor     324/400
//
// mode:'pos' throughout — an hours figure of 0 means "not scheduled/needed", which is
// genuinely absent rather than a reading worth averaging.
Object.assign(METRIC_SOURCES, {
  // ⚠️ laborRows is NOT a source for these. The chain test rejected it, and checking why
  // turned up a real gap: the labor_rows TABLE has no floor/variable/contract columns at
  // all (loc, report_date, sales, labor_pct, tpph, ot_hrs, ot_dollar, ids only). The MBI
  // parser produces these fields, but they are NEVER PERSISTED — so they existed only in
  // the browser session that did the upload and were 0 on every reload. LifeLenz is
  // therefore not a fallback here, it is the ONLY durable source.
  floorMgmtNeeded:  { mode: 'pos', srcs: [['schedRows', 'needFloor']] },
  floorHrsSched:    { mode: 'pos', srcs: [['schedRows', 'schFloor']] },
  variableNeeded:   { mode: 'pos', srcs: [['schedRows', 'needVLH']] },
  // Fixed contract hours = LifeLenz "fix guide hrs" (owner-confirmed 2026-08-08).
  // sch_fix_hrs is a DIFFERENT thing — how many fixed hours were actually scheduled.
  // ⚠️ Sparse: fix_guide_hrs was populated on only 33 of 400 completed-day rows sampled,
  // so expect gaps. That is a source-coverage fact, not a wiring fault.
  fixedContractHrs: { mode: 'pos', srcs: [['schedRows', 'fixGuideHrs']] },

  // Total scheduled hours — variable + fixed + floor, summed in the loader.
  schedHrs:         { mode: 'pos', srcs: [['schedRows', 'schedTotHrs']] },

  // Salaried manager hours — was unchained on the Ops scorecard too.
  salaryMgrHrs:     { mode: 'pos', srcs: [['schedRows', 'salMgrHrs'],       ['ctrlRows', 'salaryMgrHrs']] },
});

// ── Derived metrics ─────────────────────────────────────────────────────────
// Computed per day from other resolvable metrics rather than read from a field. Each
// input resolves auto-first through its own chain, so these inherit the full fallback
// depth of their parts.
// ⚠️ ROLLUP CAVEAT for these ratios. metricAvg returns the MEAN OF DAILY VALUES, which is
// its documented contract for rate metrics. For a ratio like SPPH the dollar-weighted
// Σsales ÷ Σhours is arguably the more correct district figure — measured on store 5985
// for 2026-08: mean-of-daily $70.18/hr vs Σ/Σ $67.04/hr, a $3.14 gap. Per-day derivation
// is still strictly better than the manual precomputed column, but a consumer that needs
// a true weighted rollup should sum the parts itself rather than call metricAvg.
//
// RESOLVED (dispatch #77, 2026-08-24) — this was the numerator/denominator gap
// notes-57-metric-registry-plan §4 describes and #580/#77 deferred with owner approval
// 2026-08-23. `derive: {..., kind:'ratio'}` marks exactly the divisions among this file's
// derived metrics (not every 2-input derive — a product or a difference is not a ratio, see
// metricSumRatio's own comment), and `metricSumRatio(ds, locs, range, key)` computes the true
// Σnumerator/Σdenominator for any of them. `rankableMetricKeys()`'s Top/Bottom Performers
// panel now uses it for all 10 of its ratio metrics (engine/top-bottom-performers.js).
// Migrating every OTHER metricAvg call site in the app to prefer it is explicitly NOT part of
// this dispatch — real work, one call site at a time, tracked separately.
export const DERIVED_METRICS = {
  // Opportunity cost $ = the hours gap vs NEEDED, priced at the labour rate
  // (owner-confirmed: "actual hours +/- needed hours x average rate of pay").
  // actVsNeed is already the signed hour difference, so this is one multiply.
  // Signed on purpose: overstaffed is positive cost, understaffed negative — mode 'any'.
  oppCostDollar: { mode: 'any', derive: { inputs: ['actVsNeed', 'avgRate'],
                   fn: (gap, rate) => (rate > 0 ? gap * rate : null) } },

  // Opportunity cost as a share of sales, so it compares across stores of different size.
  // ⚠️ THE DENOMINATOR IS AN ASSUMPTION — the owner specified the dollar formula but not
  // this one. Sales is the natural basis and matches how every other pct metric here
  // works, but confirm before relying on it.
  oppCostPct:    { mode: 'any', derive: { inputs: ['oppCostDollar', 'sales'],
                   fn: (dollars, sales) => (sales > 0 ? dollars / sales : null) } },

  // ── NEW (owner's idea, 2026-08-08) ──────────────────────────────────────────
  // Act-vs-Sched Opportunity: (actual hours ± SCHEDULED hours) × average rate.
  // The existing opportunity cost measures actual against what was NEEDED. This measures
  // actual against what was PLANNED, which is the number a manager can act on: the hope is
  // that they move the schedule — up or down — toward needed, based on what actually got
  // used. Signed, so over- and under-scheduling are distinguishable.
  actVsSched:     { mode: 'any', derive: { inputs: ['actHrs', 'schedHrs'],
                    fn: (act, sched) => (act > 0 && sched > 0 ? act - sched : null) } },
  actVsSchedOpp:  { mode: 'any', derive: { inputs: ['actVsSched', 'avgRate'],
                    fn: (gap, rate) => (rate > 0 ? gap * rate : null) } },

  // Sales per person-hour. No stream carries it; sales and actual hours both resolve, and
  // actHrs now chains to the DAR (v4.889), so this is available wherever the DAR is.
  // kind:'ratio' (dispatch #77) — this is the exact pair the ROLLUP CAVEAT comment above
  // measured the mean-of-daily-vs-Sum/Sum gap on ($70.18/hr vs $67.04/hr, store 5985, 2026-08);
  // metricSumRatio now closes it. oppCostPct just above is deliberately NOT marked — its own
  // comment flags the sales denominator as an unconfirmed assumption, and this fix should not
  // extend trust to a formula that hasn't been.
  spph:    { mode: 'pos', derive: { inputs: ['sales', 'actHrs'],
             fn: (sales, hrs) => (hrs > 0 ? sales / hrs : null), kind: 'ratio' } },

  // Average labour rate $/hr = labour dollars ÷ actual hours, and labour dollars =
  // laborPct × sales. NOT avg_check, which is $/transaction — a different metric that an
  // earlier name-match wrongly proposed as a source.
  avgRate: { mode: 'pos', derive: { inputs: ['laborPct', 'sales', 'actHrs'],
             fn: (pct, sales, hrs) => (hrs > 0 && pct > 0 ? (pct * sales) / hrs : null) } },
};
Object.assign(METRIC_SOURCES, DERIVED_METRICS);

// ── Meals & manual refunds (Notes 60, owner-confirmed 2026-08-08) ───────────
// The owner corrected these off the manual-only list: employee and manager meals are in
// the Daily Glimpse (manager meals labelled "Manager Discount Amt"), and manual refunds
// are on the Register Audit. Glimpse is EMAILED/auto so it leads the manual Controls
// upload; auditRows sits last as deeper history — it is a manual upload with no pull
// script (newest row 2026-06-30 when checked), so it adds fallback depth, not freshness.
//
// ⚠️ The Glimpse leg only starts producing values once daily_glimpse_daily has the two new
// columns AND a report has been parsed since — see supabase/schema-glimpse-meals.sql.
// Until then this chain resolves from Controls/Audit exactly as before, so wiring it early
// is safe.
Object.assign(METRIC_SOURCES, {
  empMealAmt:   { mode: 'pos', srcs: [['glimpseRows', 'empMealAmt'], ['ctrlRows', 'empMealAmt'], ['auditRows', 'empMealDisc']] },
  mgrMealAmt:   { mode: 'pos', srcs: [['glimpseRows', 'mgrMealAmt'], ['ctrlRows', 'mgrMealAmt'], ['auditRows', 'mgrMealAmt']] },
  manualRefAmt: { mode: 'pos', srcs: [['ctrlRows', 'manualRefAmt'], ['auditRows', 'manualRefAmt']] },
  // Deposit $ — ctrl_rows carries it with 41,287 non-zero rows. It was on the manual-only
  // list purely because I checked the EMAILED streams and never checked whether the
  // Controls loader emitted it. Single-source for now: no auto stream carries deposits,
  // so this is fallback depth of one until a cash-sheet pull adds it.
  depositAmt:   { mode: 'pos', srcs: [['ctrlRows', 'depositAmt']] },
  // Meal COUNTS beside the amounts. auditRows carries a manager count; there is no
  // employee-count equivalent there (emp_meal_ch is a charge, not a count), so that one
  // is Glimpse-only until another source appears.
  empMealCnt:   { mode: 'pos', srcs: [['glimpseRows', 'empMealCnt']] },
  mgrMealCnt:   { mode: 'pos', srcs: [['glimpseRows', 'mgrMealCnt'], ['auditRows', 'mgrMealCnt']] },
});

export const MANUAL_ONLY_METRICS = {
  // Empty as of 2026-08-08. Every metric compute6wk reads now resolves through a chain
  // or a derivation. Kept as the documented home for anything genuinely source-less.
};

// ── Lazy fill for manual-fed sources (#191, 2026-08-11) ─────────────────────
// Manual-fed sources are last-resort fill (CLAUDE.md standing rule) — but until now they were
// loaded EAGERLY at every startup regardless of whether the cloud streams already covered the
// day, which measured at ~21s of a 63s startup (owner's waterfall capture, #191). This lets the
// resolver kick off an on-demand load the first time a metric chain that includes a lazy-fill
// source is actually resolved this session, instead of loading it unconditionally on login.
//
// Deliberately narrow scope, per #191's own suggested sequencing: only auditRows for now — the
// highest-volume (21,929 of ~42,500 T3 rows) manual source, and its 4 chains (empMealAmt,
// mgrMealAmt, manualRefAmt, mgrMealCnt) all place it last, behind glimpseRows/ctrlRows, so on any
// day the cloud already covers it never reaches auditRows at all. laborRows/opsRows/ctrlRows/
// fobRows stay on their existing eager-load path until this is proven out and extended.
//
// This does NOT gap-scope the request (load only the missing loc/date range) — it loads the
// whole stream, once, same shape/cost as the eager load it replaces, just triggered on demand
// instead of unconditionally. Gap-scoping is real future work (a demand queue keyed on
// (stream,loc,range), draining on a debounce) but is not required to capture this win: on a
// session where nothing ever resolves one of these 4 chains, auditRows now never loads at all;
// when something does, it loads exactly once, deduped, same as before.
//
// "Pending must not look like zero" (v4.870 rule): metricDaily/metricSeries's contract is
// unchanged — they return null while a lazy-fill source hasn't resolved yet, exactly like they
// already do during the (now removed) eager-load's own brief loading window. This does not
// introduce a new failure mode, only extends how long that pre-existing window can be. Consumers
// that need to distinguish "still loading" from "no data" (a "load on open" panel, e.g.) should
// call isLazyFillPending(src) and show their own loading state — see store-analytics.js's
// Register Audit tab for the reference implementation.
// #209: wasteRows added — same "load on demand, not eagerly" shape as auditRows, but reached
// via explicit ensureLazyFill('wasteRows') calls (see engine/waste-discipline.js's consumers),
// not through a metricDaily/metricSeries chain — the data-discipline score is a day-presence
// PATTERN analysis over raw rows (mirrors engine/count-cycle.js's shape), not a per-day scalar
// value with a fallback chain, so it doesn't fit METRIC_SOURCES' resolver model.
// Dispatch17 (#292): pmixRows added — same shape as wasteRows again. Product Mix
// (loc,date,item,price) is raw item-level price/mix rows for price-change detection and
// mix-shift analysis, not a per-day scalar metric, so it's a consumer-triggered
// ensureLazyFill('pmixRows') call, not a METRIC_SOURCES chain entry.
export const LAZY_FILL_SOURCES = Object.freeze(['auditRows', 'wasteRows', 'pmixRows']);

let _lazyFillHook = null;                 // { setDs, loaders: { [src]: () => Promise<rows> } }
const _lazyState = {};                    // src -> 'pending' | 'loaded' | 'error'

// App.js calls this once at startup with the REAL setDs (not the tiered loader's queueing
// shadow — a lazy fill can resolve long after the tiered loader's own queue has been flushed
// and discarded) and the real loader functions it already imports. A no-op before that wiring
// runs (e.g. in tests), which just means lazy sources stay unloaded — the existing behavior for
// any manual source today, before its eager stage completes.
export function configureLazyFill(hook) { _lazyFillHook = hook; }

function _triggerLazyFill(src) {
  if (!_lazyFillHook || !LAZY_FILL_SOURCES.includes(src)) return;
  if (_lazyState[src] === 'pending' || _lazyState[src] === 'loaded') return;
  const loader = _lazyFillHook.loaders[src];
  if (!loader) return;
  _lazyState[src] = 'pending';
  loader().then(rows => {
    _lazyState[src] = 'loaded';
    _lazyFillHook.setDs(prev => (prev ? { ...prev, [src]: rows || [] } : prev));
  }).catch(e => {
    _lazyState[src] = 'error';   // no auto-retry — matches the eager loaders' own error handling
    console.warn(`[Meridian] lazy-fill ${src} failed:`, e);
  });
}

// For a "load on open" consumer that reads a lazy-fill source directly (bypassing the resolver)
// to distinguish "still loading" from "genuinely no data" instead of reading an empty array as
// the latter. Also triggers the fill as a side effect, so calling this IS the "demand" signal.
export function ensureLazyFill(src) { _triggerLazyFill(src); return isLazyFillPending(src); }
export function isLazyFillPending(src) { return _lazyState[src] === 'pending'; }
// So a "load on open" consumer can show a visible failed-badge instead of reading a failed
// fetch the same as "loaded, zero rows" — the exact false-all-clear class the FOB Report fix
// (v4.976) addressed for a different stream; #209's waste-discipline UI is the first
// LAZY_FILL_SOURCES consumer that needs this distinction (auditRows' RegisterAuditTab tab
// only ever reports counts, where 0 vs error both read as "nothing to show").
export function isLazyFillError(src) { return _lazyState[src] === 'error'; }

// ── Wide (opt-in) tier — dispatch #170 ─────────────────────────────────────────
// `ensureLazyFill('pmixRows')` alone used to be the ONLY way `ds.pmixRows` ever got
// populated, via a single loader with a fixed 400-day window. Measured live 2026-08-27:
// `qsr_product_mix`'s real data starts 2026-01-01, so 400 days back is not "the last 400
// days" — it's the whole table, and the whole table is 2.5M+ rows and growing (~11K
// rows/day). That single blob is what "Cloud tab never populates, waited several minutes"
// (owner report) actually was — reproduced live: a plain fetch of that window scales at
// ~18K rows/sec measured throughput, so 2.5M rows is ~140s, i.e. "several minutes," not a
// hang, but indistinguishable from one to someone watching a blank panel.
//
// `App.js`'s `configureLazyFill({ loaders: {pmixRows: ...} })` now binds a genuinely
// BOUNDED loader (40 days back — ~430K rows, ~24s measured, comfortably covers
// ProductMixPanel's own 7D/30D quick views). Consumers that need real historical breadth
// — dispatch #169's Signal Lab item picker + Scanner "Item Mix" correlation sweep, and
// ProductMixPanel's own 90D/180D/All range options — opt into the WIDE fetch explicitly
// via `ensureLazyFillWide(src)`, which is registered separately (`wideLoaders`) and, once
// resolved, REPLACES `ds[src]` with the wider array (same field, so every existing reader
// of `ds.pmixRows` — signal-registry.js, events.js, store-dash.js's price-change badge —
// needs no changes; they just eventually see a bigger array). Deliberately a second,
// source-scoped tier rather than a general `ensureLazyFill(src, {range})` API: only
// `pmixRows` has this two-speed need today, and `LAZY_FILL_SOURCES`'s existing
// auditRows/wasteRows callers are unaffected (no `wideLoaders` entry for them → no-op).
const _lazyWideState = {};                // src -> 'pending' | 'loaded' | 'error'
function _triggerLazyFillWide(src) {
  if (!_lazyFillHook || !_lazyFillHook.wideLoaders || !_lazyFillHook.wideLoaders[src]) return;
  if (_lazyWideState[src] === 'pending' || _lazyWideState[src] === 'loaded') return;
  const loader = _lazyFillHook.wideLoaders[src];
  _lazyWideState[src] = 'pending';
  loader().then(rows => {
    _lazyWideState[src] = 'loaded';
    _lazyState[src] = 'loaded';        // keep the plain pending/error read coherent too
    _lazyFillHook.setDs(prev => (prev ? { ...prev, [src]: rows || [] } : prev));
  }).catch(e => {
    _lazyWideState[src] = 'error';
    console.warn(`[Meridian] lazy-fill-wide ${src} failed:`, e);
  });
}
export function ensureLazyFillWide(src) { _triggerLazyFillWide(src); return isLazyFillWidePending(src); }
export function isLazyFillWidePending(src) { return _lazyWideState[src] === 'pending'; }
export function isLazyFillWideLoaded(src) { return _lazyWideState[src] === 'loaded'; }
export function isLazyFillWideError(src) { return _lazyWideState[src] === 'error'; }

// Test-only: this module's lazy-fill state is intentionally module-level (one loader per
// source per session, not per-caller), which means it persists across test cases unless reset.
// Not called by application code.
export function _resetLazyFillForTests() {
  _lazyFillHook = null;
  for (const k of Object.keys(_lazyState)) delete _lazyState[k];
  for (const k of Object.keys(_lazyWideState)) delete _lazyWideState[k];
}

const _ok = (v, mode) => v != null && !isNaN(v) && (mode === 'any' ? true : v > 0);

// Newest per-day date present across the CORE daily operating streams — powers a
// "daily data is N days stale" guard so a truncated/stale read can never silently ship
// (Notes: the Jul-2026 data-loss incident). Returns a Date, or null when nothing is loaded.
const _DAILY_STREAMS = ['qsrActSummaryRows', 'salesLedgerRows', 'glimpseRows', 'laborRows', 'opsRows', 'ctrlRows', 'cashRows'];
export function dailyDataFreshness(ds) {
  if (!ds) return null;
  let max = null;
  for (const s of _DAILY_STREAMS) {
    for (const r of (ds[s] || [])) {
      if (!r || !r.date) continue;
      const t = r.date instanceof Date ? r.date.getTime() : Date.parse(r.date);
      if (!isNaN(t) && (max == null || t > max)) max = t;
    }
  }
  return max != null ? new Date(max) : null;
}

// Sources whose OWN r.loc is stored zero-padded rather than the bare-numeric-string
// convention every other source (and every METRIC_SOURCES caller, e.g. DEFAULT_TARGETS'
// own keys) uses. loadQsrFob's own comment in supabase.js explains why the loader itself
// is not changed: four existing consumers already rely on reading it padded. Normalized
// ONLY at this index-building boundary — callers keep passing the same unpadded loc they
// always have, and every other source's indexing is untouched. Without this, a chain
// sourced from qsrFobRows would silently never match and look identical to a genuinely
// manual-only metric — the exact bug class dispatch #64 exists to close, reintroduced by
// the fix itself if this is skipped.
const _PADDED_LOC_SOURCES = new Set(['qsrFobRows']);
const _srcLocKey = (src, rawLoc) => _PADDED_LOC_SOURCES.has(src)
  ? (String(rawLoc).replace(/^0+/, '') || '0')
  : String(rawLoc);

// Lazy per-source index (loc_date → rows[]), cached non-enumerably on ds so it rebuilds
// automatically when ds is replaced (setDs makes a new object).
// Per-source, per-loc sorted date keys, cached on ds alongside _srcIdx. Built once from
// the same single pass, so adding it costs nothing beyond the memory for the keys.
function _srcDates(ds, src) {
  const cacheKey = '_msDates_' + src;
  if (!ds[cacheKey]) {
    const byLoc = {};
    for (const r of (ds?.[src] || [])) {
      if (!r || r.loc == null || !r.date) continue;
      const l = _srcLocKey(src, r.loc);
      (byLoc[l] || (byLoc[l] = new Set())).add(_dk(r.date));
    }
    const out = {};
    for (const l in byLoc) out[l] = [...byLoc[l]].sort();
    try { Object.defineProperty(ds, cacheKey, { value: out, enumerable: false, configurable: true }); }
    catch { ds[cacheKey] = out; }
  }
  return ds[cacheKey];
}

function _srcIdx(ds, src) {
  const cacheKey = '_msIdx_' + src;
  if (!ds[cacheKey]) {
    const idx = {};
    for (const r of (ds?.[src] || [])) {
      if (!r || r.loc == null || !r.date) continue;
      const k = _srcLocKey(src, r.loc) + '_' + _dk(r.date);
      (idx[k] || (idx[k] = [])).push(r);
    }
    try { Object.defineProperty(ds, cacheKey, { value: idx, enumerable: false, configurable: true }); }
    catch { ds[cacheKey] = idx; }
  }
  return ds[cacheKey];
}

// Single-day value for a metric at (loc, date), auto-first. Returns null if no source has it.
export function metricDaily(ds, loc, date, key) {
  const spec = METRIC_SOURCES[key];
  if (!ds || !spec) return null;
  if (spec.srcs) for (const [src] of spec.srcs) if (LAZY_FILL_SOURCES.includes(src)) _triggerLazyFill(src);
  const dkey = String(loc) + '_' + _dk(date);
  for (const [src, field] of spec.srcs) {
    const rows = _srcIdx(ds, src)[dkey];
    if (rows) for (const r of rows) { const v = r[field]; if (_ok(v, spec.mode)) return v; }
  }
  return null;
}

// Per-(loc) daily value map over a range, auto-first per day. { dateKey: value }.
// `range.s`/`range.e` may be Date objects OR "YYYY-MM-DD" strings, and row dates may be
// Date objects (cloud streams via _mkDate) OR strings — normalize both sides to
// "YYYY-MM-DD" before comparing so a Date-vs-string mix doesn't silently drop rows
// (a Date >= a bare date-string coerces to NaN and is always false).
// Same per-day resolution as metricSeries, but each entry is { value, source, field } instead
// of a bare number — dispatch #64 needs to know WHICH source answered (to keep a provenance
// column honest), not just the resolved value. metricSeries (below) is a thin wrapper that
// strips this down to { dateKey: value }, so every existing caller keeps its exact contract.
export function metricSeriesWithSource(ds, loc, range, key, _depth = 0) {
  const spec = METRIC_SOURCES[key];
  const out = {};
  if (!ds || !spec) return out;

  // ── DERIVED metrics ────────────────────────────────────────────────────────
  // Some metrics are not carried by ANY stream but are computable from ones that are.
  // Before this, coverage was judged as "does a source emit this field", which understated
  // what is actually available: sales-per-person-hour is not in any feed, but sales and
  // actual hours both are, so it is resolvable — and computing it per DAY from
  // auto-first inputs is strictly better than reading a manual-only precomputed column.
  //
  // Derivation happens PER DATE, not on aggregates. Deriving from averages would average
  // a ratio (Σsales/n ÷ Σhours/n), which is the "never average an average" error this
  // codebase has been bitten by before. Each day resolves its own inputs auto-first, and a
  // day is emitted only when EVERY input is present for it — a partial input set produces
  // no value rather than a wrong one.
  const _derive = (into) => {
    if (!spec.derive || _depth > 3) return into;      // depth guard: cyclic definitions
    const parts = spec.derive.inputs.map(k => metricSeriesWithSource(ds, loc, range, k, _depth + 1));
    const days = new Set(parts.flatMap(p => Object.keys(p)));
    for (const dk of days) {
      if (into[dk] != null) continue;                 // a real source already answered
      const vals = parts.map(p => p[dk]?.value);
      if (vals.some(v => v == null)) continue;        // incomplete inputs → no value
      const v = spec.derive.fn(...vals);
      if (_ok(v, spec.mode)) into[dk] = { value: v, source: 'derived', field: key };
    }
    return into;
  };
  if (spec.derive && !spec.srcs) return _derive(out);  // derivation-only metric
  for (const [src] of spec.srcs) if (LAZY_FILL_SOURCES.includes(src)) _triggerLazyFill(src);
  const L = String(loc);
  const rs = _dk(range.s), re = _dk(range.e);
  // Collect every date in range that any source has for this loc, then resolve auto-first.
  //
  // This used to scan the FULL source array on every call. That is fine for a panel
  // resolving one metric, but compute6wk resolves ~18 metrics, 3 times per store, across
  // 27 stores — roughly 4,000 full-array passes over multi-year tables. The comment at the
  // top of compute6wk documents a previous fix for exactly that pathology, so routing it
  // through here without this would have re-created the problem it warns about.
  // _srcDates caches a per-source, per-loc sorted date list on ds, so collection is O(days
  // for this store) instead of O(all rows).
  const dates = new Set();
  for (const [src] of spec.srcs) {
    for (const dk of (_srcDates(ds, src)[L] || [])) {
      if (dk >= rs && dk <= re) dates.add(dk);
    }
  }
  for (const dk of dates) {
    for (const [src, field] of spec.srcs) {
      const rows = _srcIdx(ds, src)[L + '_' + dk];
      if (rows) { let hit = false; for (const r of rows) { const v = r[field]; if (_ok(v, spec.mode)) { out[dk] = { value: v, source: src, field }; hit = true; break; } } if (hit) break; }
    }
  }
  // LAST RESORT: compute the metric for days no source could answer. A precomputed value
  // from a real source always wins — derivation only fills gaps. This matters for TPPH: a
  // day with Glimpse (guest counts) and Controls (hours) but no DAR previously produced
  // nothing, even though both halves of transactions ÷ hours were sitting right there.
  return _derive(out);
}

export function metricSeries(ds, loc, range, key, _depth = 0) {
  const withSrc = metricSeriesWithSource(ds, loc, range, key, _depth);
  const out = {};
  for (const dk in withSrc) out[dk] = withSrc[dk].value;
  return out;
}

// Mean of the daily values across one or more locs over a range (auto-first per day).
// The standard aggregate for a RATE metric (labor %, OEPE, TPPH…) — never averages a
// pre-rolled average, it means the raw daily values from the freshest source per day.
export function metricAvg(ds, locs, range, key) {
  const list = Array.isArray(locs) ? locs : [locs];
  let sum = 0, n = 0;
  for (const loc of list) {
    const s = metricSeries(ds, loc, range, key);
    for (const k in s) { sum += s[k]; n++; }
  }
  return n ? sum / n : null;
}

// Dispatch #77's deferred numerator/denominator gap, resolved. A ratio metric's `derive` is
// marked `kind: 'ratio'` exactly when its two `inputs` genuinely ARE [numerator, denominator]
// (a plain division) — NOT every 2-input derive (oppCostDollar's gap*rate is a PRODUCT,
// actVsSched's act-sched is a DIFFERENCE; neither is summable as parts). This is a deliberate,
// curated marker rather than "any derive with 2 inputs," so this function can never
// misinterpret a non-ratio formula as one.
//
// Returns the TRUE period/scope rollup — Σnumerator ÷ Σdenominator — as opposed to metricAvg's
// mean-of-daily-ratios. This is the fix for the measured gap that motivated this work: SPPH on
// store 5985 for 2026-08 was $70.18/hr mean-of-daily vs $67.04/hr Sum/Sum, a 4.5% gap (this
// file's own ROLLUP CAVEAT comment above DERIVED_METRICS). Every ratio metric with a declared
// numerator/denominator gets the same fix, not just the one instance that happened to get
// measured.
//
// Each DAY counts only when BOTH legs resolve for it (mirrors metricSeriesWithSource's own
// derive() contract: a partial input set contributes nothing rather than a wrong number) — so a
// day covered only by a manual upload that lacks one leg (e.g. Controls has no net-sales-$
// column) is silently excluded from the sum rather than guessed.
//
// Returns null when the metric has no declared ratio parts, or when nothing resolves both legs
// for any day in range — callers must NOT fall back to metricAvg and present it as the same
// number; null is a real "cannot compute Sum/Sum here" signal, not "zero."
export function metricSumRatio(ds, locs, range, key) {
  const spec = METRIC_SOURCES[key];
  if (spec?.derive?.kind !== 'ratio') return null;
  const [numKey, denKey] = spec.derive.inputs;
  const list = Array.isArray(locs) ? locs : [locs];
  let numSum = 0, denSum = 0, n = 0;
  for (const loc of list) {
    const numSeries = metricSeries(ds, loc, range, numKey);
    const denSeries = metricSeries(ds, loc, range, denKey);
    for (const dk in numSeries) {
      if (denSeries[dk] == null) continue;
      numSum += numSeries[dk];
      denSum += denSeries[dk];
      n++;
    }
  }
  return n && denSum > 0 ? { value: numSum / denSum, n } : null;
}

// Every METRIC_SOURCES key whose derive declares a real [numerator, denominator] pair — the set
// metricSumRatio can compute a true Sum/Sum for. Deliberately a curated subset of the metrics
// with a `derive` at all (see metricSumRatio's own comment on why not every derive qualifies).
export function rollupCapableMetricKeys() {
  return Object.keys(METRIC_SOURCES).filter(k => METRIC_SOURCES[k].derive?.kind === 'ratio');
}

// ── metricRate — the standard "period rate" accessor for a ratio metric (dispatch #153,
// relocated + reused by dispatch #155) ──────────────────────────────────────────────────────
// metricAvg is a flat MEAN OF DAILY VALUES, which blends an in-progress, still-incomplete
// business day into a "current period" average at FULL WEIGHT — qsr_daily_activity_rollup
// always carries the full 24-hour_slot shape even mid-day (future hours zero-filled, not
// absent), so an incomplete day is structurally indistinguishable from a complete one and can
// read as an implausibly fast/high figure purely from being incomplete (see CLAUDE.md's DAR/
// hour_slot completeness note). metricSumRatio fixes this for a real ratio metric by summing
// the raw numerator/denominator legs across the range, so a low-volume in-progress day
// naturally contributes proportionally less instead of being averaged in as if representative.
//
// metricRate tries metricSumRatio FIRST and falls back to metricAvg ONLY when metricSumRatio
// has nothing to compute (no day in range resolves both raw legs — e.g. a store with no DAR
// rows this period, only a manual Ops Report upload of the precomputed field). Never silently
// drop a number that used to display.
//
// Originally dispatch #153's private `rateMetric` helper in one-pager-data.js (the Leadership
// One-Pager's 3 call sites). Relocated here and renamed `metricRate` under dispatch #155 so it
// can be shared across every call site in the app that reads oepe/r2p/tpph (or any other
// ratio-marked metric) over a range that can include the current, still-open period — NOT
// renamed `rateMetric` to avoid colliding with the unrelated, already-exported
// `rateMetric(actual, target, metricCfg)` 1-4 scoring function in engine/review-engine.js.
export function metricRate(ds, locs, range, key) {
  const sumRatio = metricSumRatio(ds, locs, range, key);
  return sumRatio ? sumRatio.value : metricAvg(ds, locs, range, key);
}

// Dispatch #77 -- the one place a consumer (e.g. Top/Bottom Performers) asks "which way is
// good" for a metric. Returns 'lower' | 'higher' | null -- null means genuinely undecided
// (see METRIC_SOURCES header comment for park/actVsNeed, the two deliberate omissions), not
// "not yet implemented." A ranking must treat null as NOT rankable, never default to a guess.
export function metricDirection(key) {
  return METRIC_SOURCES[key]?.direction ?? null;
}

// Every METRIC_SOURCES key with a resolved direction -- the set a ranking is allowed to build
// on. Deliberately excludes anything metricDirection() would return null for.
export function rankableMetricKeys() {
  return Object.keys(METRIC_SOURCES).filter(k => METRIC_SOURCES[k].direction != null);
}
