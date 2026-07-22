---
name: project-crew-skills-matrix
description: LifeLenz People List (Simple CSV) → Crew Skills Matrix. Parse, table, panel; eventual auto-pull from the LifeLenz people page.
metadata:
  node_type: memory
  type: project
---

# Crew Skills Matrix (LifeLenz People List)

Owner uploaded `people_list_simple_0011657__PURCELL_*.csv` (LifeLenz People List,
Simple CSV export). Goal: reformat the packed skills into a readable matrix and
persist to Supabase; eventually auto-pull per store from the people page.

Source page (Phase 2 scrape target):
`https://admin.lifelenz.com/us01/people/{businessId}/{viewId}` → Download Report →
Simple (CSV). businessId = 01979dbf-a166-759b-8702-aba9915c578e.

## CSV shape

Columns: `EMPLOYEE` (BOM on header), `SCHEDULE JOBS`, `HOME STORE`,
`SCHOOL CALENDAR`, `JOB RATE`. Job/role cells are wrapped in literal quotes.
- SCHEDULE JOBS = packed string `"BEVERAGE SPECIALIST (3), DRIVE THRU (5), ..."`
  — each job rated **1-5**. ~32 distinct jobs. Empty ("") = untrained.
- HOME STORE = `"0011657 - PURCELL"` (can contain a comma: `"0033704 - TECUMSEH, OK"`).
- JOB RATE (col E) = `"Primary (00650 - CREW PERSON)"` → the **job title/role**.
  Owner wants this shown as a "Job Title" column.
- Files are per-store but can include a few cross-store people (home elsewhere).

## Progress (Phase 1 shipped, v4.465)

- ✅ **Parser** `parsePeopleSkills(rows)` / `parsePeopleSkillsWb(wb)` +
  `parseSkillJobs` in `src/parsers/index.js`. Strips BOM + literal quotes;
  regex `/([^,()]+?)\s*\((\d)\)/g` explodes jobs → `{job:rating}`; parses home
  store (comma-safe) + role. `detectType`: `people_list*` → `people-skills`.
  Fixture + 10 tests.
- ✅ **Table** `employee_skills` (PK loc+employee; skills_json jsonb) in
  schema.sql; `saveEmployeeSkills`/`loadEmployeeSkills` in supabase.js. Keyed by
  HOME store + name (idempotent across store files).
- ✅ **Panel** `src/views/skills-matrix.js` — nav 🎓 "Crew Skills" (modal
  `skills-matrix`). Rows = employee + Job Title; columns = stations (production→
  service→admin order); cells = 1-5 heat-mapped (red→green); blank = untrained.
  Store filter, name/title search, sort (name/title/click a station), highlight
  ≥3/≥4/5, ≥3-proficient coverage footer, CSV + print. Upload wiring in App.js.

## Phase 2 — Auto-pull (scaffolded, v4.467, needs live confirmation)

- ✅ **Script** `scripts/lifelenz-people-pull.mjs` — Playwright login (reuses the
  IDM OAuth flow from lifelenz-pull.mjs), opens each People page, drives Download
  Report → Simple (CSV), parses with the SAME `parsePeopleSkills` the app uses
  (verified in Node: 45 employees / 32 jobs), upserts to `employee_skills`
  (source `lifelenz_people_scrape`). Two capture strategies: real download event,
  then in-browser fetch of any observed CSV endpoint. **Logs the export request
  URL** so we can convert to a fast all-stores API pull (skip the UI).
- ✅ **Workflow** `.github/workflows/lifelenz-people-pull.yml` — weekly (Mon 11:00
  UTC) + workflow_dispatch. Env: LIFELENZ_USERNAME/PASSWORD, SUPABASE creds,
  `LIFELENZ_PEOPLE_URLS` (JSON [{loc,url}]).
- ⏳ **NEEDS from owner (live-only, can't test from here):**
  1. **Per-store URL / store-picker mechanism** — the shared URL is ONE store
     (Purcell, viewId 019c9ad6-…). Need how to target each of the 27 stores:
     a per-store URL/viewId map, or whether a store filter on the page drives the
     export. Set `LIFELENZ_PEOPLE_URLS` secret to a JSON array of {loc,url}.
  2. **OR the export request URL** from DevTools (Network → Download Report →
     Simple CSV → copy request URL). That unlocks a fast API pull for all stores
     and removes the fragile UI-driving.
  3. Run once via workflow_dispatch (debug=1) — the logs print observed CSV
     endpoints + screenshots to confirm selectors.
- ⚠️ Scheduled runs execute from the DEFAULT branch (main) — won't run on cron
  until PR #12 merges. workflow_dispatch works from any branch.
- Optional next: coverage heat by daypart/station gaps; "who can open/close".
