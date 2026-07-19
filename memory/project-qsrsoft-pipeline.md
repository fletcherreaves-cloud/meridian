---
name: project-qsrsoft-pipeline
description: "QSRSoft email ingest pipeline — architecture, schedule, secrets, status"
metadata: 
  node_type: memory
  type: project
  originSessionId: ac407d52-bc14-4517-af65-49f116393c04
---

# QSRSoft Email Ingest Pipeline (v4.240–4.241)

Fully automated: QSRSoft emails Excel reports → Gmail poller → Supabase Edge Function
→ Storage bucket → pending_reports table → Meridian auto-loads on login.

## Status (as of 2026-06-28)
- ✅ Parsers built (v4.240): Sales Ledger, Daily Glimpse, Cash Sheet, Labor Exceptions
- ✅ Edge Function deployed: `ingest-report` on project `oiajpwdcihgvhofntjcn`
- ✅ INGEST_SECRET set in Supabase secrets
- ✅ Google Apps Script created, INGEST_SECRET in Script Properties, hourly trigger installed
- ✅ SQL run: `qsr-reports` bucket + `pending_reports` table created
- ✅ QSRSoft schedules configured (13 schedules: 4 report types × daily/weekly/monthly)
- ⏳ Sender address unconfirmed — first email arrives 2026-06-29 at 10:30 AM
- ⏳ New analytics panels not yet built (3PO mix, Daily Glimpse scorecard, Exceptions)

## Secrets (locations only — never values in memory)
- `INGEST_SECRET`: Supabase Dashboard → Edge Functions → ingest-report → Secrets
- Service role key: Supabase Dashboard → Project Settings → API → service_role

## Key files
- `supabase/functions/ingest-report/index.ts` — Edge Function
- `supabase/gmail-poller.gs` — Google Apps Script (paste into script.google.com)
- `supabase/schema.sql` — includes pipeline SQL block
- `PIPELINE_SETUP.md` — full setup instructions for future reference

## ABC / data quality strategy
QSRSoft ABC (Automated Business Cutover) completes ~7-8 AM. Daily reports at 10:30 AM
catch most stores. Weekly (Wednesday) and monthly (2nd) reports automatically overwrite
bad daily data — Meridian's dedup keeps last-loaded row per store+date.

## To Explore: QSRSoft browser-session download automation

FOB EOM Troubleshooter currently requires manual file download from QSRSoft one store at a time (6 files × 27 stores = 162 manual downloads). User flagged this as a game-changer opportunity.

**Hypothesis:** QSRSoft has an internal API (same pattern as LifeLenz). If we can:
1. Capture a session token from browser DevTools (like LifeLenz's X-Auth-Token)
2. Identify the API endpoints that serve the 6 inventory report types
3. Write a Node.js script that batches requests across all 27 stores

…we could auto-download all ~162 files and either:
- Drop them directly into the browser (via File System Access API or drag-and-drop injection)
- Or pipe them through the Supabase ingest pipeline (better long-term)

**First step when revisiting:** Log into QSRSoft web UI, open DevTools → Network tab, download one of the 6 report types for one store, capture the XHR/fetch request URL + headers. Look for store ID, date range, and report type as query params.

**Reference:** See [[lifelenz-session]] for the LifeLenz pattern this mirrors — token from DevTools, Node.js script, batching by store.

**Why:** Relates to [[project-meridian]] data pipeline and [[project-data-model]] dedup logic.
