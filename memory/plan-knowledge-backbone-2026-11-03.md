# The knowledge backbone — refining memory/ + sage_memory_kb, and the product/tenant split

**Folds into task #70** (multi-org/multi-user readiness). Owner, this session: "We need to refine
our memory file... supercharge it and give it the backbone it needs while keeping it versatile
enough to continue growing... we need to sort this out and find a way to differentiate it
[product vs. tenant knowledge]." This is that spec.

**Status: §3's mechanism APPLIED (owner-approved 2026-11-04).** `scope` column defined in both
`supabase/schema-sage-memory-kb.sql` (fresh deployments) and `supabase/schema-sage-memory-kb-scope.sql`
(the ALTER an already-deployed instance needs — **owner action required**, DDL is never run by an
agent session, see that file). `scripts/sage-memory-ingest.mjs` reads a `scope:` frontmatter tag
(defaults to `'tenant'`, the safe direction, for every file that doesn't have one — i.e. the whole
pre-2026-11-04 corpus keeps ingesting exactly as before, nothing skipped). `search_project_memory`
(sage-chat/index.ts) now returns a row when it's either the caller's own tenant (any scope) or
explicitly `scope='product'`. **What's still open, and a real ordering requirement:** (a) the owner needs to run
`schema-sage-memory-kb-scope.sql` in the Supabase SQL editor before `scope` exists as a real
column on the live table. **This has to happen before `sage-chat` is next redeployed** (`supabase
functions deploy sage-chat --no-verify-jwt`) — the updated `search_project_memory` query now
references `scope` unconditionally, so deploying the new Edge Function code against a table that
doesn't have that column yet would break memory search outright (a real SQL error, not a graceful
no-op) until the migration runs. Nothing is at risk from merging this code change itself — Edge
Function deploys are a separate, manual step in this repo (confirmed: no CI workflow deploys
`supabase/functions/*`), so `main` can safely hold this code before the SQL has run; just don't
run the deploy command until the migration is applied first. (b) §4's backlog-classification of
the existing ~30 ingested files is still deliberately NOT done — no file carries `scope: product`
yet, so nothing is actually shared across tenants today, by design, until someone tags a file.

## 1. What's actually there today (measured, not assumed)

I went back and checked the real schema/code before designing anything new — my own earlier
answer in this conversation (framing the product/tenant split as entirely unbuilt) turned out to
be half wrong, and it's worth recording precisely what is and isn't true:

- **`sage_memory_kb` already has `tenant_id` + real RLS policies** (`supabase/schema-sage-memory-kb.sql`):
  `tenant_select`/`tenant_insert`/`tenant_update`/`tenant_delete`, all `using (tenant_id =
  public.current_tenant_id())`. The schema's own comment already anticipated exactly this need —
  written as "defense in depth for any future non-service-role reader."
- **But the actual reader bypasses it.** `sage-chat/index.ts`'s `search_project_memory` tool
  queries through `createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)` — the service-role client,
  which bypasses RLS entirely — and had **no `tenant_id` filter of its own** in the query. So the
  defense-in-depth the schema comment counted on was never actually exercised by the one reader
  that exists. **This is now fixed** (same commit as this doc): `profiles.tenant_id` is resolved
  alongside `role`/`accessible_locs` in the existing auth block, threaded through `runTool()`, and
  the query adds `.eq('tenant_id', tenantId)` explicitly. A no-op today (one tenant,
  `00000000-0000-0000-0000-000000000001`, confirmed live), but it closes the actual gap before a
  second tenant's data could ever land in the same table and leak across.
- **A second, separate axis already exists and is unrelated: `sensitivity`** (`'open'` |
  `'restricted'`), gating personnel-adjacent content by the CALLER's role within one org
  (`qualifiesForRestricted`/`rowVisible` in `memory-kb.js`). This is NOT the product/tenant split
  — it's orthogonal, stays exactly as-is, and should not be conflated with what follows.
- **What genuinely does NOT exist yet**: any notion of "is this piece of knowledge generic
  product documentation (safe for every tenant) or this-operator's proprietary operational
  knowledge (never safe for another tenant)." Every ingested row today is implicitly "this
  tenant's," because there's only one tenant — the distinction has simply never had to be made.

## 2. The real risk, stated precisely

`scripts/sage-memory-ingest.mjs` ingests `memory/*.md` files into `sage_memory_kb` wholesale
(minus files with no frontmatter classification, which are excluded entirely — see that schema's
own comment). Those files mix two fundamentally different kinds of content:

- **Generic product knowledge** — how a QSRSoft term works, how a Meridian panel computes
  something, the 4am business-day boundary, general forecasting methodology. Safe, even
  valuable, to share with every future tenant — it's what makes SAGE smart on day one for a new
  operator, at zero marginal cost.
- **This operator's proprietary knowledge** — specific coaching notes on named people, specific
  vendor friction, specific financial figures, specific district politics, specific store
  nicknames and history.

Today's ingest makes no distinction. If a second tenant onboarded tomorrow and their SAGE
instance (correctly, now) only reads tenant_id-scoped rows, they'd see NOTHING from this
operator's memory corpus — including the generic product knowledge that should have been free to
share. The current state is actually the opposite failure from what I described earlier in this
conversation before measuring: not "wide open leak," but "the tenant fence is real and about to
make SAGE dumber for every new tenant than it needs to be," because nothing is marked as safe to
cross that fence.

## 3. The fix: a `scope` classification, orthogonal to `sensitivity`

Add one more required column to `sage_memory_kb`, alongside the existing `sensitivity` check:

```sql
alter table public.sage_memory_kb
  add column scope text not null default 'tenant' check (scope in ('product', 'tenant'));
```

- **`'product'`** — generic, reusable knowledge. Ingested once, into a shared/product tenant
  record (or simply exempted from the tenant_id filter — see §5's open question), reachable by
  every tenant's SAGE.
- **`'tenant'`** — this operator's own proprietary operational knowledge. Stays tenant_id-scoped
  exactly as the fix in §1 already enforces. This is the DEFAULT for anything not explicitly
  classified `'product'` — fail toward privacy, not toward sharing, matching this table's existing
  "fail closed" convention for `sensitivity`.

Classification happens at ingest time, in `scripts/sage-memory-ingest.mjs`, via the SAME
frontmatter mechanism that already decides a file's `sensitivity` (so authors — today, the owner;
later, possibly other operators writing their own memory files — tag a file once, at the top, the
same way they already must for `sensitivity`). A reasonable starting rule for an UNCLASSIFIED
file: default `'tenant'` (safe direction), same as an unclassified `sensitivity` file is excluded
from ingestion entirely today.

## 4. A first pass at sorting the EXISTING corpus

This repo's `memory/` directory is large (125+ files per `MEMORY.md`'s own drift-check). Most of
it is quite plainly tenant-specific by its own content — anything with a real store name, a real
person's name, a specific dollar figure, or an owner decision about THIS district's operations.
A genuinely generic slice exists too: the files that explain HOW something in the app works
mechanically (the 4am boundary, DAR hour_slot mapping, the Simple-Models backtest methodology,
RBAC architecture) rather than WHAT this operator decided to do with it.

**Not attempting to hand-classify 125 files in this pass** — that's real, deliberate work
(possibly LLM-assisted triage followed by a human spot-check, given the stakes of getting this
wrong in either direction), and belongs to whenever a second tenant's onboarding is actually
imminent, not speculative work today. What belongs in THIS plan is the mechanism (§3) and the
rule going forward (§5) — so the backlog of 125 files is a bounded, one-time sorting job whenever
it's needed, not a permanently-growing one.

## 5. Going forward — the rule, and what "versatile enough to keep growing" means

**The rule (apply from today onward, no retrofit needed for files written before this):** every
new `memory/*.md` file gets a `scope:` frontmatter tag the same way it already needs a
`sensitivity:` tag for KB ingestion eligibility. Writing it is a one-line habit, not a project.

**What makes the backbone versatile rather than brittle** — three properties worth being
deliberate about, since "keep growing" is exactly where ad hoc systems rot:

1. **Classification lives in the DATA, not in a separate index someone has to remember to update.**
   `scope`/`sensitivity` as columns on the row itself (not a side table mapping filenames to
   tags) means the classification travels with the content through every future refactor —
   consistent with how this table already treats `sensitivity`, and with `MEMORY.md`'s own
   drift-check script philosophy (verify, don't trust the habit).
2. **The search tool's filter is structural (SQL `WHERE`), not prompt-level.** Exactly the
   existing `sensitivity` pattern (`qualifiesForRestricted` gates the QUERY, not just what the
   model is told) — `scope` should follow the identical shape: a caller's tenant_id determines
   which `'tenant'`-scoped rows are visible; `'product'`-scoped rows are visible to everyone,
   enforced at the query, never by a system-prompt instruction the model could be talked out of.
3. **The corpus stays greppable and human-owned, not just machine-queryable.** `memory/*.md` is
   the source of truth; `sage_memory_kb` is a generated, chunked search index over it (per
   `sage-memory-ingest.mjs`'s own header). Nothing about this plan changes that relationship —
   SAGE's memory gets smarter by the SAME files a future session reads to pick up context, not a
   parallel system that drifts from them. This is already the right shape; the backbone work here
   is sharpening its edges (the scope split), not replacing its architecture.

## 6. How this connects to the "self-learning" conversation

This backbone is the literal, buildable version of "the system gets smarter from what it
processes" — see the chat answer alongside this plan for the full honest framing (the MODEL
doesn't learn; the KNOWLEDGE BASE does, because it's designed to accumulate and be re-read). The
next concrete lever past what's built today is turning the 🐞 Log feedback loop (a wrong SAGE
answer → Task Queue ticket → code fix) into a loop that ALSO updates `memory/`+`sage_memory_kb`
when the mistake was a knowledge gap, not a code bug — so "SAGE didn't know X" can't recur the
same way twice. Not built in this pass; flagged as the next real increment once the scope split
above ships and settles.
