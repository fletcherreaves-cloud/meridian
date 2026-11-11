# Legal / IP protection + privacy posture for onboarding users outside the owner's own operation (task #70)

**Not legal advice — a readiness map.** I'm not a lawyer and this isn't a substitute for one. What
follows is the technical/product-side homework that should be DONE before a real lawyer drafts
anything, so that conversation starts from "here's our actual architecture and risk list" instead
of a blank page. Treat every "recommend" below as a flag for the owner's decision, not a change
I'm making unilaterally — several of these cross into "reversing a documented decision" / "scope
that's a judgment call" territory CLAUDE.md already carves out as owner-only.

**Context:** owner, 2026-11-02: *"really close to pulling the trigger on bringing on additional
users and possibly a whole different organization."* Two separable risk surfaces follow from that:
(1) **tenant isolation** — can a second store/operator's data leak into the owner's own views, or
vice versa; (2) **everything legal/contractual** — who owns what, who's liable for what, what a
user is agreeing to by logging in. #70's technical half (1) is almost entirely covered already by
`memory/project-multitenant-onboarding.md` + the pending SQL fix from task #76
(`supabase/schema-fix-tenant-id-hardcode-2026-11-03.sql`, written, awaiting the owner's run in the
Supabase SQL editor) — this file picks up where that one stops: the legal/privacy/contractual half,
which is genuinely unstarted, plus a few technical items that are legal-posture-adjacent rather than
pure isolation bugs.

---

## 1. What's actually being protected, named plainly

Three different things get casually lumped under "IP protection," and they need different
treatments:

- **The code itself** (this private GitHub repo, the forecast/visit-readiness/recommendation-ledger
  engines). Protected today by: the repo being private, and nothing else formal. A second
  operator or their employees never need repo access to use the app — that's a Vercel-deployed
  product, not a dev environment handed out. **No current exposure here** as long as that stays
  true; flag if anyone ever proposes giving an operator or contractor direct repo access.
- **The methodology** (how the Smart Targets median-of-three model works, the PACE/EcoSure
  readiness weights, the Scanner's correlation thresholds, the Recommendation Ledger's grading
  tolerance). This is the actual competitive differentiation task #83 went looking for — and the
  role-based panel-gating work (task #77, `memory/plan-role-based-panel-gating-2026-11-03.md`) is
  already a real control on this axis, not just a UX cleanup: `model-assign`, `dialedin`,
  `fcst-accuracy`, `why-engine`, and the other `analytics.forecasting`/`analytics.ai`-gated panels
  are already invisible below GM/manager level for every role (`SUPERVISOR_PERMS` and up only).
  **Recommend:** keep that gate tight specifically BECAUSE of this — if a second operator's own
  staff get accounts, the model-internals panels staying `admin`/`owner`-only (not even extended to
  that operator's own "admin"-equivalent user) is the simplest way to keep the methodology from
  walking out the door through an account that was only ever meant to see that operator's own
  store data. This is a point in favor of NOT handing a second operator their own `admin`-role
  user — see §3.
- **Each operator's own operational data** (their sales, labor, employee PII, security findings).
  This is the one the RLS tenant-isolation work actually defends, and it's *their* data to protect
  from everyone ELSE, not Meridian's IP to protect from them. Conflating this with the methodology
  question above is the easiest way to over- or under-scope what a Terms of Use needs to say.

---

## 2. Terms of Use / contractual — what a second-operator relationship needs stated, and why

Not drafting actual ToU language here (that's the lawyer's job once this is a real conversation,
not a hypothetical one) — naming the clauses that matter and why, based on what the architecture
actually does and doesn't do today, so the eventual draft is grounded in reality rather than
boilerplate:

1. **Who owns the operator's own data, and what happens to it if the relationship ends.** Today
   there is no export/deletion mechanic for a tenant's data at all — the architecture assumes one
   permanent tenant. Before a second operator's data exists, decide: on termination, is their data
   exported to them, deleted, or just left inert in a disabled tenant row? This needs a real answer
   before it needs a clause.
2. **What the software's outputs are, legally** — forecasts, recommendations, visit-readiness
   scores, SAGE's answers. These should be stated as **advisory, not guarantees** — SAGE in
   particular, because it's an LLM: it can be wrong, and nothing today disclaims that to an end
   user inside the app itself (worth a visible, not just contractual, disclaimer — see §5).
3. **Confidentiality / non-compete-adjacent language, if this is ever a paid relationship between
   operators who could plausibly compete** (two different McDonald's franchisees, for instance,
   could have real reasons not to want their own numbers visible to the other even indirectly).
   The RLS isolation already makes this technically true (operator #2 cannot query operator #1's
   rows under any role), but a Terms of Use should SAY that the isolation exists and what it means,
   not just rely on it silently working — a stated guarantee is worth more to a nervous operator
   than an unstated one, and it also commits Meridian to keeping it true, which is useful internal
   pressure.
4. **Liability cap / "as-is" language** given this is a nights-and-weekends build run by one person,
   not a vendor with an SLA — standard SaaS boilerplate territory, but worth being explicit that
   there's no uptime guarantee, no support SLA, and no warranty that a given metric/forecast is
   accurate, especially for anything LLM-generated.
5. **IP ownership of the platform itself**, stated so a second operator's use of it never implies
   any claim on the codebase, the methodology, or future development — standard "you get a license
   to use the service, not the software" framing.

**None of this blocks continuing to build.** It only matters once there's a real second
relationship to put a signature on — flagging it now so it's ready when that moment arrives, not
discovered after someone's already logged in.

---

## 3. The account-model question this surfaces (a real open decision, not resolved here)

`memory/project-multitenant-onboarding.md` item #3 already flags "no self-serve pick-your-org
flow" as an open technical gap. The legal/IP lens adds a sharper version of the same question:
**what role does a second operator's own staff get, and does any of them ever get the same
`admin`/`owner` level the current owner has?**

- If a second operator gets their own `admin`-equivalent user, by the current `DEFAULT_ROLES`
  shape that's a **level-1 bypass of `disabledPanels` entirely** — they'd see the forecasting
  internals §1 just argued should stay protected, plus `settings`/`panel-manager`/`users.manage.all`
  for THEIR tenant only (tenant RLS still isolates their store rows), but with full visibility into
  how the app itself is configured.
- **Recommend:** define a tenant-scoped admin tier below true `owner`/`admin` — someone who can
  manage users and settings within their own tenant without inheriting the level-1 permission
  bypass or forecasting-methodology visibility. This does not exist today; `DEFAULT_ROLES`'s
  9 roles are all single-tenant-shaped (no role currently means "admin of MY org only"). This is a
  real gap, not a cosmetic one, the moment a second tenant with its own staff exists — and it's a
  product-shape decision, not something to seed into `DEFAULT_ROLES` unilaterally.

This is listed as an open decision, not a recommendation to build yet — it depends entirely on
whether a second operator relationship is "I manage their account for them" (no new role needed)
or "they run their own show" (new tenant-admin tier needed).

---

## 4. Privacy — PII posture under a second tenant

CLAUDE.md's existing PII rules (never pull/persist `ssn`, strip `X-Auth-Token` from every capture,
roster workbooks get deleted) were all written with one operator's employees in mind. They don't
change under a second tenant — the rules are already general, not owner-specific — but two things
sharpen once a second organization's employees' data is actually in the system:

1. **A real Privacy Notice becomes necessary, not optional,** the moment there's a genuine second
   "customer" rather than just the owner's own stores. Today there's no privacy notice in the app
   at all (checked: no `privacy`/`terms` panel or route exists in `panel-registry.js`). Low urgency
   while it's one person's own data; becomes a real requirement — likely legally, not just as good
   practice — once a second employer's employees' PII is being processed on their behalf.
2. **Who's the data controller vs. processor** for a second operator's employee data (LifeLenz/
   QSRSoft pulls, SMG VOICE, performance reviews) is a real question a lawyer should answer once
   this is concrete — Meridian is processing data ABOUT a second operator's employees, which is a
   different legal posture than processing data about the owner's own.

Not building a Privacy Notice panel speculatively — flagging it as the one genuinely new privacy
artifact this triggers, to have ready alongside the ToU conversation in §2.

---

## 5. Security posture checklist (grounded in what's actually true today, not a generic audit)

Re-using `project-multitenant-onboarding.md`'s own open items rather than re-deriving them, plus
what's legal-posture-relevant specifically:

| Item | Status | Why it matters for a second operator |
|---|---|---|
| Tenant RLS isolation (~70 tables, phase2 sweep) | ✅ Live, independently measured | The technical backbone every confidentiality claim in §2.3 rests on |
| 46-table hardcoded-literal fix (task #76) | Written, **awaiting owner's SQL-editor run** | Until run, those 46 tables mistag any service-role insert as the owner's tenant — a real cross-org exposure risk the moment tenant #2's pull scripts start writing |
| `org_config` PK collision (key, not key+tenant_id) | Open | Blocks tenant #2's own store registry/settings from existing without colliding with tenant #1's row |
| Pull-script tenant stamping | Open | Every automated pull (LifeLenz/QSRSoft/email-parse) needs its own tenant's credentials + an explicit tenant parameter, or it silently writes to tenant #1 |
| Shared infra (one Supabase project, one Vercel project, one Anthropic key) | Known, not necessarily a problem | Fine technically given RLS; becomes a real question the moment this is a PAID relationship (no per-tenant cost attribution, no isolated blast radius if the Supabase project itself has an incident) |
| Secrets handling | Governed by CLAUDE.md's standing PII/credential rules | Same rules, no change needed — just confirm they're followed per-tenant too (e.g. a second operator's own LifeLenz/QSRSoft tokens get the same no-commit/no-log treatment) |
| Backups | **Not independently verified this session** — Supabase's own backup tier/retention hasn't been checked against what a second operator's data would need | Worth a real measurement (what plan/tier, what retention, point-in-time recovery or not) before a second tenant's data exists, not assumed |

---

## 6. What this plan is NOT saying

- Not saying don't onboard a second operator. Not even saying wait a long time — most of the
  technical blockers (§5's open items) are each a scoped, already-described task, not a redesign.
- Not drafting the actual Terms of Use, Privacy Notice, or any other legal document — that's
  real legal work for a real lawyer once this is concrete, and signing anything drafted by an LLM
  without that review would be a mistake regardless of how reasonable it reads.
- Not proposing to build the tenant-scoped admin role (§3) or a Privacy Notice panel (§4)
  unprompted — both are flagged as open product/legal decisions for the owner, consistent with
  CLAUDE.md's standing carve-out that scope/privacy judgment calls get asked, not assumed.

## 7. The punch list, in one place

**Before any second operator's data exists:**
1. Owner runs `supabase/schema-fix-tenant-id-hardcode-2026-11-03.sql` (task #76's output).
2. Fix `org_config`'s PK to `(key, tenant_id)` + the app's upsert target.
3. Decide the account-model question in §3 (tenant-scoped admin tier, or managed-for-them).
4. Verify Supabase's actual backup/retention tier.

**Before any PAID or formal second-operator relationship (not needed for a casual/favor
arrangement with a fully trusted party):**
5. Real lawyer drafts Terms of Use (ownership, liability, confidentiality, termination/data
   handling) and a Privacy Notice, using §2/§4 above as the technical input.
6. Decide and build whatever data export/deletion mechanic the ToU ends up promising.
7. ✅ **DONE 2026-11-11** — added a visible "⚠ AI-generated — advisory, not a guarantee. Verify
   before acting." disclaimer to SAGE's own header (`src/views/sage.js`), the surface §2.2 singled
   out specifically (an LLM, can be wrong, nothing disclaimed that to the end user before this).
   Scoped to SAGE only this pass — the Recommendation Ledger has no UI panel yet (Phase 1 is pure
   helpers only, `supabase/schema-recommendation-ledger.sql` not yet run), and "forecast outputs"
   spans dozens of panels that would need their own scoping pass rather than a drive-by addition
   here. Covered by `src/__tests__/dispatch-sage-advisory-disclaimer-2026-11-11.test.js`.

**Ongoing, regardless of tenant count:** keep the forecasting-methodology panels (`model-assign`,
`dialedin`, `fcst-accuracy`, `why-engine`, etc.) gated at `admin`/`owner` only — don't extend that
visibility to a second operator's account without re-deciding §1's tradeoff deliberately.
