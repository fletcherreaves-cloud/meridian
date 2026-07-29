---
name: notes-33-queue
description: Notes 33 — owner's queue spanning Performance Reviews (personnel moves, location attribution, Shift Manager Summary) and Leadership One-Pager (print, R2P/TPPH bugs, current-day/week, operator pulse, grouping list) + Promotions/Training area + Top-of-Discussion pre-populate. Plus AI recommendations on the 3 judgment calls.
metadata:
  node_type: memory
  type: project
---

# Notes 33 (2026-07-28) — Perf Reviews + Leadership One-Pager

Captured verbatim-in-substance from owner dump. Status: QUEUED (none built yet).
Context: lands after the QSRSoft People/Digital/Delivery data pulls all went live (v4.545–548).

## A. Performance Reviews — what's left to solve
1. **Personnel moves (loc→loc) + supervisor patch assignment changes (add/remove).**
   - Auto-pull QSRSoft report(s) tracking a manager's HOME-assigned store WITH the dates of any status
     change. (Employee Roster already gives homeLocation + storeStartDate + jobTitleCodeStartDate; may
     need a dedicated transfer/status-history report — capture TBD.)
   - Surface as a **viewable + exportable table**.
   - **Must stay EDITABLE** — override bad source data (e.g. someone not internally transferred on paper
     but actually working another location). Owner needs manual override.
2. **Location-attribution rule** — today a person's month is judged at whichever location they worked the
   MAJORITY of the month. Owner asks: tighten it now that we have the data? → see AI rec A below.
3. **Shift Manager Summary** — isolate ONE manager's performance from everyone else's. GMs own the whole
   store (all data relevant); DMs/shift managers need their ACTUAL shifts separated out. Explore merging
   the Shift Manager Summary report into review logic. → see AI rec C below.

## B. Leadership One-Pager
4. **Print** only shows the top section, abbreviated. Make print meaningful by selected
   location/patch/group/etc.
5. **R2P not populating.**
6. **TPPH incorrect** — e.g. showing 0.1 vs a 5.0 target (looks like a scale/unit bug).
7. **Current-day selected → metrics not pulling in.**
8. **Week selected → most data 0 or blank.**
9. **Operator→DO pulse**: add a way to pulse each location on top metrics — Sales & +/-, FOB, Labor, any
   current CFV (graded visit) or Voice visit + results. Make it meaningful for an owner/operator. → AI rec B.
10. **Main page grouping**: keep the on-screen view as a roll-up to whatever grouping is selected up top.
    BUT when the grouping changes, also summarize + list that group's locations individually on screen for
    easy reference; then pass those results to reports (kept overview/summarized).

## C. Cross-cutting
11. Add an area for **Promotions (product), Training, Other Initiatives / Other**.
12. **Top of Discussion Report**: when generating for specific positions + locations, **pre-populate with
    all relevant names** for the report scope.

---

## AI recommendations on the 3 judgment calls

**A. Location attribution (tighten?)** — Recommend: keep majority-of-month as the headline single score
(most months have no move, and one clean score is reviewable), BUT now that transfer dates exist, also
compute a **day-weighted split** across stores and STORE it, so the attribution is auditable and
transparent (ties to the provenance directive). **Flag** any review where no single store holds ≥~70% of
the person's days for manual attention/override. This gives accuracy without fragmenting every review.
Full proration of the score across stores is possible but heavier — start with split-visibility + flag,
escalate only if owner wants per-store partial scores.

**B. Operator→DO pulse (make meaningful)** — Design as a scannable ~5-tile "is this store OK / any fires"
card per location: (1) Sales vs plan and vs LY (+/-), (2) FOB % vs target, (3) Labor % vs target, (4)
newest CFV/graded-visit result (score + date) and newest Voice/CSAT, (5) DT speed (OEPE) as the ops
heartbeat. Each tile = value + variance + status color (on/watch/off) + "as of" date. Add ONE
"biggest gap vs target" callout = the single thing the DO should ask the GM about today. Keep it to what
a DO acts on this week; hover shows source + as-of (provenance).

**C. Shift Manager Summary (isolate individual)** — Recommend: get a CAPTURE of QSRSoft's Shift Manager
Summary report first; if it already attributes metrics to the manager-on-duty, PULL it (same pattern as
the other reports) into a table and wire DM/shift-role reviews to the manager-attributed data, while GMs
keep store-total. That's the most verifiable path (use the source report vs reconstruct MOD×hourly
ourselves). If the report doesn't attribute, fall back to joining LifeLenz MOD-by-shift × qsr_daily_activity
hourly metrics — heavier, note the caveats (overlapping shifts, salaried vs hourly).

See [[session-handoff-2026-07-28]], [[feedback-metric-provenance]].

---

## ⏸ DEFERRED — Labor% current-day fallback (owner to explain, 2026-07-29+)
DAR gives **crew punch labor %** = actual_punched_dollars ÷ product_sales (reconciles exactly to the
report's "Punch Labor" column), but that is crew-only — NOT a fully-loaded labor% (no mgmt salary /
taxes / benefits). Proposed 3 options (crew-punch labeled / leave blank / separate row). **Owner: "work
this out tomorrow, more to it than that, needs explaining."** KEY CONTEXT owner gave: **FL vs OK utilize
labor differently** — the two markets account for/use labor in different ways, so a single labor% fallback
rule won't fit both. DO NOT wire a DAR labor% fallback until the owner explains the FL/OK difference and
the intended definition. The other DAR speed fallbacks (R2P v4.549, OEPE v4.550) are already shipped and
unaffected. actual_punched_dollars is already persisted → wiring is trivial once the definition is settled.

---

## One-Pager sweep — FINDINGS (2026-07-28 autonomous pass)
- **B#6 TPPH scale — FIXED** (commit b69ccab). `loadQsrActSummary` derived TPPH from
  `(healthy_count+unhealthy_count)/punched_hours` — a KVS order-health count, not transactions →
  ~0.1 vs ~5 target. Now `transactions ÷ actual_punched_hours` (matches Shift Mgr transPerPunchedHour).
- **B#5/B#7 R2P blank on current-day** — ✅ FIXED (v4.549). Reverse-engineered from the DAR report
  itself: **R2P = (fc_untilserve − fc_untilclosedrawer) / fc_trans_cnt / 1000** (front-counter). Reconciled
  EXACTLY to the report's R2P column, all active hours (3708, 2026-07-28). Fields already in
  `qsr_daily_activity` → NO re-download. Derived in `loadQsrActSummary`, wired as auto fallback in
  metric-source `r2p` (manual Ops Report still wins first). DAR pulls ~8a/10a/2p CT → current-day
  populates. Full derivation + proof: [[reference-r2p-formula]]. (Avg Win TTL = fc_untilserve/fc_trans_cnt,
  NOT R2P — the near-mismap.)
- **B#7 current-day blank / B#8 week mostly blank** — ✅ MOSTLY FIXED (v4.549 R2P, v4.550 OEPE).
  Root: DAR (qsrActSummaryRows) was wired only for sales/gc/tpph, not oepe/r2p/laborPct. Now:
  R2P = (fc_untilserve−fc_untilclosedrawer)/fc_trans_cnt/1000 (v4.549) and
  **OEPE = (dt_untilserve−dt_untilstore)/dt_trans_cnt/1000** (v4.550) — BOTH reconciled EXACTLY to the
  DAR report columns, wired as metric-source fallbacks, cloud-fresh → current-day populates.
  **STILL OPEN — Labor%**: DAR punch-labor = actual_punched_dollars ÷ product_sales (reconciles to the
  report's "Punch Labor" column exactly, per-hour 0.3733 etc.), BUT it's CREW-PUNCHED labor, not a
  fully-loaded labor% (no mgmt salary/taxes/benefits) — could read lower than the Glimpse labor% for the
  same day and mislead vs a fully-loaded tLabor target. **DEFERRED pending owner confirm** (see AI note).
  actual_punched_dollars is already persisted → wiring is one accumulator + one metric-source line once confirmed.
- **B#4 print thin / B#10 list-locations** — ✅ DONE (v4.550). `buildPerLocationRows` → PerLocationTable
  (screen) + print table: per store Net Sales, vs LY (matched), FOB%, Labor%, OEPE, R2P, Opp $/wk,
  colored vs each store's own target, worst-sales-vs-LY first. Shown only when scope spans >1 store.
  Also fattens the print (B#4). Remaining B#4 nuance (per-group print scoping) can extend from here.
- **Cleanup spotted**: stray CloudDocs duplicate files `src/**/* 2.js` (e.g. one-pager.test 2.js,
  people-reports 2.js) — delete.
