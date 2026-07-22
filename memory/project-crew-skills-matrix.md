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

## Phase 2 — Auto-pull ✅ WORKING (v4.473, 2026-07-22)

**Proven: 1,529 employees across all 27 stores, zero manual upload.** The path
that works (`scripts/lifelenz-people-pull.mjs`), hard-won through several runs:
- **Auth:** browser form-login at `https://admin.lifelenz.com/us01/auth/login`
  (fill username+password, click the primary "Log in" — NOT "Log in with SSO",
  wait to leave /auth/login). The bare IDM `connect/authorize` URL renders BLANK
  headless — do not use it. `LIFELENZ_TOKEN` is still used for schedule discovery
  only (`/api/admin/businesses/{id}/schedules`); login uses USERNAME/PASSWORD.
- **Per store:** navigate `/us01/people/{businessId}/{scheduleId}` with
  `waitUntil: 'domcontentloaded'` (NOT networkidle — the SPA polls forever), wait
  for the "Download Report" control.
- **Export (3 gotchas):** (1) the "Simple (CSV)" link is `<a click.delegate=
  "downloadEmployeeRosterCsvSimple()">` hidden in the collapsed menu — invoke its
  native `.click()` via page.evaluate (Playwright won't click a hidden element).
  (2) That opens a **Disclaimer modal** — must click **"Acknowledge & Export"**;
  only then does the download fire. (3) Attach `.catch` to `waitForEvent
  ('download')` so a per-store miss doesn't crash the run.
- Parse via `parsePeopleSkills` (shared), upsert `employee_skills`
  (source `lifelenz_people_scrape`). Weekly cron Mon 11:00 UTC + workflow_dispatch.
- ⚠️ Depends on `LIFELENZ_TOKEN` (schedule discovery) — refresh when it expires,
  same as the labor pull. FUTURE: discover schedules via the authenticated browser
  session to drop the token dependency entirely (USERNAME/PASSWORD don't expire).

<details><summary>Earlier scaffold notes (superseded)</summary>

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
- ✅ **URL pattern SOLVED (DevTools, v4.468):** the People page is
  `/us01/people/{businessId}/{scheduleId}` — the 2nd path segment IS the store's
  **scheduleId** (Ponce de Leon `019c9ad6…`, Purcell `019866cf…`). Same IDs
  `getStoreSchedules()` returns. The list is GraphQL-driven
  (`GetAllEmploymentsForPeopleRoleList`, POST `us01-connect…/manager/graphql`,
  vars `{businessId, scheduleId}`) — but that query does NOT carry the 1-5 skill
  ratings, so we don't reverse the GraphQL; the **Simple CSV export DOES** carry
  them, so we UI-drive the download.
- ✅ **Script now all-stores (v4.468):** login captures X-Auth-Token → discover
  active store schedules via `/api/admin/businesses/{id}/schedules` (in-browser
  fetch) → build each store's people URL by scheduleId → UI-drive Download Report
  → Simple (CSV) → parse + upsert. No dropdown automation. Override with
  `LIFELENZ_PEOPLE_URLS` if needed.
- ⏳ **Only unverified bit (live-only):** the export button selectors
  (`Download Report`, `Simple (CSV)` by text) and that the CSV comes through as a
  Playwright download event. First run should be **debug=1** — it screenshots the
  page + logs on failure. Adjust selectors if the first run misses.
- ⚠️ Scheduled/dispatch runs execute from the DEFAULT branch (main) — the workflow
  only appears in the Actions UI and runs on cron once PR #12 merges.
- Optional next: coverage heat by daypart/station gaps; "who can open/close".

</details>
