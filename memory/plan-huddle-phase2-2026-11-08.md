---
name: plan-huddle-phase2-2026-11-08
description: Huddle Phase 2 concepts (task #125) — Memory, The Save, Pre-Warn, Cross-Role Relay. Design-only, nothing built. These four labels were coined in this same session's "what else can you dream up" conversation but never written down before the session was summarized — this doc defines each one concretely for the first time, grounded in the real Phase 1 code and the owner's own stated ideas, rather than assuming the reader already knows what they meant.
metadata:
  type: project
---

# The Huddle — Phase 2 concepts (task #125)

## A note on provenance, up front

Task #125 names four labels — **Memory, The Save, Pre-Warn, Cross-Role Relay** — coined during
the same night's "what else can you dream up?" exchange that produced Phase 1
(`memory/plan-huddle-narrative-2026-11-08.md`). Those four words were never actually written down
anywhere before this session's context got summarized, so there is no prior text defining what
each one means precisely. This doc defines them now, concretely, reasoned from (1) Phase 1's real
code and its own "owner's same-night follow-on ideas" section, and (2) the owner's own words from
the original pitch conversation (temporal learning, "results of the results," crew recognition,
DO-through-supervisors messaging). If any of these four drifted from what was actually meant in
the moment, **that's a discrepancy to flag to Fletcher, not something to silently paper over** —
read this as "here is a concrete, buildable shape for each name," not "here is what you said."

Nothing below is built. No code changed. This is the same audit-plus-proposal treatment tasks
#90/#79/#110 already got.

---

## 1. Memory — huddle notes that reference the past, not just today

**The owner's own words, already captured in Phase 1's doc:** *"some data, although not live in
nature, could be served up as reminders about how previous shifts ran or previous same days of
the week... We should and can always learn from the past and keep that front and center."*

**What Phase 1 doesn't do today:** `buildHuddleFacts(stores, altitude)` (`huddle-narrative.js`)
builds facts from *today's* `{loc,name,severity,flags}` snapshot only. The model has never seen
last Friday, or the last 4 Fridays, when it writes today's note.

**Concrete shape:** extend `buildHuddleFacts` to accept a second argument — a small trailing
window of the same weekday's last N occurrences (reuse `vs-ly.js`'s matched-day comparison logic,
specifically the same-DOW matching `matchedVsLY`/`autoFirstDaily` already do, rather than
inventing new date math). Add one field per flagged store: `trend` — e.g. "3rd Friday in a row
flagged for dinner staffing" or "first time flagged in 6 weeks" — computed from how many of the
last N same-weekday snapshots that store/flag combination appeared in. Feed this into the prompt
as an explicit fact (`Never invent a number... that wasn't given to you in the facts` already
guards against the model inventing a streak that isn't real — Memory just gives it a real one to
use).

**Why this is the right Phase 2 foundation, not a side feature:** The Save and Pre-Warn below both
depend on the same trailing-window computation Memory introduces — build it once here, reuse it
twice.

---

## 2. The Save — closing the loop on a caught-and-fixed pattern

**The owner's own words:** *"If we are smart we would build a table to track the results of the
results ongoing as conditions changed. Examples being a pattern of short staffed periods of the
day being remedied should reflect positively with results. We should be able to catch that and log
it and return it as advice or feedback."*

**What already exists, unexpectedly, and is the real foundation here:** the Recommendation
Accuracy Ledger (task #84) is live in production — 240 real rows since 2026-11-04
(`recommendation_ledger` table, `saveRecommendation`/`updateRecommendationOutcome`/
`loadOpenRecommendations` in `src/lib/supabase.js`). It's deliberately generic across `source`
values (today: `sales_forecast`, `labor_tpph_forecast`) — exactly so a new source can be added
without a new system. Phase 1's own doc already named this: *"log each generated huddle note as a
checkable recommendation... and let the SAME grading job that's already designed for forecasts
grade huddle notes too."*

**Concrete shape — "The Save" is the positive-outcome branch of that exact mechanism:**
1. When a huddle note names a specific flagged pattern (e.g. "dinner staffing short 3 Fridays
   running"), log it to `recommendation_ledger` with `source:'huddle'`, the flag/store as the
   `recommendation_text`, and `outcome_due_at` set to N days out (the next occurrence of that same
   weekday pattern, not a fixed calendar date — reuse Memory's trailing-window logic to know when
   "next time" actually falls).
2. `scripts/grade-recommendations.mjs` (already built, already grading forecast rows) grades it:
   did the flagged condition recur, improve, or disappear by `outcome_due_at`?
3. **A graded row where the flag DIDN'T recur is "a save."** That's the one Phase 2 surfaces back
   to the user — in the SAME altitude-voiced huddle note, not a separate panel — as a specific,
   factual callout: "Store X hasn't shown a dinner-staffing flag in 3 weeks, since [date] —
   whatever changed, it's working."
4. This is also the concrete, data-grounded answer to Notes-73 item 4's *"we should always
   remember to celebrate the wins"* ask (task #111, a separate still-open backlog item) — The Save
   gives that ask a real mechanism instead of an invented "win" metric, for exactly the subset of
   wins this system can actually prove happened (a pattern that stopped recurring), not a vaguer
   "good job" generated from nothing.

**Open design question:** who gets credited for a save? The ledger has no `attributed_to` field
today, and crew-level attribution is explicitly still blocked (Phase 1's doc: *"blocked on an
attribution data source... DAR/labor data is store-level, not per-crew-member"*). The honest first
version of The Save names the STORE, not a person — "Store X" improved, not "Manager Y fixed it"
— until crew/manager-level attribution is solved separately. Overclaiming credit to a specific
person from store-level data would be a real accuracy risk, not just a nice-to-have gap.

---

## 3. Pre-Warn — surfacing a likely risk before the shift that matters, not after

**The owner's own words (the same quote Memory draws from), read forward instead of backward:**
if the system can say "this pattern happened the last 3 Fridays," the SAME data, looked at before
today's shift starts rather than after, is a warning: "today is a Friday — this store has been
short at dinner on each of the last 3."

**Why this is a genuinely different thing from Memory, not just Memory with a different label:**
Memory is backward-facing narration delivered whenever someone clicks (any altitude, any time of
day, cached per business day). Pre-Warn is forward-facing and TIME-SENSITIVE — it only has value
delivered before the risk window, which for a dinner-staffing pattern means late morning/early
afternoon, not whenever someone happens to open Curated Home. This is the same reasoning Fletcher
already walked through this morning for notification timing in general (*"time/schedule-based
alerting tied to LifeLenz schedules... learn what they are scheduled and only alert while
working"*) — Pre-Warn is that same mechanism, applied specifically to Huddle-sourced risk patterns
rather than generic anomaly detection.

**Concrete shape:**
- Reuses Memory's trailing-window pattern detection (same weekday, last N occurrences) to compute,
  for TODAY's date, which stores have a real recurring-pattern risk for a daypart that hasn't
  happened yet.
- Delivered through the SAME infrastructure already built and currently paused for exactly this
  reason — Movers Alerts (task #91): push notifications, `target_roles` column, already proven
  against real production data, paused by the owner's own call pending a real GM/AS/DO account
  with a device subscription. **Pre-Warn is not a new delivery mechanism — it's a new alert TYPE
  inside the system that's already sitting there ready to be re-enabled.**
- Timing: fire once the pattern is confirmed as "today is one of the risk days" and before the
  risk daypart starts — for a dinner pattern, late morning. This needs the LifeLenz
  schedule-awareness piece from this morning's still-open design question (does the recipient
  have a real schedule to time against, or a manual preference) — Pre-Warn is a concrete consumer
  of that mechanism once it exists, not a reason to build a second one.

**Open design question:** false-positive cost. A Pre-Warn that fires on a 2-in-a-row pattern will
be noisy; one that waits for 4-in-a-row will miss real risk earlier. Needs a stated confidence
threshold (reuse Signals' Scanner's own effect-size/FDR-guardrail thinking, `correlation-stats.js`,
rather than inventing a new one) before this ships, not a guessed number.

---

## 4. Cross-Role Relay — a flagged win or risk, relayed to the role who should act on it, not just the role who saw it

**The owner's own words, from the original pitch, stated as a DO-specific need:** *"For DO's...
they should gear messaging through supervisors and teams to get the most bang for the buck results
and feedback."* And separately, on crew recognition: *"nudging them to give the due props"* — the
supervisor isn't just informed of a good result, they're prompted to go DELIVER the recognition
themselves.

**What Phase 1 already has, half of this concept:** the three altitude voices
(`ALTITUDE_VOICE` in `huddle-narrative.js`) already frame each role's note around what THAT role
should do — the district voice explicitly says "framed around leading THROUGH supervisors... never
a store-level fix list." That's the FRAMING half of Cross-Role Relay. What's missing is the RELAY
half: today, a DO's note and a supervisor's note are generated independently, from the same raw
per-store facts, with no connection between them. The DO's note doesn't actually hand the
supervisor anything concrete to go say.

**Concrete shape:** when a DO/VP altitude note identifies a specific store+situation worth a
supervisor conversation (already part of the district voice's job), write a SECOND, derived
artifact: a one-line, ready-to-deliver talking point, stored against that store/supervisor pair,
that surfaces inside the relevant Area Supervisor's OWN huddle note the next time they generate
one — e.g. a DO's note flags "Ardmore needs a direct conversation about X," and the Ardmore AS's
own huddle note, generated later that day or the next, includes "District flagged Ardmore for X —
worth raising this week" as an explicit input fact, not a separate notification. Same mechanism
for a win: a patch-level win noticed at the district altitude becomes a specific "go tell [GM] at
[store] this landed well" line inside the supervisor's own note — the literal mechanism for
"nudging them to give the due props."

**Why this belongs in `buildHuddleFacts`, not a new system:** the relay target is always the NEXT
altitude down (district → patch → store), which is exactly the altitude ladder `huddleScopeKey`
already encodes. A relay row is just one more fact type fed into the lower altitude's existing
prompt — `huddleUserMessage`'s `JSON.stringify(facts)` already passes through whatever shape
`buildHuddleFacts` builds. The new piece is persistence (a relay item has to survive from when the
DO generates their note to when the AS generates theirs, possibly a different day) — this is
naturally another `user_settings`-keyed row (by recipient altitude+scope, not by business day,
since a relay can span days until it's been surfaced once), not a new table.

**Open design question:** does a relay item expire/consume itself once shown once, or persist
until the supervisor acts on it? And does the AS get to mark it "handled" (closing the loop back
up, mirroring The Save's ledger pattern) — if so, this and The Save may want to share one
mechanism rather than two parallel ones. Worth deciding together rather than separately.

---

## 5. How these four relate to each other, and to what's already queued

- **Memory** is the one true prerequisite — Pre-Warn and (to a lesser extent) The Save's "did the
  pattern recur" check both need the same trailing-window computation Memory introduces. Build
  Memory first regardless of which of the other three ships next.
- **The Save** is the natural pairing with Notes-73 item 4's "celebrate the wins" ask (task #111)
  — recommend scoping those together rather than letting two sessions invent two different
  win-recognition mechanisms.
- **Pre-Warn** is the natural pairing with Movers Alerts (task #91) re-enabling, and with this
  morning's still-open "schedule-aware notification timing" design question — it's a consumer of
  both, not a reason to build either from scratch again.
- **Cross-Role Relay** is the most purely NEW piece of infrastructure (a cross-altitude message
  queue) — smallest in code terms (reuses `user_settings`, no new table) but the one with the most
  real open design questions (expiry, acknowledgment, whether it merges with The Save's
  close-the-loop pattern).

**Recommended build order, if/when any of this moves from design to build:** Memory first (it's
also independently useful — a GM's own huddle note gets better just from seeing its own store's
recent pattern, with no cross-role or ledger work needed yet). Then either The Save or Cross-Role
Relay next, owner's choice, since they serve different audiences (The Save: anyone, closes a loop
on a flagged pattern; Cross-Role Relay: specifically the DO→supervisor and supervisor→GM
recognition flow). Pre-Warn last, since it's gated on the Movers Alerts re-enable decision and the
schedule-aware timing design, both already pending for unrelated reasons.

## 6. Open questions for the owner, all four concepts

1. Do these four concrete shapes match what was actually meant when each name was coined? (See
   the provenance note at the top — these are reasoned reconstructions, not transcribed intent.)
2. The Save's attribution question (§2): store-level credit only, until crew/manager attribution
   is solved separately — agreed, or does this need to wait until that's solved?
3. Pre-Warn's confidence threshold (§3) and its dependency on the schedule-aware notification
   timing question from this morning — build Pre-Warn's pattern-detection half now (useful inside
   Memory-powered notes even without push delivery), or wait for delivery timing to be settled
   first?
4. Cross-Role Relay's expiry/acknowledgment model (§4) — share a mechanism with The Save's
   ledger, or keep them separate?
5. Build order (§5) — agree with Memory-first, or a different priority given where Fletcher's own
   attention is right now?
