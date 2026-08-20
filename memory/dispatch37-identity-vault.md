# Dispatch #37 — Security build: identity-vault architecture (Direction B)

**⚠️ Post-merge security fix, same day (2026-08-20) — read
[incident-reveal-rpc-null-role-bypass-2026-08-20.md](incident-reveal-rpc-null-role-bypass-2026-08-20.md)
before touching `reveal_employee_identity()`.** The version described below and originally shipped
in `supabase/schema-identity-vault.sql` had a role-gate bug (a `NULL`-role caller — i.e. anonymous
— fell through the `IF/ELSIF` untouched and reached the name lookup) — found and fixed live the
same day, before any confirmed exposure. The current schema file already has the fix; this
document's function listing below is otherwise still accurate.

2026-08-20. `memory/dispatch-37.md`, implementing the owner's 2026-08-20 Direction B decision
(`memory/plan-security-pii-architecture-2026-08-19.md` §4) and the access-tier/evidence-grade
decisions (`memory/plan-security-loss-prevention.md` §5). Lands before Phase 1 per the owner's
own reasoning: Phase 1 is the first thing that will write new employee-attributed risk data, and
it should write tokens from day one rather than migrate plaintext later.

## The real finding that shaped every RLS/RPC decision

Verified directly against `supabase/schema.sql:13`, not assumed from CLAUDE.md: `profiles.role`'s
check constraint allows exactly `'admin' | 'supervisor' | 'manager'`. CLAUDE.md's documented
8-tier RBAC (Developer/Admin/Owner-OO/VP/DO/Supervisor/GM/Office Staff) is not implemented at the
DB level — `memory/qsrsoft-rbac-and-permissions.md` independently frames the fuller ladder as a
future reference model, not something live. Every role check in `schema-identity-vault.sql` uses
the three real values only — never `'do'`/`'vp'`/`'gm'`/`'owner'`/`'developer'`, which would
silently never match.

## What was built

**`supabase/schema-identity-vault.sql`** — two new tables, additive only, does NOT touch
`audit_rows`' existing `(loc,date,emp)` PK or the `emp` column (dispatch #35's own decision to key
on name for manual/auto continuity stands unchanged; migrating the PK to be token-keyed is a
separate, later decision, not this one).

- **`employee_identity_vault`** — `id uuid` IS the token (no second derived value, per the
  NIST-sourced guidance the research cited: a token must carry no embedded information).
  `unique(tenant_id, employee_name)`. **Zero RLS policies** — no select/insert/update/delete for
  any role via the normal API. The only access is through the two SECURITY DEFINER functions
  below, which see the table regardless of the absent policies (the same bypass-RLS-on-tables-it-
  owns mechanism `get_my_role()` already relies on for reading `profiles`, `schema.sql:87`).
- **`identity_reveal_log`** — append-only, evidence-grade per the owner's own 2026-08-20 decision
  (`plan-security-loss-prevention.md` §5 point 1: *"I kind of think we need to retain for future
  recollection... one that keeps reappearing becomes more focused"* — retention is load-bearing
  for the cross-case-recurrence mechanism, not a compliance afterthought). Indefinite retention,
  no TTL/cleanup job. Admin-read-only SELECT policy (oversight of who looked up whom, including
  supervisors'/managers' own reveals); **no insert/update/delete policy at all** — every write
  goes through `reveal_employee_identity()`'s definer context, so nobody, including an admin
  through the normal API, can edit or remove an entry.
- **`audit_rows.emp_token`** — one new nullable column, `references employee_identity_vault(id)`.

**`get_or_create_employee_token(p_employee_name text)`** — SECURITY DEFINER RPC, the shared write
path. Atomic `INSERT ... ON CONFLICT (tenant_id, employee_name) DO UPDATE ... RETURNING id`
(handles the lookup-or-create race in one statement). Never returns `employee_name` — only ever a
token — and only accepts a name the caller already has, so it discloses nothing new; safe to
expose broadly (default PUBLIC execute, matching this repo's existing convention of relying on
internal logic rather than explicit grants for lower-sensitivity functions).

**`reveal_employee_identity(p_token uuid, p_reason text)`** — SECURITY DEFINER RPC, the ONE path
to a real name. Explicit `revoke ... from public` / `grant ... to authenticated` — unlike every
other function in this repo, warranted because the dispatch itself frames this as "the single
most sensitive piece of this whole build," belt-and-suspenders on top of the internal role check.
Logic:
1. Reject an empty/null reason outright.
2. `admin`/`supervisor` → always allowed (owner's 2026-08-20 decision — **a real, intentional
   divergence** from the existing DO-and-above disclosure policy elsewhere in Meridian
   (`project-sage-knowledge-grounding.md`), scoped specifically to this identity-reveal
   mechanism, not a blanket policy change).
3. `manager` → allowed only if `org_config.gm_identity_reveal_enabled` (jsonb `{"enabled":
   true}`) is true. **Explicitly flagged as a placeholder, not a confirmed design**: the owner's
   "GM's should optionally be able to" didn't specify optional *per what* — this is the cheapest
   safe default (one org-wide flag), very likely not exactly what was meant, and should be
   revisited once someone actually wants to configure it (per-case? per-store? DO-granted —
   except "DO" isn't a real role today).
4. Anything else → rejected.
5. Look up the name by token+tenant; log the reveal to `identity_reveal_log` **before** returning
   the name (so a reveal is recorded even if the caller's client crashes right after); raise with
   no data on any failure.

**`src/engine/identity-vault.js`** — `getOrCreateToken(supabase, name)` / `tokenizeRows(supabase,
rows, empField)`, the shared JS write-path helper. Lives in `src/engine/` following this repo's
own established convention for logic shared between a `scripts/*.mjs` pull and browser `src/`
code (verified via `grep`: `scripts/qsrsoft-employee-roster-pull.mjs` already imports
`src/engine/people-reports.js`, `scripts/lifelenz-pull.mjs` already imports
`src/engine/lifelenz-shift-jobs.js` — this is not a new pattern). `tokenizeRows()` batches to ONE
RPC call per **distinct** employee name in a row batch, not one per row.

**Wired into both write paths**:
- `scripts/qsrsoft-register-audit-pull.mjs`'s `saveAuditRows()` — calls `tokenizeRows()`,
  populates `emp_token` alongside `emp` on every row.
- `src/lib/supabase.js`'s `saveAuditRows()` (the manual-upload path, anon-key client) — same
  pattern. This is the path the dispatch specifically flagged as needing "its own RLS-compatible
  insert path" onto the vault, since the zero-select-policy design still needs to let an
  authorized uploader *create* a vault entry — resolved by routing through the RPC rather than
  reasoning about a permissive insert policy from an anon-key client.
- `src/lib/supabase.js`'s `loadAuditRows()` — maps the new `emp_token` column through as
  `empToken`.

**`scripts/backfill-identity-vault.mjs`** — new, idempotent one-time backfill. Pages through
`audit_rows` collecting every distinct `emp` name still missing a token (paginated past the
1000-row cap, same convention as every other loader in this repo), resolves tokens via the same
`tokenizeRows()` helper, then updates existing rows. Safe to re-run — only ever touches
`emp_token IS NULL` rows. **Owner needs to run this against live Supabase** — same as every other
`schema-*.sql` file in this repo, not something this session can execute.

**`src/utils/register-audit.js`'s `analyzeRegisterAudit` retrofit**: `e.id` is now `e.empToken`
(falls back to `'Unknown'` only for rows that predate the backfill). The internal grouping key
(`loc+'::'+r.emp`) stays on the raw name — an implementation detail, never assigned onto the
returned object. **The returned employee objects carry no plaintext name field anywhere** — a
caller that needs the real name calls `reveal_employee_identity()` with the token, deliberately,
logged. `.name` on the returned object is unchanged — it was always the STORE name
(`STORE_NAMES[loc]`), not personnel data.

## A real conflict found and flagged, not silently resolved either way

Before touching `analyzeRegisterAudit`, checked every consumer of `ds.empRisk`
(`analyzeRegisterAudit`'s output) rather than assuming "the one place every consumer reads from"
(the dispatch's own, narrower framing). Found `src/views/store-analytics.js`'s
`RegisterAuditNarrative` panel reads `e.emp` directly at **9 sites** — 4 narrative-sentence
templates, 4 table-column cells, and the AI-insight prompt builder — to display real employee
names today, live, in a shipped panel.

Stripping `.emp` from `analyzeRegisterAudit`'s return value (exactly what the dispatch asks for)
means those 9 sites now render `'Unknown'`/`'?'` instead of a name. This is a genuine tension
between the dispatch's explicit, deliberate instruction and CLAUDE.md's "never break working
features" standing rule. Resolved by implementing the retrofit exactly as specified — **this is
not accidental breakage the standing rule is meant to catch; it is the direct, anticipated,
owner-authorized cost of the architecture just built.** `plan-security-pii-architecture-
2026-08-19.md` §4 names the "blind mode" bias-reduction property as an explicit benefit of
Direction B — a panel defaulting to showing a token instead of a name is the mechanism working,
not it failing. Patching those 9 sites to silently re-resolve every name un-gated (the tempting
quick fix) would defeat the entire logged-reveal architecture this dispatch exists to build, and
"no UI in this dispatch" is the dispatch's own explicit scope boundary — a reveal button is
future panel work.

**What this means in practice, right now**: the panel does not crash, and continues to rank/sort/
flag employees correctly (risk scoring operates on the token exactly as well as it did on the
name). It just can't show *who* until a follow-up dispatch wires a "reveal" button into those 9
sites, calling `reveal_employee_identity()` with a required reason, per-click. **Recommending
that as the next dispatch in this sequence** — this is flagged here explicitly rather than buried,
since a Supervisor/GM opening this panel tomorrow will notice immediately.

## Verification approach (matches dispatch #35/#36's pattern — no live Supabase access)

- `getOrCreateToken()`/`tokenizeRows()` — fixture-tested against a mocked `supabase.rpc()`:
  correct args passed, correct return, null (never throw) on a missing client/empty name/RPC
  error, and the exactly-once-per-distinct-name batching behavior.
- `analyzeRegisterAudit`'s retrofit — fixture-tested exactly like its existing units-contract
  coverage: `e.id` is the token, `JSON.stringify(e)` never contains a name that was passed in,
  correct `'Unknown'` fallback, correct first-non-null-token-across-a-group behavior for a
  pre-backfill gap.
- **Not verifiable from this sandbox, same as every prior dispatch in this sequence**: the two
  RPCs themselves are live Postgres functions behind RLS/`SECURITY DEFINER` — the role-gating
  logic (admin/supervisor always, manager gated on the flag, everyone else rejected) needs either
  a real Supabase session or `pgTAP`-style SQL tests (checked: this repo has neither set up) to
  confirm it behaves as specified. An owner or a session with live Supabase access needs to run
  `schema-identity-vault.sql`, then exercise `reveal_employee_identity()` as each of the three
  real roles before this is trusted.
- The backfill script needs the owner to run it against live Supabase — not something this
  session can execute, same pattern as every `schema-*.sql` file.

## Verified

- `node --check` clean on both modified/new `.mjs` files; confirmed both import cleanly without
  Supabase env vars set (no new module-scope crash introduced).
- 28 new fixture tests (`identity-vault.test.js`, `register-audit-identity.test.js`) —
  1630/1630 full suite passes (28 new, up from dispatch #36's 1618).
- `npm run build` clean; entry chunk 510.16 KB → 510.40 KB gzip (well within the 850 KB budget,
  337.7 KB of headroom remaining).

## Explicitly not in this dispatch

Migrating `audit_rows`' PK/`emp` column to be token-keyed. Any UI (the reveal button flagged
above, a blind-mode toggle). Phase 1's actual rules or Phase 4's evidence-chain mechanism —
this dispatch only builds the identity layer both will sit on top of. Refining the "GM
optionally" mechanism beyond the flagged org-wide placeholder. Any change to
`security_rules`/`security-baselines.js`/`security-rules.js` (Phase 0b, dispatch #36) — untouched.

## What's needed to close this out for real

Owner runs `supabase/schema-identity-vault.sql` against live Supabase, then
`scripts/backfill-identity-vault.mjs`. A session with live Supabase access should exercise
`reveal_employee_identity()` as each real role (admin/supervisor/manager, with the org_config
flag both on and off) to confirm the gating logic behaves as specified before Phase 1 or a
reveal-UI dispatch builds on top of it.
