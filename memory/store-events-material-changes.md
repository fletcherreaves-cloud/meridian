# Material store changes — the comparability register

A running log of physical, structural or operational changes that **break comparability** for a
store: rebuilds, relocations, format changes, openings, closures, extended construction.

**Why this file exists.** These facts live in the owner's head and surface by accident, usually
*after* an analysis has already been run and believed. Ponce de Leon's March 2026 opening
distorted two separate analyses before anyone said it out loud. Anything here should be checked
before a vs-LY comparison, a peer ranking, a forecast backtest, or a coaching judgement about the
store's management.

**Rule of thumb:** if the building, the format, or the trading conditions changed, LY is not a
valid comparison across the boundary, and peer ranking is not valid while the store is
structurally unlike its peers.

---

## Holdenville (35064) — relocation from in-Walmart to standalone

**Reported 2026-08-13 by the owner.** Store currently operates **inside a Walmart**. A new
**standalone restaurant** is being built **on the same property**. Construction runs
**concurrently with normal operations**. Plan is to close the Walmart location and open the new
building **on the same date**.

Owner's own assessment: *"That likely will not be a reality as it's extremely optimistic, but
that is the plan."* Treat the handover date as unreliable until it happens.

GM: Lynsey Yahola (acting GM since 2025-11-26, no prior management experience).

### What this breaks

1. **A concurrent-construction period is a performance confound.** Build activity on the property
   degrades trading — access, parking, noise, staffing disruption — for reasons that have nothing
   to do with management. Any dip during this window must not be read as a management failure,
   and this is the store whose GM is already under scrutiny. **This is the single most important
   consequence.**
2. **Handover is a hard break in every series.** In-Walmart and standalone are different
   businesses. Sales level, transaction mix, dayparts, labor model and cost structure all shift
   at once. **vs-LY is invalid across the boundary** and will stay invalid for twelve months
   after.
3. **Drive-thru is likely new.** An in-Walmart unit typically has no drive-thru. If so, every DT
   metric — OEPE, DT service time, cars held, the Speed of Service panel, DT-based Signals —
   goes from absent/not-applicable to present, and the store joins a peer set it was never in.
4. **A same-date close-and-open would produce a discontinuity, not a gap.** If the plan slips
   into a gap between closing and opening, expect zero-sales days that must not be modelled as a
   collapse. If the plan holds, expect a step change with no transition.
5. **The `newStore` flag will not fire.** It is derived from first-data-date (`backtest.js:472`
   `_openedOn`), and this store has years of history under the same loc. A relocation looks like
   continuity to the code while being a discontinuity in reality.

### Open caveat this raises about an existing finding

**#255's peer test assumed Holdenville is structurally comparable to the other 26 stores.** If it
is an in-Walmart small-format unit, that assumption is weaker than stated. Holdenville having the
highest pre-window `stat_pct` SD in the district (2.32 vs 1.25 second) gains an alternative
explanation: in-store units may simply carry noisier inventory than freestanding ones — smaller
storage, shared receiving, different count practice.

This does **not** touch the within-store finding, which is the stronger half: the Jun→Sep 2025
suppression to 0.42%, the October spike to 6.32%, and the 8.3x volatility collapse at the GM
transition are all comparisons of Holdenville against itself over time, unaffected by format.

But the sentence "most volatile store in the district" needs the qualifier "and the only one in
this format," and the peer comparison should be re-run against any other in-store units before it
is quoted again. **Unresolved — needs the owner to confirm the format and say whether any peer
shares it.**

### Wanted

- Confirmed construction start date, and the handover date once it is real rather than planned.
- Whether the new building has a drive-thru.
- Whether any other store in the estate is an in-store/small-format unit.
- All of it into `org_events` once #259's tagging work lands, so the confound is applied
  automatically rather than remembered.

---

## Ponce de Leon (43701) — opened March 2026

Newest store in the estate. **Has already distorted two analyses:**

1. A claimed 8–12 point traffic-trajectory gap between Florida and Oklahoma **collapsed to near
   zero** once this store was excluded. The entire apparent divergence was one new store.
2. In #255's peer table it shows `pre_sd = null` with `post_sd 2.81` and a max month of 8.10,
   which reads as a second volatility outlier. It is not — it simply has no pre-window.

Exclude from any pre-2026-04 comparison, any vs-LY, and any peer ranking that spans its opening.

---

## Sulphur (32525) — closed Easter Sunday, 2025-04-20

Confirmed in QSRSoft 2026-08-13: **$0.00 net sales against $8,699.51 LY, 0 guest counts against
775.** A genuine full-day closure, not a data gap. `qsr_service_stats` correctly has no row for
that store-day — nothing traded, so there was nothing to summarize.

**Why it is recorded here:** a $0 day poisons any vs-LY that lands on it. Easter moves — it was
2025-04-20, and 2026-04-05 — so the LY-matched comparison for dates around 2026-04-20 can land on
this closed day and produce a meaningless swing.

The measured-anomaly exclusion redesign (see the `fetchLY`/`fetchLYDate`/`fetchGC` work, which
switched from tag-presence to measured anomaly) should catch a zero-sales day automatically.
**Worth confirming it actually fires on this date rather than assuming** — this is a clean,
real-world test case for that code, and it is the first one we have identified.

Check whether other stores also closed 2025-04-20; the pull only surfaced Sulphur because it was
the store that happened to be missing a service row.

---

## Data-quality note — Marietta (33109), 2025-08-03: upstream service-stats hole

Not a store event. Recorded next to them because it was found the same way and looks identical
in our data.

Marietta traded normally that Sunday — $10,715.51, 976 guest counts — but QSRSoft itself has
**no per-location Service row** for the day, while showing Sales normally. Our pull requests
service stats by location, gets nothing, writes nothing. **The hole is upstream; the pull is
faithful.**

Consequence: `qsr_service_stats` carries holes wherever QSRSoft's per-location service row is
missing, nothing currently surfaces that, and any service average over a date range silently
averages over fewer days than it believes. Found only because the row counts were reconciled by
hand against `dates x active stores`.

Beware a UI artifact while checking these: QSRSoft's Service panel does not always refresh when
the date changes. A closed store showed a fully populated Service Total carried over from the
previously viewed date.

---

## Tishomingo (43380) and Ponce de Leon (43701) — a data hazard, not a store event

Recorded here because it bites the same analyses. Both store numbers fall inside Excel's
date-serial range (43380 = 2018-10-07, 43701 = 2019-08-24), so a date-formatted cell silently
converts them. The underlying cell value survives — the fix is re-formatting to General, not
re-typing — but a loader that honours the date format will mangle them. Loader-side fix is queued.
