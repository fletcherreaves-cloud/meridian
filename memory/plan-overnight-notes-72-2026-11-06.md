---
name: plan-overnight-notes-72-2026-11-06
description: "Research + honest opinion on the owner's 'Notes 72' overnight brain-dump (2026-11-06): a main-screen human-data quick-capture point, a smarter/curated personalized home screen, and expanding beyond McDonald's to other QSR brands or other industries entirely. Grounded in three parallel research passes against the real codebase, not assumption. Recommendation, in priority order: (1) quick-capture is the highest-ROI idea — most of its backend already exists and already correlates, ship it first; (2) the curated home screen is real and valuable but should be phased, starting from what already works (Morning Brief's engine, role-aware delivery, format choice) before the genuinely-new, unproven, and lower-value 'predict when they log in' piece; (3) other QSR brands is a bounded, fundable integration project, but 'any industry' is not a feature — it's a second product, and shouldn't get speculative engineering time without a real second customer."
metadata:
  node_type: memory
  type: plan
scope: tenant
sensitivity: open
---

# Notes 72 (2026-11-06) — three big ideas, researched and opined on

Owner's own framing: *"Lots of big thoughts tonight. These are definitely queue for later."* Asked
for thorough research, mockups/pictures of what each could look like, and my honest opinion —
*"I will trust and follow your lead."* This doc is that: three parallel research passes against
the real codebase (not assumption), then an actual recommendation, not a menu of options with no
verdict. Mockups delivered separately as an Artifact (link in the chat reply that cites this doc).

**My overall read, upfront:** these three ideas are not equally sized or equally ready. One is
mostly a surfacing exercise on infrastructure that already exists and already works. One is a
real, valuable, multi-phase build where the hardest/newest part is also the least proven-value
part. One is being asked as a single idea but is actually two very different things wearing the
same sentence — a bounded project and an open-ended platform bet. Treating all three as equally
"ready to scope" would be the mistake; the plan below sequences them on that basis.

---

## 1. Quick-capture / human-sourced data as a niche — build this first

**The ask:** a main-screen icon/button, category tiles (People/Operations/Events/Weather),
smart-suggest + free-text input, AI/rules routing into the right tables for future correlation, a
"living shareable" database that's store-specific but generalizes across similar locations, user
feedback on how their input helped, natural-language AI response to input. Plus the broader
framing: *"any other creative ways that would get users involved... collecting data... from a
person. It is extremely valuable and way too underutilized. That could become our niche."*

**What's actually already there (measured against the real code, not assumed):**

| Ask | Status |
|---|---|
| Category tiles + smart-suggest common items | **~Done as data.** `EVENT_TYPES` (`constants.js`) already has ~50 structured event types, pre-organized by comment header into Weather / Store Events / Community-External / Operations-Scheduled / School Calendar / Retail-Shopping — exactly the category breakdown the owner is describing. It's just not surfaced as tiles; it's a dropdown buried in a store's drill-down tab. |
| "Living shareable, store-specific-yet-generalizing" database | **Already built.** `org_events`'s `scope`/`scope_locs` columns + `collapseScopedEvents()` already support store / state / all / explicit-list scope — this is the exact shape asked for, already shipped, already tested. |
| AI/rules routing input into tables for future correlation | **Already built and already running.** The Event Impact Registry (`event_impact` table, `forecast.js`) measures a real per-store × event-type sales/GC lift or drag from logged events and feeds it back into the forecast engine. Logging an event already has a measured downstream consequence today — this isn't a "someday" pipeline, it's live. |
| Main-screen icon/button, free-text custom input, feedback-on-impact UI | **Genuinely net-new.** No FAB/universal-capture pattern exists anywhere in the app; tagging is several clicks deep inside one store's tab, one store at a time, dropdown-only (no free text). |
| Natural-language AI response to input | **Half-built.** SAGE has 12 real tools, every one of them `query_*`/`search_*` — **read-only**. It can discuss data fluently; it cannot currently write anything a user tells it. One new write-tool (`log_event`, feeding the exact same `org_events` pipeline the manual UI would use) closes this. |
| Human-logged events as a correlatable Scanner signal | **Real gap, not myth.** Signals' Scanner already correlates auto-pulled streams plus a synthetic Calendar day-of-week group — a human-logged event isn't one of its inputs yet, but the shape (date-keyed flag) is identical to what Scanner already ingests. Small, real integration work. |
| Gamification / streaks / contribution badges | **Doesn't exist, and I'd advise against it.** See below. |

**My opinion:** this is the best idea in the notes, specifically *because* most of the hard part —
a real backend that already measures whether a logged observation actually moved a number — is
done. The "human data as our niche" instinct is right: every competitor in this space ingests
POS/scheduling exhaust; almost none systematically capture a manager's qualitative read ("the ice
machine's been down since Tuesday," "there's a street festival two blocks over this weekend") and
then show the operator the real, measured effect of having logged it. That second half — the
measured effect — is what makes this more than a notes app, and it's the part Meridian already
has that a competitor would have to build from zero.

**What I'd build, in order:**
1. A front-screen entry point (not a new icon necessarily — a clearly-labeled "+ Log Something"
   affordance, always reachable, not three clicks into a store tab) with the existing `EVENT_TYPES`
   categories as tiles, free text as a genuine fallback, not an afterthought.
2. `log_event` as SAGE's 13th tool, so the natural-language path and the tile path write to the
   exact same place — no second schema, no drift between "typed it" and "told SAGE."
3. Wire human-logged events into Scanner as one more correlatable series.
4. **Skip badges/streaks.** Nothing in this app's existing tone supports that register (Bloomberg-
   terminal-adjacent, professional, data-first per CLAUDE.md's own "Voice by role" rule), and
   gamification tends to read as patronizing to GMs and ops people who already have a real job to
   do. The feedback loop the owner actually asked for — *"give feedback to users... as to how it
   helps the app help the user over time"* — is better served by surfacing the REAL number: "Last
   time you logged [X], we measured a [Y]% [lift/drag] over the following [N] days." That's the
   event-impact engine's own output, already computed, just not yet shown back to the person who
   logged the thing. That's more honest and more motivating than a badge, and it's nearly free —
   the number already exists.

---

## 2. The smarter, curated, personalized home screen — real, valuable, needs phasing

**The ask:** a front end that's already done the homework when a user opens it — curated focus
items with drill-in, learns login timing and anticipates, keeps surfacing something new so it
doesn't go stale, uses every data source (schedules/weather/events/correlations/tendencies),
analyzes every shift per user/store/patch/above, gets more automatic over time, "fun... but
professional," role-cascaded delivery, and lets the user pick their own format (checklist, bullet
points, narrative synopsis).

**What's already there:**

| Ask | Status |
|---|---|
| Curated, action-oriented, drill-in content | **Real, proven engine exists.** Morning Brief's `MORNING_RULES` — a genuine 12-rule correlation engine with severity, headline/detail/action structure — is the closest thing to this already shipped. At-A-Glance's tiles/Movers-strip/Action-Checklist are the same instinct at a different altitude. |
| "Correlations we have made" | **True, not aspirational.** Signals' Scanner is live, with real Weather and Calendar (day-of-week) metric groups already wired in. |
| Analyze each shift, feedback to users/patches/above | **Partially real.** The Recommendation Accuracy Ledger (task #84, Phase 1) genuinely grades a recommendation against its real outcome — but scoped narrowly to forecast/target accuracy, and its own Supabase table hasn't been run yet, so it isn't live. Nothing today grades a SHIFT's own outcome against its own plan in this generalized way. |
| Role-cascaded delivery STYLE (not just data access) | **Does not exist.** SAGE's RBAC is real but scopes *what data* a role can see, not *how* content is written for that role. Grepped Morning Brief directly for any role/weather/event/schedule awareness — zero hits. There's no precedent anywhere in this app for voice actually changing by role. |
| User-customizable format (checklist vs. bullets vs. narrative) | **Does not exist.** No such setting anywhere in `constants.js` or `user_settings`. |
| Learn login timing, anticipate opening the app | **Does not exist, and has no foundation at all.** This is the one I'd flag hardest: there is **zero per-user login-timestamp or behavioral tracking anywhere in this codebase** — no `last_login` column, nothing. This isn't "mostly there, needs tuning" — it's a cold start requiring new session/event infrastructure before a single prediction could be made. |
| Task #92 ("Role-based welcome-back digest since last login") | **Exists as a task, never scoped.** No design note anywhere. This ask and task #92 are the same thing — worth merging into one line item rather than tracking twice. |

**My opinion:** this is a real, valuable direction — but it bundles a cheap, high-value piece
(reuse what already works, add role-voice and format choice) with an expensive, unproven piece
(predict *when* someone opens the app). Those don't deserve equal priority, and I'd resist
building them as one project.

**Phase 1 — buildable now, on existing engines, no new infrastructure:** take Morning Brief's
already-proven correlation engine and At-A-Glance's tile logic and make ONE of them (or a thin
new layer over both) the actual front door, with two real additions: (a) a role parameter that
changes the *writing*, not just the data scope — a GM gets a tactical one-liner + the number, a DO
gets the patch-level pattern, an Admin gets the district rollup — same underlying facts, different
altitude of language, which is exactly the "Voice by role" standing rule this app already commits
to elsewhere, just not yet applied to delivery style; (b) a genuine per-user format preference
(checklist / bullets / narrative), stored once in `user_settings`, respected everywhere this
content renders. This closes task #92 for real.

**Phase 2 — only after Phase 1 ships and gets used:** the behavioral-learning piece (login-timing
anticipation, "always something new so it doesn't go stale"). I'd deprioritize "predict when they
open the app" specifically — it needs net-new tracking infrastructure to even start, and the
actual payoff is modest (saving someone from opening the app slightly earlier) compared to the
payoff of Phase 1 (getting WHAT they see right, every single time they open it, which they do
daily regardless of when). Build the login/session-event table as the real prerequisite, but treat
the prediction itself as a stretch goal to revisit once there's real usage data to learn from — not
before.

---

## 3. "Other QSR brands" vs. "any industry" — two different-sized asks, not one

**The ask:** groundwork for bringing on other QSR/fast-casual brands, what's reusable vs. what
changes, even other business types entirely, a dynamic backend customizable per industry, research
and data-mine for it, "can work on this at anytime."

**This heavily overlaps already-in-flight work.** Task #70 ("Multi-org/multi-user readiness audit
+ legal/IP protection plan") already covers onboarding a **second McDonald's-like operator on the
same vendors** — tenant isolation (RLS + `tenant_id`, already live, independently measured twice),
`org_config` fixes (open), pull-script tenant-stamping (open), legal/ToU groundwork (correctly
flagged in that work as the owner's own lawyer's job, not mine). Tonight's notes go further than
#70 in two specific ways: **other QSR/fast-casual brands** (not just another McDonald's-shaped
operator) and **other business types entirely**. Those are the two real new questions, and they
are NOT the same size.

**Other QSR/fast-casual brands — bounded, real, fundable.** The multi-tenant *data* layer (RLS,
`tenant_id`, `org_config`) is already genuinely industry-agnostic and would carry over cleanly.
What doesn't carry over: 35 of 50 pull scripts are wired to QSRSoft's exact API hosts, 11 to
LifeLenz's — a brand on a different POS/scheduling stack needs entirely new integration scripts,
full stop, same scope of effort as the original QSRSoft/LifeLenz builds were. That's real work,
but it's the SAME KIND of work this app has already done twice (QSRSoft, LifeLenz), just for a
third and fourth vendor. Known, repeatable, schedulable.

**Any other industry — not a feature, a second product.** The metric vocabulary this app's actual
value sits on (OEPE, R2P, DT Held Time, TPPH — defined with their exact arithmetic baked into
`constants.js`'s field dictionary, woven through ~80 panels) is McDonald's-drive-thru-specific at
the engine level, not a display-label problem. A fast-casual brand with no drive-thru has no
OEPE/R2P at all. A retail or service business has none of this vocabulary, period. There is no
realistic "make it generic" path for this layer — OEPE isn't a generalized concept with a QSR
skin on it, it IS a QSR drive-thru concept. Redesigning the metric/engine layer to be
industry-agnostic would mean rebuilding the thing that makes this app deep and good at its one
job, in service of being shallow at many jobs instead.

**My opinion, stated plainly because the owner asked me to be:** don't spend real engineering time
on "dynamic backend for any industry" speculatively. It has no near-term payoff, and the owner's
own phrasing ("can work on this at anytime") already signals it isn't urgent even to him. If a
genuine second-QSR-brand prospect materializes, that's worth scoping for real at that point —
vendor integration work, bounded, known pattern. "Research and mine data for what [any industry]
looks like, store it for later" is effort spent now against a hypothetical customer that may never
show up, for a problem (the metric engine) that can't actually be solved generically without
gutting what makes Meridian good. I'd shelve this one, not advance it, until there's a real brand
or industry in front of us asking for it specifically.

---

## Bottom line / sequencing recommendation

1. **Quick-capture (§1)** — build first. Highest ratio of value to new work; most of it already
   exists and already correlates.
2. **Curated home screen, Phase 1 only (§2)** — build second. Real value, no new infrastructure,
   closes an already-pending task (#92) for real instead of leaving it unscoped.
3. **Curated home screen, Phase 2 (login-timing prediction)** — defer until Phase 1 has real usage
   to learn from.
4. **Other QSR brands (§3)** — scope only when a real second-brand prospect exists; don't build
   ahead of a customer.
5. **Any other industry (§3)** — shelve. Not a near-term bet; would compromise the depth that makes
   this app actually good at the one job it does today.

Nothing in this doc is built yet. Mockups for §1 and §2 (the two UI-shaped ideas) delivered as a
separate Artifact, cited from the chat reply.
