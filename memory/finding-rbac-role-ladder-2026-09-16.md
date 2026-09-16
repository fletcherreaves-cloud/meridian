---
name: finding-rbac-role-ladder-2026-09-16
description: "RBAC audit — CLAUDE.md's documented 8-tier ladder doesn't exist; real DB has 9 different role ids; found and fixed 8 live bugs from the mismatch"
metadata:
  node_type: memory
  type: finding
---

## RBAC audit, 2026-09-16 — ahead of onboarding a second operator

Part of a broader distribution-readiness pass. A background research agent was asked to map how
RBAC actually works today (not how CLAUDE.md said it worked) — read-only investigation, no code
changes on its own pass. It found the documented role ladder was simply wrong, and that the
mismatch had already produced live bugs.

### The core finding

CLAUDE.md's RBAC table (now corrected in place) documented an 8-tier ladder: Developer / Admin /
Owner / VP / DO / Supervisor / GM / Office Staff. **None of `Developer`, `Supervisor` (as spelled),
or `Office Staff` are real `profiles.role` values.** The live DB CHECK constraint
(`supabase/schema.sql`) and `src/engine/permissions.js`'s `DEFAULT_ROLES` (which agree with each
other) allow exactly: `admin`, `owner`, `vp`, `do`, `om`, `area_supervisor`, `gm`, `sm_am_dm`,
`manager` — 9 ids, introduced by dispatch #148's 7-rung review-hierarchy ladder plus two
pre-existing system roles (`admin`, `manager`). `admin` and `owner` are both `level:1` (top tier,
bypass all permission checks) — `owner` is a distinct, real, equally-privileged role, not an alias
that collapses into `admin`.

This one repo has run under a single live account (role `admin`, per the app-wide default) since
launch. Every code path written for "Developer" or the pre-#148 "Supervisor" spelling has never
been exercised by a real login of any other kind — which is exactly how these went unnoticed.

### Live bugs found and fixed (all client-side, all opportunistically corrected in the same pass)

1. **`management.js`'s "🛠 Dev" tab** — gated `userRole==='developer'`, which can never be true.
   Never rendered for anyone, including the real owner's own account. Fixed to
   `userRole==='admin'||userRole==='owner'` (same fix applied to the adjacent "🗄 Data" tab, which
   had the same dead half of its OR condition).
2. **`task-queue.js`'s `isDev`** — read `settings?.role`, a field that has never existed on the
   app-wide UI-settings object (`DEF_SETTINGS`). Always `false` for everyone, silently disabling
   Feature Request `dev_notes` editing for every user including the real admin. Fixed to read the
   real `userRole` prop (which had to be threaded through from `App.js`'s `TaskQueuePanel` call
   site — it was never passed at all). Covered by a new render test
   (`task-queue-role-fix.test.js`) exercising admin/owner (editable) vs manager (read-only).
3. **`App.js`'s beta-mode default** — `data.role !== 'developer'` was always true, so every
   first-time login on a fresh device (including the owner's) defaulted Test Kitchen to hidden,
   not just non-owner logins as the comment claimed. Fixed to check `admin`/`owner`.
4. **`security-panel.js`'s `securityPanelAccess()`** — checked the literal string `'supervisor'`
   (pre-#148 spelling) and excluded `'owner'` entirely. A real `area_supervisor`- or `owner`-role
   profile would be denied the Security panel. Its own inline duplicate check inside the
   permission-state effect had the same bug (now calls the corrected exported function instead of
   re-deriving the logic). The matching `security_findings` RLS policy had the identical stale
   string — corrected in `supabase/schema-security-findings-role-fix.sql` (⚠️ pending: owner needs
   to run this SQL file).
5. **`security-panel.js`'s bulk-reveal gate** — dispatch #50's own comment says the frictionless
   tier is "Developer/Admin/Owner," but the code only checked `'admin'`. A real owner-role profile
   was excluded from a capability its own documented intent said it should have. Fixed to
   `admin||owner`; added a matching test.
6. **`sage-chat/index.ts`'s tone-tuning line** — checked `scope.role === 'supervisor'` for
   multi-store framing. Cosmetic-only (SAGE's real data scoping is via `accessible_locs`, not this
   string), but a real area-supervisor caller got single-store-manager tone/framing instead of the
   intended patch-level framing. Fixed to `'area_supervisor'`.
7. **`sage.js`'s `canShare`** and **`forms-panel.js`'s `isPrivileged`** — both checked
   `'admin'||'developer'`/`'admin'` only, excluding `owner` from a stated "Developer/Admin/Owner"
   tier. Fixed both. The real enforcement for SAGE prompt sharing is a DB trigger
   (`sage_prompts_guard`, `schema-sage-prompts-sharing.sql`), which had the identical
   `('admin','developer')` stale pair in three places — corrected in
   `supabase/schema-sage-prompts-role-fix.sql` (⚠️ pending: owner needs to run this SQL file).

### Not a bug, but worth knowing

- **`hasPermission()` fails closed on an unrecognized role** (returns zero permissions, not
  "everything") — the safe direction, left as-is.
- **`shell.js`'s `can = perm || (() => true)` fallback fails OPEN** if `perm` is ever omitted.
  Currently inert (`App.js` always passes `perm`), but it's the one fail-open point in an
  otherwise fail-closed system — flagged with a comment at the call site, not changed, since
  changing behavior here wasn't asked for and the current wiring is safe.
- **New-signup default role is `manager`** (DB column default + `handle_new_user()`) — a real,
  fairly restrictive tier (no `analytics.district`/`.forecasting`/`.ai`/`.upload`/`.settings.*`).
  This is what a second operator gets before the owner manually assigns them a role via Admin
  Panel — not a bug, just the practical starting point to know about.
- **Two tables** (`qsr_daily_activity` raw, `store_vlh_config`) get their store-level scoping from
  a *different* migration (`schema-multitenant-phase2-rls.sql`, tenant_id-only) than the 51-table
  `my_locs()` array in `schema-rls-phase2-loc.sql` — not independently re-verified this pass,
  worth a live check before relying on it for those two specifically.

### The one thing that matters most and was NOT fixed this pass

**RLS store-level scoping (`accessible_locs` → `my_locs()`, 51 tables) has never been exercised
end-to-end with a real restricted account.** Per `memory/finding-rls-phase2-already-installed-
2026-08-23.md`, the mechanism was structurally confirmed live on 2026-08-23, but both real
profiles at that time had `accessible_locs = NULL` (unrestricted) — the scoping predicate was a
no-op for everyone. Creating a real test profile with a non-null `accessible_locs` and confirming
scoping holds across more than one panel needs a live Supabase Auth test user, which touches the
production auth system — flagged to the owner rather than done unilaterally. This is the
single highest-value verification before treating the app as safe for a real second operator with
a restricted role.

### Pending owner action

- ✅ **DONE (owner-confirmed 2026-09-16)** — `supabase/schema-security-findings-role-fix.sql` and
  `supabase/schema-sage-prompts-role-fix.sql` both run. Not independently re-verified this session
  (no live DB access to confirm the policies/trigger actually changed) — re-check live if a
  `security_findings` or `sage_prompts` RLS question comes up again.
- Decide whether to authorize a throwaway restricted-role test account for live RLS verification
  (still open — the single highest-value item above)
