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

### Both waves cross both states — and this is NOT a contradiction (corrected 2026-08-18)
Four FL restaurants are in wave 1 and three in wave 2.

**An earlier draft of this file said the owner's account "does not survive this" and
needed reconciling. That was an overreach and is withdrawn.** The account was
specifically that *every Oklahoma restaurant* took the recommended June change, and
B2 confirms exactly that — all 19 OK restaurants appear in one of the two waves.
Nothing is contradicted.

What the data *adds* is that **Florida took the June rounds too**, which the account
did not speak to. That matters for a different reason than contradiction: Florida is
the external control, so **price cannot explain the OK-vs-FL gap** — both markets
repriced, and Florida is still ~4.6 pp worse. Something else drives that gap and this
analysis has not identified it. Carry it as an open limitation, not as a conflict
with what the owner said.

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

### D-PLACEBO-TRIMMED — RAN 2026-08-18. Band tightens as pre-registered.

| Cohort | control | treated | placebo did |
|---|---|---|---|
| wave2_early (14) | −2.11 % | −3.71 % | −1.60 pp |
| wave3_later_trimmed (10) | −0.84 % | −2.74 % | −1.91 pp |

**Residual drift +0.31 pp**, down from +0.72 pp on full cohorts. So Tishomingo and
Elgin caused **0.41 pp — well over half — of the drift**, which is the mechanism
that was predicted: a store improving mechanically as its opening honeymoon decays
out of the LY base *is* a trend difference, and a placebo is exactly what detects
one. +0.31 pp against a −2.74 pp effect is ~11 %. **Call it a pass.**

(It again landed between pre-registered buckets — nearer 0 than +0.7 — so this is
again a judgment call, recorded as one. The pre-registered prediction for the
"near 0" branch was *"drag ≈ −1.3 pp, about a third of Oklahoma's −3.96 pp"*; the
measured band came in at −1.17 to −1.46 pp, ~29–37 %. The read rule was written
before the result and held.)

### ⭐ FINAL NUMBER
Primary estimate is the **trimmed** cohorts — the cleaner design, since Elgin and
Tishomingo were excluded for confounded *LY baselines*, not for a different price
response, so applying it district-wide is sound.

- Price effect while in force: **−2.43 to −3.05 pp** of guest counts
- Post-window-average drag at 48 % exposure: **−1.17 to −1.46 pp**
- **≈ 29–37 % of Oklahoma's −3.96 pp; ≈ 15–19 % of Florida's −7.83 pp**

**About a third of the Oklahoma traffic decline the document attributes to McValue
is in fact the June price rounds.** Note the band did not merely narrow, it moved
*up* — trimming and the smaller placebo correction both push the same way.

---

## ⭐ THE THING THAT MATTERS MOST: B1–B3 IS CLEAN OF PRICE TOO

Map the waves onto the document's own 14-day block layout:

| block | window | national events | **price** |
|---|---|---|---|
| **B1** | 04-21 → 05-04 | — clean — | **— clean —** |
| **B2** | 05-05 → 05-18 | — clean — | **— clean —** |
| **B3** | 05-19 → 06-01 | — clean — | **— clean —** |
| B4 | 06-02 → 06-15 | World Cup Happy Meal (6/9) | **wave 2 (6/13)** |
| B5 | 06-16 → 06-29 | Apple Pie LTO (6/23) | **wave 3 (6/26)** |
| B6–B8 | 06-30 → 08-10 | rehit, flavour launches | both waves in force |

**Every price round lands in B4 or later. B1–B3 is clean of national events AND
clean of price.**

This does not complicate the document — **it reinforces a decision it had already
made.** The file already argues B1–B3 is "the only clean McValue read" and "the
strongest evidential unit in the whole analysis, currently buried in an eight-block
average." That case now rests on **two independent grounds**, one of which was
unknown when the recommendation was written.

And the practical consequence: **the B1–B3 clean read needs NO price correction at
all.** The −1.17/−1.46 pp drag applies to the *full-window* figure. Lead with the
clean window and the price confound simply does not apply to the headline.

**So the next query is not another robustness check — it is Query E, the B1–B3
clean-window DiD for the 19 Oklahoma restaurants.** That is the number the document
should lead with, and nothing in this analysis touches it.

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


---

## 4. Query E — the six clean weeks, MEASURED 2026-08-18

| | pre (Jan 1 – Apr 21) | B1–B3 clean (Apr 22 – Jun 1) | B4–B8 (Jun 2 – Aug 11) |
|---|---|---|---|
| Traffic vs LY | **+1.13 %** | **−2.01 %** | **−3.32 %** |
| Traffic DiD | — | **−3.14 pp** | **−4.45 pp** |

**Sanity check passed first:** pre reproduces at **+1.13 %**, exactly the 2026-08-16
measured table. Cohort definition and window boundaries are validated, so the two
new figures can be trusted to the same standard.

### ⭐ −3.14 pp is the number the document leads with
Six weeks, McValue alone — no national marketing, no price round. **It requires no
correction and carries no caveat.** It is also the most conservative-against-us
framing available, which is exactly why it is the strongest: leading with a number
that needs defending is worse than leading with a slightly worse number that does
not.

### The two methods disagree by ~0.4 pp, and the disagreement is informative
- **Method 1** — correct the full window for price: **−2.50 to −2.79 pp**
- **Method 2** — measure the clean window directly: **−3.14 pp**

Method 1 assumes price is the *only* confound. Method 2 assumes nothing. **Prefer
method 2.** And note the sign of the gap: method 1 lands *less* negative, which is
what you would see if the national marketing inside B4–B8 was mildly **positive**,
inflating the full-window figure and causing a price-only correction to over-credit
McValue.

### ⛔ RETIRE the "traffic got worse as national marketing support increased" line
This file's B4–B8 section builds a framing on that sentence — *"the period with the
most promotional support is the period with the worst traffic performance."* The
sentence is still literally true. **It is no longer safe to say.**

Deterioration from clean to confounded is **−1.31 pp**. Price exposure inside B4–B8
is **75.8 %** (10 OK restaurants priced for 60 of 71 days, 9 for 47), so price alone
accounts for **−1.84 to −2.31 pp** in that stretch. **Our own price increase more
than covers the entire deterioration, with room to spare.**

Saying "traffic worsened as marketing increased" in the room invites one reply —
*you raised prices in June* — and it is correct, it is ours, and it is bigger than
the effect being pointed at. That is precisely the trap this whole price analysis
existed to avoid walking into. Cut the line. What survives is the honest and
narrower version: **the deterioration after 2 June is our price, not the offer
failing harder** — which is why the clean six weeks are the read that matters.


---

## 5. Query F — the March free-item footprint test (Defect 2). RAN 2026-08-18. CLOSED.

Per the document's own spec, using each March-2026 row's built-in `ly_` twin rather
than a separate 2025 pull — comparing March's vs-LY reading against the rest of the
pre-window as baseline.

| bucket | traffic vs LY | avg check | check vs LY |
|---|---|---|---|
| rest_of_pre (Jan–Feb, Apr 1–21) | +1.45 % | $10.42 | +$0.20 |
| march | +0.35 % | $10.58 | +$0.29 |

A free-item, $1-minimum promo predicts a traffic **spike** (March higher) and a
check **dip** (March lower). **Both came back the opposite way:** traffic is
**1.10 pp lower** in March than the rest of the window, and check is **9 ¢ higher**.

**This is stronger evidence than a null result would be.** A cancellation scenario
— 2025 ran a comparable offer, so the LY twin absorbs it — predicts a delta near
zero, not a reversal. An inverted signature on both dimensions argues the offer
simply didn't move behavior detectably in either year, or that something else
entirely (other Jan–early-Apr activity inflating the baseline) is driving the
rest-of-pre numbers. Either way, the practical answer is the same.

**Defect 2 is closed. The 2026 pre-window is not shown to be inflated on traffic or
depressed on check by the March free-item promotion.** The 2025 calendar pull is no
longer required to publish — the document's own test, run as specified, did not
find the confound it was designed to detect.

### Where this leaves the two gating measurements
- **Defect 2 (March free-item promo): CLOSED**, per above.
- **Defect 1 (pre/post boundary)**: not re-litigated here, but note that **every
  query in this file already uses the corrected 04-22 boundary** the document's fix
  prescribes — Query C, Query E, and Query F all match blocks to launch rather than
  the original 7-block layout. Defect 1's fix has been the standing convention
  throughout this whole price analysis, not a separate outstanding action.

**Both of the document's publish gates are now satisfied.** Nothing found in this
project's price/traffic work blocks reporting the DiD numbers.
