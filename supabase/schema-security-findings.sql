-- ── security_findings — Phase 1 output table (dispatch #39) ─────────────────────────────────────
-- The rules registry (dispatch #36) and the identity vault (dispatch #37) exist; nothing yet
-- stores what a rule actually computed for a real employee. This is that table.
--
-- SUBJECT IS emp_token, NEVER emp (plaintext name) -- the single most important constraint in
-- this file. Direction B's whole point (dispatch #37) is that no new table introduces a second,
-- unlogged path to a plaintext name. A finding referencing emp_token is exactly as safe at rest
-- as audit_rows itself; a finding that stored emp directly would silently reopen the hole #37/#38
-- just closed.

create table if not exists public.security_findings (
  id               uuid             not null default gen_random_uuid() primary key,
  tenant_id        uuid             not null default '00000000-0000-0000-0000-000000000001',
  emp_token        uuid             not null references public.employee_identity_vault(id),
  loc              text             not null,
  rule_id          text             not null,
  window_start     date             not null,
  window_end       date             not null,
  value            double precision,                 -- the computed rate; null mirrors evaluateRule()'s
                                                       -- own honest-null contract (no exposure in window)
  threshold_used   double precision,
  pass             boolean,                           -- nullable -- never fabricate a verdict evaluateRule() itself declined to give
  baseline_context jsonb            not null default '{}',  -- {mean, stdev, n, values, ...} at evaluation time
  explanation      jsonb            not null default '[]',  -- array of {label, value, contribution, ...} -- plan §4's additive-breakdown shape, single-rule slice
  computed_at      timestamptz      not null default now(),
  foreign key (tenant_id, rule_id) references public.security_rules(tenant_id, rule_id)
);

-- Idempotent upsert target for the batch job: re-running today's window updates the same row
-- instead of duplicating it, same convention as every pull script's onConflict.
create unique index if not exists security_findings_upsert_key
  on public.security_findings (tenant_id, rule_id, emp_token, loc, window_start, window_end);

create index if not exists security_findings_emp_token_idx on public.security_findings (emp_token, computed_at desc);
create index if not exists security_findings_rule_idx on public.security_findings (rule_id, pass) where pass;

alter table public.security_findings enable row level security;

-- Gated read: the SAME access tier as reveal_employee_identity() (admin/supervisor always;
-- manager gated on org_config.gm_identity_reveal_enabled, the existing toggle -- not a second
-- one), deliberately NOT the general "any authenticated user" pattern most operational tables in
-- this repo use. Reasoning stated explicitly, not silently assumed: a token alone isn't PII, but
-- project-sage-knowledge-grounding.md's disclosure-gating policy is written around "a
-- named-employee risk-score view," and a small-store finding can be practically de-anonymizing
-- even in token form (a 4-person night crew with one flagged token isn't meaningfully anonymous
-- to whoever's looking at a panel). Starting conservative and loosening later on an explicit
-- owner decision is the safer default than the reverse.
drop policy if exists "security_findings: gated read" on public.security_findings;
create policy "security_findings: gated read" on public.security_findings
  for select using (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    and (
      get_my_role() in ('admin', 'supervisor')
      or (
        get_my_role() = 'manager'
        and coalesce((select (data->>'enabled')::boolean from public.org_config where key = 'gm_identity_reveal_enabled'), false)
      )
    )
  );
-- No insert/update/delete policy for any role -- every write comes from scripts/security-rules-
-- run.mjs's service-role key, which bypasses RLS entirely regardless of policies here. Matches
-- identity_reveal_log's own "writes are backend-only" pattern.

comment on table public.security_findings is
  'Phase 1 rule-evaluation output (dispatch #39). Subject is emp_token, never a plaintext name -- see dispatch37-identity-vault.md. Written only by scripts/security-rules-run.mjs (service role); read gated to the same tier as reveal_employee_identity().';
