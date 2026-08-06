# Notes 54 / 55 / 56 — triage

Owner pasted Notes 54, 55, 56 on 2026-08-06. Owner's own instructions with the paste:

- Weekly usage is near the cap **until 2026-08-07 20:00**. Prefer low-token work until then.
- Group by quick wins vs major projects before doing anything.
- **UI/UX section is PARKED** until after 08-07, and must be done in **Opus Plan mode**,
  with owner alignment before starting. Do not begin it early.
- For everything else: pick what's achievable at low token cost and propose a path.

Status key: ✅ shipped · ◐ partially shipped · ☐ open · ⛔ blocked on owner

---

## 0. Already shipped (verified against commit bodies — do not redo)

| Item | Where |
|---|---|
| 54 · Move User Management into Settings | ✅ v4.813 |
| 54 · Cash re-pull-until-settled, hourly, stop 2pm CT | ✅ v4.815, fixed v4.816 |
| 54 · AAG tile show/hide lost; Labor tile won't toggle; Mac ≠ MacBook | ✅ v4.814 |
| 54 · Audit data sources, default to auto pulls | ◐ v4.820/824/829/830/833 — see 2.3 for the remainder |
| 55 · Labor Analytics wired to auto pulls | ✅ v4.824 |
| 56 · #1 Inventory counts plotted vs baseline | ◐ v4.827 chart only — see 3.1 |
| 56 · #2 Custom reports, non-QSRSoft panels | ◐ v4.838 = PACE only — see 3.2 |
| 56 · #3 All percentages to 2 decimals | ✅ v4.826 |
| 56 · #4 Event Lookup | ◐ v4.839 = rule-derived retail events — see 2.5 |

v4.814 detail worth keeping: the tile-toggle bug was **two** compounding causes — the
"Sections ☰" button lived inside the Action Checklist header (so it disappeared whenever
`allActiveItems.length === 0`), and `mf_kpi_secs` was localStorage-only, so tile state
never crossed devices. Both fixed; localStorage is now just the instant-paint cache.

---

## 1. Quick wins — low token, do first

**1.1 ☐ Create the standing-rules file (54 · UI/UX sub-item)**
Owner explicitly asked for "a file to remember these rules." The rules are NOT parked even
though the redesign is — write them down now so the parked work starts from them:
  - Nothing becomes visible to other users until it is verified working AND accurate
    against real data, with a clear as-of date (and time, for daily figures).
  - Menu restructure principle: simple primary hierarchy, drill-in via submenus.
  - Capture the owner's proposed IA tree verbatim (§4) so it survives session archiving.

**1.2 ☐ Sooner Rd (20475) / Tinker AFB event tagging (56 · #4)**
Small, concrete, and rides the v4.839 plumbing end to end (`parseStaffingEvents` →
`saveOrgEvents` → `org_events` → `orgEventsToDayMap` → `mf_events` → `_evFactor`). Same
zero-assumed-impact rule: ship at magnitude Low until a measured value exists.

**1.3 ☐ Backup / rollback story (54 · Backend)**
Owner asked "is there a safe backup of settings or the site to roll back to?" Code
rollback is already solved by git. The real gap is **Supabase** — schema + data + the
user-settings rows. Cheap to answer and to write a `pg_dump`-style snapshot script; do
the doc first, script second.

**1.4 ⛔ Run the v4.839 event scripts — needs owner go-ahead**
`scripts/seed-retail-events.mjs` and `scripts/measure-retail-impact.mjs` were shipped but
deliberately never run: both are production writes that change forecasts. Owner should
review a dry run first. **Not a phone task.**

---

## 2. Medium — bounded, follows an existing pattern

**2.1 ☐ AAG load performance (54 · AAG) — HIGHEST non-UI value**
Owner: "App is unusable until [the Sales chip] loads. Sometimes 2-3 minutes or more.
People will not use this if it is that slow." This is an adoption blocker, not a polish
item. v4.594 already parallel-loaded the current-window streams and it's still slow, so
the fix needs actual measurement, not another guess. Bound the diagnosis: instrument the
load waterfall first, report, THEN decide. Do not open-endedly refactor.

**2.2 ☐ AAG tile readiness gating (54 · AAG)**
Two linked asks: (a) keep a tile hidden until *all* of its data is populated, rather than
showing a half-filled tile; (b) when a data path breaks or stays unpopulated, log the
event and raise a priority task. (b) is the natural first consumer of the statistics DB
in §3.3 — design them together even if built apart.

**2.3 ☐ Finish the auto-pull migration (54 · Requests, 55)**
Remaining after v4.820/824: **Scheduling Intelligence**, **Schedule Summary**, **Labor
Analysis** (Labor Analytics is done). Route through `metric-source.js` / `vs-ly.js` per
the standing rule. Known blocker below.

**2.4 ⛔ LifeLenz Time & Attendance has no live source**
`TA_DATA` in `scheduling.js` is a hand-transcribed snapshot from v4.243 (Jun 2026); no
pull path was ever built. v4.834 made it *label itself* as stale rather than pass as
current. Auto-sourcing is feasible — auth is already solved by `scripts/lifelenz-pull.mjs`
— but the report-name endpoint needs **the owner's live LifeLenz session + DevTools
network capture**. Cannot be discovered from this environment. Blocks part of 2.3 and all
of 3.5.

**2.5 ☐ Event Lookup, remaining halves (56 · #4)**
v4.839 covered only rule-derivable retail events. Still open: scout every location for
proximity to major retailers (Walmart/Target/malls — "major" judged per location, since a
Walmart means something different in Tishomingo than in OKC), and detect micro/pop-up
events near stores. Both need a data source decision before any code.

**2.6 ☐ Food Cost panel, original (55)**
Update to auto sources, or merge into the newer food-cost area if that's the better home.
Decide merge-vs-update before building.

---

## 3. Major projects — park until after 08-07, scope individually

**3.1 ☐ Inventory troubleshooting logic engine (56 · #1)**
v4.827 shipped the chart. The real ask is much larger: baseline from month-start on-hand,
plot every purchase / POS sale / completed waste / raw waste, derive a **look-back window
locating where the variance had to have occurred**, then correlate against who was working
that window and keep a running log that rules people out over time.
⚠️ This attributes suspected wrongdoing to named employees. Build the variance-window math
first and keep crew attribution strictly as a *narrowing* aid with explicit confidence —
never a verdict. Worth agreeing on that framing with the owner before writing it.

**3.2 ☐ Custom reports for all non-QSRSoft panels (56 · #2)**
v4.838 did PACE/Visit Readiness as the first slice. Remaining: **SMG/Voice**, **LifeLenz**,
**calendars & events**, plus correlation-derived reports over data already in use. Ship one
panel per commit; the v4.838 pattern (scope selector pushed into the engine via `opts.locs`,
print view + audit CSV, registered as a My Reports type) is the template.

**3.3 ☐ Statistics / telemetry database (54 · Backend)**
Owner's list: panel usage, crash + error logs, pipeline health with suggested resolutions,
active session time per user, tamper detection on code/DB, new-user and removed-user
logging, performance stats, unauthorized-use detection with **automatic instance shutdown**.
Schema design is cheap; implementation is a real project. Auto-shutdown especially needs
care — a false positive locks a legitimate operator out mid-shift. Propose it as
flag-and-alert first, auto-shutdown only once the detector has a track record.

**3.4 ☐ FOB day-by-day curve through the month (55)**
Owner's theory: because FOB % works off total product sales, early-month numbers are
heavily skewed, settle mid-month, and only the remainder reflects true control. Wants the
curve mapped historically across all locations to find the settling point, then defensible
coaching built on it. Genuinely good analysis; `qsr_fob` daily data should support it.
Medium-to-major depending on how far the coaching layer goes.

**3.5 ☐ LifeLenz Manager Planner (54 · new features)**
Recreate manager schedules in-page with events. Blocked by 2.4.

**3.6 ☐ Google Reviews per location (54 · new features)**
Fun-only at first, eventually a scored metric. Needs an API + cost decision before code.

**3.7 ☐ Security sweep + sensitive-data protection (54 · Backend)**
Start from the existing `project-security-notes.md` and `project-rls-hardening-plan.md`
rather than from scratch.

**3.8 ☐ App Store readiness roadmap (54 · Backend)**
Explicitly "not there yet" — deliverable is the roadmap document, not the work.

---

## 4. PARKED — UI/UX (owner: after 08-07, Opus Plan mode, align first)

Do not start these early. Recorded verbatim so the parked plan survives archiving.

**Home screen.** Owner wants the main screen to "scream of look what I can do that no one
else is doing" — nothing off the table, explicitly hunting for home-run ideas. Integrate
Meridian's unique data plus exciting/fun ways to interact with it. Candidate: dynamic
rendering of the primary view based on what each user actually focuses on (learn and show
what they want most). Desktop customization should be standard — dynamic view, user-selected
view, or a hybrid. "This real estate is gold": maximize space and content while staying
clean and crisp.

**Menu restructure — owner's proposed IA.** Simple primary hierarchy, drill-in submenus.
For panels not named below, suggest the logical new home of each existing panel.

- **Notifications** — Alerts · In-App notifications (header chip with unread count) ·
  subscribe-me options, e.g. notify when a metric is a selectable amount out of range
- **Reports** — "amazing reports only we can create" · Org Summary · Rankings (rework for
  impact; fix broken data links/blanks)
- **Planning** — Calendars · Events Tagging · Event Impact · Projections
- **Operations**
- **Scheduling**
- **Labor**
- **People** — Performance Reviews · Rosters · Skill Levels
- **Analytics** — Correlations
- **Forms** — Templates · Pre-Filled · Subscriptions
- **Resources** — file/link manager: upload, remove, rearrange, URL links, folders and
  subfolders (needs building)
- **Test Kitchen**
- **Help** — Knowledge Base · Feature Requests
- **Admin** — Settings · Change Log · In-App Settings · About

**Also parked (UI placement, keep coherent with the restructure):** move SAGE to be
persistent in the main-page top bar (54 · new features).

---

## 5. Owner questions to answer (analysis, no code)

Cheap relative to building, and all four are really one capacity review:
1. Deep analysis of current usage and development pace vs growth in data retention, users,
   and usage — how do we hold up today, and what should be planned for?
2. How many users could be onboarded right now?
3. What should be done before allowing new users?
4. Anything missing from the statistics-DB list in 3.3?

---

## 6. Needs clarification

- **"Aug 19-21 JR"** (54 · new features) — unclear. A calendar event to tag? Someone's
  initials? A visit? Ask before assuming.
- **"Google Reviews … Sun for for now"** — read as "fun for now," i.e. not yet a scored
  metric. Confirm.

---

## 7. Recommended order for the low-token window (before 08-07 20:00)

1. §1.1 rules file + IA capture — pure doc, near-zero risk
2. §1.2 Tinker AFB tagging — small, reuses proven plumbing
3. §5 capacity review — analysis, produces a durable doc
4. §1.3 backup/rollback doc, then script
5. §2.3 finish auto-pull migration — established pattern, low risk
6. §2.1 AAG load performance — *instrument and report first*, decide after

Everything in §3 and §4 waits for the fresh window.
