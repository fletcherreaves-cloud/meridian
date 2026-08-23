---
name: notes-68-entity-explorer
description: Notes 68 - owner's big feature request for a Power-BI-style deep-analytics page. Pick any subject (person, store, patch, org, product, event, metric), assemble everything known about it, and follow links outward endlessly. Captures the request verbatim, measures what already exists to build on (the security panel is already a working vertical slice), sketches the Subject/Resolver/Profile/Links architecture, names the attribution + PII problem in the People view, and proposes a slice plan.
metadata:
  node_type: memory
  type: plan
---

# Notes 68 — the Entity Explorer

**Status:** brainstorm requested by the owner 2026-08-23 (*"Is this something we can brainstorm and
build out?"*). Nothing built. No dispatch yet — the first decision is the owner's (see Open
decisions).

---

## The request, as stated

> In my ideal world I would like to see all paired data together to tell a story.
>
> - **People** — a dashboard that knows all we know about each person: metrics, time worked, job
>   duties, comparisons vs their location/patch/org. Any identified concerns based on data, with
>   the mechanism built in to drill down to the finding and substantiate it. Anything we know and
>   can tie directly to an employee should be findable here. *"In a way over the top thought, I
>   would like to build a work ethic profile on each one."*
> - **Products** — history per location, amounts, who has counted and when, statistics about the
>   product and any findings that are flagged.
> - **Metrics** — rolled-up profiles by location/patch/org on history, trends, hot spots, records,
>   who can be attributed where possible, and analysis of how the metrics affect overall business.
>
> **The setup:** a page dedicated to deep analytics *"that morphs as we identify things."* Start by
> selecting a person, store, patch, org, product, or a security-type idea. Populate all data around
> that topic. Date picker with ranges. Intelligently build a flow based on the data selected and
> drill in to see all relevant findings, including original data and any analysis already returned
> for the event. *"I have never used Power BI, but envision it being something akin to that."*
> Charts, tables and graphs as appropriate.
>
> *"I want to be able to seemingly endlessly find everything there is to know about it and have the
> app intelligently build a profile based on this data."*
>
> Separately: **search all data and metrics for top performers and bottom performers.**

## 🔴 The most important measured fact: one vertical slice already exists

`src/views/security-panel.js` is this feature, built once, narrowly:

- `SubjectRow` (`:492`) groups **findings by subject** (`group.empToken`) — subject-centric, not
  panel-centric.
- Identity is already tokenized and gate-revealed: `src/engine/identity-vault.js`
  (`getOrCreateToken`, `tokenizeRows`), reveal only through `reveal_employee_identity()`, gated on
  `org_config.gm_identity_reveal_enabled`, and *"reveal happens only through the existing RevealName
  path... never automatic"* (`:378-379`, `:502-504`).
- Findings already carry rules, domains, and drill-down expansion.

**So the ask is not "invent an entity explorer" — it is "generalise the one we have from
(subject=employee, source=security_findings) to (any subject, every source)."** That reframes the
whole build and is the single most useful thing to know before scoping it.

## Other blocks that already exist — do not rebuild

| Piece | Where | What it gives the explorer |
|---|---|---|
| Declarative metric registry | `src/engine/metric-source.js` — **59** keys in `METRIC_SOURCES`, plus `DERIVED_METRICS` | The proven in-repo shape for a registry-driven resolver. Copy this pattern, don't invent one. |
| Auto-first per-day sourcing | `metricDaily` / `metricSeries` / `metricAvg` | Every metric already resolves across streams with manual-last precedence. The explorer gets this free. |
| Matched-day vs-LY | `src/engine/vs-ly.js` | Comparison basis for every profile number. |
| Signal metric registry | `src/engine/signal-registry.js` | Controls/weather/calendar metric groups + cloud streams. |
| Cross-metric discovery | Signals **Scanner** (v4.495) | Already does Pearson/Spearman across all metric pairs with FDR guardrails. The "what moves with this" panel of a metric profile is largely this, re-scoped to one subject. |
| Situation keys | `src/engine/insight-ledger-measure.js` | Step 1 shipped, measured **142 distinct situations/day**. This is the substrate for *"any analysis already returned for the event."* |
| Org attribution | `whoRan(loc,date)` (`src/engine/pipeline.js`, `src/constants.js`) | Who ran a store on a date. Tier 2 (routing rollups through it) is unbuilt. |

## Architecture sketch

**One primitive: the Subject** = `(type, id)`. Types: `employee` · `store` · `patch` · `org` ·
`product` (WRIN) · `event` (a count, a shift, a cash exception, a graded visit) · `metric`.

Three layers, and only the first is genuinely new:

1. **Resolver (NEW, and the real work).** Given `(subject, dateRange)` → which streams hold rows
   about it. Today every panel hardcodes its own queries; nothing can answer "what do we know about
   X" generically. Build it as a declarative registry keyed by subject type, exactly like
   `METRIC_SOURCES`:
   `SUBJECT_SOURCES[type] = [{ stream, keyField, loader, rowKind }]`.
   ⚠️ Registry entries go stale silently — `metric-chains.test.js` exists because `METRIC_SOURCES`
   drifted from what loaders actually emit **four times in one day**. Guard this the same way from
   day one, not later.
2. **Profile (assembly).** Sections render only if the resolver returned rows — the page "morphs"
   because it is data-driven, not because of special-casing. Every number states its source stream,
   window, and comparison basis (standing voice rule).
3. **Links (the "endless" part).** Every rendered row exposes the subjects it touches; a cash
   exception links employee + store + date. Clicking re-enters the explorer with that subject.
   📌 It is not endless data — it is a **graph walk**, and the graph is just "which foreign keys
   does this row carry." That is what makes it buildable.

## 🔴 The People view — the attribution problem is an engineering blocker, not a policy debate

**Today the app cannot honestly say an exception belongs to a person.** Two measured, already-filed
reasons:

- `attribution-validity-register-login.md` designs an attribution-confidence state
  (`clean`/`contested`/`unknown`) precisely because **register logins do not reliably match punch
  times**. It is unbuilt. It needs a LifeLenz punch-timestamp extension (raw shifts are never
  stored) or QSRSoft transaction detail.
- Per-entity metrics at low n are dominated by noise. This estate has a concrete in-house
  demonstration: `finding-cfv-predictability-ceiling-2026-08-22.md` measured ρ=+0.023 (n=190),
  ICC 0.087 — a store's own prior graded visit barely predicts its next. An individual with far
  fewer observations is worse, not better.

**So `attribution-confidence` is a prerequisite for the People view, not a follow-up.** Shipping a
person profile without it manufactures confident-looking accusations out of unresolved data.

**On the "work ethic profile" specifically.** The operational goal — find a pattern, substantiate
it, coach it — is legitimate and fully achievable. The risk is in the *composite*: a single derived
character score, assembled from noisy operational metrics, that reads as the employer's official
judgment of a person. Meridian is heading to a second operator in beta, so it would become a
document about **someone else's** employees under someone else's HR policy, and it is discoverable.

**Recommended shape: evidence, not verdict.**
- Show attributed items with their **attribution confidence** and a link to the source row.
- Compare against location/patch/org as the owner asked — that is a fair, factual framing.
- **No single composite character score.** Nothing that renders as "this person's work ethic is N."
- Keep the existing tokenize-by-default + logged-reveal path. Never widen it for convenience.

⚠️ Standing PII constraints carry into this view unchanged: **never** ingest protected-class
attributes (`nationalOrigin`, `gender`, `dateOfBirth`, `federalMaritalStatus`); never put `ssn` in
`selectCols` or persist it; pay rate stays stored and surfaced in no panel; `security_findings`
subjects stay `emp_token`/`wrin`, never plaintext.

📌 Related and already open: **SAGE knowledge-grounding sensitivity gating** is unbuilt, and
`finding-padding-and-cash-hunt-2026-08-13.md` already names a GM by name with nothing stopping it
reaching SAGE's context. An entity explorer over person data makes that gap materially worse.
**Build the gating first or alongside — not after.**

## Slice plan

**Slice 1 — Top/bottom performers (ships alone, proves the plumbing).** The owner's separate ask,
and the smallest real thing. Pick metric → scope (All/State/Org/Patch/Store) → window → rank.
59 `METRIC_SOURCES` keys already know how to resolve per-loc per-day, so this is mostly assembly.
⚠️ The hard part is not ranking, it is **honesty guards** already standing in this repo: don't rank
a store with 3 days against one with 90 (count-completeness), dollar-weight aggregates, never
average averages, show `n`. Same discipline as dispatch #75's thin-cell floor.

**Slice 2 — Store/Patch/Org profile.** Lowest-risk subject types (no PII, no attribution problem),
and they exercise the resolver end to end. Delivers the "Metrics" bullet.

**Slice 3 — Product (WRIN) profile.** History per location, counts and who counted, flagged
findings. Needs the resolver to span inventory + waste + variance streams.

**Slice 4 — Event profile.** A count, a shift, a graded visit, a cash exception. This is where
Insight Ledger **step 2** (persistence + writers, currently gated on "more data") becomes required —
this feature is the missing justification for ungating it.

**Slice 5 — Person profile.** Last, and gated on attribution-confidence + SAGE sensitivity gating.

## Open decisions for the owner

1. **Does the person profile stay evidence-only** (no composite character score), per the
   recommendation above? This determines whether slice 5 is buildable at all.
2. **New panel, or extend the security panel's subject view?** The generalise-what-exists path is
   cheaper and reuses a tested reveal path; a new panel is cleaner but duplicates it.
3. **Which subject type is genuinely most valuable first** — the slice order above is a proposal,
   not a finding. Owner may want Product ahead of Store.
4. **Charting.** No chart library is in the eager bundle today and the entry budget is 850 KB gz.
   Any Power-BI-like visual richness has to be lazy-loaded per the standing perf rule; decide the
   library before slice 2, not during it.
