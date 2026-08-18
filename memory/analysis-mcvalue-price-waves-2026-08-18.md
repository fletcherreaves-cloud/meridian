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

### ⚠ D IS GATED ON TWO CHECKS — do not quote −1.07 pp until both pass
Both queries are written in the .sql file and neither has been run.

1. **D-PLACEBO — parallel trends.** DiD is only valid if the two cohorts move
   *together* absent treatment. Re-runs D on windows after Feb 25 and before
   Jun 13, when neither cohort had moved. Near 0 → D stands. Near 2 → D is
   measuring cohort composition and must be discarded outright.
2. **D-ROBUST — the two improvers are both in wave 3.** **Tishomingo (43380)
   improves mechanically** as its 2024-12-16 honeymoon decays out of the LY base —
   that is a *trend* difference, precisely what breaks DiD, and it is the sharpest
   threat to this result. **Elgin (33222)** is the only genuinely positive
   restaurant. Both sit in the cohort that produced the +2.24 pp.
   Arithmetic says neither can explain it — each is ~2–2.5 % of cohort volume, so a
   2.24 pp cohort swing would need a ~90–110 pp single-store move — but **that is
   reasoning, not measurement.** Run it.

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
