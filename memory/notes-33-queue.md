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
