// @ts-nocheck
export default {version:'5.577', date:'2026-10-17', changes:[
  '**New: Access Log** (owner request, "usage logs/reports for auditing", given latitude to ' +
  'scope it: "whatever you feel is best for now, we can always pivot later"). A deliberately ' +
  'narrow first cut, not blanket usage telemetry — researched first and found the app had zero ' +
  'login/feature-usage tracking anywhere, but several proven append-only audit tables already ' +
  '(org_assignment_audit, lifelenz_punch_edits, identity_reveal_log) whose pattern this reuses.',
  'Two event types logged: a real credential-based sign-in (never a restored session on page ' +
  'load/refresh, never a silent token renewal), and a view of either of the app\'s two existing ' +
  'Owner/Admin/DO-only panels (Pay Rate History, Security). Admin/owner-read only, tighter than ' +
  'Pay Rate History\'s own (admin/owner/do) precedent since this log is oversight OF a DO\'s own ' +
  'activity too — new `security.auditLog` permission key. No update/delete policy at all, same ' +
  '"tamper-evident" pattern as identity_reveal_log.',
  'New viewer panel (Access Log, Admin section) — a plain chronological table, not a ReportShell ' +
  'report (this content has no real store/date-range scope to filter on). kind stays ' +
  '\'test-kitchen\' per the standing rule for a brand-new, unproven panel against a table that ' +
  'still needs its migration run manually (supabase/schema-app-access-log.sql — same "needs ' +
  'manual action" status employee_pay_rate_changes had when it shipped).',
  '25 new tests (permission-matrix check, AuthGate SIGNED_IN-vs-restored-session/token-refresh ' +
  'distinction, both instrumented panels\' logging + a denied-view-never-logs check, and the new ' +
  'viewer panel\'s real render). shell-nav-snapshot/panel-registry updated for the new nav entry ' +
  '(route count fifty-one -> fifty-two; Test Kitchen census fourteen -> fifteen).',
]};
