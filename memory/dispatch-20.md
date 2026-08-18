# Dispatch #20 — price is a data stream we do not have, and a vs-LY trap we do not guard

**✅ DELIVERED 2026-08-18.** All three items shipped in PR #411 (v5.062), merged to `main` clean —
`src/engine/price-events.js` verified against 763k real `qsr_product_mix` rows reproducing the exact
14/13 wave split with no tuning, wired to Signal Lab + `computeEventFactors()` + Store Dashboard;
`firstRealTradingDate()`/`lyQuality()` added to `vs-ly.js`, wired into `RankingView` so a young store
like Tishomingo renders flagged instead of ranking as a top performer; the 27-store `crit` finding
chased (not left flagged) to a real bug — 98.9% of Condiment items reading `active=false`
district-wide — fixed, with real-data impact 27/27 crit → 10 ok/5 warn/12 crit. #409 and #410 also
merged the same day. Kept below as the original ask, for the record.

**Board (at time of writing):** `main` at v5.060. #409 and #410 in flight, #410 deployed clean. The McValue price
question is now *measured* — six queries, in `memory/mcvalue-verification.sql`, findings in
`memory/analysis-mcvalue-price-waves-2026-08-18.md`.

Two calls worth naming. **#410's acceptance run was done the right way** — real post-migration data,
Tecumseh shown before/after (67→78 denominator, 78% instead of a flattering 91%) so the mechanism is
visible rather than asserted, and the 0/27 status-change result reported as the *expected* outcome
rather than buried. Put that "0/27 is correct, the rescue fixes the denominator not the status
logic" sentence in the PR body if it is not already there; without it a later reader files it as
"the fix did nothing."

And a correction to me, from the data: I predicted Tishomingo and Elgin were *inflating* the price
estimate. They were **dampening** it. Removing them made the effect larger, not smaller. The
prediction that they could not explain the result held; the direction of their influence did not.

---

## 1. ⭐ Meridian cannot see a price change. That is the gap.

I found three district-wide price rounds this week — **2026-02-25 (all 27 restaurants), 2026-06-13
(14), 2026-06-26 (13)** — by hand-writing a window function against `qsr_product_mix`. Every
restaurant took the June change exactly once, in one of two waves 13 days apart.

**Nothing in this application can see any of that.** Three consequences, all live today:

- **Forecast models calibrate straight through price steps** as if nothing happened. `forecastDay`
  and the backtest family treat a repricing week as ordinary trailing data.
- **Signal Lab and Scanner cannot correlate on price** — it is not in `signal-registry.js`, so the
  single largest deliberate lever the business pulls is absent from the correlation engine.
- **Every vs-LY comparison silently mixes pricing regimes.** `vs-ly.js` has no notion that the two
  legs may sit on different menus.

### Build it as a stream, the same as every other

**Before writing anything, grep for existing price handling.** `qsr_product_mix` has a pull script
and a parser; there may already be a partial affordance. Four copies of the org map and three of
scheduled-hours all started as "surely nobody has done this yet."

`src/engine/price-events.js`, exporting persistent base-price step detection. **The algorithm is
already validated — do not invent a second one.** Take `max(price)` per (loc, item, date) as base
menu price (promos are always below menu), then count a change only where the price was flat for 14
observed days before and flat at the new value for 14 days after. The naive version — comparing
price-tier *sets* day over day — returns 50–130 "repriced" items at every restaurant on every
calendar day and is pure noise; it is preserved in the .sql file marked FAILED so nobody retries it.

Then wire it to three consumers, because an engine nobody calls is the #366 failure mode:

1. **`signal-registry.js`** — a Price metric group (days-since-last-change, items-changed,
   mean-step-%). Then weather↔sales has a sibling: price↔traffic.
2. **Auto-generated calendar events**, so `computeEventFactors` sees repricing weeks. This is the
   one with real forecast consequences.
3. **A per-store "last price change" field** surfaced in Store Dashboard.

**Verification bar — must touch a call site, not just the engine.** Reproduce all three dates *from
the app*, with the same 14/13 wave split, and show a rendered consumer: the Signals metric present
and correlating, or the calendar showing 2026-06-13 tagged at exactly the 14 wave-2 restaurants. A
test that only imports `price-events.js` would pass unchanged with every consumer deleted.

**Supabase + `tenant_id` + RLS, watched in `sync-failure-watch.yml`** if this adds any scheduled job.

---

## 2. The vs-LY trap: a young restaurant scores well for being young

Tishomingo ranks **2nd best of 26** on traffic DiD (+4.06 pp) — and it is an artifact. Pre −10.58 %,
post −6.51 %: both windows deeply negative, the store merely lapping a *less* inflated base. It
opened **2024-12-16**, so LY for a Jan–Apr 2026 window is months 2–5 of its life, peak
grand-opening honeymoon, decaying month over month. Its vs-LY improves on its own, forever, until
the ramp clears.

**Any restaurant under ~24 months has this, and the app shows vs-LY everywhere with no guard.**
Ponce de Leon (opened 2026-03-13) is the acute case — it has no LY twin at all.

Add an `lyQuality` signal in **`src/engine/vs-ly.js`**, where the matched-day logic already lives —
do not add a fourth comparison helper. If the LY leg falls within N months of the store's
first-sales date, the comparison is unreliable: flag it in the UI and default it out of district
rollups. `min(dt) where product_sales > 0` is the anchor, but **use a real-trading threshold, not
`> 0`** — Tishomingo's first `> 0` day is 2024-12-13 with **14 guests**, a training day; real
trading starts 12-16 at 816. That off-by-three-days is exactly the kind of thing that ships.

**Verification bar:** Tishomingo's +4.06 pp renders *flagged* rather than as a top performer, and
Ponce renders as "no LY" rather than blank, zero, or −100 %.

---

## 3. All 27 stores reading `crit`/`weekly-overdue` on one day — chase it

Correctly flagged and correctly not chased in #410. Chase it now, and **the first step is a
measurement, not a theory**: re-run the grade against several dates that are not today. Every date
`crit` → logic. Only today → stale feed. One query, half the search space gone.

`CLAUDE.md` notes `weekStartOf()` was reimplemented rather than imported (#363). That is a candidate
worth *checking*, not a diagnosis to implement — the last two times a cause felt obvious because it
matched a past incident in this repo, it was wrong twice running.

---

## What I am not asking for

No new panel for the McValue analysis. That work is a document, not a feature, and it ships Tuesday
the 25th. Items 1 and 2 are here because they are defects the analysis *exposed* — they would be
worth doing if McValue had never happened.
