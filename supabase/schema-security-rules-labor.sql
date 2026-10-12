-- ── LABOR-001/002/003 — Labor domain (dispatch 2026-10-12) ──────────────────────────────────────
-- Scoped off the owner's own question ("do we currently scan or look for the possibility of ghost
-- employees on payroll or potential for fraudulent time clock entries being manually applied in
-- any type of pattern?") and memory/plan-security-loss-prevention.md §2.4/§2.4a/§5's resulting
-- net assessment: now that lifelenz_punch_edits is live, correct, and verified
-- (memory/finding-lifelenz-punch-edit-audit-report-2026-10-12.md, v5.521-v5.526), every pattern
-- the research pass identified as "buildable, not blocked on more research" is buildable with the
-- existing security_rules/security_findings/scripts/security-rules-run.mjs architecture -- no new
-- engine capability, no new table beyond what already shipped.
--
-- Compute logic: scripts/security-rules-run.mjs's own "── LABOR ──" section
-- (supportsLaborGhost/supportsLaborSelfApproval/supportsLaborManagerRate,
-- computeLaborEmployeeFindingsForRule/computeManagerEditFindingsForRule). Panel wiring:
-- src/views/security-panel.js's 'labor' domain tab.
--
-- ⚠️ ALL THREE SHIP ACTIVE=FALSE. There is no live Supabase credential in this sandbox to run the
-- equivalent of INV-004's own pre-ship dry-run measurement (its migration's own header shows what
-- that looks like: real percentiles from a live join, checked before choosing a threshold). These
-- thresholds are first guesses in the same declared sense schema-security-rules.sql's own
-- CASH-001/CASH-002 fixtures are ("to be tuned against this org's actual data") -- not a
-- Phase-1-quality delivery yet. Before flipping any of these active=true:
--   1. Run scripts/security-rules-run.mjs once against real data and read its own
--      `[security-rules-run] LABOR-00N: N row(s) ... -> N finding(s)` log line per rule.
--   2. For LABOR-001 specifically, measure the LifeLenz-geid-vs-QSRSoft-geid join hit rate first
--      (see that script's own header comment on this exact open question) -- a near-zero hit rate
--      means the two vendors' geids are NOT the same identifier space for this org, and LABOR-001
--      would need a name-based join instead before it means anything.
--   3. Re-tune threshold/min_denominator/min_value against whatever that real run shows, the same
--      way INV-004's own migration documents its measured percentiles before picking 2.5σ.

-- ── LABOR-001 — Ghost employee: punch-edit activity after the employee's own termination date ──
-- Subject: the edited employee (empToken from employee_name). Numerator is a precomputed 0/1 flag
-- (postTerminationFlag, scripts/security-rules-run.mjs's joinPunchEditsWithTenure) -- a plain
-- threshold COUNT, not a rate: even ONE post-termination edit event is worth a look, there is no
-- "normal" nonzero rate of this to normalize against.
insert into public.security_rules (
  rule_id, domain, subdomain, method, description, data_required, logic_type, logic_expression,
  window_days, baseline_type, threshold, severity, weight, confidence, opportunity_factor,
  corroboration_rules, exoneration_rules, false_positives, investigation_action, source, version, active
) values (
  'LABOR-001', 'labor', 'ghost-employee', 'Post-termination punch-edit activity',
  'A LifeLenz punch add/edit, for this employee, dated after the termination date QSRSoft has on file for them -- the sharpest single signal for a "ghost employee" still being paid for time after they left.',
  '["lifelenz_punch_edits", "qsr_employee_tenure"]', 'threshold',
  '{"field": "postTerminationFlag", "agg": "sum", "comparator": "gte"}',
  28, null, '{"default": 1}', 5, 1.5, 'high', true,
  '{}', '{}',
  '["a late correction to a punch from the employee''s final days, properly backdated to a date before their last worked day", "a termination date entered into QSRSoft after the fact, placing a legitimate final-week edit after the recorded (but inaccurate) termination date", "LifeLenz geid and QSRSoft geid not actually being the same identifier space for this org -- see this migration''s own pre-flight step 2"]',
  'Confirm the termination date in QSRSoft and the edited punch''s own date/time directly against LifeLenz''s change-log entry for this employee before escalating; verify the edit is not a late-entered correction for days legitimately worked before termination.',
  'owner question 2026-10-12 ("...ghost employees on payroll or potential for fraudulent time clock entries..."); memory/plan-security-loss-prevention.md §2.4/§2.4a', 1, false
)
on conflict (tenant_id, rule_id) do nothing;

-- ── LABOR-002 — Self-approval: the edited employee IS the editing manager ──────────────────────
-- Subject: the edited employee (empToken from employee_name) -- same subject grain as LABOR-001,
-- different signal. selfApprovalFlag (scripts/security-rules-run.mjs's mapPunchEditRow) is 1 when
-- employee_name and manager_modified name-match on the same row, a segregation-of-duties red flag
-- regardless of whether the edit itself was legitimate.
insert into public.security_rules (
  rule_id, domain, subdomain, method, description, data_required, logic_type, logic_expression,
  window_days, baseline_type, threshold, severity, weight, confidence, opportunity_factor,
  corroboration_rules, exoneration_rules, false_positives, investigation_action, source, version, active
) values (
  'LABOR-002', 'labor', 'self-approval', 'Employee self-approved punch edit',
  'The person whose punch was added/edited in LifeLenz is the SAME person recorded as having made the edit -- a manager or shift lead editing their own time, with no second person involved in the approval.',
  '["lifelenz_punch_edits"]', 'threshold',
  '{"field": "selfApprovalFlag", "agg": "sum", "comparator": "gte"}',
  28, null, '{"default": 1}', 4, 1, 'medium', true,
  '{"LABOR-003"}', '{}',
  '["a shift lead or manager with this store''s own documented policy permitting self-edit", "a name-matching artifact -- two different employees sharing an identical name string at the same store"]',
  'Confirm this store''s own policy on who may approve their own punch edits; if self-approval is not permitted here, pull the LifeLenz change-log entry for the exact edit and this employee''s manager chain.',
  'owner question 2026-10-12 ("...fraudulent time clock entries being manually applied in any type of pattern..."); memory/plan-security-loss-prevention.md §2.4/§2.4a', 1, false
)
on conflict (tenant_id, rule_id) do nothing;

-- ── LABOR-003 — Per-manager outlier edit rate, vs. other stores ────────────────────────────────
-- Subject: the EDITING MANAGER (empToken column reused for a manager subject, from
-- manager_modified -- same reuse INV-004 already established for its own manager x day-part x
-- store grain, immediately above in schema-security-rules-inv004.sql). z-scored against other
-- stores' own edit rate for the window, normalized per 1,000 punches at that store
-- (qsr_punch_times) so a high-volume store's manager isn't flagged purely for editing more
-- punches in absolute terms.
insert into public.security_rules (
  rule_id, domain, subdomain, method, description, data_required, logic_type, logic_expression,
  window_days, baseline_type, threshold, severity, weight, confidence, opportunity_factor,
  corroboration_rules, exoneration_rules, false_positives, investigation_action, source, version, active
) values (
  'LABOR-003', 'labor', 'manual-edit-rate', 'Punch-edit rate per editing manager, vs. other stores',
  'How often a manager edits/adds punches, normalized per 1,000 punches at their own store that window, compared against other stores'' own rate for the same window -- unusual against other stores'' managers, not against a fixed number.',
  '["lifelenz_punch_edits", "qsr_punch_times"]', 'z-score',
  '{"numerator": {"field": "editCount", "agg": "sum"}, "denominator": {"field": "storePunchVolume", "agg": "sum"}, "scale": 1000, "comparator": "gte", "min_denominator": 500}',
  28, 'store', '{"default": 2.5}', 3, 1, 'medium', true,
  '{"LABOR-002"}', '{}',
  '["a store going through a POS/time-clock hardware issue that week, needing more corrections than usual", "a new-hire training week with more punch mistakes needing correction", "a manager newly assigned to this store absorbing a backlog of the PRIOR manager''s unedited punches"]',
  'Compare this manager''s edit volume against their own store''s punch volume for the window, and check whether the edits cluster on one employee (a possible LABOR-002 overlap) or are spread evenly across the crew (more consistent with a system/training issue than a targeted pattern).',
  'owner question 2026-10-12 ("...in any type of pattern?"); memory/plan-security-loss-prevention.md §2.4/§2.4a', 1, false
)
on conflict (tenant_id, rule_id) do nothing;
