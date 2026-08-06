---
name: mac-session-todo-2026-08-06
description: Everything requiring the owner at a Mac as of 2026-08-06 — PR merges, the tracer run that unblocks the AAG fix, production writes awaiting go-ahead, DevTools captures only he can do, Supabase dashboard checks, and the RLS decision that gates all onboarding.
metadata:
  type: project
---

# Mac session to-do — as of 2026-08-06

Written because the phone session hit the limit of what can be done without the owner.
Ordered by dependency, not importance: §1 unblocks the most downstream work.

Context for whoever picks this up: `notes-54-56-triage.md` (what's shipped vs open) and
`capacity-and-onboarding-review.md` (why onboarding is blocked).

---

## 1. Run the load tracer — unblocks the AAG fix

**Do this first.** Everything about the "app unusable for 2-3 minutes" problem waits on it.

1. Merge **PR #82** (v4.840, startup load tracer) and let Vercel deploy.
2. Open production with **`?trace=1`** — e.g. `https://meridianbi.vercel.app/?trace=1`
3. Log in normally and wait ~3s after the app settles. The waterfall auto-prints to the
   console; no typing needed. (`mfTrace()` reprints it, `mfTrace.off()` disables.)
4. Screenshot or copy the console table.

**What to look at.** The headline line reports `serialisation ratio` = Σ(durations) /
wall-clock:
- **near 1.0** → requests genuinely ran one-at-a-time, confirming the 28-stage serial
  chain. Fix = tiered `Promise.all` with the Sales-chip streams (`loadDarRows`,
  `loadQsrActSummary`) promoted to tier 1. Cheap and low-risk: the stages are already
  independent, each with its own try/catch and its own `setDs` patch.
- **well above 1.0** → they already overlap, and parallelising further won't help. Look at
  `idle` (wall minus union of in-flight intervals) and at the slowest individual tables
  instead — the cost is then per-query, not structural.

Either answer decides the fix. Don't refactor before reading it — v4.594 already
parallelised four stages on a confident guess and the panel is still slow.

---

## 2. Merge the open PRs

- **#81** — ✅ already merged (memory-file rule + Notes 54/55/56 triage + capacity review)
- **#82** — v4.840 startup load tracer. Diagnostic only, off unless `?trace=1`. 719 tests.
- **#83** — v4.841 `training` event type, for the JR sessions. 724 tests.

---

## 3. Production writes awaiting go-ahead

**3.1 Tag the JR leadership event** (Notes 54, clarified 08-06)
Aug 19–21 2026, **all 20 Oklahoma stores**, speaker from Guidon Leadership.
After #83 merges, the type **🎓 Training / Leadership** appears under Operations in the
Calendar Manager tag picker. Use the bulk/recurring path rather than 60 single entries
(20 stores × 3 days).
Deliberately not seeded by script — it's a production write, and the UI already does it.

**3.2 v4.839 retail-event scripts — never run**
- `scripts/seed-retail-events.mjs` — writes 5 rule-derived events to `org_events`
- `scripts/measure-retail-impact.mjs` — writes measured lift to `event_impact`

Both change forecasts. Review a dry run before letting either write. Note the design
already protects you: every retail event ships at magnitude Low → `impactWeight() = 0`,
so nothing moves a forecast until a **measured** value lands. Seeding is therefore safe
to do before measuring.

---

## 4. Captures only the owner can do

**4.1 LifeLenz Time & Attendance endpoint** — blocks two things
`TA_DATA` in `scheduling.js` is a hand-transcribed snapshot from v4.243 (June 2026); no
pull path was ever built. v4.834 made it label itself stale rather than pass as current.
Auth is already solved (`scripts/lifelenz-pull.mjs`'s `X-Auth-Token` / `X-Business-Id`
pattern) — the only unknown is the report-name endpoint.

**How:** log into LifeLenz → DevTools → Network → open the Time & Attendance report →
copy the request URL + payload for the report call. Paste it back.
**Unblocks:** finishing the scheduling auto-pull migration, and the Manager Planner
feature (Notes 54).

**4.2 Chrome extension handshake**
The extension is installed and Chrome restarted cleanly (verified from the CLI), but it
still won't connect. Needs the extension enabled in `chrome://extensions` and claude.ai
logged in as fletcher.reaves@mcreaves.com in Chrome. Once connected, archived session
transcripts can be read directly instead of copy-pasted.

**4.3 `.env.local` is missing on this Mac**
Only `.env.example` is present, so local sessions can't query Supabase — every figure in
`capacity-and-onboarding-review.md` is derived from code and schema, not live data.
Restoring `.env.local` (with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`) makes future
local sessions far more useful.

---

## 5. Supabase dashboard checks

From `capacity-and-onboarding-review.md` §6 — none can be checked from the CLI:

1. **Plan tier**, and actual DB size / egress / MAU against its limits.
2. **Real row counts**, especially `qsr_daily_activity` (est. 190k–240k rows/year and the
   dominant table by an order of magnitude).
3. ⚠️ **Confirm `SUPABASE_SERVICE_ROLE_KEY` is set for every write workflow** — the RLS
   plan flags `qsrsoft-email-parse` as falling back to the anon key if the secret is
   missing. That works today only because RLS is open; **it would break under RLS Phase 1.**
   Check this *before* §6.
4. **PITR / automated backups** — are they on? This is the honest answer to "can we roll
   back?" Git covers code; nothing currently covers Supabase data.

---

## 6. The decision that gates everything: RLS hardening

**Current state:** ~30 tables carry `using(true)` (anonymous access, not merely
any-logged-in-user), RBAC is client-side so it gates rendering rather than what the DB
returns, and the startup loader fetches all 27 stores for every user regardless of role.
**A GM account today hands over the entire district.**

So: users allowed to see everything → 5–15 is fine. Users who must see only their own
stores → **zero, until this lands.**

`project-rls-hardening-plan.md` is written, phased, and approved-to-draft since
2026-07-27. Its safety proof: every pull script and edge function uses the service-role
key, which **bypasses RLS entirely**, so tightening policies cannot break automation.

**What's needed:** the owner's go-ahead to produce `supabase/schema-rls-hardening.sql`,
then run Phase 1 (close anonymous access — near-zero risk), bake a day, then Phase 2
(per-loc isolation via `can_see_loc()`), verified with a restricted test profile.

⚠️ Related: the accepted-risk `xlsx` advisories in `project-security-notes.md` rest on
"only trusted users upload files." Onboarding changes that premise — revisit before, not
after.

---

## 7. Lost memory files — decide whether to chase them

Three files are cited by v4.817–v4.838 commit bodies and were **never committed**. They
lived only in session workspaces that no longer exist. (The rule added in #81 stops this
recurring.)

| File | From | Recoverable? |
|---|---|---|
| `project-aag-tiles-reimagine.md` | Aug 6 session `01S71757XDZoWpe3pAKsBxWu` | Unarchived; runtime offline but the **transcript still renders** — readable via the `Write`/`Read` tool calls in it |
| `cleanup-backlog.md` | Aug 3 session | Find by date, same method |
| `finding-live-intraday-operations-report-data.md` | Aug 4 session (v4.817) — holds the **Live Pulse Phase 2/3 plan** | Find by date, same method |

Worth 10 minutes if the Live Pulse phase plan matters; otherwise let them go and rebuild
from commit bodies, which is what the triage already did.

---

## 8. Decisions needed before the relevant work can start

- **Notes 56 #1 — crew attribution.** The inventory variance engine ends at correlating
  variance windows against who was on shift, to "rule people out over time of who is
  likely responsible for potential wrong-doing." The variance math is sound and buildable.
  Attributing suspected theft to named employees off a statistical window needs an agreed
  framing first: a narrowing aid with explicit confidence shown, never a verdict.
- **Food Cost panel (Notes 55)** — update the original to auto sources, or merge it into
  the newer food-cost area? Merge-vs-update decides the work.
- **Google Reviews (Notes 54)** — needs an API and cost decision before any code.
- **UI/UX kickoff** — parked by the owner until after 2026-08-07 20:00, to be done in
  **Opus Plan mode** with alignment first. The full home-screen direction and menu IA are
  recorded verbatim in `notes-54-56-triage.md` §4.

---

## 9. Available without the owner (if another session picks up first)

- **Triage §2.3** — finish the auto-pull migration: **Scheduling Intelligence**,
  **Schedule Summary**, **Labor Analysis** (Labor Analytics is done as of v4.824). Route
  through `metric-source.js` / `vs-ly.js` per the standing rule. Partially limited by 4.1.
- **Triage §2.5** — Event Lookup remainder: retailer-proximity scouting and micro/pop-up
  events. Needs a data-source decision first, so scope it before building.
- **Triage §3.2** — next custom-report slice (SMG/Voice is the natural one), following the
  v4.838 pattern: scope selector pushed into the engine via `opts.locs`, print view +
  audit CSV, registered as a My Reports type.
