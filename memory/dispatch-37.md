# Dispatch #37 — Security build: identity-vault architecture (Direction B)

**Board (2026-08-20), at time of writing:** `main` is at the commit merging Phase 0b's SQL
confirmation. Phase 0a and 0b are both done; Phase 1 is unblocked but the owner explicitly chose
**to build this dispatch first** — read `memory/plan-security-pii-architecture-2026-08-19.md` §4
(the Direction B decision) and `memory/plan-security-loss-prevention.md` §5 (the Phase 4 gating
answers, since this dispatch's access-tier design has to be consistent with them even though
Phase 4 itself isn't being built yet) before starting.

**Why this goes before Phase 1, not after:** Phase 1 is the first thing that will write new
employee-attributed risk data. Building it against today's plaintext `audit_rows` shape means
migrating live personnel data later; building the vault first means Phase 1 can write tokens from
day one. This dispatch is deliberately scoped to make that true without touching Phase 1 itself.

---

## A real finding that changes how this must be built — read before touching RLS

**CLAUDE.md's documented 8-tier RBAC (Developer/Admin/Owner-OO/VP/DO/Supervisor/GM/Office Staff)
is not actually implemented.** Verified directly against `supabase/schema.sql`, not assumed:
`profiles.role` has a hard `check` constraint allowing exactly three values — `'admin'`,
`'supervisor'`, `'manager'`. `get_my_role()` (the `SECURITY DEFINER` function every RLS policy in
this repo calls) reads that same column. `memory/qsrsoft-rbac-and-permissions.md` (2026-07-28)
independently confirms this: it frames the fuller Developer/Admin/Owner/VP/DO/Supervisor/GM/Office
ladder as a **future reference model** for an unbuilt "RLS Phase 3 (PII)," not something already
live. Separately, `src/engine/permissions.js` has its own, different, client-side/localStorage
permission engine (`admin`/`area_supervisor`/`manager` role IDs, permission toggles, `org_config`-
synced) — this is a **third, unrelated system**, not the DB-level RBAC either.

**What this means for this dispatch:** when the owner said "Supervisors should be able to
identify employees, GM's should optionally be able to," that maps onto the **real** `profiles.role`
values — `supervisor` and `manager` (the DB role, which is the closest existing thing to "GM" —
confirm this mapping is still correct with the owner if there's any doubt, don't assume it
silently) — not onto DO/VP/GM/Office Staff strings that don't exist in the database. **Do not
write RLS or an RPC that checks for `'do'`, `'vp'`, `'gm'`, `'owner'`, or `'developer'` as
`profiles.role` values — they will never match, and the policy will silently fail closed (denying
everyone) or silently fail open, depending on how the check is written.** Use `get_my_role()`
returning `'admin'`, `'supervisor'`, or `'manager'`, exactly as every other RLS policy in this
repo already does.

---

## 1. Schema — two new tables, additive only

`supabase/schema-identity-vault.sql`, following this repo's `schema-*.sql` convention (owner runs
it manually against live Supabase, same as `schema-security-rules.sql`).

**`employee_identity_vault`** — the token ↔ real-name mapping. Per the AI research's own NIST-
sourced guidance (`plan-security-pii-architecture-2026-08-19.md` §1), the token must carry no
embedded information (no store number, no hint of identity) — use the row's own `id uuid` as the
token itself, not a second derived value:

```text
id            uuid          not null default gen_random_uuid() primary key   -- THIS is the token
tenant_id     uuid          not null default '00000000-0000-0000-0000-000000000001'
employee_name text          not null      -- the join key, matches audit_rows.emp exactly
created_at    timestamptz   not null default now()
unique (tenant_id, employee_name)
```

**RLS on this table: no direct `select` policy for any role, full stop.** The only way to read
`employee_name` is through the reveal RPC below, which logs the read as it happens. If a future
consumer needs `select` access, that is itself a design regression to flag, not to grant quietly.

**`identity_reveal_log`** — append-only, evidence-grade per the owner's own decision (§5, "yes,
build it evidence-grade now"):

```text
id            uuid          not null default gen_random_uuid() primary key
tenant_id     uuid          not null default '00000000-0000-0000-0000-000000000001'
person_token  uuid          not null references employee_identity_vault(id)
viewer_id     uuid          not null references profiles(id)
viewer_role   text          not null            -- snapshot of get_my_role() at reveal time
reason        text          not null            -- required, not optional -- see the RPC below
case_ref      text                              -- optional link to a future Phase 4 case; null today
revealed_at   timestamptz   not null default now()
```

**RLS: insert-only via the RPC's `SECURITY DEFINER` context, no direct client insert, no update
policy, no delete policy at all** — not "restricted to admin," genuinely absent, so nobody,
including an admin through the normal API, can edit or remove a reveal-log entry. That is what
"tamper-evident" means here without reaching for anything exotic. Retention is **indefinite**, per
the owner's own decision (§5) — do not add a cleanup job or TTL.

---

## 2. The reveal RPC — the one path to a real name

A single Postgres function, `reveal_employee_identity(p_token uuid, p_reason text)`, `SECURITY
DEFINER`:

1. Reject if `p_reason` is null or empty — a reveal without a stated reason doesn't get logged
   correctly and shouldn't be allowed to happen.
2. Check `get_my_role()`:
   - `'admin'` → always allowed.
   - `'supervisor'` → always allowed, per the owner's decision.
   - `'manager'` → allowed **only if** a per-tenant flag is on (see the placeholder design below).
   - anything else → reject.
3. Look up `employee_name` from `employee_identity_vault` by `p_token` (scoped to the caller's
   `tenant_id`).
4. Insert one row into `identity_reveal_log` (`viewer_id = auth.uid()`, `viewer_role =
   get_my_role()`, `reason = p_reason`, `person_token = p_token`) — this happens **before**
   returning the name, so a reveal is logged even if the caller's client crashes immediately after.
5. Return the `employee_name`, or raise an exception with no data if steps 2-3 fail.

**The "GM's should optionally be able to" design — explicitly a placeholder, not a confirmed
design, flag this back to the owner when it's built:** the owner's answer didn't specify optional
*per what* (a per-case toggle? a store setting? a DO-granted permission — except "DO" doesn't
exist as a role today, see above). The cheapest, safest default that doesn't foreclose a better
design later: a single `org_config` row (`key = 'gm_identity_reveal_enabled'`, boolean, default
`false`) that an admin/supervisor can flip. This is org-wide, not per-GM or per-store — **say so
plainly when this ships**, since it's very likely not exactly what "optionally" meant, and a
narrower mechanism (per-case, per-store) may be needed once someone actually wants to use it.

No UI in this dispatch — the RPC is callable from a future panel's "reveal" button; building that
button is not in scope here.

---

## 3. Retrofit the write path — additive, does NOT touch `audit_rows`' existing PK/`emp` column

**This is the highest-judgment call in this dispatch, made explicitly rather than left implicit:**
`audit_rows`' primary key is `(loc, date, emp)` with `emp` = the employee's plaintext name, and
that convention has 5+ months of manually-uploaded history plus the now-live Register Audit
auto-pull built on it (dispatch #35's own explicit decision to key on name, not ID, for exactly
this continuity reason). **Do not change that PK or rename/repurpose the `emp` column in this
dispatch** — that would be a live-data migration on real personnel history with real risk of
breaking the freshest-wins join between manual and auto rows, and it is not required to get
Direction B's actual benefit. The benefit Direction B is after — panels, SAGE tools, and any
export seeing a token instead of a name by default — lives at the **output/exposure layer**, not
the storage layer. Migrating `audit_rows` itself to be token-keyed is a real, separate, larger
decision to raise with the owner explicitly later, not something to fold in here.

**What this dispatch does instead:**

1. **Add one new nullable column**, `emp_token uuid references employee_identity_vault(id)`, to
   `audit_rows` (in the same `schema-identity-vault.sql` file, or a small follow-up — either is
   fine, just don't skip it).
2. **A shared helper**, `getOrCreateToken(supabase, tenantId, employeeName)` — look up
   `employee_identity_vault` by `(tenant_id, employee_name)`, insert if missing, return the `id`.
   This needs to be genuinely shared, not duplicated, between:
   - `scripts/qsrsoft-register-audit-pull.mjs`'s `saveAuditRows()` (the auto-pull path,
     server-side, service-role key).
   - `src/lib/supabase.js`'s `saveAuditRows()` (the manual-upload path, browser-side, anon key —
     this one needs its own RLS-compatible insert path onto `employee_identity_vault`, since the
     no-select-policy design above still needs to allow an authorized uploader to *create* a vault
     entry; check whether that needs its own narrow insert policy or should also route through a
     small RPC, don't just add a permissive insert policy without thinking about who can call it).
   Put this in a location both a `scripts/*.mjs` file and browser `src/` code can import, or
   accept a small, deliberate duplication if that's genuinely not possible in this codebase's
   module boundaries (server vs. browser) — check `scripts/lib/` vs `src/engine/` conventions
   before deciding, don't guess.
3. **Both write paths call the helper and populate `emp_token`** on every new row going forward,
   alongside the existing `emp` (name) column — both are written, nothing is removed.
4. **One-time backfill**: for every distinct existing `(tenant_id, emp)` already in `audit_rows`,
   call the same helper and populate `emp_token` on the existing rows. Write this as a small,
   idempotent script (`scripts/backfill-identity-vault.mjs` or similar) — safe to re-run, only
   fills nulls.

## 4. Retrofit the exposure layer — `analyzeRegisterAudit`

`src/utils/register-audit.js`'s `analyzeRegisterAudit`: today, `e.id = e.emp || 'Unknown'` — the
plaintext name, unmasked, is the record's identifier at the one place every consumer of this
function reads from. Change `e.id` to `e.emp_token` (falling back to `'Unknown'` only if a row
genuinely has no token, which should only happen before the backfill runs). **The internal
grouping key** (`loc+'::'+r.emp`, used to bucket rows by employee before scoring) **can stay on
`.emp`** — that's an internal implementation detail, not something exposed to a caller, and
changing it isn't necessary to get the privacy benefit. Do not expose `.emp` (the name) anywhere
in this function's return value once this lands — a caller that needs the real name calls the
reveal RPC with the token, deliberately, logged.

---

## Verification approach (matches dispatch #35/#36's pattern — no live QSRSoft access needed)

- `getOrCreateToken()`'s logic (get-vs-create, idempotency) is fixture-testable without live
  Supabase — mock the client, assert it inserts once and reads thereafter for the same name.
- `analyzeRegisterAudit`'s retrofit is fixture-testable exactly like its existing test coverage —
  assert `e.id` is now the token, not the name, and that no returned object contains a plaintext
  name field anywhere.
- **The RPC itself (`reveal_employee_identity`) cannot be meaningfully unit-tested from this
  sandbox** — it's a live Postgres function behind RLS. State this plainly rather than skip it
  quietly: verifying the role-gating logic (admin/supervisor always, manager gated on the flag,
  everyone else rejected) needs either a real Supabase session or `pgTAP`-style SQL tests if this
  repo has that tooling (check before assuming it doesn't). Flag this the same way dispatch #35
  flagged its own live-verification gap — an owner or a session with real Supabase access needs to
  confirm the RPC's role logic actually behaves as specified before this is trusted.
- **The backfill script needs the owner to run it** against live Supabase, same pattern as every
  `schema-*.sql` file — it's not something CI or this sandbox can execute.

## Explicitly not in this dispatch

- Migrating `audit_rows`' PK/`emp` column to be token-keyed — a real, separate, later decision.
- Any UI (a "reveal" button, a blind-mode toggle) — future panel work, not this dispatch.
- Phase 1's actual rules or Phase 4's evidence-chain mechanism — this dispatch only builds the
  identity layer both will sit on top of.
- Refining the "GM optionally" mechanism beyond the flagged org-wide placeholder — revisit with
  the owner once someone actually wants to configure it.
- Any change to `security_rules`/`security-baselines.js`/`security-rules.js` (Phase 0b) — untouched.
