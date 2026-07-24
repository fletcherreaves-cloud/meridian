---
name: project-lifelenz-schedule-jobs
description: LifeLenz per-job (business-role) hours+cost breakdown — reverse-engineered GraphQL endpoints, response shapes, the businessRoleId→name map derived from compliance descriptions, and the plan to wire it into the daily pull + Weekly Schedule Summary.
metadata:
  node_type: memory
  type: project
---

# LifeLenz Schedule "per-job" (business-role) hours + cost — API reverse-engineering

Goal: the right-panel **per-job hours+cost breakdown** on the LifeLenz weekly-schedule
screen (Grill / Drive-Thru / Beverage / Lobby / Maintenance / Opening / …, with #shifts,
hours, $cost) — surfaced across ALL stores in Meridian's Weekly Schedule Summary. This is
NOT in the `labor_analysis_actuals_report` CSV the daily pull already uses; it's a set of
separate GraphQL calls on the schedule-week page. Owner captured them one at a time from
DevTools (2026-07-24).

## Transport (all of these)

`POST https://us01-connect.lifelenz.com/manager/graphql?<OperationName>`
Headers: `x-auth-token` (the session token — env `LIFELENZ_TOKEN` in the pull),
`x-lifelenz-device: webadmin`, `x-user-id`, `x-version: 1.75.50`, and for schedule-scoped
ops `x-schedule-id: <scheduleId>`. Body = standard `{operationName, variables, query}`.
`businessId = 01979dbf-a166-759b-8702-aba9915c578e`. Example scheduleId (DeFuniak/Ponce
area store) = `01979dc0-a7cb-7677-a46e-d06dd5d2c7aa`. **Two ID families:**
`businessRoleId` UUIDs start `01979dc0-6…` (operational STATION); `jobTitleId` UUIDs start
`01979dc1-f…` (payroll TITLE). Every metric segment carries both.

## The endpoints (7 captured)

### 1. `ShiftsForSchedulePeriod` ✅ CORE — the hours+cost source
vars: `businessId, scheduleId, startDateTime, endDateTime, shiftType:["offer","offer_to_all","roster","time_off","open"], includePayRates:true`.
→ `data.shifts.edges[].node`: `{ id, shiftStartTime, shiftEndTime, shiftType,
assignedEmploymentId, expectedHours, expectedEarnings, isAbsent, scheduleId, scheduleName,
businessOfficeLocationId, pivotMetrics[] }` + `pageInfo{endCursor,hasNextPage}` (paginate).
`pivotMetrics[]`: `{ businessRoleId, earnings, jobTitleId, payType(regular|overtime),
payCode, seconds, startTime, nextDay }`.
**Per-job rollup = group `pivotMetrics` by `businessRoleId` → Σ`seconds`/3600 = hours,
Σ`earnings` = cost, count shifts; split regular/OT on `payType`.**
⚠️ FILTER edges to the target `scheduleId` (shared stores like "0043701 PONCE DE LEON"
bleed in). Open/offer shifts have null earnings/jobTitleId — exclude from committed sums.

### 2. `GetPaginatedJobTitles` ✅ — jobTitleId → payroll title
Lookup-by-ids: vars `businessId, ids:[…], after`. → `jobTitles.edges[].node{ id, code,
name, isManager, salaried, jobTitleTypeId, … }`. Known:
`01979dc1-f628-7bd6-9439-c855d07e906e` = **CREW PERSON** (code 00650);
`01979dc1-f5a1-782d-8a86-7fa8c8b3926c` = **BACKUP MAINTENANCE PERSON** (code 00670).
Coarse (payroll classes) — NOT the station granularity. In the pull, collect distinct
`jobTitleId`s from pivotMetrics and resolve in one batched call (or `ids:null` for all).

### 3. `FixedHoursGuides` ✅ bonus — the "Fix. Guide Hrs" source
vars `businessId, scheduleId, startDate, filter:{excludeDeleted:true}`.
→ `fixedHoursGuides.nodes[].config[]{ businessRoleId, days[]{hours, dayOfWeek} }`.
Per-role fixed hours per weekday. This is literally where the daily report's fixed-hours
guide comes from — a config, not per-day actuals.

### 4. `FixedTasks` ✅ bonus — fixed task plan
→ `fixedTasks.nodes[].config[]{ startTime, businessRoleId, daysOfWeek[], duration,
headcount, operationType }`. Specific fixed tasks (e.g. Maintenance 07:00 ×10h) per role.

### 5. `GetSkillLevels` ✅ ref — crew proficiency scale
→ `skillLevels.nodes[]{ id, name, level, rank, aosLevel, isDefault }`. Values:
Outstanding(1)/Excellent(2)/Good(3)/Training(4)/Cannot Schedule(5, default). Referenced by
compliance SKL_L warnings.

### 6. `GetScheduleTargets` ❌ empty — KPI target VALUES only (setValueId/value/valueType), no names. Skip.

### 9. `GetBusinessRoleCategories` / `GetBusinessRolesPaginated` ✅ — role taxonomy + authoritative names
`roleCategories(businessId)` → the 3 categories (Variable/Floor/Fixed under root "MCDOK/Emerald
Arches"). `businessRoles(businessId, excludeInactiveRoles:false)` → all 34 roles with
`businessRoleName, code, symbol, color, businessRoleCategoryId, isFixedHourRole`. **This is the
authoritative source for `LIFELENZ_BUSINESS_ROLES` in src/engine/lifelenz-shift-jobs.js** (see the
role-map note below). Static config — refetch only if roles are added.

### `GetOpeningHours` ✅ useful cross-check (not pulled yet) — `openingHours(businessId, scheduleId,
startDate, endDate, includeDeleted)` → `nodes[]{ id, scheduleId, type (RegularOpeningHour),
startDate, endDate, days.details[]{ dayOfWeek, time[]{ startTime, endTime } } }`. LifeLenz's
authoritative hours-of-operation per store (e.g. DeFuniak = 05:00–23:00 all 7 days = 18h/day). Use to
**validate the Labor-Analysis Band-5 hours-of-op config** (`store_labor_config` open/close per weekday,
see project-labor-analysis-flh.md) — a mismatch = data-integrity flag. Also feeds hours-open×VLH sanity.

### minor — `GetActiveAvailabilitiesMaxHours` (nice-to-have, not pulled) — `availabilities(businessId,
employmentIds, status:[active], types:[…], startDate, endDate)` → per-employee availability records
`{ id, employmentId, type, maxDurationPerWeek, startDate, endDate }`. For this org almost all are
`Availability_NoPermanentWorkSchedule` with `maxDurationPerWeek: null` (no weekly caps set) → nothing
actionable now; hook for a future "who has capacity / max-hours" scheduling-intelligence view.

### 8. `GetSchedulableEmploymentsForPeriod` ✅✅✅ — roster + PAY RATES + skill matrix (richest)
vars: `businessId, scheduleId, startDateTime, endDateTime, includePayRates:true,
includeEmploymentAvailability:false, includeEmploymentContracts:false,
includeSharedSchedule:true, after`. → `employmentsInScheduleTimeRange.edges[].node` (Employment):
`{ id, computedName, firstName, lastName, code, currentHomeScheduleId, email, dateOfBirth,
schoolId (minor flag), currentStatus, employmentStatus, securityRole, employmentTypeConfig{name:
Part Time/Casual/…}, employmentRate ($/hr now), employmentRates[]{ jobTitleId, jobTitle{…name,
code, isManager, salaried}, rate, startDate, endDate, status }, employmentRoles[]{ businessRoleId,
skillLevelId, rating, roleRate }, employmentSchedule{ generalManager, serviceManager, groupAdmin,
shiftManager, managerTrainee, schedulable, permissionLevel }, employmentScheduleHistories[] (cross-
store transfers/loans) }` + pageInfo (paginate).
- **`employmentId` → name** → label `ShiftsForSchedulePeriod` shifts by person.
- **PAY RATES** (`employmentRate` / `employmentRates[].rate`) = authoritative $/hr cost basis;
  salaried GMs = 0.0 (excluded from crew labor % — matches the report's hourly-only basis).
- **jobTitle catalog** (jobTitleId → name/code): `00641` GENERAL MANAGER (salaried), `00647`
  CERT. SWING MGR., `00648` CREW TRAINER, `00650` CREW PERSON, `00670` BACKUP MAINTENANCE
  PERSON, `00739` SHIFT MANAGER TRAINEE, `10001` DEPT MGR I W/ CREW PUNCHES.
- **Skill matrix** (`employmentRoles`) = who's cross-trained on which `businessRoleId` + skill
  level → bench-depth analysis + explains the SKL_L/SKL_M compliance warnings (endpoint #7).
- **Manager flags** in `employmentSchedule` = per-store org chart. **Transfers** in
  `employmentScheduleHistories` = shared-schedule loans across stores.
- Feeds future features: per-employee scheduled hrs+cost, manager-vs-crew split, cross-training
  depth, minor/school-calendar flags, transfer tracking.

### 7. `ScheduleComplianceWarnings` ✅✅ — surfaced the ROLE-NAME VOCABULARY + is useful on its own
vars `businessId, scheduleId, startDateTime, endDateTime, after, includePayRates:true`.
→ `complianceWarnings.edges[].node`: `{ code, category, severity, description, title,
ruleName, employmentId, shiftId, timeClockId, isOverridden, overrideReason, meta,
shift{…pivotMetrics}, timeClock{clockIn, clockOut, …pivotMetrics} }`.
Codes seen: `SKL_L` (low skill — **description NAMES the role**), `SKL_M` (missing role),
`MNSC`/`MDWH`/`MMBM` (FL minor rules: school-calendar, >8h pre-school-day, 4h-no-break),
`FUTURE_WARNING` (open time-clock). severity 1–10; category Roles and Skills / Minors /
Configuration. **This is independently valuable** — a district-wide "schedule
compliance / minor-law / skill-gap" feed (potential Signals or Visit-Readiness input).

## businessRoleId → NAME map (empirically derived, 2026-07-24)

The role NAMES come from SKL_L `description` ("Employee has a low skill level for X.").
On **single-role shifts** (all pivotMetrics share one businessRoleId) the mapping is clean;
multi-role grill shifts (6a99+6abd) can't split BREAKFAST vs REGULAR from this alone.
**CONFIRMED (single-role shifts):**
- `01979dc0-6a3a-7651-8a71-39b5f3fd8454` = **MAINTENANCE** (SKL_L MAINTENANCE shifts are all-6a3a; FixedHoursGuides 6–8h/day)
- `01979dc0-6a4a-7851-9173-0977a41ac4fe` = **LOBBY** (SKL_L LOBBY shifts all-6a4a; FixedHoursGuides 10–16h/day — the big fixed block)
- `01979dc0-6af3-786a-82a1-17bd10262233` = **DRIVE THRU** (SKL_L DRIVE THRU shifts all-6af3)
- `01979dc0-6a26-7ce1-9790-08109fc38f18` = **BEVERAGE SPECIALIST** (SKL_L BEVERAGE shift all-6a26)
- `01979dc0-6a6e-7acb-a7af-ea86644434fd` = **TRAINING** (SKL_L TRAINING shifts; first segment 6a6e)
- `01979dc0-6ac8-7f96-a0c6-5dc3160e325c` = **OPENING** (SKL_L OPENING shifts; opening 09:00 segment = 6ac8)
**LIKELY (multi-role, needs authoritative confirm):** `6a99` & `6abd` = GRILL (BREAKFAST /
REGULAR MENU) — both appear together on grill shifts. Other role UUIDs seen but unnamed:
`69ac, 69cd, 69d9, 69e5, 6a09, 6a17, 6a58, 6a8e, 6ab1, 6ad2` (front counter, closing,
presenter, order-taker, etc. — unknown).

**✅ AUTHORITATIVE map CAPTURED (2026-07-24)** — `GetBusinessRolesPaginated` (`businessRoles(businessId,
excludeInactiveRoles:false)`) → `edges[].node{ id, businessRoleName, code, symbol, color,
businessRoleCategoryId, isFixedHourRole, roleRate, replaceByAos, deleted }`. All 34 roles for this
org, with categories. **The full map now lives in `src/engine/lifelenz-shift-jobs.js`
(`LIFELENZ_BUSINESS_ROLES`)** — confirmed every reverse-derived name was correct. Variable stations:
Drive Thru(D), Grill Breakfast Menu(GB), Grill Regular Menu(G), Window(W), French Fries(FF),
Hashbrown(HB), Beverage Specialist(BS), LZ_AOS. Floor: Floor(FL), Floor Production(FP), Floor Guest
Service(FG). Fixed (mgmt/task hrs): Opening, Closing, Maintenance, Lobby, Food Safety, Admin/Cash,
Support/Prep, Transition, Pre-Shift, Training, Manager Meeting, Truck Delivery, Walk Thrus, VAT,
Hiring, Schedules, STAT, Birthday Parties, Planned Maintenance, Individual Development, OTP, Guest
Experience Leader(GL), General Manager. Refresh the const from this query only if roles are added.

**Role CATEGORIES** (`GetBusinessRoleCategories` → `roleCategories`): each businessRole belongs to a
category. For this org: root "MCDOK/Emerald Arches" → **Variable** (code `Variable`) / **Floor**
(`Floor`) / **Fixed** (`Fixed`). This is the same Variable/Fixed/Floor split that drives the
report's Proj-VLH (variable) vs Fix-Guide-Hrs (fixed) vs Floor columns. The (not-yet-captured)
`businessRoles` query would carry `businessRoleCategoryId` linking each role UUID to one of these —
letting per-job rollups also roll up by Variable/Fixed/Floor.

## Build status — SHIPPED v4.507 (2026-07-24)

✅ **1. Pull** — extended `scripts/lifelenz-pull.mjs` (NOT a separate script — reuses the one
auth + `getStoreSchedules` discovery). After the CSV upsert it runs `pullJobHours(token,
schedules, start, end)`: for every store schedule × every Wednesday-anchored week in the pull
range it POSTs `ShiftsForSchedulePeriod` (paginated), rolls up via the SAME engine
(`rollupShiftsByRole` from `src/engine/lifelenz-shift-jobs.js` — zero drift), and upserts.
**Fully best-effort/non-fatal**: wrapped so any failure logs + returns [] and can NEVER cost
the (already-committed) CSV pull. Escape hatch `LIFELENZ_SKIP_JOBS=1`. First-failure logs the
GraphQL error verbatim then goes quiet (avoids 27×N noise).
✅ **2. Table** — `lifelenz_job_hours` (loc, week_start, business_role_id, role_name, category,
code, hours, cost, reg_hours, ot_hours, n_shifts) PK (loc, week_start, business_role_id) in
`supabase/schema.sql`. **week_start = the WEDNESDAY anchor** (WEEK_START_DOW=3) so keys line up
with the Schedule Summary panel's weekKey. ⚠️ **User must run this SQL block** in the Supabase
editor (fails soft — app works without it, per-station section just shows "not yet pulled").
✅ **3. Loader** — `loadLifeLenzJobHours({weeksBack,weeksFwd})` in `src/lib/supabase.js`
(paginated); App.js startup sets `ds.jobHours`.
✅ **4. Surface** — `ScheduleSummaryPanel` expanded store view now renders `StationBreakdown`
below the daily grid: per-station Station/Cat/Shifts/Reg/OT/Hours/Cost/$per-hr, category
summary (Variable/Floor/Fixed hrs) + total row. Indexed by `_normLoc(loc)+'|'+weekKey`.
✅ **Role-name config** — `LIFELENZ_BUSINESS_ROLES` already authoritative (all 34 roles).

✅ **GraphQL query VERIFIED against the real DevTools capture (2026-07-24).** The initial
reconstruction had wrong variable types that would have failed every call — corrected in
`SHIFTS_QUERY`:
- `startDateTime` / `endDateTime` are **`ISO8601DateTime!`** (NOT `String!`) — and must be
  sent as canonical UTC with ms + Z (`2026-07-22T00:00:00.000Z`); a bare `…T00:00:00` is
  rejected by the scalar.
- `shiftType` is **`[ShiftTypeEnum!]`** (NOT `[String!]`). Values passed:
  `["offer","offer_to_all","roster","time_off","open"]`.
- **`includePayRates` is NOT a `shifts()` argument** — in the real query it only gates the
  `earnings` field via `@include(if: $includePayRates)`. We request `earnings` plain (the
  owner token is authorized), so the var/arg is dropped entirely.
- Headers on the real request: `x-auth-token`, `x-lifelenz-device: webadmin`,
  `x-schedule-id`, `x-version: 1.75.50`, `x-user-journey: Display Schedule Week` (and an
  `x-user-id` we can't derive for the service account — omitted, and the CSV pull works the
  same way without it).

**Response confirmed the engine filters are correct + exposed one edge case:** the week for
DeFuniak (`01979dc0-a7cb-…`) returns 227 edges including **shared-store bleed** from Ponce de
Leon `019c9ad6-63ef-…` (filtered by scheduleId ✓), **open** shifts (null earnings, excluded by
shiftType ✓), and a **REJECTED roster shift** (`shiftType:'roster'`, `assignedEmploymentId:null`,
`earnings:null`, non-zero `seconds`). The last would have added phantom $0 hours, so
`_committed` now also requires a truthy `assignedEmploymentId`. `isAbsent:true` shifts (e.g.
"Late Notice – Unexcused") keep their scheduled hours (planned = scheduled). Pay math sanity:
`$16/hr × 4h = 14400s = $64`, `payType:'overtime'` seen on real OT segments.

Still open / optional:
- Per-EMPLOYEE breakdown (engine `rollupShiftsByEmployee` ready) — would need the roster from
  `GetSchedulableEmploymentsForPeriod` pulled too; not wired yet.
- (Optional) `ScheduleComplianceWarnings` → a compliance/minor-law feed.

⚠️ The `x-auth-token` values pasted in the DevTools captures are LIVE session tokens — treat
as sensitive, NEVER hardcode; the pull reads `LIFELENZ_TOKEN` from env like the existing job.
