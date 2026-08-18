# McValue 2.0 FBP — price rounds located, and per-restaurant traffic DiD
**Measured 2026-08-18. Source: `qsr_product_mix` (Queries B/B2) and
`qsr_daily_activity_rollup` (Query C).** Companion to
`memory/project-mcvalue-2-fbp-document.md`; queries in `memory/mcvalue-verification.sql`.

---

## 1. THREE price rounds are now located, and two of them sit inside the post-window

### How this was measured (and why the first attempt failed)
**Query B** compared each item's whole price-tier *set* day-over-day and counted
changes per store per day, floored at `>= 20`. That failed: every restaurant returns
50–130 "repriced" items on essentially **every** calendar day. The threshold was far
too low for a 400+ item menu and a one-day tier-set comparison catches promotional
variation, not base menu price. **No single row of Query B means anything.**

**Query B2** is the test that works. It takes `max(price)` per item per day as the
base menu price (promos are always *below* menu), then counts a change only when the
price was flat for **14 observed days before** and flat at the new value for
**14 days after**. A promotion cannot survive that filter; a price round can.

### The result
B2 returns 54 rows (top 2 dates per restaurant). **52 of them land on just two
dates**, and the two-wave structure Query B's noise had hinted at is confirmed
exactly:

| Round | Date | Restaurants | Window |
|---|---|---|---|
| 1 | **2026-02-25** | **all 27** | pre |
| 2 | **2026-06-13** | 5183, 5985, 6178 (Chipley FL), 6838 (FL), 10422, 11657, 13113, 18213, 20475, 33109, 33704, 34222, 35242 (Cottondale FL), 38609 (FL) — **14** | post |
| 3 | **2026-06-26** | 3708, 6972, 10034 (Bonifay FL), 10915, 24471, 29760, 31357, 32525, 33222 (Elgin), 35064, 37566 (Mossy Head FL), 43380 (Tishomingo), 43701 (Ponce FL) — **13** | post |

14 + 13 = **27. Every restaurant took the June change exactly once, in one of two
waves 13 days apart.** The wave assignment B2 produces is **identical, store for
store, to the one the noisy Query B implied** — two independent methods agreeing on
the same partition.

Only 2 rows fall elsewhere: **2026-03-28** at Bonifay (10034) and Mossy Head (37566)
— a small FL-only round inside the pre-window — and **2026-04-15** at Ponce de Leon,
which is menu setup a month after it opened 2026-03-13. Ignore Ponce's.

### Both waves cross both states
Four FL restaurants are in wave 1 and three in wave 2. So the June round was **not**
"all Oklahoma took the recommended change" — it reached Florida too, in both waves.
**The owner's account needs reconciling against this before the document is final.**

### Why this matters to the FBP
Post-window is 2026-04-22 → 2026-08-11 (112 days). Wave 2 lands on day 53, wave 3 on
day 66. **The back half of the post-window carries a price increase; the front half
does not.** A post-window traffic decline therefore measures McValue *and* a price
round together, and the document cannot attribute the whole decline to McValue
without saying so plainly.

Partial mitigation worth stating: the **pre-window carries a price round too**
(Feb 25, day 55 of 111). Each window has a round roughly midway, so the
contamination is partly symmetric — but not equal: the post-window gets a *second*
increase stacked on the first.

### The natural experiment the stagger gave us — Query D, RAN 2026-08-18

Between **2026-06-13 and 2026-06-25**, wave-2 restaurants had the new prices and
wave-3 restaurants did not — and **both cohorts had McValue the whole time.**

| Cohort | control (May 24–Jun 12) | treated (Jun 13–25) | did |
|---|---|---|---|
| wave2_early — priced Jun 13 | −2.83 % | −2.82 % | **+0.01 pp** |
| wave3_later — not yet priced | −1.84 % | **+0.40 %** | **+2.24 pp** |

**Price effect while in force = 0.01 − 2.24 = −2.23 pp of guest counts.**

Read the mechanism, not just the number: **mid-June carries a seasonal lift.** The
un-priced cohort caught it and went positive vs LY (+0.40 %). The priced cohort did
not move at all. Price did not push traffic down so much as **suppress a rising
tide** — which is the harder kind of loss to see, because nothing looks like it
got worse.

### What that means for the FBP's headline
Exposure over the 112-day post window: wave 2 priced for 60 days (53.6 %), wave 3
for 47 (42.0 %) — **48 % average exposure**. So the post-window-average drag is
roughly **2.23 × 0.48 ≈ −1.07 pp**.

Against the 2026-08-16 measured headline that is
**~27 % of Oklahoma's −3.96 pp and ~14 % of Florida's −7.83 pp.**

**So about a quarter of the Oklahoma traffic decline the document attributes to
McValue is in fact the June price rounds.** McValue attribution survives — it is
still the majority of the effect — but the document cannot keep claiming the whole
decline, and now it has a measured number to subtract rather than a caveat to hedge
with. That is a strictly better position than the one the file was in.

Assumes the price effect is constant over the post window, which 13 days cannot
establish. It is a first-order estimate; present it as a bound.

### D-ROBUST — RAN 2026-08-18. D strengthens, and the cohorts match exactly.

Re-ran D with the two restaurants that could have been driving it removed —
**Tishomingo (43380)**, which improves mechanically as its 2024-12-16 honeymoon
decays out of the LY base, and **Elgin (33222)**, the only genuinely positive
restaurant. Both sat in wave 3.

| Cohort | control | treated | did |
|---|---|---|---|
| wave2_early (14) | **−2.83 %** | −2.82 % | +0.01 pp |
| wave3_later_trimmed (10) | **−2.83 %** | −0.08 % | **+2.75 pp** |

Two things, and the second is the important one.

**1. The effect got bigger, not smaller: −2.74 pp.** Elgin and Tishomingo were
*dampening* the estimate, not inflating it — both were already improving in the
control period, so their control-to-treated *delta* was small and diluted the
cohort average. I had predicted they could not explain the result; they could not,
but I had the direction of their influence backwards. Removing them raises the
price effect from −2.23 pp to −2.74 pp.

**2. The two cohorts sit at an identical −2.83 % in the control period** — then
diverge by 2.74 pp the moment one takes price and the other does not. Matching to
two decimals is partly luck and should not be oversold, but it kills the
"the cohorts are just different restaurants" objection about as completely as
observational data can. Note this is a match in *level*; **trend** is what
D-PLACEBO still has to establish.

### The number to carry: a bound, not a point
- Price effect while in force: **−2.23 pp to −2.74 pp** of guest counts
- Post-window-average drag (48 % exposure): **−1.07 pp to −1.32 pp**
- **≈ 27–33 % of Oklahoma's −3.96 pp; ≈ 14–17 % of Florida's −7.83 pp**

**So roughly a quarter to a third of the Oklahoma traffic decline the document
attributes to McValue is in fact the June price rounds.** Reporting it as a bound
matches this file's own standing instruction to state the DiD as a bound rather
than a point estimate.

### D-PLACEBO — RAN 2026-08-18. Not zero. Judgment call, stated as such.

Windows entirely after the Feb 25 district round and before the Jun 13 wave, when
neither cohort had moved.

| Cohort | control (Apr 20–May 9) | treated (May 10–22) | placebo did |
|---|---|---|---|
| wave2_early | −2.11 % | −3.71 % | −1.60 pp |
| wave3_later | +0.32 % | −2.00 % | −2.32 pp |

**Cohort drift with no treatment = −1.60 − (−2.32) = +0.72 pp.**

I pre-registered "near 0 → stands, near 2 → discard." **+0.72 landed between the
two thresholds**, so this is a judgment call and is recorded as one rather than
rounded to whichever side is convenient.

**The call: D stands, with a wider band.** Two reasons.

1. **The drift has the wrong sign to explain the result.** Absent treatment wave 2
   runs *0.72 pp better* than wave 3. In the treatment window wave 2 ran **2.23 pp
   worse**. A bias pointing that direction cannot manufacture the finding — to do
   that it would have to be −2.23 pp itself. If anything the true effect is larger
   than measured, and the placebo-corrected point estimate is **−2.95 pp**.
2. **But parallel trends does not hold exactly**, and pretending otherwise would be
   the error. +0.72 pp is ~32 % of the effect's magnitude. That is the noise floor
   on any single run of this design and it has to widen the band.

### THE NUMBER TO CARRY — final, placebo-widened
- Price effect while in force: **−1.5 pp to −3.0 pp** of guest counts
  (raw −2.23, trimmed −2.74, placebo-corrected −2.95, pessimistic −1.51)
- Post-window-average drag at 48 % exposure: **−0.7 pp to −1.4 pp**
- **≈ 18–36 % of Oklahoma's −3.96 pp; ≈ 9–18 % of Florida's −7.83 pp**

**Roughly a fifth to a third of the Oklahoma traffic decline the document
attributes to McValue is in fact the June price rounds.** The substantive
conclusion is unchanged from the pre-placebo read — price is a material minority,
McValue remains the majority — but the band is now honest about how much the
design can actually resolve. Report the band; never the midpoint as a point.

### Optional last tightening (D-PLACEBO-TRIMMED) — worth one query, not required
D-PLACEBO ran on **full** cohorts, so Tishomingo is in it — and Tishomingo's
mechanical improvement as its honeymoon decays out of the LY base is precisely a
*trend*, which is exactly what a placebo detects. It is therefore likely that
Tishomingo causes most of the +0.72 pp drift. Re-running D-PLACEBO on the
**trimmed** cohorts tests that: if it comes back near 0, the trimmed effect
(−2.74 pp) needs no correction and the band tightens from 1.5 pp wide to roughly
0.5 pp. Swap the two window pairs in D-ROBUST for D-PLACEBO's. Nice to have; the
band above is already usable without it.

This does **not** unblock the document's existing publish gate (the March 2026 vs
March 2025 comparison and the free-item footprint check, both still unrun). It adds
a fourth thing the document must state.

---

## 2. Query C — per-restaurant traffic DiD (matched-day, ratio of summed counts)

Pre 2026-01-01→04-21, post 2026-04-22→08-11, each vs its own `ly_transactions`.
26 restaurants returned; **Ponce de Leon (43701) is absent because it opened
2026-03-13 and has no LY twin at all** (`constants.js:93`).

**Exactly one restaurant is genuinely positive: Elgin (33222) at +6.34pp**
(pre +8.65% → post +14.99% — growing in both windows and accelerating).
0020475 at +0.15pp is flat, not positive. Every other restaurant is negative.

Distribution across the 26:
- median **−5.17pp**, unweighted mean **−4.47pp**
- range **+6.34pp to −11.34pp** — a **17.7pp spread**. The district number hides
  enormously different store-level experiences; that spread belongs in the document.
- ⚠ median/mean here are an *average of averages* — fine for describing the
  distribution and finding outliers, **never** for the headline. The headline DiD
  stays the district ratio-of-sums already in the document.

### Tishomingo is positive — and it is an artifact. Exclude it.
43380 ranks **2nd at +4.06pp**, superficially confirming the retired figure set's
"Tishomingo showed positive traffic movement." It does not survive reading:
**pre −10.58%, post −6.51%.** Both windows are deeply negative; the store is merely
lapping a *less* inflated base. Tishomingo opened **2024-12-16**, so LY for a
Jan–Apr 2026 pre-window is months 2–5 of its life — peak grand-opening honeymoon —
and LY for the post-window is months 5–9, already decayed. The "improvement" is the
honeymoon base fading, not McValue.

This sharpens the exclusion wording: it is not *"the store is in its opening ramp"*
(it is 20 months old) but ***"its LY twin is an opening ramp."***
**The retired "Tishomingo was positive" line must not go in front of anyone.**
Elgin is the only defensible positive restaurant.

### Florida is materially worse than Oklahoma
FL (6178, 6838, 10034, 35242, 37566, 38609 — 43701 has no LY): mean **−7.97pp**,
best −1.88pp (Mossy Head). OK (20 with LY): mean **−3.41pp**.
**Florida runs ~4.6pp worse.**

This cuts *against* a simple price story: the account is that Oklahoma took the
recommended price change, yet Oklahoma is the better-performing half — and B2 shows
Florida took the June round too, in both waves. Query D is what decides whether
price or something FL-specific is driving the gap.

---

## 3. Housekeeping observed in passing
Query B shows missing/depressed rows across **2026-01-24 → 01-25** at many stores
(18213, 29760, 32525, 33109, 33222, 33704, 34222, 10915 each missing a day).
`constants.js:85` already documents a **Jan 2026 OK snow-storm closure** tagged as an
event for 33222 — so this is a real closure, not a pull gap. Confirm the tag covers
*every* affected store before any window including January is graded.
