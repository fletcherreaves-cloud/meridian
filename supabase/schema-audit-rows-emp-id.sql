-- Dispatch #51 (memory/dispatch-51.md): make dispatch #49's Phase 0 identity-vault-re-key gate
-- measurable as a repeatable SQL query instead of a bespoke API re-pull that inherits none of
-- qsrsoft-register-audit-pull.mjs's own proven two-path auth + Playwright fallback + retry
-- handling. The Register Audit API carries empID beside empName on every row -- confirmed from a
-- live DEBUG key-name run (dispatch #49, run 32431369072), not inferred.
--
-- ADDITIVE ONLY. Nothing reads this column yet. Does NOT touch the identity vault,
-- get_or_create_employee_token(), or any token keying, and does NOT change audit_rows' existing
-- (loc, date, emp) PK -- five months of manual-upload history and freshest-wins continuity ride
-- on that PK being untouched. Phase 1 (the actual re-key) is not started by this column existing.
--
-- Populated going forward by scripts/qsrsoft-register-audit-pull.mjs's mapRow()/saveAuditRows()
-- (auto-pull only -- parseRegisterAudit's manual-upload path has no employee-ID column to read,
-- so manually-uploaded rows will always carry emp_id = null, same as every other auto-only field
-- on this table). Backfilled 2026-03-01 -> today via a re-run of the existing pull, which upserts
-- on the SAME (loc,date,emp) key -- existing rows simply gain a value in this one column.

alter table audit_rows add column if not exists emp_id text;

comment on column audit_rows.emp_id is
  'Register Audit API''s own employee ID (source field: empID), additive alongside the '
  'name-keyed emp column. Nullable -- manually-uploaded rows never carry it, and rows pulled '
  'before dispatch #51''s backfill will be null until re-pulled. NOT used for token keying or '
  'any PK -- dispatch #49''s Phase 0 gate reads this column directly, nothing else does yet.';
