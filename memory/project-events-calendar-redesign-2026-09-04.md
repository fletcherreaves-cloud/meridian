---
name: project-events-calendar-redesign-2026-09-04
description: Research + design proposal for a unified events/calendar/tagging/impact system. Full audit of the six existing subsystems, live org_events measurements, industry research (PredictHQ/RFC 5545/Teamup/Google), and a proposed canonical model. Owner brief 2026-09-04. Research only — nothing built.
metadata:
  type: project
  status: proposed, not built
  supersedes: none — extends memory/project-events-redesign.md (2026-08-11, owner-signed) and memory/dispatch24-event-scope-design.md
---

# Events, Calendar, Tagging & Impact — a unified system

Owner brief, 2026-09-04, verbatim fragments that set the bar:

> *"research any and all known methods for managing event calendars and tagging while
> incorporating impacts… a standardized system of tying all of these functions together
> seamlessly. I have no problem with a redesign. It is an area I want to like, but something is
> off with it. For one, when I look at it I get a wall of repetitive events."*

> *"The whole system should track everything date related but be smart enough to know what to
> include on a calendar for in store use. For example, I don't necessarily need to see that power
> was out at a location on a calendar of events but do need to see things like sporting events,
> concerts, festivals, etc."*

> *"Use our previously discussed method to tag shared events with one master calendar entry and
> tags for locations impacting."*

> *"I want to love this area and for it to not only work as intended, but look and feel great too."*

**Read `memory/project-events-redesign.md` first.** That 2026-08-11 design carries owner-signed
decisions (§8 decisions log) that this document does **not** re-litigate — it extends them. The one
thing that document got materially wrong is corrected in §1.4 below, with measurements.

---

## PART 1 — AUDIT OF WHAT EXISTS

### 1.0 The headline: there is no single system, there are six, and they meet at one impoverished shape

Everything date-related funnels through **one nested map**:

```
userEvents = { [loc]: { 'YYYY-MM-DD': { type, label, note, icon, source, tags?, impact?, … } } }
```

localStorage key **`mf_events`**, cloud table **`org_events`**. **Exactly one event per
(store, day).** That single structural fact is the origin of nearly every problem below — the
"wall", the silent overwrites, the inability to say "one event, many stores", and the absence of
any place to put an *event identity* that is not a store-day.

Six subsystems write into or read out of it:

| # | Subsystem | File | Role |
|---|---|---|---|
| 1 | **Events & Tags** (List mode) | `src/views/store-dash.js` → `EventCalendar` | The owner-facing ledger. Flat list, search/filter/sort/export. **This is the "wall".** |
| 2 | **Calendar Manager** (Calendar mode) | `src/features/calendar.js` (1,852 lines) | Month grid, agenda, recurring rules, pending-review queue, bulk import, share codes, day-detail organizer, in-app edit |
| 3 | **Holiday engine** | `src/utils/holidays.js` | `buildHolidays()`/`isHoliday()`/`getHolidayAdj()` — pure date arithmetic, needs no stored rows |
| 4 | **Retail/shopping rules** | `src/engine/retail-events.js` | `RETAIL_EVENT_RULES` — statutory windows (OK tax-free, FL back-to-school, Black Friday weekend) |
| 5 | **Event Impact Registry** | `src/views/event-impact.js` + `event_impact` table | Measured per-(store × event_type) sales/GC lift |
| 6 | **Signals Scanner** | `src/engine/signal-registry.js` | `weather` + `calendar` metric groups — correlation, *not* event-aware |

Plus the import/scope engine `src/engine/events-import.js` and the forecast consumer
`src/engine/forecast.js` (`_evFactor`).

They are joined by convention, not by contract. The unifying seam that *does* exist —
`orgEventsToDayMap()` — is the read path everything already funnels through, and it is the single
best lever in the codebase (§3.1).

---

### 1.1 THE "WALL OF REPETITIVE EVENTS" — root cause, with code and live measurements

The owner's complaint is **structurally correct and precisely locatable**. Three compounding causes.

#### Cause A — the ledger UI renders one row per (store × day), with no grouping whatsoever

`EventCalendar`'s `allEvents` (in `src/views/store-dash.js`) flattens the nested map:

```js
for(const [loc,dkMap] of Object.entries(userEvents)){
  for(const [dk,info] of Object.entries(dkMap)){
    ...ev.push({loc,dk,date:new Date(dk+'T12:00:00'),...info});
```

`filtered` then only ever **filters and sorts** that flat array — search, `typeFilter`,
`holidayFilter`, `locFilter`, `sortBy`. **There is no group-by anywhere in the component.** So one
Thanksgiving becomes 27 consecutive visually-identical rows differing only in the store name.
Sorted `date-desc` by default, a district-wide event is 27 adjacent clones. That is the wall,
literally.

Contrast: `CalendarManagerPanel`'s `monthAgenda` (`src/features/calendar.js`) **does** dedupe —
`byLabel[k]=byLabel[k]||{...e,locs:[]}` then renders `(N stores)`. So **the app already contains
the fix, in the sibling view, unused by the view the owner is looking at.** This is the single
cheapest high-impact change available (§5, Phase 0).

#### Cause B — writes materialize N rows for one fact

Every multi-store write loops per store. `applyEventToStores` (`src/features/calendar.js`):

```js
dates.forEach((dt,i)=>{ const dk = dKey(dt);
  locsToTag.forEach(loc=>{ if(!cur[loc]) cur[loc]={};
    cur[loc][dk] = {type, note:note||label, label:dayLabel, …}; }); });
```

The `🗓 Auto-Tag Holidays` button in `EventCalendar` is the worst offender — `stores × HOLIDAY_MAP ×
3 years`:

```js
for(let y=yr-1;y<=yr+1;y++){ const hols=buildHolidays(y);
  for(const [dk,hol] of Object.entries(hols)){
    for(const s of stores){ … next[s.loc][dk]={type:'holiday',note:hol.label,icon:'🗓',
      label:'Holiday: '+hol.label,autoTagged:true}; count++; } } }
```

19 holidays × 27 stores × 3 years ≈ **1,539 rows from one click**, representing 57 real facts.

#### Cause C — the fix for B was built, shipped, and never applied to the data

`collapseScopedEvents()` (`src/engine/events-import.js`, dispatch24/#388) collapses a flat
per-store array into one row + `scope`/`scope_locs`; `orgEventsToDayMap()` expands it back on read.
The schema migration `supabase/schema-org-events-scope.sql` **has been run** — the columns exist.

**Live measurement, this session, 2026-09-04.** Credential: `SUPABASE_SERVICE_ROLE_KEY` as both
`apikey` and `Authorization: Bearer`, against `/rest/v1/org_events`. Calibrated: a deliberately
fake column returned `{"code":"42703"}`, not `*/0` or silence, and `content-range: 0-999/2708`
returned real rows — so these are observations, not an empty-read misread.

| Observation | Value |
|---|---|
| `org_events` total rows | **2,708** |
| `scope='store'` | **2,708** |
| `scope='all'` / `'state'` / `'list'` | **0 / 0 / 0** |
| Distinct `(date_start, label, event_type)` groups | **483** |
| Groups spanning >1 store | 167, occupying **2,392 rows** |
| **Collapse ratio if applied** | **5.61 : 1** (2,708 → 483) |
| `org_event_exceptions` rows | 0 |

By `event_type` (all 2,708): `holiday` 760, `promo` 756, `sports` 571, `school_no_school` 211,
`tax_free` 162, `black_friday` 136, `event` 45, `school_start` 27, `school_end` 27,
`school_early_release` 8, `school_break` 5.

Multi-store rows by type: holiday 760, promo 756, sports 360, school_no_school 191, tax_free 162,
black_friday 135. The LTO/promo rows are **exactly 27 each** — e.g.
`('2025-01-07','Value for Money: McValue Menu','promo')` occupies 27 rows for one district-wide LTO.

> **So: 88% of the cloud event table is redundant copies, the de-duplication machinery is written,
> tested and deployed, and it has simply never been run over the existing data.** Dispatch24's own
> closing note predicted exactly this — *"Re-running `expandRetailEvents` → `approveBulk` for the
> ~733 existing retail events after the migration lands will be the first real test… that hasn't
> been done in this pass."* It still hasn't.

#### Cause D — 760 holiday rows that should not exist at all

`project-events-redesign.md` §3 established the principle: **holidays are a rule, not data.**
`isHoliday()`/`HOLIDAY_MAP` answer "is 2026-11-26 a Black Friday?" on demand; `forecast.js` calls
them directly and never reads a materialized holiday tag. #197 Slice 1 (v4.983) removed
`autoTagHolidays()`'s 3 automatic call sites and shipped
`scripts/cleanup-materialized-holiday-events.mjs`.

**Measured: 760 holiday rows remain, all `method:'manual'`, 19 distinct labels, spanning
2025-01-01 → 2026-07-04.** 19 labels × ~27 stores × ~1.5 years ≈ 760. The cleanup script exists and
appears never to have been run; the three owner-clicked auto-tag buttons (`EventCalendar`'s
`🗓 Auto-Tag Holidays`, `analytics.js`'s "Tag All Holidays", the Review Pack inline tagger) are all
still live and still materialize. Removing these 760 alone cuts the ledger by 28%.

---

### 1.2 The data model, field by field

One `userEvents[loc][dk]` entry, union of all writers:

| Field | Written by | Notes |
|---|---|---|
| `type` | all | single `EVENT_TYPES` key |
| `tags[]` | `_withPriceEvents`, `combineOrgEntries` | `[{type}]` — **multi-type exists but no UI writes it** |
| `label` / `note` / `icon` | all | `label` gets ` (Day N of M)` suffix on spans |
| `source` / `method` | all | provenance: `manual` / `bulk upload` / `ai search` / `recurring rule` |
| `orgSourced` / `orgEventId` | `orgEventsToDayMap` | cloud round-trip keys |
| `impact:{magnitude,daypart,gameDay}` | import | High/Medium/Low × breakfast/afternoon/day/dinner/all/gameday |
| `expectedSalesDelta` / `expectedGcDelta` | edit UI | owner-tunable fraction — **measured: 0 of 2,708 rows populated** |
| `status` | edit UI | `canceled` / `postponed` / `rescheduled` → zeroes `_evFactor` |
| `rangeId` / `rangeDayNum` / `rangeTotalDays` | span writers | span reassembly |
| `scope` / `scopeState` | scoped rows | **0 rows carry it** |
| `verification` | import | `Confirmed` / `Estimated` |
| `url`, `opponent`, `kickoff` | import/edit | |
| `combinedEvents[]` | `combineOrgEntries` | escape hatch for the one-slot-per-day limit |
| `autoTagged`, `synthetic` | auto-taggers | |

**Structural verdicts:**

- **No event identity.** The key is `(loc, date)`. `org_events` adds `unique(loc,date_start,label)`.
  There is nowhere to hang "this is one event" — hence `rangeId` (string-concatenated), `scope`
  sentinel locs (`*ALL*`, `*STATE:OK*`, `*LIST:…*`), and `combinedEvents` as three separate
  workarounds for the same missing concept.
- **One slot per (loc, day)** — issue #142 measured **261 legitimate same-day pairs** across 27
  stores (a school closure *and* a game). `combineOrgEntries` string-joins them (`label: a + ' + ' + b`)
  and `EventCalendar` re-splits them for display. Real data loss was only recently stopped here.
- **No public/internal flag.** The owner's power-outage-vs-concert distinction has **no field to
  live in**. `EVENT_TYPES` groups exist (`🏪 Store Events` = tech/utilities/maintenance/power/outage
  vs `🚨 Community / External` = event/sports/…) but they are a *tag-picker UI grouping only*, never
  read as a visibility rule anywhere. This is the cleanest new-capability gap in the whole audit.
- **No impact-vs-metric mapping.** `impact_daypart` says *when*; nothing says *what* (sales? GC?
  DT? Park? labor?). See §3.2 and the "carport" open question.

### 1.3 How events reach the forecast — the one part that is genuinely well-built

`forecast.js`'s `_evFactor` is a clean **3-tier precedence ladder**, and it should be preserved
intact by any redesign:

```
forecast = lyAdjH × opsFactor × (1+wAdj) × (1+trendFactor) × (1+eventFactor) × (1+plusUp)
```

1. **Event Impact Registry** (`_EVENT_IMPACT[loc][type]`) — the *measured*, curated per-store value
   wins. Sports splits home/away off the label.
2. **Learned historical** (`computeEventFactors` in `src/utils/events.js`) — per (loc, type) median
   of `(actual − trimmed-mean same-DOW baseline) / baseline`, requiring ≥4 baselines and ≥2
   occurrences.
3. **Stored expected impact** — `expectedSalesDelta`, else `impactWeight(impact)`
   (`High:0.08 / Medium:0.03 / Low:0.0`, `GAMEDAY_WEIGHT:0.10`).

Clamped ±25%. `status:'canceled'|'postponed'` → 0. Multi-tag averages.

**This is a better design than the UI feeding it deserves**, and it embodies the standing rule in
`retail-events.js`: *"MEASURED lift beats ASSUMED lift"* — every retail rule ships `Low` →
`impactWeight` 0 → moves no forecast until measured.

**The registry is healthier than `project-events-redesign.md` §9 claims.** That document says
"only Sports wired". **Measured 2026-09-04: `event_impact` holds 189 rows across 8 types, every
one `source:'measured'`** — sports 26, holiday 27, tax_free 26, promo 26, black_friday 25,
small_biz_sat 25, cyber_monday 25, event 9. Sample: loc 13113 sports `home_impact 0.077 /
away_impact 0.019 / n_home 14`. The measurement pipeline
(`scripts/measure-retail-impact.mjs`, `measure-holiday-impact.mjs`,
`measure-tagged-event-impact.mjs`, `retail-events.js`'s `measureEventLift`) is real and running
monthly. **`weather` is the one declared type with zero rows** — still a genuine gap.

`measureEventLift(salesRows, eventDatesByLoc, opts)` is the reusable engine: matched same-DOW
baseline within `windowDays:28`, median, `minBaseline:3`, excludes other event dates. It already
implements the matched-control counterfactual the industry uses (§2.4) — **do not build a second one.**

### 1.4 Weather is two disconnected things

- **As a correlation input:** `signal-registry.js`'s `weather` group (`wxTmax/wxTmin/wxTavg/wxRain/
  wxWind` from `ds.weatherRows`, Open-Meteo) and the `calendar` group (synthetic `calWeekend/calFri/
  calMon` 0/1 flags over `_calendarUniverse`). Feeds Scanner correlations only.
- **As an event:** 10 `EVENT_TYPES` weather keys (`winter_storm`…`hurricane`), hand-tagged, feeding
  `_evFactor`.
- **As a forecast term:** a separate `wAdj` in `forecastDay`, clamped −15%/+3%.

**Nothing connects them.** No automatic "a storm was recorded at this store on this date → propose a
weather event". `weatherRows` already carries the daily observations that would drive it, and
`event_impact` already has a `weather` row shape waiting to be populated. This is a high-value,
low-cost automation (§3.2, §5 Phase 2).

### 1.5 Everything else that is date-driven but outside the events system

Named because the owner asked for *"anything tied to them I have inadvertently left out"*:

| Thing | Where | Relationship |
|---|---|---|
| **Material store changes** | `memory/store-events-material-changes.md` | Rebuilds/relocations that **break comparability**. Lindsay (18213) Walmart→standalone. Prose in a memory file — *no structured representation anywhere*. The `newStore` flag explicitly won't fire. **This is a Type-C period event with real forecast consequences and zero data model.** |
| **Competitor openings** | `EVENT_TYPES.comp_new` etc. | Owner-decided (`project-events-redesign.md` §2) to be a **baseline shift, not a day event** — split to its own issue. Still only expressible as a day tag. |
| **Price changes** | `src/engine/price-events.js` → `_withPriceEvents` | Auto-detected from `ds.pmixRows`, injected into `userEvents` at read time as `price_change` tags. **A model for how other auto-detected events should work.** |
| **Graded visits** (CFV/RGRV/EcoSure) | `EVENT_TYPES.cfv/ecosure/rgr`, `visit-readiness.js` | Scheduled/actual visit dates; `propel.mcd.com` returns real `visitDate` per `memory/finding-ecosure-propel-api-2026-08-22.md`. Not on any calendar. |
| **School config** | `org_school_config` (5+ rows, first/last day + bell times) | Structured, per-store, **already cloud-resident**; the "school-calendar LY alignment" fix depends on it. |
| **Promos/LTOs** | 756 `promo` rows | District-wide, exactly 27 copies each. `promo-roi.js` reads `userEvents` for matched-day ROI. |
| **Recurring rules** | `loadRecurringRules()` — **localStorage only** | Fixed month/day/duration. **Not in Supabase → device-local, lost on device switch.** Violates the standing "every new persistent data type goes into Supabase" rule. |
| **Share codes** | `decodeShareCode` | External submitters → pending queue. |
| **Trading days / business day** | `src/engine/trading-days.js`, `date.js`'s `businessDate()` | The 4am boundary. Any event day-boundary must use it. |

---

## PART 2 — INDUSTRY RESEARCH

Web access worked; PredictHQ's own domains (`www.predicthq.com`, `docs.predicthq.com`) are blocked
by this environment's egress proxy, so their material below is from search-result summaries rather
than fetched pages — **treat the category list as high-confidence and any specific numeric claim as
needing verification before it is designed against.**

### 2.1 PredictHQ — the direct comparable

An API product built exactly around "events that affect demand", used by QSR chains for staffing and
demand planning.

- **~19 categories**, split by *kind*, not by subject:
  - **Attended:** `concerts`, `festivals`, `performing-arts`, `sports`, `conferences`, `expos`,
    `community`, `academic`
  - **Non-attended:** `public-holidays`, `school-holidays`, `observances`, `severe-weather`,
    `disasters`, `airport-delays`
  - **Unscheduled:** things with no pre-known date — severe weather, disasters, airport delays,
    infectious disease
- **Ranking is the core primitive.** Every event carries a numeric **PHQ Rank** (impact by
  attendance) and a **Local Rank** — *"a numeric value on a logarithmic scale between 0 and 100 to
  represent the impact of an event to its local area"*, computed as **estimated attendance relative
  to local population density**. Severe weather has a Local Rank but **no attendance** — impact is
  areal, not headcount. Published guidance is per-industry **Local Rank thresholds** (filter out
  everything below N for your vertical).
- **`phq_attendance`** — predicted headcount, separate from rank.
- **Predicted Impact Patterns** — *"flagging 'leading' and 'lagging' days, which are the days before
  and after an event occurs"*, with the impact curve differing **by category and by industry
  vertical**. An event is a *shaped window*, not a point.
- Coverage framing: ~8 years historical + ~2 years future, explicitly *"enabling companies to
  backtest models"*.

**Directly applicable lessons.** (a) Split categories by *kind* (attended / non-attended /
unscheduled), which is very close to the owner's own calendar-vs-log instinct. (b) A **single
numeric relevance rank** is what makes filtering tractable at scale — Meridian has magnitude
High/Medium/Low but no scalar. (c) **Relevance = magnitude relative to local context**, not absolute
— a 5,000-person fair matters enormously at Tishomingo and not at all at a metro store. (d) Events
have **leading/lagging days**; Meridian's model is strictly same-day.

### 2.2 RFC 5545 (iCalendar) — the settled answer to "one event, many instances"

The 30-year-old standard the whole calendar industry implements:

- A **master `VEVENT`** carries `UID` + `DTSTART` + **`RRULE`**. *"The recurrence set is the
  complete set of recurrence instances… generated by considering the initial DTSTART along with the
  RRULE, RDATE, and EXDATE properties"* — i.e. **instances are computed, never stored.**
- **`RECURRENCE-ID`** *"allows the reference to an individual instance within the recurrence set"* —
  *"A modified single occurrence becomes an exception — a standalone record that overrides the rule
  for one date while the rest of the series follows the master."*
- **`EXDATE`** removes an instance without touching the master.

Meridian's dispatch24 design **already cites and follows this** ("expand-on-read, not
materialize-on-write (RFC 5545 model)"), and `org_event_exceptions` is explicitly *"the RFC 5545
exception-instance answer"*. **The architecture is right and standards-aligned; it is the data and
the UI that never caught up.** The one axis RFC 5545 does *not* cover is **scope across locations** —
that is Meridian's own extension, and §3.1 keeps the two orthogonal.

### 2.3 Calendar UX — how the wall is avoided elsewhere

- **Google's "event chips"** (US Patent 9,740,362) — *"displaying an event associated with multiple
  calendars only once, together with a visual indication that the event belongs to multiple
  calendars."* One row, a badge for the rest. This is exactly the owner's ask.
- **Teamup** names the two options explicitly: **"striping"** — *"one event with colored stripes
  representing each assigned calendar… a compact view… avoiding duplicate entries"* — versus
  **"multiple boxes"**, which *"displays the event separately on each assigned calendar while still
  linking them to the same underlying event"*. Crucially, **the choice is per-view, from one stored
  event**: *"Rather than creating separate copies… assign one event to multiple sub-calendars, so
  updates only need to be made once."*
- **Sub-calendar filtering** — one joint calendar, N overlays, user toggles which apply. The standard
  mechanism for personalized views (§3.3).

**Verdict:** the master-entry + location-tags + collapsed-display pattern the owner described from
memory *is* the industry-standard answer, independently arrived at. Build it with confidence.

### 2.4 Impact scoring conventions

Consistent across the promotions/causal-inference literature:

- **Baseline counterfactual → uplift.** *"The baseline forecast predicts sales without any
  promotional activity, serving as a control scenario… The difference between the promotion and
  baseline forecasts reveals the promotional lift."*
- **Matched controls.** *"Establishing a stable/good set of matched markets that correlate with the
  test market is important for the model to predict the baseline values (and hence calculation of
  lift) in a reliable way."*
- **Uncertainty is first-class.** Bayesian Structural Time Series / Bayesian Causal Forests are used
  specifically for *"credible interval estimation around individual uplift predictions"*.
- **Decomposition** — cannibalization, halo, timing-shift (pull-forward) are separated from net lift.

**Meridian's `measureEventLift` already implements the mainstream version of this** (matched
same-DOW baseline in a ±28-day window, median, minimum sample). What it lacks is **(a) an interval
or confidence tier alongside the point estimate**, and **(b) `n` surfaced in the UI as a
trust signal** — `event_impact` stores `n_home`/`n_away` but the forecast ladder uses the point value
unconditionally. Adding a confidence tier is the single most standards-aligned upgrade available.

### 2.5 QSR/retail workforce platforms

Thinner and more marketing-shaped than the above; reported honestly as such. Crunchtime states its
AI *"accounts for weather patterns and holiday demand"* and predicts labor *"by role, by hour"*, and
that forecasts should account for *"fixed tasks, holidays, LTOs, and other special events"* with
*"managers… leave notes about special events in the calendar."* PredictHQ publishes a QSR workforce-
optimization vertical. **The consistent pattern is: events feed the labor forecast, not just the
sales forecast, and they land at hour/daypart granularity** — which is precisely what Meridian's
unused `impact_daypart` field was built for, and precisely the direction the owner's
"what [daypart] is expected to be impacted" points.

### 2.6 The public/internal split — no standard term found

Searched specifically for an established retail term separating a customer/ops-facing event calendar
from an internal incident log. **Nothing authoritative came back.** The retail-incident literature
(SafetyCulture, incident.io, Auror) treats incident management as its own discipline with its own
taxonomy and never frames the split this way. PredictHQ's *attended / non-attended / unscheduled*
axis is the closest published analogue, and it is a different cut (it is about whether people gather,
not about who should see it).

**Honest conclusion: the owner's distinction is correct and useful, and there is no industry term to
borrow. Coin one.** This proposal uses **`visibility: 'calendar' | 'log'`** — see §3.1.

---

## PART 3 — THE PROPOSAL

Design principle throughout: **one event entity, expanded on read, never materialized.** Everything
below is an extension of machinery that already exists.

### 3.1 A single canonical event model

Replace the `(loc, date)` primary key with a real event identity. One table, `events` (evolving
`org_events` in place — §5):

```
events
  id                  uuid PK          — the event's identity (RFC 5545 UID)
  tenant_id           uuid
  ── WHAT ────────────────────────────────────────────────────────────
  title               text             — "OU vs Texas", "Carter County Free Fair"
  category            text             — the taxonomy key (§3.1a)
  visibility          text             — 'calendar' | 'log'   ← THE OWNER'S DISTINCTION
  ── WHEN ────────────────────────────────────────────────────────────
  date_start          date
  date_end            date             — = date_start for single-day
  rrule               text NULL        — RFC 5545 recurrence; NULL = one-off
  lead_days           int  DEFAULT 0   — PredictHQ "leading days"
  lag_days            int  DEFAULT 0   — "lagging days"
  time_start          time NULL        — kickoff / gates
  daypart             text NULL        — breakfast|afternoon|day|dinner|all|gameday
  ── WHERE (the master-entry + location-tags pattern) ────────────────
  scope               text             — 'all' | 'state' | 'patch' | 'list' | 'store'
  scope_state         text NULL
  scope_locs          text[] NULL      — resolved store list
  ── IMPACT ──────────────────────────────────────────────────────────
  relevance           int NULL         — 0..100 local-relevance rank (§3.2d)
  expected_impact     jsonb NULL       — { sales:+0.08, gc:+0.05, dtPct:-0.02 }  (§3.2)
  impact_confidence   text             — 'measured' | 'estimated' | 'assumed' | 'unknown'
  impact_n            int NULL         — sample size behind a measured value
  ── PROVENANCE ──────────────────────────────────────────────────────
  status              text             — scheduled|canceled|postponed|rescheduled
  verification        text             — Confirmed | Estimated
  source, url, method, entered_by, entered_at, note

event_exceptions                       — RFC 5545 RECURRENCE-ID / EXDATE, already exists
  event_id, loc, occurrence_date, status, overrides jsonb
```

**Four changes carry the whole design:**

1. **`id` is the event.** `(loc, date)` stops being an identity and becomes a *projection*. This is
   what kills the wall at the source: one Thanksgiving is one row, always.
2. **`scope` + `scope_locs` is the master-entry + location-tags pattern** the owner remembered — and
   it is **already implemented on both sides** (`collapseScopedEvents` writes it,
   `orgEventsToDayMap` expands it). It needs *data*, not code.
3. **`visibility` is new and is the owner's power-outage-vs-concert rule, made structural.** Not a
   UI convention — a column, defaulted per category, overridable per event.
4. **`rrule` replaces the localStorage recurring rules**, and replaces materialized holidays
   entirely (`isHoliday()` becomes one built-in rule provider among several).

#### 3.1a The category taxonomy — two orthogonal axes

Today `EVENT_TYPES`' 44 keys conflate subject and visibility. Split them:

| Axis 1 — **Category** (what it is) | Axis 2 — **Visibility** (who should see it) |
|---|---|
| `holiday`, `observance` | `calendar` |
| `sports`, `concert`, `festival`, `community` | `calendar` |
| `school` (start/end/break/no-school/early-release) | `calendar` |
| `retail` (tax-free, Black Friday, Small Biz Sat, Cyber Monday) | `calendar` |
| `promo` (LTO) | `calendar` |
| `weather` (10 existing subtypes) | `calendar` when forecast, `log` when recorded after the fact |
| `store_incident` (power, tech, utilities, maintenance, outage) | **`log`** ← the owner's example |
| `staffing`, `training` | `log` |
| `visit` (CFV / EcoSure / RGR) | `log` (management-visible, not crew-facing) |
| `competition` (new/promo/closure/pricing/media) | `log` |
| `access` (road closure, construction) | `calendar` — it changes how customers reach the store |
| `material_change` (rebuild, relocation, format change) | `log` + **period semantics** (§3.4) |

Every existing `EVENT_TYPES` key maps cleanly onto exactly one `(category, default visibility)`
pair, so migration is a lookup table, not a judgement call per row (§5).

**`visibility` defaults from category and is overridable per event** — a power outage that closed the
store for a day *should* appear on a store's calendar; a routine one should not. The owner gets a
default that is right ~95% of the time plus an explicit override, rather than a rule that fights him.

### 3.2 Impact modeling

Keep `forecast.js`'s 3-tier precedence ladder **exactly as it is** — it is correct and it already
prefers measured over assumed. Extend it in four ways, all reusing existing engines.

**(a) Impact becomes multi-metric.** `expected_impact` as a jsonb map instead of a scalar sales
delta, keyed by metrics the app already computes: `sales`, `gc` (guest count), `dtPct`, `oepe`,
`park`, `laborHours`. **The forecast keeps reading `sales` only** — nothing else changes in
`forecastDay` — but the calendar and the store view can then *state which metric an event hits*,
which is what the owner's "as detailed as what [carport] is expected to be impacted" asks for
(see Open Question 1). `event_impact` already proves the pattern: it carries sales **and** GC
columns from the same `measureEventLift(…, {valueKey:'gc'})` call.

**(b) Confidence tiers, per §2.4.** Every impact value carries `impact_confidence` ∈
`measured | estimated | assumed | unknown` and `impact_n`. Surfaced in the UI as a badge, and
usable as a forecast gate (e.g. "only apply measured impacts with n ≥ 5"). This makes
`retail-events.js`'s standing rule — *"MEASURED lift beats ASSUMED lift"* — visible to the user
rather than encoded as a silent `Low → 0` convention.

**(c) Auto-measurement extends to every category.** `measureEventLift` is category-agnostic already;
`scripts/measure-tagged-event-impact.mjs` exists. Add the two missing pipelines
(`weather`, `event`/festival) and schedule them alongside the monthly retail run. **Weather is the
easy win**: `ds.weatherRows` already holds daily temp/rain/wind per store, so a weather-event impact
can be measured *without anyone tagging anything* — derive candidate weather days from the
observations, run them through the same matched-DOW baseline, populate `event_impact['weather']`.

**(d) `relevance` (0–100), Meridian's Local Rank.** Computed, not hand-entered:
`relevance = f(expected |impact|, confidence, distance from store)`. `STORE_COORDS`/`INV_ORG_COORDS`
already carry lat/lng and `src/engine/locality.js` exists. This is the field that makes the
in-store calendar filterable to "things that actually matter here" (§3.3) without the owner
curating 27 lists by hand.

**(e) Leading/lagging days.** `lead_days`/`lag_days` per §2.1, defaulted per category (a 3-day
festival has lead 1 / lag 0; a hurricane has lead 2 / lag 3). Cheap to store now, used when the
forecast is ready for it. **Explicitly *not* wired into `forecastDay` in phase 1** — store the shape,
prove the lift, then apply, per the measured-beats-assumed rule.

### 3.3 The per-location personalized calendar

A store's calendar is a **query**, not a table:

```
storeCalendar(loc, range) =
  events
    where scope resolves to include `loc`             (orgEventsToDayMap — exists)
      and visibility = 'calendar'                     (new: the owner's rule)
      and relevance >= threshold(loc)                 (new: keeps it short)
      and no 'canceled' exception for (event, loc)    (org_event_exceptions — exists)
    expanded through rrule/date_end into occurrences  (RFC 5545 — expand-on-read)
```

Three sub-calendars a GM can toggle, per the §2.3 sub-calendar pattern:
**📣 Community** (sports/concerts/festivals/school/access) · **🍔 Business** (LTOs, retail windows,
holidays) · **📋 My Store** (visits, training, incidents — `log`, off by default).

The owner's power-outage example resolves cleanly: it is `category:'store_incident'`,
`visibility:'log'` — **it still exists, is still searchable, still feeds impact measurement and the
Why Engine, and simply is not on the printed calendar.** Nothing is hidden; one view is curated.

**Print/export** (`printAgenda` already exists and does multi-month) becomes the in-store artifact:
one page per month, community + business only, per store, with the expected impact stated in
restaurant words — *"Fri Sep 12 · Ada HS Football (Home) · expect +8% dinner"* — which satisfies the
standing "say the number AND the decision" voice rule.

### 3.4 Period events — the missing third shape

`project-events-redesign.md` §1's Type C (bounded period / structural change) still has no
representation, and `store-events-material-changes.md` is prose. Give it one:
`category:'material_change'`, `visibility:'log'`, `date_start`/`date_end` spanning weeks or months,
and a flag that means **"vs-LY is invalid across this boundary"**. Consumers (backtest, peer
ranking, coaching) can then ask the events system a question they currently cannot ask.

This is deliberately scoped as *representation only* — the forecast-side baseline shift for
competitor openings stays split out as its own issue, per the owner's 2026-08-11 decision.

### 3.5 UI / UX direction

**One panel, `events`, five views.** Absorbs Events & Tags (List), Calendar Manager, and Event Impact
— the owner's *"should get their own home and dashboard"*. Built `route:true` from day one per the
panel contract, `RoutePanelShell` + `LocationSelector` + `DateRangeControl`.

```
◷ Events                       [ Upcoming | Calendar | Log | Impact | Rules ]
                               [ All ▾ State ▾ Patch ▾ Store ▾ ]   [ + Add ]
```

**1 · UPCOMING** *(default — owner-decided 30 days + custom range)*
Grouped by date, **one row per EVENT**, never per store-day:

```
┌────────────────────────────────────────────────────────────────────┐
│ FRI  SEP 12                                                        │
│  🏈 Ada HS Football (Home)          ● Ada            +8% dinner ⬤measured n=14 │
│  🎪 Carter County Free Fair  day 2/4  ◍ 3 stores ▾   +5% all    ◐estimated     │
│  🍔 McValue Menu             ongoing  ◉ all 27       —          ○unmeasured    │
└────────────────────────────────────────────────────────────────────┘
```

The scope chip (`◉ all 27` / `◍ 3 stores` / `● Ada`) **is** the master-entry + location-tags
pattern made visible; it expands in place to the per-store impact list (owner-decided:
*"One row, expands to per-store impact"*). Confidence is a glyph, not a word — `⬤ measured /
◐ estimated / ○ assumed`.

**2 · CALENDAR** — month grid, existing `CalendarManagerPanel` shape, with **event chips** (§2.3):
one chip per event with a store-count badge, never 27 stacked chips. Day click → the existing
day-detail organizer.

**3 · LOG** — `visibility:'log'` only. Fast entry, dense table, the incident/audit surface. Small,
because holidays and district events no longer live here.

**4 · IMPACT** — the existing Event Impact Registry, plus per-category measurement status
("weather: not yet measured") so a gap is legible rather than silent.

**5 · RULES** — `rrule` recurrence, category→visibility defaults, relevance thresholds, and the
**pending-review queue** (rule confirmations + AI search + share-code imports + — the new part —
**anomaly-proposed tags**, per `project-events-redesign.md` §4's owner-approved inversion).

**Adding an event — one flow, three questions.** *What* (title + category, visibility auto-set with
an override) → *When* (date/range, "repeats?" → rrule) → *Where* (**the scope selector: All / State /
Patch / Store, the same pill hierarchy as every other filter in the app**). Impact is optional and
defaults from the category's measured value. **The scope selector is where the master-entry pattern
becomes the natural thing to do rather than a thing to remember.**

*Deliberately creative here:* the confidence glyphs, the scope chip as a first-class expandable
control, and the relevance threshold as the in-store calendar's curator. *Following established
patterns:* RFC 5545 master+exception, Google/Teamup event chips, sub-calendar toggles, PredictHQ's
rank-threshold filtering and lead/lag windows.

---

## PART 4 — WHAT MAKES THIS TRACTABLE

Most of it is already built. Honest accounting:

| Capability | Status |
|---|---|
| Expand-on-read scope model | ✅ `orgEventsToDayMap` + `collapseScopedEvents`, tested, deployed |
| `scope`/`scope_locs`/`scope_state` columns | ✅ migration run (measured) |
| Per-store exceptions (RFC 5545) | ✅ table + RLS + CRUD helpers; **0 rows, no UI** |
| Measured impact registry | ✅ 189 rows, 8 categories, all `measured` |
| Impact measurement engine | ✅ `measureEventLift` + 3 scripts + monthly workflow |
| 3-tier forecast precedence | ✅ `_evFactor`, clamped, status-aware |
| Deduped agenda rendering | ✅ **exists in `monthAgenda`, absent from the ledger the owner looks at** |
| Multi-month print | ✅ `printAgenda` |
| Recurring rules | ⚠️ localStorage only — must move to Supabase |
| `visibility` (calendar vs log) | ❌ new — one column + a category map |
| `relevance` rank | ❌ new — computed from existing coords + impact |
| Multi-metric `expected_impact` | ❌ new — jsonb; forecast still reads `sales` |
| Lead/lag days | ❌ new — store now, apply later |
| Period/material-change events | ❌ new — representation only |
| Data collapsed to master entries | ❌ **the big one: 2,708 → 483** |

---

## PART 5 — MIGRATION & PHASING

Nothing below loses an event, a rule, or a share link.

**Phase 0 — stop the bleeding, ship the visible win (small, standalone, ~1 dispatch).**
1. **Group the ledger.** Port `monthAgenda`'s dedupe into `EventCalendar`'s `filtered` — group by
   `(date, label, type)`, render one row + `(N stores)`, expand on click. **This alone removes the
   wall the owner sees, with zero schema change**, and is reversible.
2. **Run `scripts/cleanup-materialized-holiday-events.mjs`** (dry-run first). Removes ~760 rows / 28%.
3. **Retire the 3 remaining holiday auto-tag buttons** — `isHoliday()` already answers on demand and
   no forecast path reads a materialized holiday tag (verified by grep in #197, re-confirmed here).

**Phase 1 — collapse the data (the 5.6:1 win).**
4. Backfill `scope` by running the existing `collapseScopedEvents` over `org_events`: group by
   `(date_start, date_end, label, event_type, category)`, write one scoped row, delete the copies.
   **2,708 → ~483.** Write it as a dry-run-first script mirroring the cleanup script's shape.
   Existing `scope:'store'` rows are untouched by construction (a group of 1 passes through).
5. Verify against the round-trip test already in `src/__tests__/events-scope.test.js` — every field
   an existing consumer reads must match exactly.

**Phase 2 — the new columns, additively.**
6. `visibility` (defaulted from a category map — no per-row judgement), `relevance`,
   `expected_impact` jsonb, `impact_confidence`, `impact_n`, `lead_days`, `lag_days`, `rrule`.
   All nullable, all defaulted so **every existing row keeps behaving identically**.
7. Migrate recurring rules from localStorage → Supabase as `rrule` events. Read localStorage once on
   first load, write up, keep reading local as fallback (the established `model_assignments` pattern).
8. Weather auto-measurement → populate `event_impact['weather']`.

**Phase 3 — the panel.**
9. Build the 5-view `events` panel; keep the old ids registered as `kind:'internal'` redirects,
   exactly as `calendar-manager` was retired in #191.
10. Anomaly → confirm/dismiss queue (the genuinely new leg from `project-events-redesign.md` §4).

**Non-negotiables carried through:** `forecastDay`/`computeEventFactors` unchanged (they read
`orgEventsToDayMap`'s output only); share codes keep working (they feed the pending queue, which
survives); manual entry never removed; every new persistent type in Supabase with `tenant_id` + RLS.

---

## PART 6 — OPEN QUESTIONS FOR THE OWNER

1. **"what carport is expected to be impacted" — which word?** Two real candidates, both live in
   this app:
   - **`daypart`** *(most likely — phonetically and semantically closest)*. The schema **already has
     `impact_daypart`** with breakfast/afternoon/day/dinner/all/gameday, populated by imports and
     never surfaced. If this is it, the feature is largely **already built and just needs showing**.
   - **`Park`** — a real McDonald's metric with a real target (`tPark`, per store, in
     `DEFAULT_TARGETS`; there is a `park-oepe-quadrant.js` engine). Would mean "which *metric* does
     this event hit", which §3.2a's multi-metric `expected_impact` covers.
   Cheap to satisfy both, and §3.2a does — but **which one drives the default UI matters.**

2. **Should a "big" incident ever reach the store calendar?** The proposal defaults
   `store_incident` → `log` with a per-event override. Is an override enough, or should severity
   auto-promote (e.g. an outage that closed the store shows on the calendar)?

3. **Who can add events, and at what scope?** Should a GM add a store-local event (a school
   fundraiser) directly, or into a review queue? Should a GM be able to **cancel** a district event
   for their store (the `org_event_exceptions` mechanism is built and has no UI)?

4. **What belongs on the printed in-store calendar?** Proposal: community + business, relevance
   above a threshold, expected impact in plain words. Confirm the sub-calendar split (📣 Community /
   🍔 Business / 📋 My Store) matches how you'd hand it to a GM.

5. **Concerts/festivals — how do they get in?** Today: manual, bulk workbook, or the AI batch search
   (2–4 min, 27 stores, Anthropic API). Is a paid event feed (PredictHQ-class) on the table, or
   should this stay owner/GM-sourced plus AI-assisted discovery?

6. **Retire the localStorage recurring rules, or migrate them?** They are device-local today and
   invisible on any other device. Migrating preserves them; retiring in favour of `rrule` is cleaner.
   Are there rules currently in use worth preserving?

7. **Should `relevance` gate the forecast, or only the display?** Proposal: **display only** in
   phase 1 (measured-beats-assumed). Confirm you don't want a low-relevance event silently dropped
   from the forecast.

8. **Material changes / competitor openings** — the store-format changes in
   `store-events-material-changes.md` are prose today. Should they become structured period events
   in this system now (representation only), or stay out until the baseline-shift forecast work is
   scheduled?

---

## Related

- `memory/project-events-redesign.md` — 2026-08-11 owner-signed decisions. **Not superseded.**
  Corrections this document makes to it: the Event Impact Registry is at 189 measured rows across
  8 types, not "only Sports wired" (§1.3); the holiday de-materialization is **partially** done —
  760 rows remain (§1.1 Cause D).
- `memory/dispatch24-event-scope-design.md` — the scope/exception mechanism. Its predicted follow-up
  (collapse the existing rows) is **measured here as still outstanding**: 0 of 2,708 rows scoped.
- `memory/store-events-material-changes.md` — the unstructured Type-C register (§1.5, §3.4).
- `memory/finding-ecosure-propel-api-2026-08-22.md` — real `visitDate` data for `category:'visit'`.
- `src/engine/events-import.js` — `collapseScopedEvents` / `orgEventsToDayMap` / `combineOrgEntries`.
- `src/engine/retail-events.js` — `RETAIL_EVENT_RULES`, `measureEventLift`, the measured-beats-assumed rule.
- `src/engine/forecast.js` — `_evFactor`, the 3-tier precedence ladder to preserve.

### Sources (Part 2)

- [PredictHQ — Events](https://www.predicthq.com/products/events) · [Event categories: attendance-based](https://docs.predicthq.com/getting-started/predicthq-data/event-categories/attendance-based-events) · [unscheduled](https://docs.predicthq.com/getting-started/predicthq-data/event-categories/unscheduled-events) · [Local Rank](https://docs.predicthq.com/getting-started/predicthq-data/ranks/local-rank) · [Predicted Impact Patterns](https://docs.predicthq.com/getting-started/predicthq-data/impact-patterns) · [Recommended categories & local rank thresholds](https://docs.predicthq.com/getting-started/guides/industry-specific-event-filters) · [QSR vertical](https://www.predicthq.com/industries/quick-service-restaurants) — *domains egress-blocked from this environment; content from search summaries, verify numerics before designing against them*
- [RFC 5545 (iCalendar)](https://datatracker.ietf.org/doc/html/rfc5545) · [RECURRENCE-ID](https://icalendar.org/iCalendar-RFC-5545/3-8-4-4-recurrence-id.html) · [EXDATE](https://icalendar.org/iCalendar-RFC-5545/3-8-5-1-exception-date-times.html) · [RRULE explained](https://cli.nylas.com/guides/recurring-calendar-events-api)
- [Teamup — one event, multiple calendars](https://www.teamup.com/learn/product-tips/connect-one-event-to-multiple-people-or-resources/) · [multi-location shared calendars](https://www.teamup.com/learn/manage-availability/coordinate-event-planning-multiple-locations/) · [Google "event chips" patent US9740362](https://patents.justia.com/patent/9740362) · [Event Calendar design pattern](https://ui-patterns.com/patterns/EventCalendar)
- [Crunchtime — restaurant forecasting](https://www.crunchtime.com/restaurant-forecasting) · [labor optimization](https://www.crunchtime.com/blog/blog/labor-optimization)
- [Promotion uplift & halo measurement](https://www.tredence.com/blog/decoding-the-metrics-a-deep-dive-into-calculating-promotion-effectiveness) · [Bayesian Causal Forests for counterfactual promo demand](https://papers.ssrn.com/sol3/Delivery.cfm/5981034.pdf?abstractid=5981034&mirid=1) · [Estimating past promotion profitability](https://medium.com/artefact-engineering-and-data-science/forecasting-something-that-never-happened-how-we-estimated-past-promotions-profitability-5f55cfa1d477)
