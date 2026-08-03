# Meridian — Session Handoff

**As of:** 2026-08-03 · **Version:** v4.772 · **Branch:** `main` (clean, pushed, Vercel auto-deploys) · **Tests:** 636 passing

> This is a living handoff. If you're a fresh Claude Code session, read the **Resume Prompt** below, then `CLAUDE.md` → `memory/MEMORY.md` → `memory/master-plan-and-mandate.md` → `memory/project-multitenant-audit.md`.

---

## ▶ Resume Prompt (paste into a new Claude Code session)

```
Resume the Meridian BI project (McDonald's franchise ops analytics, ~27 stores,
owner/developer Fletcher Reaves). Read first, in order: CLAUDE.md, memory/MEMORY.md,
memory/master-plan-and-mandate.md, memory/project-multitenant-audit.md,
memory/notes-49-reports-and-print.md. We're at v4.772 on branch main (clean, pushed).

Standing mandate: work autonomously while I'm remote (through Thu Aug 6). Keep pressing
the task list AND productize Meridian for internal multi-operator rollout. Accuracy is
the bar — verified, defensible, dollar-weighted, never average averages, self-audit every
report; if a number can't be defended, don't ship it. Add logical items to the task list
as they surface. Before each change: npm run build (clean) + npx vitest run (636 green),
then commit + push (git push origin main — SSH key, Vercel auto-deploys), bump v4.xxx.
Commit trailer: Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>.

Where we are: just shipped Notes 49 (Calendar multi-month print v4.770 + My Reports
report-subscriptions/build-your-own One-Pager panels v4.771) and the Track-B multi-tenant
migration DRAFT (v4.772). I chose single-project + org_id RLS and asked you to prep the
migration SAFE PARTS ONLY — supabase/schema-multitenant-phase1.sql (additive) +
schema-multitenant-phase2-rls.sql (the flip, run last) + tenant loaders in src/lib/
supabase.js are drafted and reviewable but NOT run. Do NOT run the migration SQL, change
any live RLS, or do the broad store-registry / pull-script / SAGE refactor unsupervised —
those need my DDL runs + a throwaway-profile isolation test. Continue Track-B safe prep
and/or defensible Track-A backlog items (see TaskList + the two memory notes). Surface
owner-decision-blocked items rather than building them.
```

---

## TL;DR — current state

- **Notes 49 is done** (both items). **Multi-tenant migration is drafted** and pushed, awaiting my review + DDL runs.
- Nothing is half-built or broken. Build + 636 tests green at v4.772. Working tree clean.
- The next big arc is **productization** (offer Meridian to a 2nd internal operator). The **gate** is data isolation — drafted, not yet executed.

---

## Standing mandate (from 2026-08-02)

- Keep pressing the remaining list **and** shape Meridian into a product for other operators (internal for now).
- Work autonomously while I'm remote at the office ~daytime **Aug 3–6 (through Thu)**. I'm on MacBook (can run sessions) + phone (can't reach a running session) — hand off cleanly between sessions.
- **Accuracy is the bar:** verified, defensible, "stands up to any level of scrutiny." Dollar-weight aggregates, never average averages, self-audit.
- Add logical items to the task list as they come up; we work them together.
- I lean on you for defensible calls and am open to rollout ideas.
- **Safe without me:** accuracy-hardening, tests, docs, bounded backlog items that build+test clean, research fan-outs, anything reversible + traceable.
- **NOT without me:** destructive/irreversible actions on real data, anything needing a credential I must supply, changes to displayed numbers that can't be verified, broad risky refactors (live RLS, ripping the store registry out of constants.js, app-wide modal-X).

---

## Shipped this session

| Ver | What |
|---|---|
| **v4.770** | **Calendar multi-month print** (Notes 49 #90) — Print button gains a range selector: This month / 2 / 3 / 6 / 12 months, scoped to the current All/OK/FL/store filter, one agenda section per month, each kept to its own page. `printAgenda(months)` + `agendaForMonth(y,m)` in `src/features/calendar.js`. Verified in-browser. |
| **v4.771** | **My Reports / report subscriptions** (Notes 49 #91) — new `🗂 My Reports` panel (`src/views/report-subscriptions.js`): save reports + groupings (report × level/grouping All/OK/FL/patch/store × period × build-your-own One-Pager panel subset); one-click pre-scoped launch. One-Pager gained `initialScope/initialPeriod/initialPanels` props + a live Panels toggle bar (`ONEPAGER_PANELS` exported). Persistence: localStorage-first + Supabase mirror (`report_subscriptions`, RLS per-user, fails soft). Verified the full loop in-browser. |
| **v4.772** | **Track-B multi-tenant migration (DRAFTED)** — see next section. |

**Owner action already completed:** ran `schema-report-subscriptions.sql` → My Reports now syncs across devices. ✅

---

## The big arc: productization (Track B)

I ran a thorough **multi-tenant readiness audit** (full findings: `memory/project-multitenant-audit.md`).

**Verdict:** Meridian is architecturally **single-tenant** today. A second operator would be able to read your data and vice-versa. Why:
- **No `org_id`/tenant column on any of ~74 tables.** Isolation rests on per-user `accessible_locs`, and only ~5 tables even use it.
- **Most tables' RLS is `using(true)` or `auth.uid() is not null`** → any logged-in user reads every store's labor/sales/FOB/voice/rosters/targets/schedules/one-pagers.
- Store list, targets, org chart, and people (GM names/emails) are **hard-coded** in `constants.js` / `morning-brief.js`; SAGE bakes a copy of your store names into its deployed function and computes "district rank" across all stores.
- Good news: "Murphy Family Restaurants" already removed from live logic; `.env.local` never committed to git.

**Decision (yours, 2026-08-03):** **Single Supabase project + `org_id` RLS** (recommended — cheapest, one codebase, isolation as strong as the policies, which we harden + verify). You also chose **"prep the migration, safe parts only."**

**Drafted & pushed (v4.772) — reviewable, NOT run:**
- `supabase/schema-multitenant-phase1.sql` — **additive, non-breaking, safe to run anytime.** Creates `tenants` + `tenant_stores` (all 27 stores seeded to your tenant `00000000-…-0001`), adds a nullable `tenant_id` to profiles + ~65 data tables + `org_config`, backfills every existing row to your tenant, adds `current_tenant_id()` / `set_tenant_id()` helpers. **Changes no RLS** → identical behavior after running.
- `supabase/schema-multitenant-phase2-rls.sql` — **the isolation flip; run last.** Replaces every loose policy with `tenant_id = current_tenant_id()` CRUD + a default-tenant insert trigger; profiles/org_config special-cased. Documents the service-role ingestion caveat + a full rollback.
- `src/lib/supabase.js` — `loadTenants` / `loadTenantStores` / `loadMyTenantId` (fail-soft, **unwired** — app still uses `constants.js` until a future change routes through them).

**Naming call I made:** `tenant_id` = the new **operator** boundary; your existing `org` (mcdok/emerald) stays as your OK/FL brand split — I didn't overload it. (Yours to veto.)

**The caveat I built in:** automated pulls run as the service role → bypass RLS + have no user identity, so Phase 2's insert trigger falls back to *your* tenant. Correct while you're the only operator, but the pull scripts must be made tenant-aware before operator #2's automated data flows. Flagged in the SQL + the plan.

### Migration run sequence (when you're back at a keyboard — do the first real run on a DB copy/branch, not live)
1. Run `schema-multitenant-phase1.sql`.
2. Set `tenant_id` on every real profile: `update profiles set tenant_id='00000000-0000-0000-0000-000000000001' where email='…';`
3. Confirm `select current_tenant_id();` returns your tenant when logged in.
4. Create a throwaway second-tenant login → confirm it sees **zero** of your rows.
5. Only then run `schema-multitenant-phase2-rls.sql`.

---

## Owner action items (pending)

- **Multi-tenant:** review the two `schema-multitenant-*.sql` files, then run the sequence above (safe Phase 1 first; Phase 2 only after the isolation test).
- **Older pending SQL** (each fails soft — app works without): `forecast_snapshots`, `smart_target_adjustments`, `sage_prompts`/`sage_prompt_runs` (schedule cols), `schema-smg-n.sql` (then re-upload latest SMG FullScale for n-weighting).
- **SAGE redeploys pending:** `supabase functions deploy sage-chat --no-verify-jwt` to activate RBAC scoping (v4.494) + promo-ROI tool (v4.500).
- **SAGE auto-scheduling:** needs a runner Supabase user + GitHub secrets (SAGE_RUNNER_EMAIL/PASSWORD, VITE_SUPABASE_ANON_KEY) — else the hourly scheduler just doesn't fire.
- **Security advisory:** rotate the on-disk service-role key before granting any 2nd party repo access (it's not in git, but it's on the workstation).

---

## Open task list (highlights)

**Track A — finish the feature list (accuracy-first):**
- One-Pager v2 depth (Scheduling week-over-week, Controls outlier names/dates/times, FOB count-completion + recount help/hurt, LY-event awareness) — #25-adjacent, Notes 47.
- Measure festivals into the Event Impact Registry (event-type, football method); pin the 24 timeframe-only community events + LTO 2026 windows.
- #37 auto-source stale Controls · #40 missing actuals (KVS/R2P/Digital/Controls) · #55 trading-day comparison · #64 LifeLenz Bridge · #41 QSRSoft KB → SAGE · #75 persist per-location config · #43 lock modal-X top-right (app-wide, risky) · #44 two-track internal docs.

**Track B — productize:** multi-tenant isolation (drafted; execute per sequence), then de-hardcode pull scripts + SAGE + store registry (supervised), accuracy-hardening pass, onboarding runbook.

**Owner-decision-blocked (surface, don't build):** #65 in-app email · #66 weekly report cadence · integrity-naming (Notes 37 A1) · sandboxed share access (Notes 37 C2) · #89 Notes 48 credential-gated sites (atMCD/Fred/Campus/Martin Brower — ToS-cautious).

---

## Key context for resuming

- **Stack:** Vite + React 19 + vanilla JS (`const h = React.createElement`, `// @ts-nocheck`). Supabase (Postgres + magic-link auth + Deno edge fns). Vercel auto-deploy from `main`. Dexie/IDB fallback.
- **Commands:** `npm run dev` · `npm run build` (must pass clean) · `npx vitest run` (636 tests).
- **Git:** push via `git push origin main` (**SSH ed25519 key**, not gh/HTTPS tokens). Vercel deploys on push. **No backticks in Bash commit messages** (zsh runs them as command substitution — use a HEREDOC or plain text).
- **Live DB from this env:** Supabase egress is allowlisted. `curl -G "$VITE_SUPABASE_URL/rest/v1/<table>" -H "apikey: $VITE_SUPABASE_ANON_KEY"` (anon honors RLS). Service-role key in `.env.local` (`SUPABASE_SERVICE_ROLE_KEY`) for verification/imports — can't run DDL via PostgREST (owner runs SQL in the Supabase editor).
- **Memory to read:** `CLAUDE.md`, `memory/MEMORY.md`, `memory/master-plan-and-mandate.md`, `memory/project-multitenant-audit.md`, `memory/notes-49-reports-and-print.md`, `memory/vision-and-roadmap.md`.
- **Org:** ~27 stores. `getStoreOrg`/`constants.js`: **MCDOK = Oklahoma (~20), Emerald Arches = Florida (~7).**

---

## Defensible calls made this session (rationale)

- **Tenant model = single-project + `org_id` RLS** (your pick) — cheapest, one codebase, enables cross-tenant benchmarking; isolation strength = policy quality, which we verify with a throwaway profile before anyone real logs in.
- **`tenant_id` ≠ `org`** — `org` already means your OK/FL brand; overloading it would be confusing and error-prone.
- **Phase 1 / Phase 2 split** — additive columns can't break the app; the RLS flip is the only risky step, isolated + reversible + gated on an isolation test.
- **Did NOT execute the migration or the broad refactor unsupervised** — matches the mandate's "no broad risky refactors without me" + "no unverifiable changes to displayed numbers."
