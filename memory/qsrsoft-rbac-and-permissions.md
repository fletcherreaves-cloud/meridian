---
name: qsrsoft-rbac-and-permissions
description: QSRSoft's full RBAC model (roles → permission slugs) captured from the SSO GraphQL getOrgInfo call. Doubles as the definitive machine-readable feature/data taxonomy (cleaner than the nav screenshots) and a mature reference for Meridian's own RBAC + field-level PII + multi-tenant design. Notable lead - "datapass_access" implies an official data-export product worth investigating over scraping.
metadata:
  node_type: memory
  type: project
---

# QSRSoft RBAC + permission taxonomy (from SSO GraphQL, 2026-07-28)

**Source:** `POST https://api.sso.myqsrsoft.com/graphql` → `getOrgInfo` → `groups[]` each with
`name`, `groupId`, `permissions[]`. Auth = bearer in `authorization` header (owner blanked it;
no secret captured). Body = org RBAC config only (no PII/credentials) — safe to bank.

## Why this matters
1. **Definitive feature/data taxonomy** — the permission slugs are the canonical, machine-
   readable list of every QSRSoft capability & data stream (better than the nav catalog).
2. **Reference RBAC** — a mature role→permission matrix + **field-level PII permissions** to
   learn from for Meridian's RBAC (`profiles.role`/`accessible_locs`), RLS Phase 3 (PII), and
   multi-tenant.

## Roles (groups) present in this org
Owner Operator · Director of Operations · Supervisor · General Manager · Shift Manager ·
Department Manager · Senior Department Manager · Floor Supervisor · Operations Manager ·
Office Manager · Office Assistant · Accounting Partner · Payroll Partner · Maintenance ·
Crew · Default Role · System Administrators.
→ Maps closely to Meridian's Developer/Admin/Owner/VP/DO/Supervisor/GM/Office ladder. Good
reference for refining our hierarchy (esp. the Partner roles = scoped external access, and
Maintenance = equipment-only).

## Notable permission slugs (beyond the nav catalog)
- **`datapass_access`** ⭐ (Owner Operator, System Admins, DO) — "DataPass" almost certainly an
  **official data-export / integration feed**. LEAD: investigate as a sanctioned data source
  vs. Playwright scraping — could be the clean pipe for the whole report catalog.
- **`transactionalAnalytics`** (Owner Operator, Supervisor, DO) — transaction-level analytics
  (the "Any Transaction"/register power tool) — loss-prevention gold.
- **`kitchenCapacity`** (Supervisor, DO only) — confirms the throughput report.
- Pricing/PMIX suite: `pmixMargin`, `pmixByPointOfOrder`, `pmixCI`, `pmixDiscountMenuItems`,
  `pmixTrend`, `menuPriceComp`, `deliveryPricing` → Pricing Engine source richness.
- People/labor-integrity suite: `turnover`, `mcdOvertimeAudit`, `storePeoplePunches`,
  `mcdLaborExceptions`, `timeAttend`, `rosterStatistics`, `mcdEmployeeRoster`,
  `mcdEmployeePayPeriod`, `mcdBirthdaysAnniversaries`, `overViewPeople`.
- Throughput/peak: `peakTargetAndTracking`, `threePeak`, `timeSliceSummary`, `3dTrend`, `YYNN`.
- Loss-prevention: `security_access`, `security_camera_settings`, `registerAudit`,
  `deposits`, `taxExempt`, `otherReceipts`, `nationalEmployeeDiscount(ByEmployee)`.
- Engagement/gamification: `rewards_access`, `award_points`, `send_points`,
  `manage_rewards_*`, `crew_portal_*`, `survey_*`.
- AI: `coachq_access`, `coachq_ai_access`, `coachq_settings` (their SAGE analog).
- Equipment/maintenance module: `equipment_*` (asset/PM/tickets/vendors/parts) — a whole
  domain Meridian doesn't touch.

## ⭐ Field-level PII permissions (model for our PII/RLS Phase 3 + multi-tenant)
QSRSoft gates PII per FIELD, not per table: `pii_name`, `pii_ssn`, `pii_payrate`,
`pii_payrate_reports`, `pii_annual_salary`, `pii_emp_info`, `pii_emp_phone_number`,
`pii_emergency_info`, `pii_terms`. Payroll Partner + System Admins hold the sensitive ones
(ssn/salary/payrate); GMs get name/phone/emergency only. → Adopt the pattern: column/field-
level gating for employee data in Meridian (reviews, skills, rosters), not just row-level RLS.

## Link-ups (when the time comes)
- **RLS/multi-tenant (Phase 3):** mirror field-level PII gating + the Partner-role concept.
- **DataPass lead:** check if `datapass_access` exposes a real export API → cleaner pulls.
- **Catalog:** treat this slug list as the authoritative index behind `qsrsoft-report-catalog.md`.
