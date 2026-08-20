-- ── Security / loss-prevention Rules Registry (dispatch #36, Phase 0b) ────────
-- memory/plan-security-loss-prevention.md §6 (schema) + §1 principle 7 ("rules live in a
-- registry, not hardcoded"). Column list is transcribed verbatim from §6 (snake_case for SQL).
--
-- Structural precedent is `org_config` (supabase/schema.sql) -- explicitly named in §6 as the
-- pattern to follow: "Matches this repo's existing pattern for tunable config... same idea, new
-- table." RLS shape below mirrors org_config exactly (authenticated read-all, admin/supervisor
-- write) with `tenant_id` added, since org_config predates that standing rule (CLAUDE.md: "Every
-- new persistent data type goes into Supabase... tenant_id + RLS"). This table holds DETECTION
-- LOGIC/THRESHOLDS, not personnel data -- the "DO and above" gating that applies to Register
-- Audit FINDINGS (memory/data-acquisition-shopping-list.md) is a separate, narrower concern about
-- individual employee scores and does not apply to this table.
--
-- No UI in this dispatch -- a rules-management panel is future scope. Interpreter:
-- src/engine/security-rules.js. Phase 1 (§2's actual cash-drawer-variance / peer-ranking rules)
-- is explicitly NOT this dispatch; the 3 rows this file seeds are ACTIVE=false test fixtures
-- proving the interpreter round-trips a real rule, not a Phase 1 delivery.

create table if not exists public.security_rules (
  id                    uuid             not null default gen_random_uuid() primary key,
  rule_id               text             not null,               -- e.g. "CASH-014", "INV-087"
  domain                text             not null,                -- cash | inventory | labor | deposit | segregation-of-duties
  subdomain             text,                                     -- e.g. "post-tender-void", "TvA-variance"
  method                text,                                     -- short name, matches plan §2's table entries
  description           text,
  data_required         jsonb            not null default '[]',   -- source tables/streams this rule reads, e.g. ["audit_rows"]
  logic_type            text             not null                 -- threshold | z-score | sequence | ratio | window-function
                          check (logic_type in ('threshold', 'z-score', 'sequence', 'ratio', 'window-function')),
  logic_expression      jsonb            not null,                -- declarative spec the interpreter executes -- see src/engine/security-rules.js header
  window_days           integer,                                  -- rolling period this rule evaluates over, in days
  baseline_type         text                                      -- personal | peer | store | network | none
                          check (baseline_type in ('personal', 'peer', 'store', 'network', 'none') or baseline_type is null),
  threshold             jsonb,                                    -- {"default": n} or {"default": n, "byLoc": {"0003708": n, ...}} -- tunable, per-location-overridable
  severity              smallint         not null check (severity between 1 and 5),   -- 1 informational -- 5 critical
  weight                double precision not null default 1,      -- contribution to composite risk score (Phase 2)
  confidence            text,                                     -- evidence-strength band this rule type typically produces
  opportunity_factor    boolean          not null default false,  -- does this rule need an access/authority check to fire meaningfully (§1 principle 3)
  corroboration_rules   text[]           not null default '{}',   -- other RULE_IDs that strengthen this one if co-occurring
  exoneration_rules     text[]           not null default '{}',   -- other RULE_IDs/checks that can reduce this one's confidence (§1 principle 4)
  false_positives       jsonb            not null default '[]',   -- known legitimate-explanation categories
  investigation_action  text,                                     -- what an investigator should do when this fires
  source                text,                                     -- which of the three research passes this rule traces to
  version               integer          not null default 1,
  active                boolean          not null default true,
  tenant_id             uuid             not null default '00000000-0000-0000-0000-000000000001',
  created_by            uuid             references public.profiles(id),
  created_at            timestamptz      not null default now(),
  updated_at            timestamptz      not null default now(),
  unique (tenant_id, rule_id)
);

create index if not exists security_rules_active_idx on public.security_rules (domain, active) where active;

alter table public.security_rules enable row level security;

drop policy if exists "security_rules: authenticated read" on public.security_rules;
create policy "security_rules: authenticated read" on public.security_rules
  for select
  using (auth.uid() is not null and tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

drop policy if exists "security_rules: admin/supervisor write" on public.security_rules;
create policy "security_rules: admin/supervisor write" on public.security_rules
  for all
  using (get_my_role() in ('admin', 'supervisor') and tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (get_my_role() in ('admin', 'supervisor') and tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

comment on table public.security_rules is
  'Loss-prevention/fraud detection Rules Registry (memory/plan-security-loss-prevention.md §6) -- rules are DATA, not code (§1 principle 7), so a threshold change or new rule is a row, not a deploy. Interpreted by src/engine/security-rules.js. Phase 1''s actual detection rules are not yet seeded ACTIVE here -- see that file''s header.';

-- ── Seed: 2 test-fixture rules from plan §2.1, ACTIVE=false ────────────────────────────────
-- These prove the interpreter round-trips a REAL rule end-to-end. They are fixtures for
-- dispatch #36's own tests (src/__tests__/security-rules.test.js), not a Phase 1 delivery --
-- ACTIVE=false so they don't read as "Phase 1 already shipped." Thresholds are the plan's own
-- first-guess numbers (§2.1), explicitly "to be tuned against this org's actual data."

insert into public.security_rules (
  rule_id, domain, subdomain, method, description, data_required, logic_type, logic_expression,
  window_days, baseline_type, threshold, severity, weight, confidence, opportunity_factor,
  corroboration_rules, exoneration_rules, false_positives, investigation_action, source, version, active
) values (
  'CASH-001', 'cash', 'drawer-variance', 'Cash drawer over/short rate',
  'Cash over/short dollars, normalized per $1,000 of drawer sales (memory/data-acquisition-shopping-list.md''s per-thousand convention) -- a raw dollar total ranks high-volume cashiers as riskiest purely for handling more cash.',
  '["audit_rows"]', 'ratio',
  '{"numerator": {"field": "cashOSDollar", "agg": "sum", "abs": true}, "denominator": {"field": "drawerSales", "agg": "sum"}, "scale": 1000, "comparator": "gte"}',
  28, 'personal', '{"default": 5}', 3, 1, 'medium', false,
  '{}', '{}', '["register malfunction", "new hire training week", "manager-verified bank error"]',
  'Pull the flagged employee''s drawer-count photos for the window and compare against the POS z-report.',
  'ChatGPT Security_Analytics_Session.md', 1, false
)
on conflict (tenant_id, rule_id) do nothing;

insert into public.security_rules (
  rule_id, domain, subdomain, method, description, data_required, logic_type, logic_expression,
  window_days, baseline_type, threshold, severity, weight, confidence, opportunity_factor,
  corroboration_rules, exoneration_rules, false_positives, investigation_action, source, version, active
) values (
  'CASH-002', 'cash', 'post-tender-void', 'POS over-ring rate',
  'POS overring count, normalized per 1,000 transactions -- an employee correcting more POS entry mistakes than peers, exposure-adjusted for how many transactions they actually rang.',
  '["audit_rows"]', 'ratio',
  '{"numerator": {"field": "posOverCnt", "agg": "sum"}, "denominator": {"field": "drawerGC", "agg": "sum"}, "scale": 1000, "comparator": "gte"}',
  28, 'peer', '{"default": 15}', 2, 1, 'low', true,
  '{"CASH-001"}', '{}', '["new POS rollout", "documented equipment malfunction", "training assignment"]',
  'Compare the employee''s overring rate against same-store peers over the same window before escalating.',
  'ChatGPT Security_Analytics_Session.md', 1, false
)
on conflict (tenant_id, rule_id) do nothing;
