-- ═══════════════════════════════════════════════════════════════════════════════
-- security_findings RLS role-check correction (RBAC audit, 2026-09-16)
--
-- The original "security_findings: gated read" policy (schema-security-findings.sql)
-- checked `get_my_role() in ('admin', 'supervisor')`, on the assumption (from an
-- earlier, pre-dispatch-#148 CLAUDE.md draft) that profiles.role only carried 3 real
-- values (admin/supervisor/manager). The live profiles_role_check constraint has
-- carried 9 real ids since dispatch #148 -- 'area_supervisor' (not 'supervisor'), plus
-- 'owner' as a second level-1 (top-tier, same as admin) role. A real area_supervisor-
-- or owner-role profile could never pass this check before, even though
-- src/views/security-panel.js's own client-side gate (securityPanelAccess()) is meant
-- to match it exactly -- that function had the identical stale check and is corrected
-- in the same dispatch as this migration.
--
-- Currently dormant: the one live profile is role='admin', so this has never actually
-- denied a real user. Run this alongside the client-side fix landing in the same PR,
-- not urgently ahead of it -- there is no live account this protects against being
-- wrongly admitted or wrongly denied yet.
-- ═══════════════════════════════════════════════════════════════════════════════

drop policy if exists "security_findings: gated read" on public.security_findings;
create policy "security_findings: gated read" on public.security_findings
  for select using (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    and (
      get_my_role() in ('admin', 'owner', 'area_supervisor')
      or (
        get_my_role() = 'manager'
        and coalesce((select (data->>'enabled')::boolean from public.org_config where key = 'gm_identity_reveal_enabled'), false)
      )
    )
  );
