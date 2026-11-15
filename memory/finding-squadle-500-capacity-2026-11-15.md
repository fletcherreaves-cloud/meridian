---
name: finding-squadle-500-capacity-2026-11-15
description: "✅ RESOLVED 2026-11-15 -- intermittent 500s on several large/historical tables (squadle_checklist_records, audit_rows, graded_visits, lifelenz_payroll_readiness, lifelenz_compliance_audit) at login, never all at once, never none, were a Supabase compute-tier capacity issue, not a code bug. Project was on the smallest (Micro) tier: max_connections=60, shared_buffers=256MB. Owner upgraded to Small (max_connections=90, shared_buffers=512MB); confirmed the Squadle panel (previously failing) loads clean afterward. Do not re-raise as a code-level bug."
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# Intermittent multi-table 500s: Supabase compute tier, not a code bug (2026-11-15)

## Symptom

Owner reported the Squadle Food Safety Checklists panel repeatedly showing "No Squadle checklist
data loaded" while on mobile, with browser console confirming genuine `500 Internal Server Error`
responses (not RLS/empty-result) from `squadle_checklist_records`, and — in later recurrences —
also from `audit_rows`, `graded_visits`, `lifelenz_payroll_readiness`, `lifelenz_compliance_audit`
simultaneously. Never all tables, never zero — always a rotating handful of the same large,
history-heavy tables.

## Ruled out, measured not guessed

- **Not RLS/data**: re-tested every failing query live via the Management API, simulating the
  owner's exact account (`role authenticated`, his real profile id) — every query returned
  correct, complete data with no error.
- **Not a stale session token for Squadle specifically**: a full sign-out/sign-in cleared the
  Register Audit instance of this same symptom-shape (separate root cause, see
  `memory/finding-register-audit-loc-padding-2026-11-15.md`) but did NOT clear Squadle's — ruling
  out "just re-login" as the general explanation.
- **Not cellular signal, specifically**: recurred again on the owner's home WiFi.
- **Not PostgREST being down globally**: unauthenticated/garbage-key requests got clean 401s the
  whole time; only real authenticated queries intermittently 500'd.
- **Not a blocking/stuck query at time of inspection**: `pg_stat_activity` checked live during one
  recurrence showed no long-running or blocked queries.

## Root cause

Checked the project's actual Postgres settings directly: `max_connections = 60`,
`shared_buffers` = 256 MB (32768 × 8kB pages) — Supabase's smallest ("Micro") compute tier. The
app's own login sequence fires a burst of large parallel paginated queries across many tables at
once (by design, for fast startup) — on a 60-connection/256MB instance, that burst can
intermittently starve a handful of the larger/slower queries in the batch, which is exactly the
"several big tables fail together, rotating membership" signature observed. This is a resource
ceiling, not a logic bug in any one query or table.

## Fix

Owner upgraded the Supabase project's compute size from **Micro → Small** via Dashboard → Settings
→ Infrastructure (confirmed via Supabase's own docs: ~$10/mo → ~$15/mo, under 2 minutes of
downtime, no data risk — compute-only change). Confirmed live immediately after the restart:
`max_connections` 60 → 90, `shared_buffers` 256MB → 512MB. Owner then reloaded the Squadle panel
and confirmed it now loads clean.

## Status: ✅ RESOLVED

Do not re-diagnose this as a code bug if it's reported again in the future — re-measure
`pg_stat_activity`/connection counts first, and check whether the project has been downgraded or
is under unusually heavy concurrent load (e.g., a second user logged in, or a scheduled pull
running at the same moment) before assuming a regression. If it recurs even on Small, the next
step is Medium, or reducing the app's own login-time query concurrency (`_MAX_INFLIGHT` in
`src/lib/supabase.js`) — not yet needed, not attempted this pass.
