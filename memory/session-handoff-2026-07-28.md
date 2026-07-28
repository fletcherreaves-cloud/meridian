---
name: session-handoff-2026-07-28
description: Live-state handoff from the 2026-07-28 session (Perf Reviews KPI directory + One-Pager Notes 31). Read at the start of the next session to resume exactly where we left off — what's shipped, what's open, and the one live verification blocked on network access.
metadata:
  node_type: memory
  type: project
---

# Session handoff — 2026-07-28

## Branch / PR
- Working branch: `claude/status-data-refresh-strategy-u88lz9`
- **Open draft PR #80** — carries TWO slices (build clean, 403 tests green, Vercel deployed):
  1. **Perf Reviews KPI directory** (v4.535, Notes 30 #3) — `src/engine/kpi-registry.js` +
     Customize panel wiring (add/rename/delete Results categories, KPI-select dropdown,
     ⓘ plain-English threshold explainer). 12 tests.
  2. **One-Pager Notes 31** (v4.536) — see `notes-31-queue.md` (fully documented). Root-cause
     fix: `metricSeries` accepts string OR Date ranges (cloud rows were being dropped) →
     Labor/OEPE/GC/TPPH populate; FOB prodSales>0 guard; range pills Week/MTD/YTD/Custom +
     YTD-alongside; timeframe labels; L/F/G spelled out; cascade dropdown O›D/D›S/S›G.

## ONE OPEN VERIFICATION (blocked on network)
- **FL FOB reads ~14.88% (vs 3.99% target).** Guard + month/YTD range should normalize it, but
  need to confirm against live `qsr_fob` rows. Egress to `oiajpwdcihgvhofntjcn.supabase.co` is
  still **403 (policy denial)** — the allowlist must be set on the ENVIRONMENT's Network access
  at claude.ai/code (NOT the desktop app's Browser "Allowed sites"), and takes effect on a NEW
  session. Once reachable, run (anon key in `.env.local`):
  `GET {VITE_SUPABASE_URL}/rest/v1/qsr_fob?select=loc,date,prod_sales_amt,comp_waste_amt,raw_waste_amt,condiments_amt,emp_mgr_meals_amt,stat_variance_amt,unexplained_amt&order=date.desc`
  Filter FL locs (INV_ORG_COORDS[loc].state==='FL'), dollar-weight Σcomponents ÷ Σprod_sales over
  a full month. If FL still ~15% → real data issue (FL prod_sales understated or different mapping).

## OPEN QUEUE (owner-approved, not yet built)
- **#65** EOM: qty variance alongside $ everywhere + Item-Journey reconciles to Variance Stat report.
- **#67** Explore writing Targets BACK to QSRSoft (two-way sync; research first; `datapass_access` lead).
- **Perf Reviews threshold-VALUE corrections** (banked in `perf-review-excel-audit.md` ROUND 2):
  OEPE %-of-target+120s floor; Shift-Certified gentle count step; FOB/Labor Bonus-Eligibility
  module; Total Profit Excel bands. Separate deliberate changes (owner is reviewing perf reviews).
- Notes 30 #1 (target write-back = #67), #2 (EOM = #65) — same items.

## Standing reminders
- Never write live creds (x-auth-token / Cognito JWT / passwords) to repo/memory/commits — redact.
- Auto/emailed-first, freshest-wins; source via metric-source.js / vs-ly.js (never filter raw rows).
- After merge, restart branch from main (same name), force-with-lease is fine for merged-only history.
