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
-- ✅ MEASURED LIVE 2026-10-12 (service-role credential, direct PostgREST reads + the real shipped
-- functions run against the actual fetched rows -- not reasoned about). Window actually available:
-- 2026-10-08..2026-10-12 (5 days) across 25 of 27 stores -- lifelenz_punch_edits is brand new, so
-- this is a COLD-START snapshot, well short of the rules' own 28-day design window. Results below
-- are real for what they measured; re-measure again once ~28 days of real history exist (no sooner
-- than ~2026-11-09) before leaning on them as a steady-state baseline.
--
--   LABOR-001 (ghost employee): 321 edit rows, 129 distinct (loc,geid) subjects. Cross-vendor
--   geid join (lifelenz_punch_edits.geid -> qsr_employee_tenure.geid) hit 121/129 = 93.8% -- the
--   open assumption HOLDS; LifeLenz and QSRSoft geids ARE the same identifier space for this org,
--   for the large majority of subjects. 0/121 joined subjects carry a termination_entry_date at
--   all -- a clean, decided "no ghosts found" (everyone currently getting punch edits is, as
--   expected, an active employee), not a sign the mechanism is broken. 0/129 flagged. ✅ ACTIVATED.
--
--   LABOR-002 (self-approval): same 321/129. 0/129 flagged -- no employee self-approved their own
--   edit in this window. A believable clean result for a rare, deliberate event; mechanism runs
--   without error. ✅ ACTIVATED.
--
--   LABOR-003 (per-manager outlier edit rate): ❌ NOT ACTIVATED -- the `min_denominator: 500` this
--   migration originally shipped was an unmeasured guess, and the real numbers prove it unusable:
--   every one of 60 real (loc,manager) subjects' own summed punch-volume denominator fell in
--   [1, 193] (sorted, n=60: min 1, p10 3, median 46, p90 108, max 193) -- NOT ONE could ever clear
--   500, so the rule would sit at pass:null forever, exactly the "degenerate, not working" state a
--   pre-ship measurement exists to catch. Lowered to `min_denominator: 20` below (clears the
--   measured near-zero tail -- 9/60 subjects at <=4 -- without being aggressive), but this is
--   STILL a cold-start-window number, not a real 28-day one, and the store-baseline population
--   itself is dominated by the same thin-denominator noise (peer stdev ~200 against a mean ~110 --
--   wildly noisy, not a usable baseline yet). Re-measure this ONE rule's thresholds for real once
--   the window has matured; do not activate off this pass's numbers alone.

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
  'owner question 2026-10-12 ("...ghost employees on payroll or potential for fraudulent time clock entries..."); memory/plan-security-loss-prevention.md §2.4/§2.4a', 1, true
)
on conflict (tenant_id, rule_id) do nothing;

-- ACTIVATED 2026-10-12 after a live measurement (93.8% join hit rate, 0 false positives) --
-- see this file's own header. A no-op if the row already exists with active already set; this
-- UPDATE is what actually flips a row inserted earlier in an unactivated state (the INSERT's own
-- `on conflict do nothing` cannot, since it skips the whole row on conflict, updates included).
update public.security_rules set active = true, updated_at = now() where rule_id = 'LABOR-001';

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
  'owner question 2026-10-12 ("...fraudulent time clock entries being manually applied in any type of pattern..."); memory/plan-security-loss-prevention.md §2.4/§2.4a', 1, true
)
on conflict (tenant_id, rule_id) do nothing;

-- ACTIVATED 2026-10-12 after a live measurement (0/129 subjects flagged, a clean decided result,
-- mechanism runs without error) -- see this file's own header. Same idempotency note as LABOR-001.
update public.security_rules set active = true, updated_at = now() where rule_id = 'LABOR-002';

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
  '{"numerator": {"field": "editCount", "agg": "sum"}, "denominator": {"field": "storePunchVolume", "agg": "sum"}, "scale": 1000, "comparator": "gte", "min_denominator": 20}',
  28, 'store', '{"default": 2.5}', 3, 1, 'medium', true,
  '{"LABOR-002"}', '{}',
  '["a store going through a POS/time-clock hardware issue that week, needing more corrections than usual", "a new-hire training week with more punch mistakes needing correction", "a manager newly assigned to this store absorbing a backlog of the PRIOR manager''s unedited punches", "a cold-start measurement window (<28 days of real lifelenz_punch_edits history) producing an unreliable baseline -- see this file''s own header"]',
  'Compare this manager''s edit volume against their own store''s punch volume for the window, and check whether the edits cluster on one employee (a possible LABOR-002 overlap) or are spread evenly across the crew (more consistent with a system/training issue than a targeted pattern).',
  'owner question 2026-10-12 ("...in any type of pattern?"); memory/plan-security-loss-prevention.md §2.4/§2.4a', 1, false
)
on conflict (tenant_id, rule_id) do nothing;

-- STILL INACTIVE 2026-10-12 after measurement -- min_denominator corrected from the original,
-- unmeasured 500 (which 0/60 real subjects could ever clear) down to 20 (measured: real per-
-- subject denominator sums ranged 1-193, median 46, over a 5-day cold-start window). This UPDATE
-- exists so a row inserted earlier under the old broken value gets corrected even though the
-- INSERT above's `on conflict do nothing` would otherwise leave it stuck at 500 forever. Does NOT
-- set active=true -- re-measure this rule specifically once ~28 days of real history exist (no
-- sooner than ~2026-11-09) before activating it.
update public.security_rules
set logic_expression = jsonb_set(logic_expression, '{min_denominator}', '20'), updated_at = now()
where rule_id = 'LABOR-003' and (logic_expression->>'min_denominator')::numeric = 500;
