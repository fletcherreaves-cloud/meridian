# OK drive-thru speed vs. transactions — three tests, three negative/null results (2026-10-31)

Owner pushback, 2026-10-30/31, on the Night-Shift Performance Plan's Oklahoma section: the report
found no dollar figure for OK ("the data has a hard limit... slower DT doesn't correlate with
lost transactions"), and the owner reasonably pushed back — *"I would argue, that inherently,
there is some potential for loss of sales, even if it is small... over time, by improving the
service speed and culture does indeed lend to increasing sales and guest counts."* He accepted a
null result if that's genuinely what holds up, but asked for one more, better-designed look
before accepting it.

**Three tests now, not one, all negative or confound-explained, each addressing the prior one's
specific weakness. Do not re-run this exact battery again without new data (HME) or a true
controlled before/after at a specific store — re-measure a specific number if acting on this, per
the "measure it, don't reason about it" standing rule, but the overall verdict below is settled.**

---

## Test 1 — cross-sectional levels (original; in the Night-Shift doc's "dollar opportunity" section)

Each of the 20 real OK stores' own trailing-90-day OEPE (seconds, Σ/Σ, `qsr_daily_activity`,
night = `hour_slot ≥ '17:00'`) vs. its own transaction-count change vs. LY, compared **across**
stores. r=0.138 (all-night), r=0.154 (dinner-peak-only, 17:00–19:00) — both near-zero and
wrong-signed for "slower service loses guests."

**Weakness, identified by the owner:** a cross-store comparison bakes in every other way stores
differ — notably, customers at a chronically slow store have already adjusted their expectations
to that store's baseline pace, so a currently-slow store isn't necessarily currently losing guests
relative to its own adjusted customer base. Also underpowered at n=20 (need |r| > ~0.44 for
significance at that sample size).

## Test 2 — within-store weekly, fixed-effects (2026-10-31)

26 trailing weeks (2026-05-02 → 2026-10-30, complete, no gaps — 3,640 of 3,640 store-days
present), 20 OK stores. De-meaned each store's own weekly OEPE and weekly transaction count
around that store's own mean (removes the store-identity confound entirely), pooled across
stores, one Pearson r. Also computed each store's own individual 25-week r.

- All-night: pooled r = **+0.39** (n=500 store-weeks). Per-store: median r=+0.38, 17/20 positive.
- Dinner-peak only: pooled r = **+0.46**. Per-store: median r=+0.48, 19/20 positive.

Real at this n, not noise — but **positive, the wrong direction**.

**Why:** almost certainly reverse causation, not a null result. A busy week is mechanically both
busier *and* slower at once (more volume → more queue congestion), so volume drives both sides of
this correlation simultaneously — the opposite causal direction from what's being tested. This
removes Test 1's confound but introduces a new one of its own.

## Test 3 — longer-horizon trend + lag (2026-10-31)

Built specifically around the owner's own point: if customers are already "dialed in" to a
store's pace, neither a snapshot (Test 1) nor a same-week wobble (Test 2) can see a real,
slow-building reputation effect — it would only show up as a store's speed *changing* over months,
followed, with a lag, by its own guest-count trajectory changing.

Trailing 12 months split into three ~4-month periods (P1 Nov–Feb, P2 Mar–Jun, P3 Jul–Oct), all 20
real OK stores (row counts matched the complete expectation almost exactly — 28,800/29,300/29,520
actual vs. 28,800/29,280/29,520 expected). Per store: night OEPE and night transaction count per
period (same Σ/Σ, same `hour_slot` windows as Tests 1–2); correlated the **speed change** against
the **transaction change** across the 20 stores, three ways, method decided before looking:

- Contemporaneous (both changes P1→P2): r=**−0.21** (all-night), r=**−0.43** (dinner-peak) — right
  direction; dinner-peak is the strongest number across all three tests, but still short of
  significance at n=20.
- **Lagged** (speed change P1→P2 vs. transaction change P2→P3 — the actual test of "takes months
  to show up via word-of-mouth"): r=**+0.16** (all-night), r=**+0.25** (dinner-peak) — **wrong
  direction, both ways.**
- Whole-year (P1 vs. P3 directly, no intermediate step): r=**−0.04** — essentially nothing.

**Verdict:** the one design actually built to catch a delayed reputation effect (the lagged test)
found no support in either direction. The contemporaneous dinner-peak r=−0.43 is real evidence
pointing the right way, but it is simultaneous, so it is at least as explainable by Test 2's
exact confound (a busy dinner rush is naturally both slower and busier) as by a genuine causal
link from speed to guest counts.

---

## Literature check (2026-10-31) — the industry hasn't proven this cleanly either

- **A real, peer-reviewed basis exists for measuring this properly once better data exists**:
  Jones (1999), *Operations Research*, "Inferring Balking Behavior From Transactional Data" — the
  right methodology for estimating lost sales from queue-abandonment timestamps, exactly what an
  HME timer system would provide. See the HME access item logged at
  `memory/data-acquisition-shopping-list.md` §M.
- **The best-known dollar claim is vendor-sourced, not independently audited**: QSR
  Magazine/Intouch Insight's Drive-Thru Study estimates a 5-second speedup could be worth
  >$8,000/unit/year — the study sponsor's own estimate.
- **A widely-repeated "1% balking = ~$100M/year industry-wide" figure traces back to the same 1999
  paper** and has never been independently reproduced since.
- **McDonald's own 2019 claim that speed gains "improved guest counts in many restaurants" is
  contradicted by its own topline**: over that same multi-year speed push, US comparable guest
  counts fell ~12% over six years — menu, pricing and macro factors clearly dominate once you look
  at the aggregate.
- **A 2024 Intouch Insight study flagged the identical reverse-causation confound Test 2 found
  independently**: industry-wide speed improvements may themselves be *caused by* lower traffic,
  not the other way around.
- Various drive-thru-tech vendors' published "abandonment rate" benchmarks carry no disclosed
  methodology — treat as marketing, not evidence.

---

## Bottom line

A plausible mechanism with real industry logic behind it (balking/reneging is a legitimate,
established queueing-theory concept) — but genuinely unproven, even industry-wide, and every test
we can run on `qsr_daily_activity` alone hits the same confound the literature independently
flags. **Not a closed question — a real line-abandonment count from HME would settle it properly
— but three honestly-designed tests on the data we have all come back negative or
confound-explained.** Treat the Night-Shift Performance Plan's "no OK dollar figure" conclusion as
settled for now; revisit only with new data (HME) or a true controlled before/after at a specific
store, not by re-running this same correlation battery a fourth way.

Footnoted in the Night-Shift Performance Plan doc's "Data notes" section:
https://claude.ai/artifact/Rv4YELfaNxM2ZFc2R14zVr
