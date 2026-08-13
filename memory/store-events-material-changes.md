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

## Lindsay (18213) — relocation from in-Walmart to standalone

> **Corrected 2026-08-13.** This was first logged against Holdenville (35064) because the owner
> wrote "Lindsey" and I read it as Lynsey Yahola, Holdenville's GM. He meant **Lindsay, the
> store** — `STORE_NAMES['18213'] = 'Lindsay-Wal-Mart'`. Owner confirmed. Holdenville is a normal
> freestanding store and is not involved.

**Reported 2026-08-13 by the owner.** Store currently operates **inside a Walmart**. A new
**standalone restaurant** is being built **on the same property**. Construction runs
**concurrently with normal operations**. Plan is to close the Walmart location and open the new
building **on the same date**.

Owner's own assessment: *"That likely will not be a reality as it's extremely optimistic, but
that is the plan."* Treat the handover date as unreliable until it happens.

### What this breaks

1. **A concurrent-construction period is a performance confound.** Build activity on the property
   degrades trading — access, parking, noise, staffing disruption — for reasons that have nothing
   to do with management. Any dip during this window must not be read as a management failure.
   **This is the single most important consequence.**
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

### Lindsay is currently the estate's only known in-store/small-format unit

Independently corroborated by the data: on Thanksgiving 2025-11-27, Lindsay recorded **one
daypart slice out of three** in `qsr_peaks_sales` — the most restricted trading in the estate
that day — which is what an in-Walmart unit tied to Walmart's holiday hours looks like. The three
other partial-daypart stores that day (Chipley, Bonifay, Cottondale) each recorded two.

Treat Lindsay as **not peer-comparable on format** for anything sensitive to store format:
inventory variance, service times, daypart mix, labor model.

### Withdrawn: the caveat this briefly raised against #255

While this was mis-attributed to Holdenville, it appeared to weaken #255's peer test — an
in-Walmart small-format unit might simply carry noisier inventory, giving "highest `stat_pct` SD
in the district" an innocent explanation.

**That caveat is withdrawn.** Holdenville is a normal freestanding store, structurally comparable
to its peers, so the peer test stands as originally reported and needs no qualifier. The finding
is stronger than the mis-attribution left it.

### Wanted

- Confirmed construction start date, and the handover date once it is real rather than planned.
- Whether the new building has a drive-thru.
- Confirmation that no *other* store is an in-store/small-format unit (Lindsay is the only one
  identified so far, by name and by the Thanksgiving daypart evidence).
- All of it into `org_events` once #259's tagging work lands, so the confound is applied
  automatically rather than remembered.

---

## Ponce de Leon (43701) — first trading day 2026-03-13 (exact)

**Established 2026-08-13 by direct query, not inference.** Use this date for every exclusion.

```
first_row          2026-03-05    one row, net_sales_amt = 0   (configured, not trading)
                   2026-03-12    one row, net_sales_amt NULL  (neither >0 nor =0)
first_trading_day  2026-03-13    110 trading days to 2026-06-30
```

Corroborated by the backfill row counts: chunk 3 covered 150 dates and returned 4012 cash rows
against `150 x 26 = 3900`, a surplus of exactly 112 = 110 trading days + the 2 stray rows.

**I first derived 2026-03-11 from that surplus and was wrong**, because the arithmetic was
correct but the assumption behind it was not — I assumed Ponce's rows were contiguous from its
opening day. Two pre-opening rows broke that. Recorded because the same reasoning will look
equally sound the next time: **a row count constrains a date, it does not determine one.**

Also from this: opening day 2026-03-13 shows only 2 of 3 daypart slices in `qsr_peaks_sales`,
consistent with trading starting partway through the day. Together the three days account for
exactly the 7 missing peaks rows in chunk 3 — nothing is wrong with the pull.

**Watch the NULL.** `qsr_cash_sheet` carries three states for sales — a real value, `0`, and
`NULL`. Anything filtering `> 0` and anything filtering `= 0` will disagree about 2026-03-12.
Same family as the `labor_pct` false-zero contamination cleaned up under #236.

### Prior damage from not having this date



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

## Holiday trading pattern — established 2026-08-13 from row-count reconciliation

Found by reconciling the #259 backfill row counts against `dates x active stores`. None of it
was visible before; nothing in the app surfaces a missing store-day.

**Christmas 2025-12-25 — 23 of 26 stores have no `qsr_service_stats` row.** Consistent with a
full-day closure: nothing traded, nothing to summarize. **Three stores do have rows**, meaning
either they traded on Christmas or they reported service stats while closed. Worth identifying —
that is an operational fact, not a data question.

**Thanksgiving 2025-11-27 — stores traded, but four traded reduced hours.** Every store has a
service row (so all were open), but four are short daypart slices in `qsr_peaks_sales`:
Lindsay-Wal-Mart 1 of 3, Chipley / Bonifay / Cottondale 2 of 3 each. Accounts for exactly the 5
missing peaks rows in that chunk.

**The contrast is the useful part:** Christmas shows up as *absent* service rows (closed),
Thanksgiving as *partial* daypart rows (reduced hours). Two different signatures for two
different operational realities, and both are invisible to anything that does not count rows.

**A prediction that failed, recorded so it is not repeated:** before looking, I expected the
missing service days to cluster on Christmas *and Thanksgiving*. Christmas was right (23 of 37).
Thanksgiving was **wrong** — zero missing service rows, because the stores were open. Holiday
closure and holiday reduced-hours are not the same event and do not leave the same trace.

### Resolved by the per-store breakdown

**Sulphur (32525) — an eight-day service-stats outage, 2025-09-09 → 09-16.** Not a closure; the
store traded normally throughout. This is the KVS/timer reporting being down for over a week.
Sulphur accounts for **10 of the 14 non-Christmas gaps** in the window (the eight-day run, plus
2026-01-25), and separately owns the legitimate Easter closure from chunk 1. Treat Sulphur as the
estate's least reliable store for service-stats completeness until shown otherwise.

**The consequence, which is the reason this matters:** Sulphur's September 2025 service metrics —
DT times, OEPE, KVS — were computed over roughly 22 days rather than 30, and nothing anywhere
flagged it. Any review or coaching on Sulphur service that month ran on a quarter of the month
missing, with no indication the figure was partial. This is the concrete harm behind the abstract
"averages over fewer days than it believes."

**Late-January 2026 — a weather cluster in south-central Oklahoma.**

| date | day | stores |
|---|---|---|
| 2026-01-20 | Tue | Duncan-Hwy 81 |
| 2026-01-25 | Sun | Sulphur · Lindsay-Wal-Mart · Tishomingo-Main & Refuge |
| 2026-01-26 | Mon | Tishomingo-Main & Refuge |

Sulphur, Lindsay, Tishomingo and Duncan are all within roughly sixty miles of each other.

**CONFIRMED by the owner 2026-08-13: there was an Oklahoma winter storm 20–26 January 2026.**
These are real closures, not a data fault.

Two consequences that outlast the event:

- **January 2026 metrics for those four stores are computed over fewer trading days**, and
  nothing marks them as short. Any month-level average or ranking covering Jan 2026 understates
  their denominator.
- **vs-LY in January 2027 will compare against storm-affected days.** Same trap as the Sulphur
  Easter closure, but across four stores and up to a week. These belong in `org_events` before
  next January, not after someone queries an inexplicable swing.

The stores named here are only those that lost a *service* row. Others may have closed or run
reduced hours without leaving that particular trace — the storm's real footprint is probably
wider than these four.

**Madill-Hwy 70, 2025-09-06 (Sat)** — isolated single day, same region, no pattern.

---

## Tishomingo (43380) and Ponce de Leon (43701) — a data hazard, not a store event

Recorded here because it bites the same analyses. Both store numbers fall inside Excel's
date-serial range (43380 = 2018-10-07, 43701 = 2019-08-24), so a date-formatted cell silently
converts them. The underlying cell value survives — the fix is re-formatting to General, not
re-typing — but a loader that honours the date format will mangle them. Loader-side fix is queued.
