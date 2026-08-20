# McValue 2.0 — the Field Business Partner document

**Deliverable:** two versions of the same analysis — one presenting findings only, one arguing a
position. Owner asked for both: *"honestly let's present both, let me see both versions."*

**Deadline: Tuesday 25 August 2026.** Captured 2026-08-14, eleven days out.

**Audience:** the McDonald's Field Business Partner, in person.

**Scope:** all 20 Oklahoma stores, plus **Gary Mornhinweg's** organisation (spelling confirmed by
the owner 2026-08-14 — an earlier "Morhininweg" was voice-input garble).

---

# ⭐⭐⭐⭐ 2026-08-20 UPDATE — read this first; it supersedes the 2026-08-18 update below

**Current draft: `memory/mcvalue-fbp-draft5.html`.** Draft 3's one remaining gate — whether the
March 2026 free-item promo inflates the pre-launch window — is closed. Query F (already run
2026-08-18, recorded in `memory/analysis-mcvalue-price-waves-2026-08-18.md` §5) tested it
directly: March came back with **lower** traffic and **higher** check than the rest of the
pre-window, the opposite of what the confound would predict. Draft 4 folds this into the document
body as its own section ("The pre-window, tested for a hidden promo"), updates the stale
Limitations bullet that was still framing this as an open bound, and closes item 1 of "Open before
the 25th." Draft 3's analysis itself is unchanged — this is presentation and gate-closure, not a
new finding.

**Draft 5 (same day) adds one thing, no figures changed:** a plain-language callout, right before
the first "Difference" table, defining what a difference-in-differences (DiD) is and clarifying
that Oklahoma and Florida are each measured this way *separately* — Florida's number is never
subtracted from Oklahoma's, it's shown as corroboration. The one genuine two-group subtraction in
the document is the thirteen-day price test. Owner asked what "DiD" meant while reviewing Draft 4
and separately noted future documents should spell it out — this was the same-day fix rather than
carrying the gap into a later draft.

**Freshness check RAN 2026-08-20 — verdict: no refresh needed.** Data through 08-11 was 9 days old
against the 25 Aug meeting; owner asked whether to pull current data and update. Query G
(`mcvalue-verification.sql`) compared the tail (08-12→08-20, −4.98% vs LY) against the already-
documented B6–B8 blend (−4.32% vs LY): gap −0.66pp, inside the no-material-change band. The trend
continued (B7/B8 were already −4.92%/−4.90%, the tail landed a touch deeper at −4.98%, not a
reversal and not a sharp new decline) — read as "still declining at the documented rate," not
"stable." The full-window and post-2-June DiD figures would move by tenths of a point at most if
extended; not worth re-deriving 5 days out. **The headline (−3.14 pp, six clean weeks) is a closed
historical window and was never at risk from this question either way.** Document stands as Draft
5. Only remaining open item is still the ask (item 8, above).

**What is genuinely still open, and it is the only thing left:** item 8 below, the ask — what is
actually being requested of the FBP. Draft 4 adds three candidate framings (relief-not-blame, a
specific ask tied to −3.14 pp, a joint-diagnostic framing) for the owner to pick from or reject,
but does not pick one. That choice is the owner's, not something this document can resolve on its
own. Once it's picked, the document is done.

---

# ⭐⭐⭐ 2026-08-18 UPDATE — read this before the FINAL EDIT SET below; it supersedes it

The price-and-traffic work below was done blind to menu pricing — it inferred price rounds from
calendar deadlines because nobody had yet measured the actual dates restaurants took price. That
inference was **wrong**, and it drove real content below (the "Correction — B1–B3 is clean was
wrong" section, further down) to a wrong conclusion. A full session of measurement on 2026-08-18
replaced inference with fact. **Full working, every query, every result: `memory/analysis-mcvalue-
price-waves-2026-08-18.md`. Runnable SQL with each result recorded inline: `memory/mcvalue-
verification.sql`. Current draft, incorporating all of this: `memory/mcvalue-fbp-draft3.html`.**

**What changed, in order of importance:**

1. **Actual price effective dates, measured from `qsr_product_mix` (persistent 14-day-flat step
   change in base price, not calendar deadlines or promotional noise): 2026-02-25 (all 27
   restaurants), 2026-06-13 (14), 2026-06-26 (13).** Not 5/14 and 6/26 as the calendar deadlines
   implied. Every restaurant appears exactly once across the two June waves.
2. **B1–B3 (2026-04-22 → 06-01) IS clean of both price and national marketing — confirmed by
   measurement, not calendar reasoning.** The "Correction — 'B1–B3 is clean' was wrong" section
   below is itself now wrong; it was built on assumed deadline dates that the actual data
   contradicts. Left in place as evidence trail per this file's own convention, not deleted.
3. **The headline number the document should lead with: −3.14 pp, the six clean weeks (B1–B3),
   McValue alone.** Needs no price correction and no calendar caveat — nothing else was running.
   This supersedes the −3.96 pp full-window figure as the number to lead with (that figure still
   holds as the district full-window measurement; it's just not the lead anymore).
4. **The June price rounds cost roughly a fifth to a third of the *full-window* Oklahoma traffic
   decline** (−1.17 to −1.46 pp of −3.96 pp), measured via the two-wave stagger as a natural
   experiment — thirteen days where one cohort had the new price and the other didn't, both
   running McValue. Gated on a placebo check; the placebo came back non-zero but with the wrong
   sign to explain the finding, so it stands with a widened band. Full derivation, including two
   robustness passes, in the price-waves file.
5. **⛔ RETIRE the "traffic got worse as national marketing support increased" framing**, wherever
   it appears below (see "The framing this unlocks" section). It is literally true and unsafe to
   say: the June price rounds alone account for more than the entire B1–B3-to-B4–B8 deterioration.
   Saying it in the room invites "you raised prices in June" — correct, ours, bigger than the
   effect being pointed at.
6. **Defect 2 (the March free-item promo) is CLOSED, without the 2025 calendar pull.** The gate
   section below ("The two measurements that gate publishing the DiD") is resolved — see the
   updated note inline at that section.
7. **Two exclusions sharpened, not changed:** Tishomingo's exclusion reason is now precisely "its
   LY twin is an opening ramp" (it opened 2024-12-16; the store itself is 20 months old). The
   retired figure set's "Tishomingo showed positive traffic" line must never reach the FBP —
   confirmed an artifact of a decaying honeymoon base, not real improvement.
8. **Still open, not a data question:** the ask section — what is actually being requested of the
   FBP. No query produces this.

---

# ⭐ FINAL EDIT SET — read this first; it supersedes earlier guidance below

Written 2026-08-15, ten days out. **This file accumulated three generations of guidance as calendar
coverage arrived, and several earlier conclusions were retracted by later ones.** Everything below
this section is preserved as the evidence trail, but where it conflicts with this section, this
section wins. A reader who starts at the top of the file and stops early will otherwise publish a
claim this project already withdrew.

## ⛔ Measured figures — 2026-08-16 re-run. These supersede every DiD number elsewhere in this file.

**Scope correction, owner-stated 2026-08-16:** *"I am good with FL being used for context, this will be
an FBP over the OK stores only though."* **Oklahoma is the subject; Florida is an external control**
(separate DO, ~900 mi, different competitive set) whose only job is to show the cause is not local
execution. Do not lead with FL or with pooled district figures — the district mixes a market that is
not under review.

Source `qsr_daily_activity_rollup`, matched-day `ly_` legs, PRE = 2026-01-01→04-21,
POST = 2026-04-22→08-11, excluding 43380 (opening ramp) and 43701 (no LY twin).
**Every figure is a ratio of summed counts** — Σtransactions ÷ Σly_transactions — never an average of
per-store or per-block rates.

| | Oklahoma (19) | Florida (6) — control |
|---|---|---|
| Traffic vs LY, pre-launch | **+1.13 %** | **+5.16 %** |
| Traffic vs LY, post-launch | **−2.83 %** | **−2.68 %** |
| **Traffic DiD** | **−3.96 pp** | **−7.83 pp** |
| **Sales DiD** | **−3.61 pp** | −8.01 pp |
| Check vs LY, pre-launch | **+22.3 ¢** | +36.6 ¢ |
| Check vs LY, post-launch | **+27.4 ¢** | +40.1 ¢ |
| **Check DiD** | **+5.1 ¢** | +3.5 ¢ |

### The check claim is WITHDRAWN — this is the biggest change

The document was going to carry **+10.4 ¢ as a McValue 2.0 effect.** It cannot. Three independent tests:

1. **The gain predates the launch.** OK check was already **+22.3 ¢** over LY before 2.0 existed. The
   incremental figure is **+5.1 ¢**, not +10.4 ¢.
2. **It NARROWS in the only block where price is impossible.** B1 (04-22→05-05) closes before the
   05-14 Round 1 deadline, effective dates later still. OK B1 = **+15.5 ¢, ~7 ¢ BELOW its own
   pre-trend.** FL independently: +36.6 ¢ pre → **+25.3 ¢** in B1.
3. **The step-up arrives with the price round, not the offer.** OK sits at pre-trend through B1–B3
   (15.5 / 21.7 / 22.7 ¢) then jumps at **B4, opening 06-03** — Price Round 2 recommendations ran
   06-01→06-26 — and stays elevated (35.4 / 34.3 / 34.7 / 28.2 / 28.0 ¢).

**Say it as:** check was already ahead of LY before launch, incremental movement is small, and the
visible step-up aligns with the June price round. Withdrawing a number you proposed yourself is the
most credible thing in the document — and far better done by us than by the FBP.

### Per-block Oklahoma series (exact, for the methodology section)

| Block | Dates | Traffic vs LY | Check vs LY |
|---|---|---|---|
| PRE | 01-01→04-21 | +1.13 % | +22.3 ¢ |
| B1 | 04-22→05-05 | +0.14 % | +15.5 ¢ |
| B2 | 05-06→05-19 | −2.68 % | +21.7 ¢ |
| B3 | 05-20→06-02 | −3.42 % | +22.7 ¢ |
| B4 | 06-03→06-16 | −0.74 % | +35.4 ¢ |
| B5 | 06-17→06-30 | −3.03 % | +34.3 ¢ |
| B6 | 07-01→07-14 | −3.10 % | +34.7 ¢ |
| B7 | 07-15→07-28 | −4.92 % | +28.2 ¢ |
| B8 | 07-29→08-11 | −4.90 % | +28.0 ¢ |

### Why the earlier traffic figures are retired rather than reconciled

**Sales reproduces (−3.61 vs −3.69 pp on file). Traffic does not** (−3.96 vs −4.55; FL −7.83 vs −5.49).
Two contradictions, both independent of weighting:

- **Weighting is NOT the cause — hypothesis tested and REFUTED.** Unweighted mean of per-store DiDs
  gives OK **−3.81**, FL **−7.97**; volume-weighted gives **−3.98 / −7.85**. The two methods agree
  within 0.2 pp and *neither* is near the published numbers. Do not re-raise averaging as the
  explanation.
- **No positive Florida store exists** (best −1.88 pp), contradicting the "Mossy Head +0.63 pp"
  outlier on file. The single positive restaurant is in Oklahoma at **+6.34 pp**.

So the pre-08-16 traffic set was computed over different data — different source, window, or exclusion
set. **Decision: retire it, do not reverse-engineer it.** Reconstructing a figure from a session
nobody has could consume the remaining days and produce nothing usable, and the goal is a number that
reproduces when the FBP asks — not an explanation of an old one. Ours derives from a stated source,
window, exclusion and weighting, computed two ways that agree.

**Coverage guard: ✅ PASSED 2026-08-16.** Per-store day counts are `min = max` on both phases —
**111 PRE / 112 POST across all 25 stores**, no store short a single day. So the ratio is not
distorted by missing days on one side, which is the failure mode CLAUDE.md warns about for any
DAR-denominated derivation. Note the guard had to be run **per store**: a district-level
`count(distinct dt)` returns 112 whether or not an individual store is missing twenty days — that
weaker query was written and caught on the same day. If this is ever re-checked, check `min`/`max`
of a per-`loc` count, not a global one.

**Still to re-run correctly:** the three-operator spread (0.38 pp on file) and the Tishomingo
exclusion effect (−4.37→−4.55 pp on file). Both come from the retired traffic set, so both are
presumed wrong until re-measured. The operator spread was doing real rhetorical work in an early
draft; it may widen.

**Live draft:** https://claude.ai/code/artifact/2dafe570-6ee1-424b-ac8d-dd39c90e1e24

---

## What is verified and stands

- **Launch date 2026-04-21**, from the April 2026 calendar issue. Independently confirmed to be a
  **Tuesday**, which is what forces the Wednesday-aligned re-anchoring.
- **The launch-anchored block layout is arithmetically exact** — recomputed 2026-08-15, all eight
  blocks are 14 days and every one starts on a Wednesday:
  `B1 04-22→05-05 · B2 05-06→05-19 · B3 05-20→06-02 · B4 06-03→06-16 · B5 06-17→06-30 ·
  B6 07-01→07-14 · B7 07-15→07-28 · B8 07-29→08-11`
- **Pricing largely differences out.** Round cadence is roughly symmetric across 2025 and 2026,
  consistent with the owner's account of minimal participation. This confound closes.
- **The FIFA World Cup Happy Meal was a demand failure, not an execution failure** — owner-confirmed
  and independently corroborated by satisfaction holding or improving on every dimension through the
  promotion, with accuracy peaking in June.
- **B1 closes 05-05, before the 05-14 Round 1 price deadline** — and effective dates fall later than
  the submission deadline, so the margin is wider than nine days. **Check movement inside B1 cannot
  be price.** This is the single most useful structural fact in the file.

## Superseded — do not re-derive these

| Retracted claim | Where | Replaced by |
|---|---|---|
| "B1–B3 is a clean six-week window" | §"What this means for the document" | **B1 alone is the cleanest block.** B2 carries a Beverage Launch and the Round 1 deadline; B3 the Worldwide convention and Round 2 recommendations. |
| "Traffic got worse as national marketing support increased" | §"The framing this unlocks" | **Retracted.** It assumed the support converted. With the World Cup Happy Meal confirmed as a commercial failure, B4–B8 carried *nominal* support that did not translate. |
| Calendar→block table with `B1 = 04-21 → 05-04` | §"six national events" | **Stale by one day** — built on the pre-re-anchoring layout. Under the corrected layout Happy Meal #4 (05-05) falls inside **B1**, not B2. Use the launch-anchored table instead. |
| "Required edits: split B1–B3 from B4–B8" | §"Required edits before 25 August" | Superseded by the narrowing above — **split B1 out**, not B1–B3. |
| "B1 alone is the cleanest block" (i.e. B2/B3 carry pricing) | this table, row above, and §"Correction — B1–B3 is clean was wrong" | **⛔ Wrong, measured 2026-08-18.** Built on the *assumed* Round 1 deadline (5/14). Actual price effective dates, measured from `qsr_product_mix`: 2026-02-25, 06-13, 06-26 — not 5/14. **B1–B3 (04-22 → 06-01) IS clean of price**, confirmed by direct measurement, not calendar inference. See `memory/analysis-mcvalue-price-waves-2026-08-18.md`. |
| "Traffic got worse as national marketing support increased" — second, independent reason | §"The framing this unlocks" | **⛔ Retracted again, 2026-08-18, for a second and separate reason.** The June price rounds alone account for −1.84 to −2.31 pp inside B4–B8 — more than the entire B1–B3-to-B4–B8 deterioration (−1.31 pp). The apparent worsening is priced by us, not caused by more marketing support converting worse. |

## The three edits the document needs

1. **Lead with B1, framed as McValue 2.0 versus McValue 1.0.** That is what the design actually
   measures — 1.0 launched 2025-01-07, so the LY twin is not "no McValue." Say so in the first
   paragraph rather than letting a reader discover it.
2. **Name every national event in the window, with dates, in the methodology section**, using the
   launch-anchored layout. B1's own Happy Meal rotation included — it rotates on a similar cadence in
   the LY twin and therefore largely cancels, but state that rather than omitting the event.
3. **Report the DiD with the calendar asymmetry stated as a bound, not as a point estimate.** The
   2025 post-twin carried two major product launches (McCrispy Strips, Snack Wraps) and a four-week
   free-fry offer; 2026's carried a failed tentpole and a one-day flash offer. Both headline numbers
   are therefore **overstated in the direction of the finding**. The honest form is *"the true effect
   is smaller than −4.55pp because the LY baseline was more heavily promoted"* — a number offered
   with its own limitation is far harder to dismiss than a number offered bare.

## The two measurements that gate publishing the DiD — BOTH RESOLVED 2026-08-18

**⛔ Superseded — see the 2026-08-18 UPDATE at the top of this file.** Both gates below are now
closed, though by sharper measurements than the two originally proposed here:

- **Gate 1 (March 2026 vs March 2025)** — closed by Query F in `memory/analysis-mcvalue-price-
  waves-2026-08-18.md`, run directly against March 2026's own matched-day `ly_` twin rather than a
  separate 2025 pull. Result: **inverted signature** (traffic 1.10 pp lower in March than the rest
  of the pre-window; check 9¢ higher) — the opposite of what a free-item promo predicts, which is
  stronger evidence of "inert" than a plain null would be. **No 2025 calendar pull required.**
- **Gate 2 (block-level check decomposition)** — answered by the actual measured price effective
  dates rather than the proposed B1-vs-B2–B8 split: check sits at its pre-launch level through the
  first six weeks and steps up in the block containing 13 June 2026, the wave-2 price date measured
  from `qsr_product_mix`. Mix, not price, explains B1–B3; price explains the step from B4 onward.

**The standing instruction below is satisfied. The DiD numbers, and the −3.14 pp six-week figure,
are clear to publish** — original text preserved below as the evidence trail.

Both are read-only. Both were flagged in this file as runnable; neither has been run.

1. **March 2026 vs March 2025 traffic and check.** Settles whether the month-long free-item offer in
   the 2026 pre-window cancels against its LY twin. The 2025 programme ran *continuously* while 2026
   shows it only in Jan–Mar, and that asymmetry inflates **both** headline numbers. A month-long
   free-item promotion leaves a visible footprint: a traffic spike with a check dip.
2. **Block-level check decomposition, B1 versus B2–B8.** If the check gain appears in B1, it is mix
   and the finding stands. If it only appears from B2, it is probably price and **the claim must
   change**. +10.4¢ is ~1.05% of a $9.909 check; a price round is typically 1–3%, so price alone
   could account for the entire headline.

**Neither can be run from the PM sandbox.** Verified 2026-08-15: the anon key returns zero rows on
`qsr_cash_sheet` (HTTP 200, empty) and `qsr_daily_activity` — that is RLS, not absence, and it must
never be reported as "no data."

**Always filter by `loc` and a date range.** An unfiltered `select=*` against `qsr_daily_activity`
returns a statement timeout — that is **expected behaviour, not a defect and not a finding**: the
table is 27 stores × hourly slots × years, and `supabase/schema-qsr-daily-activity-index.sql`
indexes it on `dt` precisely so filtered reads use an index scan. A `dt`-filtered probe returned
cleanly in the same session. Do not scope a measurement around the timeout; scope it around the
index.

These need either the owner's service-role shell or an engineer dispatch — the security constraints
permit the engineer **read-only measurement** with service-role access.

**Approved 2026-08-15 to run in parallel with the PR queue, with a constraint.** Rule 3's rationale
is repo merge collisions, and a read-only measurement writes nothing — but since the engineer must
run it, it is genuinely a second task in flight. It stays acceptable only as a **pure read: no
branch, no commit, numbers reported back.** Whoever is free then writes them into this file, so
exactly one session ever writes the repo. That preserves what rule 3 protects rather than its
letter.

**Standing instruction from this file, still in force: do not publish the DiD numbers until both are
resolved.** Found by us first, they become a methodology section that demonstrates rigour; found by
the FBP first, they cost the document its credibility.

---

## The claim under test

The owner's observation: McValue changed direction in **May 2026**, producing roughly a
**30–50¢ increase in average check at the cost of a sharper decline in guest counts**.

**That is the hypothesis, not the premise.** If the analysis starts from "clearly not working
well" it will find exactly that. The reference-class design below exists specifically to give the
data a chance to say otherwise.

## How McDonald's views the organization — owner correction, 2026-08-14

This determines which comparison carries the argument, so it is recorded before the method.

> *"as far as McDonald's views all of these operators, they are all run as one organization…
> Oklahoma is run separately with its own DO, Florida is run separately with his own DO as well.
> But the trump card is that for all business planning purposes and potential growth and rewrite
> of lease terms with McDonald's on restaurants, all 27 are viewed as one organization."*

Three levels, and they are not the same unit:

| level | reality |
|---|---|
| **Owner/operator** (Ryan Thorley, Rick/Kathy Thorley, Gary Mornhinweg, Jacob Thorley) | genuinely separate ownership; comparisons across them stand on their merits |
| **Market / DO** (Oklahoma; Florida) | **operationally separate** — each has its own Director of Operations |
| **McDonald's view** | **all 27 are one organization** for business planning, growth, and lease-term rewrites |

**Consequence for the argument.** An early draft leaned on "three independently-run organizations
all landed within 0.38 pp — not an execution story." **That framing fails in the room**, because
McDonald's does not recognise operator as the unit: one organization, one set of practices, of
course they move together.

**The comparison that survives is Oklahoma versus Florida** — two separately-run operations under
different DOs, ~900 miles apart, different competitive sets, weather, and demographics, both
showing the same signature in the same fortnight:

| market | n | traffic DiD |
|---|---|---|
| Oklahoma | 19 | ~~−4.55 pp~~ → **−3.96 pp** |
| Florida | 6 | ~~−5.49 pp~~ → **−7.83 pp** |

> ⛔ **SUPERSEDED 2026-08-16 — the figures above the arrows DO NOT REPRODUCE. Do not quote them.**
> See "Measured figures — 2026-08-16 re-run" immediately below.

The three-operator consistency inside Oklahoma becomes a **secondary corroboration**, not the
load-bearing claim.

**Honesty caveat to state in the document rather than let the FBP raise it:** OK and FL are not
fully independent — same ownership umbrella, same BI tooling, same person above both. A strong
control, not a clean one.

**Stakes, for the argue-a-position version only.** Because McDonald's evaluates all 27 as one
organization for growth and lease rewrites, a sustained district-wide traffic decline feeds the
numbers used to assess the organization for expansion — not merely a quarterly performance note.
**Keep this out of the findings-only version**, which stays strictly descriptive.

## ⛔ Tishomingo's open date — MEASURED 2026-08-18, supersedes "early 2025"

**Opened 16 December 2024.** Not "early 2025" (this file's earlier wording, an inference
never measured) and not later in 2025 (the owner's recollection). Both were wrong.

| date | guests | reading |
|---|---:|---|
| 2024-11-29 → 12-12 | 0 | in the system, not trading |
| **2024-12-13** | **14** | 105 in sales — a training/test day, **not** an opening |
| 2024-12-14 → 12-15 | 0 | |
| **2024-12-16** | **816** | **first real trading day** |
| 2024-12-17 | 1,224 | grand-opening peak |
| 2024-12-21 → 12-28 | ~750–900 | decay |
| 2024-12-25 | 0 | closed Christmas — correct, not a gap |

**Not a backfill artifact:** the table floor is 2024-01-01 and Tishomingo's first row is
2024-11-29 — **333 days after the floor**, so this is a genuine opening.

⚠️ **Method note worth keeping.** A first pass asked for `min(dt) where product_sales > 0`
and returned **2024-12-13** — the 14-guest training day. **First sales is not first day of
business.** The shape query caught it; the date query alone would have shipped a wrong date
for the second time. Use a volume threshold, or read the ramp.

### Why this strengthens the exclusion rather than weakening it

The pre-window's LY twin is Jan–Apr 2025. Opening 16 Dec 2024 puts the store at **two to
six weeks old across that entire LY leg**, in the steepest part of its grand-opening decay
— visibly 1,224 → ~800 guests within a fortnight, and the 17.6% within-2025 sales decline
already on file is the same curve continuing.

**Direction of the bias, now by mechanism rather than assertion:** the 2026 pre-window
compares against an *inflated* LY baseline (Tishomingo looks bad in pre); the post-window
compares against a *settled* one (looks good in post). **That manufactures a positive DiD.**
Excluding it therefore makes the finding more conservative, which is worth saying aloud.

**Document edit required:** replace "opened early 2025" with "opened 16 December 2024", and
state the two-to-six-weeks-old fact — it is stronger than the vaguer wording it replaces.
✅ **Done 2026-08-18** in the live draft.

### ✅ LY-twin question CLOSED — the exclusion reason is "opening ramp", not "no LY twin"

Measured 2026-08-18: across the 2026 pre-window (Jan 1 → Apr 21, **111 days**), Tishomingo
has an LY twin on **109** of them — **98% coverage**. It was genuinely trading through the
baseline period, so it is NOT the Ponce de Leon case.

**Confirmed wording: "opening ramp".** The two zero-LY days are immaterial and consistent
with 2025 closure days (Oklahoma weather). This question is settled — do not re-raise.

## Two stores excluded, with reasons

Both are opening artifacts. Documented exclusions, never silent drops.

**43701 Ponce de Leon** — opened 2026-03-13, `ly = 0` throughout. No comparison possible. It also
distorts any district aggregate that includes it: it adds current-year volume against no
last-year counterpart, inflating district vs-LY by roughly **+1.2 pp in the pre window and
+2.4 pp in the post window**. Because it inflates more in post, an uncorrected district series
*understates* the traffic decline.

**43380 Tishomingo** — opened early 2025 (`memory/dar-vs-ops-reconciliation.md:78`;
`constants.js:92` flags "Limited history (503 days)" and `recentOnly: true`). Its LY is an opening
ramp, not steady-state trading — measured, the LY baseline falls **−17.6% in sales and −16.2% in
traffic within 2025** ($7,078/day → $5,830/day). So its pre-window compares against a hot opening
period and its post-window against a cooler one, making the store appear to *improve*. It was one
of only two stores with positive traffic DiD, and the effect is spurious.

**Excluding it strengthens the finding:** All-OK sales DiD −3.36 → **−3.69 pp**, traffic DiD
−4.37 → **−4.55 pp**. It also explains why Ryan Thorley looked better than the other operators
(−3.10 vs −3.48/−3.62) — Tishomingo is his. Excluded, he is at −3.86 and the three-operator
spread tightens from 0.52 pp to **0.38 pp**.

⛔ **SUPERSEDED 2026-08-16.** The 2026-08-16 re-run measures **no positive Florida store** — FL's best
is **−1.88 pp** — so Mossy Head is not an outlier and the "+0.63 pp" below does not reproduce. The one
positive restaurant in the whole set is in **Oklahoma at +6.34 pp**, which nothing in this file
identifies. This is the second independent contradiction of the pre-08-16 traffic figures and it is
what makes the whole earlier traffic set untrustworthy, not just its headline. Original text kept
below as the evidence trail:

Checked and **kept**: 37566 Mossy Head (+0.63 pp traffic DiD) — established Florida store, no
opening artifact, a genuine outlier.

## Method

**Difference-in-differences against `ly_` twins.** McValue is national — there is no untreated
store cohort, so the control has to be the same stores a year earlier.

### Source: `qsr_cash_sheet`, not the rollup

Confirmed 2026-08-14 by reading the actual JSONB keys rather than assuming a schema (a mistake
already made once this month with `net_sales_amt`). `qsr_cash_sheet.metrics` carries **`ly_`
twins for every key**:

`net_sales_amt` · `billable_sales_amt` / `billable_sales_qty` · `discount_amt` / `discount_qty` ·
`promo_amt` / `promo_qty` · `coupon_a_qty` … `coupon_e_qty` · `emp_meal_discount_*` ·
`mgr_meal_discount_*` · `overring_*` · `treds_before/after_*` · `cash_refunds_*` ·
`cashless_refunds_*` · `actual_dep_amt` · `cash_over_or_short` · `drawer_opens_qty` ·
`petty_cash_reim_amt` — each with an `ly_` counterpart.

Every row is therefore its own matched pair; **no self-join is needed**.

**Coverage (measured) — these are BACKFILL FLOORS, not data floors:**

| table | backfilled from | to | locs |
|---|---|---|---|
| `qsr_cash_sheet` | 2024-04-01 | 2026-08-14 | 27 |
| `qsr_sales_mix` | 2024-04-01 | 2026-08-14 | 27 |
| `qsr_daily_activity_rollup` | 2025-01-01 | 2026-08-14 | 27 |

**Owner, 2026-08-14:** *"We can access all historical data for the restaurants for many many
years in the past, so don't let that be a limiter."* Now a standing rule in CLAUDE.md. If this
analysis wants a longer pre-period — more promo windows in the reference class, a multi-year
baseline for the discount rate — **run a backfill rather than scoping down**. The 2024-04-01
figure is when the ops-pull was first run, nothing more.

`billable_sales_qty` is the **transaction count** — the cash-sheet field group is literally
`Billable Sales: Billable Sales Cnt` / `Billable Sales Amt` (`scripts/parse-field-defs.mjs:104`).
So **average check = `net_sales_amt / billable_sales_qty`**, and the value itself is the check on
that reading: a result in the $8–12 range confirms the field; anything else means stop.

### Periods: 14-day Wednesday-anchored blocks, not calendar months

Owner's contribution, 2026-08-14, and it is correct: 7/14/21/28-day blocks are **day-of-week
balanced** — one of each weekday per 7-day block. Calendar months are not (a 31-day month has
three weekdays occurring five times and four occurring four), so month-over-month comparison
carries a DOW-composition confound.

**This is already the house convention, verified in code:**

- `src/constants.js:103` — `weekStartDay: 3, // 0=Sun 1=Mon 3=Wed (McDonald's standard)`
- `scripts/qsrsoft-dar-pull.mjs:260` and `qsrsoft-digital-app-pull.mjs:73` send
  `compType: 'trading', weekStart: '3'` — so the `ly_` values come back **trading-day aligned**
- `src/engine/backtest.js:466,531` already do LY lookups at `addD(row.date, -364)`, with
  variables named `_ly364` — the 52-week convention, not 365

The 364-day point matters: 365 days shifts the comparison by one weekday (two after a leap
year), quietly comparing a Friday to a Thursday. QSRSoft's trading alignment handles this
already, so the inline `ly_` values are correct without recomputation.

**Block layout.** Today is Friday 2026-08-14, so the last complete day is the 13th and the last
complete Wednesday-anchored block ends **Tuesday 12 August**. Block 0 = Jul 30 – Aug 12; indices
step backward in 14-day steps. Block −7 straddles 1 May, so:

- **post** = blocks −6 … 0 → **7 complete blocks**
- **pre** = blocks −13 … −7 → **7 matched blocks**, same length, same DOW balance

**Why this beats months, stated correctly.** The owner initially estimated 10–20% more data;
the real figure is ~7% (98 days vs 92). **Volume was never the argument.** The gain is
**7 post-break observations instead of 3** — three points cannot distinguish a step change from
a drift, seven can show whether the average-check gain is holding, growing or decaying since
May. For a document arguing a position, that trajectory is most of the argument.

**August is not excluded** — it is included as complete 14-day blocks, which is precisely what
the block method buys. What is excluded is any partial block. A partial period weighted as a
full one is a known error class in this repo; say so explicitly in the document rather than
dropping it silently.

## The reference-class extension (owner idea, 2026-08-14)

> *"I might source the national promotional calendar for last year and potentially even the year
> back from that if it will be useful to see when other national promotions landed to get more
> clarity on how they may have worked versus the current one."*

**Two distinct benefits, the second larger:**

1. **Confound control.** An `ly_` twin is a clean control only if last year's matching period was
   not itself under a promo. If May–Aug 2025 carried a strong national window, the LY baseline is
   inflated and part of the apparent decline is an artifact. This is fair game for the FBP to
   raise, and the calendar closes it.
2. **A reference class.** Turns the document from *"McValue 2.0 hurt us"* into *"here is the
   check-versus-traffic signature of every national promo window in our data; McValue 2.0 sits
   outside it in this specific way."* An objective standard rather than our read of one window —
   much harder to wave off, and it is also what keeps the analysis honest about its own premise.

**Which years are actually worth sourcing:**

| year | verdict |
|---|---|
| **2024** | **Yes.** Data starts 2024-04-01, so Apr–Dec 2024 windows are directly measurable, and they are the LY baseline under the 2025 windows. |
| **2026** | **Already in the repo, unextracted** — `REV_2__2026_OPNAD_Calendar_10.29.25.pdf` covers the period under study, including the McValue 2.0 window itself. Free value; extract before sourcing anything new. |
| **2025** | Already extracted — `data/marketing-calendars/2025-opnad-retail-windows.json`, 16 windows, three source year-typos corrected and owner-confirmed. |
| **2023** | **Corrected 2026-08-14 — worth having after all.** The original advice ("skip, our data does not reach 2023") was wrong reasoning: QSRSoft holds many years and a backfill reaches 2023 whenever we want it. Value it if the reference class wants more promo windows; the constraint is backfill effort, not data existence. |

The 2026 media-mix grids are a different shape (GRPs by week-start, not start/stop pairs), so a
window has to be inferred from contiguous non-empty weeks.

**Consequence:** promo windows must be tagged so blocks can be classified promo/non-promo. The
marketing-calendar README notes loading into `org_events` is still outstanding — that becomes
load-bearing for this document rather than housekeeping.

## Data access

The anon key reaches Supabase but **RLS returns zero rows** on every table this needs (verified
2026-08-14: `qsr_daily_activity_rollup` → HTTP 200 `[]`, `qsr_cash_sheet` → HTTP 200 `[]`,
`qsr_daily_activity` → HTTP 500 statement timeout). `qsrsoft_kb` **is** readable with the anon
key — useful for field definitions.

So the analysis runs on the **query path**: owner executes SQL in the Supabase SQL editor and
pastes results. Owner chose this over service-role access, which he has deferred until closer to
additional users. This is the first concrete dated need for that key; he has invited reminders.

## Open items

**Owner:**
- [ ] **Exact date of the McValue 2.0 direction change.** He can get it; asked not to be let to
      forget. **Find the break in the data first and use his date as verification** — if they
      agree that is corroboration, if they disagree that is worth knowing before it reaches the
      FBP. Do not use his date as an input that biases the search.
- [ ] **Gary Mornhinweg's six loc numbers.** An earlier session recorded 5183 Chickasha, 11657
      Purcell, 18213 Lindsay-Wal-Mart, 20475 OKC-I240/Sooner, 33704 Tecumseh, 34222 Harrah — but
      CLAUDE.md lists all six under MCDOK, so **do not split the cohorts on that stale note**.
      The Part B query returns every store so the split can be applied after confirmation.
- [ ] Run the two-part analysis SQL (district × block; per-store pre vs post).
- [ ] Source the 2024 national marketing calendar.

**Me:**
- [ ] Extract `REV_2__2026_OPNAD_Calendar_10.29.25.pdf`.
- [ ] Find the break in the data independently.
- [ ] Load promo windows to `org_events` for block tagging.
- [ ] Draft both versions.

---

# McValue launch date CONFIRMED: 2026-04-21 (owner, from the May OPNAD Calendar Optimizations deck)

Owner also reports **an updated push in July 2026**, which he reads as an early corporate
acknowledgment of weakness. (I could not extract text from the PDF in this environment — poppler is
unavailable — so the date and the July push are on the owner's reading of the deck, not my own.)

## This settles the satisfaction question, and it favours the document

The district OSAT decline (`memory/qsrsoft-report-catalog.md`) begins around **March 2025** —
**thirteen months before McValue launched.** Regressing the survey-weighted monthly series:

| window | months | slope | t |
|---|---|---|---|
| **pre-launch** (2024-01 … 2026-04) | 28 | **−0.286 pp/month** | **−4.33 — significant** |
| **post-launch** (2026-05 … 2026-08) | 4 | **+0.586 pp/month** | +1.11 — not significant, n too small |

12 months before launch: **79.7%**. Since launch: **76.8%**.

Monthly around the launch:

```
2025-12  75.4%
2026-01  77.2%
2026-02  80.6%
2026-03  75.2%
2026-04  74.7%   <- McValue launches 4/21 — the series TROUGH
2026-05  76.6%
2026-06  76.8%
2026-07  76.0%
2026-08  78.8%
```

**Satisfaction fell significantly for 28 months, bottomed in the launch month, and has been
flat-to-rising in the four months since.**

## What that does to the traffic argument

The obvious challenge to the document — *"traffic fell because service got worse, not because of
McValue"* — **does not survive this**:

1. The satisfaction decline **predates the launch by 13 months**, so it cannot have been caused by
   McValue, and it was already significant long before.
2. A **steady** secular decline is differenced out by the DiD design, which compares the *change*
   in the vs-LY gap. That is what DiD is for.
3. What DiD cannot absorb is an *accelerating* decline. Satisfaction did not accelerate downward
   after launch — the slope flipped positive. So a worsening-service story cannot explain the
   post-launch traffic deterioration.

**Traffic kept deteriorating (−2.91% → −4.72%) while satisfaction stabilised.** That divergence is
the strongest form of this argument: whatever is pulling traffic down is *not* a service-quality
problem, because service perception stopped falling at exactly the point traffic kept going.

Raise this in the document explicitly. A reader who knows the business will wonder about service;
answering it with the measurement is far stronger than leaving it unaddressed — and the answer
happens to help.

## ⚠️ Design consequence: the post period contains TWO events

The **July push** sits inside the post-launch window. Blocks after mid-July therefore reflect
launch **plus** refresh, not launch alone. Options, in order of preference:

1. Report the post period split at the July push date — pre-push blocks and post-push blocks
   separately. The trajectory table already runs block-by-block, so this is a labelling change, not
   new analysis.
2. At minimum, **name the July push in the document** and note which blocks it touches. An
   unmarked second intervention inside a post period is exactly the kind of thing that invalidates
   a finding when someone else spots it first.

The owner's read — that a July refresh signals corporate awareness of softness — is plausible
context but is **not evidence**; keep it as framing, not as a finding.

## The post-launch window is NOT a clean treatment period — six national events sit inside it

Owner supplied the 2026 marketing calendar (June–August). Mapping it onto the 14-day blocks from
launch (2026-04-21), against data running to 2026-08-13:

| block | window | national activity |
|---|---|---|
| **B1** | 04-21 → 05-04 | **— clean —** |
| **B2** | 05-05 → 05-18 | **— clean —** |
| **B3** | 05-19 → 06-01 | **— clean —** |
| B4 | 06-02 → 06-15 | **U.S. FIFA World Cup Happy Meal begins (6/9)** |
| B5 | 06-16 → 06-29 | Fried Apple Pie LTO, all-store sell (6/23) |
| B6 | 06-30 → 07-13 | **McValue 2.0 REHIT (7/7)** — under-$3: $1.50/$2 Sausage Burrito, $1.50/$2 McChicken **+ National French Fry Day flash offer (7/10)** |
| B7 | 07-14 → 07-27 | Happy Meal #6 (7/14); Breakfast Flavor News (7/21); Chicken Flavor News — Caesar Snack Wrap / McCrispy / Dip Cup (7/21) |
| B8 | 07-28 → 08-10 | — clean — |

*(Beverage Rehit 8/17 and Happy Meal #7 8/18 fall after the data cutoff.)*

**The July push is precisely dated: 2026-07-07, "McValue 2.0 Rehit", landing in B6.**

### What this means for the document

**Blocks 1–3 are the only clean McValue read** — six weeks, launch effect alone, nothing else
national running. That is the window in which "McValue did X" can be said without qualification.
**Report it separately.** It is the strongest evidential unit in the whole analysis and it is
currently buried in an eight-block average.

**B4 onward is confounded by at least five distinct national events**, one of which — a **FIFA World
Cup Happy Meal in a World Cup year hosted in North America** — is potentially a large traffic
driver in its own right. Any statement of the form "in the post-McValue period, traffic did X"
without that caveat is over-claiming, and a reader who works for McDonald's will know the calendar
better than we do.

### The framing this unlocks — and it is stronger, not weaker

The trajectory finding is that traffic **deteriorated** across the post period (−2.91% → −4.72%,
flattening only in the final block). Set against the calendar, the early blocks are the clean ones
and the later blocks carry the World Cup Happy Meal, an LTO, the McValue 2.0 rehit, and two flavour
launches.

**Traffic got worse as national marketing support increased.** That is a materially harder result
than the headline number alone, and it is the honest reading rather than a spin: the period with
the most promotional support is the period with the worst traffic performance.

It also reframes the July rehit. The owner reads it as corporate acknowledgment of weakness; the
data says traffic continued deteriorating *through* B6 and B7, i.e. **the rehit did not arrest the
decline** in the six weeks we can observe. That is a finding, where "corporate seems worried" is
only an impression.

### Required edits before 25 August

1. **Split the post period**: report B1–B3 (clean) separately from B4–B8 (confounded), and say why.
2. **Name every national event in the window**, with dates, in the methodology section.
3. **State plainly that the post period is not a clean treatment window** and that the clean read is
   six weeks long. Owning that limitation is what makes the B1–B3 result credible.

## FIFA World Cup Happy Meal — a DEMAND failure, not an execution failure (owner-confirmed)

Owner, 2026-08-14: the World Cup Happy Meal was *"a huge fail for us"*, and on the execution
question — *"your restaurants ran it fine, customers didn't buy it"* — **"correct."**

The satisfaction series supports it independently. Across the promotion window every dimension held
or improved:

| month | OSAT | Accuracy | Fast | Clean | Quality |
|---|---|---|---|---|---|
| 2026-05 | 76.6% | 79.3% | 75.1% | 71.2% | 75.3% |
| **2026-06** (WC HM from 6/9) | 76.8% | **81.0%** | 76.1% | 71.9% | 75.7% |
| 2026-07 | 76.0% | 80.2% | **76.8%** | **72.3%** | **76.0%** |

No service degradation anywhere — accuracy actually **peaked** in June. A tentpole promotion that
strains a kitchen shows up as slower service and worse accuracy. This one did not.

### Correction to an earlier framing in this file

An earlier note argued *"traffic got worse as national marketing support increased."* **Retract
that.** It assumed the support converted. With the World Cup Happy Meal confirmed as a commercial
failure, blocks B4–B8 carried *nominal* support that did not translate, so the later-block
deterioration has a rival explanation that is not McValue. The line was too clever and the owner's
operational knowledge corrects it.

**Consequence: stop extracting a McValue signal from B4–B8.** At least two candidate causes —
McValue's effect decaying, or a failed tentpole dragging — and nothing in our data separates them.
**B1–B3 is the defensible read and should be the headline.**

## The through-line for the document — three independent lines, one conclusion

This is now evidenced from three directions that do not depend on each other:

1. **⛔ Stale, see the 2026-08-18 UPDATE at the top of this file.** Both numbers below are
   superseded: traffic DiD is **−3.96 pp** (the 08-16 re-run), and the check gain is **withdrawn as
   a claim entirely** — draft3 drops it, because the timing lines up with a measured price round,
   not mix. **Traffic DiD −4.55pp, check +10.4¢** — customers visiting less often, spending more per visit.
2. **Satisfaction stable through the period** (slope flipped positive post-launch; every dimension
   held during the tentpole) — operations are not the problem.
3. **A World Cup Happy Meal, in a World Cup year, in a host country, failed to move traffic** —
   demand is not responding to promotional stimulus.

**The convergent conclusion is that this is a demand-side problem, not an execution problem.**

That matters for how the document lands. It moves the conversation from *"your operators need to
execute better"* to *"the offer is not working"* — and each leg is independently defensible, so
challenging one does not collapse the argument. Point 2 in particular is the pre-emptive answer to
the most likely pushback, and it is measured rather than asserted.


### Calendar revision — a seventh event, and it cuts against the check finding

A later issue of the calendar (owner, 2026-08-14) adds one item the first version did not carry:

**7/10 — National French Fry Day (Flash Offer): free medium fries with $1 minimum purchase,
redeemable 1× per customer.** Falls in **B6**, alongside the McValue 2.0 rehit.

**This works against the check result, which makes that result more conservative.** A free-item
offer gated at a **$1 minimum purchase** manufactures a day of unusually low tickets by design.
Wherever it lands it drags average check down, so the measured **+10.4¢** check gain is if anything
**understated** in the affected block — the promotion pushed the metric the opposite way from the
finding.

Worth one line in the document. A limitation that biases *against* your own conclusion is the
cheapest credibility you can buy, and a reader who knows the calendar will spot the date anyway.

**Note on the World Cup Happy Meal:** the later calendar issue does not list it (its June section
begins at 6/23), almost certainly because that issue only carries forward-looking items. It is not
a retraction — the owner independently confirms the promotion ran and *"was a huge fail for us."*
The 6/9 start date stands, and the B4 mapping is unchanged.
### ⚠️ Current calendar (Aug 2026 issue) — a RECURRING offer, not just point events

The live calendar carries two standing items the earlier issues did not surface:

```
Now–10/4  Weekly Mass Digital Offers | Free Medium Fry w/ $1 min purchase
          AND $2 Breakfast Sandwich  (redeemable 1x/customer PER WEEK)
Now–9/30  ABS 2.0 promotion — up to $3,000 savings per unit, all purchases  [operator-side]
```

**The Weekly Mass Digital Offers item is the most consequential thing found in any of the calendar
versions**, because it is *recurring* rather than a single date. A weekly free-fry offer gated at a
$1 minimum, running across the measurement window, acts continuously on both headline metrics.

**Issue dated 2026-08-10** (owner). That establishes the offer was live *by* 8/10; it does not
give the start date, since "Now" is relative to publication.

**Inference, and it is only an inference:** the preceding issue did **not** carry it. That issue
listed `7/10 National French Fry Day` as a **one-day** flash offer and had no standing `Now–`
items at all. A recurring weekly offer already running in July would almost certainly have appeared
there in the same standing form the August issue uses. So the likely start is **between mid-July
and 2026-08-10** — placing it in **B7, B8 and the final partial days**, roughly the last two to
three weeks of a sixteen-week post period.

**To pin it exactly:** find whichever issue *first* carried the `Now–10/4` line. That dates it to
within a week. Worth doing before the claim goes in the document, but not blocking.

**What matters most: B1–B3 is clean of this as well.** The headline six-week window closes
2026-06-01, well before any plausible start date. No version of the answer reaches the read the
document leads with — which is a further argument for making B1–B3 the headline rather than the
eight-block average.

**It biases BOTH findings toward conservatism, whichever the answer:**

| finding | direction of the offer's effect | consequence |
|---|---|---|
| check **+10.4¢** | free item at a $1 minimum **suppresses** average check | the gain was measured *against* a check-suppressing offer — **understated** |
| traffic **−4.55pp** | a free item is a **traffic draw** | the decline was measured *against* a traffic-supporting offer — **understated** |

That is the good kind of confound: it works against the conclusion in both directions, so naming it
strengthens the document rather than weakening it.

**`ABS 2.0` is operator-side** (equipment/supply savings, not consumer-facing) so it does not touch
traffic or check — but it is relevant to food-cost and P&L work, and is noted here so it is not
mistaken for a marketing event later.

### Post-cutoff items — context only, not in the data

`8/17` Energy Launch + Coffee LTO · `9/1` Spicy McNuggets LTO · `9/8` **Dual Daypart EVM** ($5
Sausage McMuffin w/ Egg; $8 Big Mac) · `9/15` Arch Card balance in the app · `9/15` Happy Meal #8 ·
`9/18` **National Cheeseburger Day** (free Double Cheeseburger, $1 min) · `10/6` Monopoly ·
`10/20` Happy Meal #9.

**Worth one observation in the document:** the forward calendar is dense with **free-item and
deep-value offers** — weekly free fries, $2 breakfast sandwiches, free Double Cheeseburger, dual
daypart EVMs at $5/$8. A system leaning this hard on discounting is itself consistent with the
demand-side reading, and unlike our own analysis it is McDonald's own published plan rather than
our inference.

---

# ⚠️ TWO DEFECTS IN THE BLOCK LAYOUT, found 2026-08-14 once the launch date was confirmed

The block layout was designed **before the McValue date was known** — anchored to data recency
(working back from Aug 12), not to the intervention. With 4/21 now confirmed from the calendar
itself (`4/21 — McValue 2.0 Launch`, April 2026 issue), two things are wrong.

## Defect 1 — the pre/post boundary is in the wrong place

```
 -9  pre   2026-03-26 → 2026-04-08
 -8  pre   2026-04-09 → 2026-04-22   <-- McValue 4/21 falls INSIDE this block
 -7  pre   2026-04-23 → 2026-05-06   <-- ENTIRELY after launch, labelled PRE
 -6  POST  2026-05-07 → 2026-05-20
```

**Roughly 16 days of post-launch trading sit in the control group.** Block −7 is wholly
post-launch; block −8 straddles the launch.

Direction: this *dilutes* the measured effect, so the true effect is **larger** than reported —
conservative, but indefensible once the date is known. A reviewer spots this in one minute.

**Fix: re-anchor to the launch.** 2026-04-21 is a **Tuesday**, so Wednesday-aligned blocks start
2026-04-22 and give **8 complete post blocks** (one more than the current 7):

```
B1 04-22→05-05   B2 05-06→05-19   B3 05-20→06-02   B4 06-03→06-16
B5 06-17→06-30   B6 07-01→07-14   B7 07-15→07-28   B8 07-29→08-11
pre = 2025-12-31 → 2026-04-21  (8 matched blocks)
```

## Defect 2 — the re-anchored pre-period contains a month-long FREE-ITEM promotion

From the March/April 2026 calendar issue:

> **Month of March — GMA Download Incentive: Free 10 pc McNuggets with $1 min purchase**

A national, month-long, free-item offer gated at a $1 minimum — sitting inside the baseline,
covering roughly **30% of the pre window**.

**This is the first confound found that inflates the headline findings rather than deflating
them**, and it does so on **both**:

| metric | effect on the 2026 pre window | effect on the DiD |
|---|---|---|
| traffic | free item **raises** pre-period traffic → pre-vs-LY inflated | subtracting a larger pre makes the decline **more negative — OVERSTATED** |
| average check | $1-minimum free item **lowers** pre-period check → pre-vs-LY depressed | subtracting a smaller pre makes the gain **larger — OVERSTATED** |

Traffic down and check up is *exactly the signature a free-item promotion ending would produce*,
independent of anything McValue did. That is the challenge this document must answer.

### It may cancel — and that is measurable, not a matter of opinion

The DiD compares 2026 against `ly_` twins. **If March 2025 carried a comparable offer, the LY twin
absorbs it and the confound largely cancels.** This is precisely the reference-class extension
already flagged in this file (owner's own idea) — now on the critical path rather than a nice-to-have.

**Two things to get, in order:**

1. **The March 2025 calendar issue** (ideally Jan–Apr 2025, covering the whole pre window's LY
   twin). Settles whether the confound cancels.
2. **Measure it directly:** pull DAR traffic and check for March 2026 vs March 2025. A month-long
   free-item promo leaves a visible footprint. If March 2026 shows a traffic spike and a check dip
   versus its LY twin, the confound is live and quantifiable; if not, it is inert. **This does not
   require the calendar** — it can be run now.

**Do not publish the DiD numbers until defect 1 is fixed and defect 2 is either measured or
excluded.** Both are cheap. Both are the kind of thing that, found by a reader first, costs the
whole document its credibility — and found by us first, becomes a methodology section that
demonstrates rigour.

---

# ⚠️ TWO MENU PRICE ROUNDS LAND INSIDE THE POST WINDOW — this threatens the check finding

Full calendar coverage (Mar–Oct 2026) obtained 2026-08-14. Rebuilt against launch-anchored blocks:

```
 B1  04-22 → 05-05   05-05 Happy Meal #4 begins
 B2  05-06 → 05-19   05-06 Beverage Launch (all-store sell)
                     05-14 DEADLINE for price changes ahead of 2026 PRICE ROUND 1
 B3  05-20 → 06-02   06-01 McDonald's Worldwide convention (6/1-6/4)
                     06-01 2026 Price Round 2 recommendations available on portal
 B4  06-03 → 06-16   06-09 FIFA World Cup Meal (dual-daypart) + Happy Meal #5
 B5  06-17 → 06-30   06-23 Fried Apple Pie LTO
                     06-26 DEADLINE to submit recommendations: PRICE ROUND 2
 B6  07-01 → 07-14   07-07 McValue 2.0 REHIT · 07-10 French Fry Day · 07-14 Happy Meal #6
 B7  07-15 → 07-28   07-15 MENU ITEM SEQUENCING begins deploying · 07-21 flavour news ×2
 B8  07-29 → 08-11   — clean —
```

## The pricing problem, stated plainly

**Two menu price rounds sit inside the measurement window.** Round 1 changes were due 5/14; Round 2
recommendations landed 6/1 with submissions due 6/26. Both take effect *after* McValue launched.

**Average check +10.4¢ on a roughly $10 check is about 1%. A menu price round is typically 1–3%.**
So the entire measured check gain could be **price**, not mix — a complete alternative explanation
for a headline number, and one a franchisee reader will think of immediately because they took the
same rounds.

**This is answerable, not a data limitation.** The owner sets his own pricing. **The question to
answer before publishing: did the stores take price in Round 1 and/or Round 2, on what effective
dates, and at roughly what percentage?**

**The decomposition that saves the finding:** **B1 (04-22 → 05-05) closes before the Round 1
deadline**, so whatever check movement appears in B1 cannot be price. B1 is therefore the clean
read on the McValue *mix* effect — which is what the document actually wants to claim. If B1 shows
the check gain and later blocks show more, the extra is plausibly price; if B1 shows nothing and
the gain only appears from B2, the finding is probably pricing and the claim must change.

**Run that block-level check-versus-price decomposition before the 25th.** It is the difference
between a defensible finding and one that collapses on the first question.

## Correction — "B1–B3 is clean" was wrong

An earlier note in this file called B1–B3 a clean six-week window. **With full calendar coverage
that is not true.** B1 carries a Happy Meal rotation, B2 a Beverage Launch and the Round 1 price
deadline, B3 the Worldwide convention and Round 2 recommendations.

The honest statement is narrower: **B1 is the cleanest block** — one routine Happy Meal rotation
(which rotates on a similar cadence in the LY twin and therefore largely cancels in a vs-LY design)
and **no pricing action**. Everything from B2 onward carries either a promotional launch or a
pricing event.

I asserted the clean window before having the calendar for it, then had to narrow it twice as
coverage arrived. Recorded so the file shows the correction rather than only the conclusion.

**⛔ This correction is ITSELF superseded — see the 2026-08-18 UPDATE at the top of this file.**
It was built on the assumption that restaurants took price on the corporate deadline dates
(Round 1 due 5/14, Round 2 submissions due 6/26). **The actual effective dates, measured from
`qsr_product_mix`, are 2026-02-25, 06-13, and 06-26 — not 5/14.** B1–B3 (04-22 → 06-01) is clean of
price by direct measurement. Left in place, not deleted, so this file shows both corrections rather
than erasing the wrong one — the second correction is the one to trust.

## Also new

**`7/15 — Menu Item Sequencing begins deploying`** (B7). An operational deployment changing order
flow, not a promotion. Potentially relevant to service times and throughput, and therefore to both
the DAR service metrics and any traffic read on B7 onward. Nothing else we track would have flagged
it.

**`9/8 — McValue 2.0 Rehit`** (Breakfast under $3: $1.50/$2 Sausage McMuffin; ROD under $3:
$1.50/$2 Cheeseburger) — a **third** McValue action, after the data cutoff. Note that two calendar
issues describe 9/8 differently (one as a McValue rehit, one as a Dual Daypart EVM at $5/$8);
worth resolving if 9/8 ever enters an analysis window.

---

# PRE-PERIOD CALENDAR (Jan–Apr 2026) — two findings that change the claim

Obtained 2026-08-14. The pre-period was **not** a quiet baseline.

## Finding 1 — the free-item offer is MONTHLY and covers the ENTIRE pre-period, then stops

| month | GMA Download Incentive |
|---|---|
| Jan 2026 | **Free Big Mac** w/ $1 min purchase |
| Feb 2026 | **Free Large Fry** w/ $1 min purchase |
| Mar 2026 | **Free 10 pc McNuggets** w/ $1 min purchase |
| **Apr–Jul 2026** | **no equivalent line appears in any issue** |
| Aug 2026 | *Weekly* Mass Digital Offers — free medium fry, $1 min, **1×/customer per week** |

**This supersedes the earlier note that treated March's free-McNuggets as the confound.** It is not
a March event — it is a **standing monthly programme running through the whole pre-window**
(pre = 2025-12-31 → 2026-04-21, i.e. Jan, Feb and Mar entirely).

And it appears to **stop after March**, with no standing free-item offer visible Apr–Jul, returning
in a *weekly* (4× more frequent) form by the 2026-08-10 issue.

**If that pattern is real, it is the strongest confound found and it inflates both headline
findings:**

- pre-period carries a monthly free item → **traffic up, check down** in the baseline
- post-period (Apr 22 → ~Jul) carries none → traffic down, check up **relative to it**
- DiD therefore reports **traffic falling and check rising** — *exactly the observed result* — with
  no McValue effect required at all

⚠️ **Caveat, and it matters: absence from a calendar listing is not proof the offer stopped.** The
Apr–Jul issues may simply not repeat standing items. **Verify before relying on this** — it is the
same "absent document ≠ absent event" error already made twice in this file.

**The decisive question is unchanged and now sharper: did Jan–Apr 2025 carry the same monthly GMA
Download Incentive?** If yes, the `ly_` twin absorbs it and the confound cancels. This is now the
single highest-value item in the whole calendar exercise.

## Finding 2 — McValue was ALREADY RUNNING in the pre-period

> **2/2 — McValue Marketing re-hit**

McValue 1.0 was live and being re-marketed during the baseline. **The pre/post comparison is
therefore McValue 2.0 versus McValue 1.0 — not McValue versus no-McValue.**

**This changes what the document can claim.** *"McValue hurt us"* and *"McValue 2.0 underperformed
McValue 1.0"* are different statements, and only the second is supported. The second is also more
credible and harder to dismiss — it is a like-for-like comparison of two versions of the same
platform, which is a fairer test than comparing a value platform against its absence.

State it explicitly. A reader who knows McValue 1.0 was running will otherwise conclude the
document's authors did not.

## The pre-period was promotionally dense

`1/6` $5 Sausage McMuffin EVM + $8 2-Snack-Wrap EVM advertising · `1/27` Happy Meal #1 + Core Hot
Honey AM/ROD LTOs · `2/2` **McValue re-hit** · `2/2–2/16` **EVM Accelerators** (audience-segmented
digital wallet offers, targeted by recent EVM behaviour) · `2/10` Double Filet-O-Fish local LTO ·
`2/17` Shamrock Shake + Oreo McFlurry · `3/2` National Egg McMuffin Day flash offer · `3/2–3/8`
**GMA Delivery Accelerator** (segmented by GMAD order behaviour) · `3/3` Core Beef Campaign ·
`3/31` Dual-Daypart Brand Relevance advertising begins.

**The baseline is not a control period.** Any framing that treats "pre" as normal trading and
"post" as the intervention is wrong on the facts. The honest framing is two differently-promoted
periods compared against their own LY twins — which is what a DiD is for, but it has to be said.

The **segmented accelerators** deserve a note of their own: they target individual customers by
recent purchase behaviour, so their effect is **not uniform across stores or customers**. That is a
source of variance no store-level analysis can see or control for.

## Price Round 1 — the dates CONFLICT across issues

- `2/5` — "Deadline for price changes before Price Round 1"
- `3/20` — "2026 Price Round 1 Deadline to submit price recommendations on the portal"
- `5/14` — "Deadline for Price Changes Ahead of Price Round 1"

Three different issues, three different Price-Round-1 dates. Either these are sequential gates in
one process or the date moved. **Do not cite a Price Round 1 date from the calendar** — the owner
knows what his stores actually did and when it went effective. That remains the question to answer.

## Corroboration — the monthly free-item programme really does end after March

A **March-issue** "Next 60 Days Calendar" (forward-looking, covering Mar/Apr/May) lists
`Month of March — GMA Download Incentive: Free 10 pc McNuggets` and shows **no April and no May
equivalent**.

That is a second, independent issue reaching the same conclusion, and it is the stronger form of
the evidence: a forward-looking calendar that lists March's monthly offer would list April's if
one existed. **The earlier caveat is now substantially reduced** — this is no longer inference from
a document that simply didn't cover the period.

**Also in the pre-period: the Big Arch launch.** `3/3` all-store sell, `3/9` advertising begins. A
major new product introduction, plus `3/31` Dual-Daypart Brand Relevance advertising and Happy Meals
#2 (3/10) and #3 (3/31).

*(Naming inconsistency across issues, again: `3/3` appears as "BIG ARCH All Store Sell" in one
issue and "Core Beef Campaign All Store Sell" in another; `3/9` likewise. Almost certainly the same
campaign under two names — another reason #290 must keep issues append-only rather than deduping.)*

## The synthesis — and why the 2025 calendar is now CRITICAL PATH

Laying the two periods side by side:

| | promotional support |
|---|---|
| **pre** (Jan–Apr 21) | monthly free-item offer (Big Mac / Large Fry / 10pc McNuggets) · **Big Arch product launch** + advertising · McValue 1.0 re-hit · EVM Accelerators · GMA Delivery Accelerator · Egg McMuffin Day · Shamrock Shake / McFlurry · Double Filet-O-Fish · Core Hot Honey LTOs · Dual-Daypart Brand Relevance |
| **post** (Apr 22 – Aug 13) | McValue 2.0 · Beverage Launch · **World Cup Happy Meal (failed)** · Fried Apple Pie LTO · McValue 2.0 rehit · French Fry Day · flavour news ×2 · weekly digital offers (from ~Aug) |

**The pre-period had stronger promotional support than the post-period** — a major product launch
and a standing monthly free-item offer, against a post-period whose tentpole failed.

Comparing a strongly-supported baseline to a weakly-supported treatment period will show traffic
down and check up **whether or not McValue did anything**.

**The `ly_` twin design is what is supposed to neutralise this** — but only if the 2025 pre and post
periods had a *similar relative* promotional intensity to each other. If 2025 was flat across both,
the 2026 imbalance passes straight through into the DiD.

**So the 2025 calendar (roughly Dec 2024 – Aug 2025) is no longer a "reference-class extension"
nice-to-have. It is the item that determines whether the headline numbers mean what the document
says they mean.** Specifically:

1. Did Jan–Apr **2025** carry the same monthly GMA Download Incentive? (settles the largest confound)
2. Was there a comparable major product launch in the 2025 pre-window? (Big Arch's counterpart)
3. What was running May–Aug **2025** — the LY twin of the post period?

If the answer to all three is "similar to 2026", the confounds cancel and the findings stand as
measured. If 2025 was materially different, the DiD is measuring calendar asymmetry and the
document's claim has to be rebuilt around B1 and the like-for-like McValue-2.0-vs-1.0 framing.

**This is the single highest-value item remaining before 25 August.**

## Pricing confound — largely defused, and the check finding gets STRONGER

Owner, 2026-08-14: *"I will need to confirm, but any changes we took were minimal. We did not
participate in the whole price change strategy."*

**Two reasons this holds, one structural and one interpretive.**

**Structural.** The DiD computes `(post vs LY) − (pre vs LY)`. A price increase taken *before* the
pre-window sits in **both** halves and cancels. Only price taken **between** the pre and post
windows survives into the result. So the exposure is narrow: price actions between roughly January
and 2026-08-13. The owner reports minimal action there.

**Interpretive — and this is the payoff.** If check rose **+10.4¢ with essentially no price taken,
the entire gain is MIX**: fewer transactions, larger ones.

That is the signature of **losing the low-ticket, price-sensitive, occasional customer while
retaining the heavier one** — precisely the customer a value platform exists to attract.

**This is a materially harder finding than "check went up."** It says McValue 2.0 coincided with
the loss of exactly the segment it was designed to serve, and because no price was taken there is
no competing explanation for the mix shift. Traffic −4.55pp and check +10.4¢ stop being two
separate observations and become **one coherent mechanism**.

**Still to confirm** (owner's own caveat): the actual price actions and effective dates for
2026 Rounds 1 and 2. Until confirmed this is stated as the owner's account, not as verified fact —
but the structural argument above means even moderate price action would have to fall inside the
Jan–Aug 2026 window to matter at all.

**⛔ CONFIRMED, 2026-08-18 — and the answer breaks this section's premise.** Price actions and
effective dates are now measured, not inferred: 2026-02-25, 06-13, and 06-26, both Oklahoma and
Florida. Price **was** taken, materially, inside the window this section's own math says matters.
The "mix, not price" interpretation above does not survive that fact — the whole "one coherent
mechanism" reading was built on "no price was taken," and that premise is now known false. See the
2026-08-18 UPDATE at the top of this file and `memory/analysis-mcvalue-price-waves-2026-08-18.md`
for what actually happened instead.

**Worth noting for context, not for the finding:** if most of the system took price and this
organisation did not, then any comparison against a national or co-op benchmark is not like-for-like
on price. That cuts against using system averages as a yardstick anywhere in the document.

---

# 2025 CALENDAR OBTAINED — the LY twin is NOT a clean control

Owner supplied Dec 2024 – Nov 2025 coverage, 2026-08-14. This was flagged as the highest-value
remaining item. It answers all three questions, and two of the answers are bad for the document.

## 1. McValue 1.0 launched **2025-01-07**

> **1/7 — McValue Launch**

So the platform history is: **McValue 1.0 on 2025-01-07**, **McValue 2.0 on 2026-04-21**. This
confirms from the calendar what the `2/2/2026 McValue Marketing re-hit` entry implied — the
document's comparison is **2.0 versus 1.0**, not McValue versus its absence.

### ⚠️ A post-hoc observation about the OSAT decline — flagged as post-hoc, not a finding

District OSAT **peaked in Jan–Feb 2025 (87.5%, 87.8%)** — the highest months in the entire 32-month
series after Aug 2024 — and then began the sustained 28-month decline from **March 2025**.

McValue 1.0 launched **2025-01-07**. The decline begins roughly eight weeks later.

**This is hypothesis-generating only.** My McValue prediction was pre-registered against 2.0 and was
cleanly refuted. This one was found *by looking at the data after the fact*, which is exactly the
thing this project treats as a story rather than a test. It is worth recording and worth testing
properly; it is not worth asserting. A real test needs a pre-registered prediction about something
not yet observed.

## 2. The monthly free-item programme ran ALL YEAR in 2025 — so the confound does NOT cancel

| 2025 | GMA New Customer Download Incentive |
|---|---|
| Feb | Free Large Fries, $1 min (thru 2/28) |
| Mar | Free McCrispy, $1 min (thru 3/31) |
| **Apr** | Free Large Fries, $1 min (thru 4/30) |
| **May** | Free Big Mac, $1 min (thru 5/31) |
| **Jun** | Free QPC, $1 min (thru 6/30) |
| **Aug** | Free Large Fry, $1 min (thru 8/31) |
| **Sep** | Free Big Mac, $1 min (thru 9/30) |

**Continuous through 2025.** In 2026 it appears only in Jan/Feb/Mar.

That asymmetry is the problem:

| period | 2026 | 2025 (LY twin) | cancels? |
|---|---|---|---|
| **pre** (Jan – Apr 21) | offer present | offer present | ✅ yes |
| **post** (Apr 22 – Aug) | **apparently absent** | **present** | ❌ **NO** |

In the post window the 2026 data lacks a free-item offer that its LY twin had. That makes
post-vs-LY **worse on traffic and better on check**, and since `DiD = post-vs-LY − pre-vs-LY`,
**both headline findings are overstated.** This is the confound confirmed, not resolved.

**But the 2026 half is still not established.** The 2025 pattern shows this is a *standing monthly
programme*, which makes it more plausible that 2026 continued it and later issues simply stopped
listing a routine item. Against that, the **March 2026 forward-looking issue listed March's and not
April's**. Genuinely unresolved, and the stakes are both headline numbers.

**Resolve it empirically, not from calendars — this is now a concrete argument for #291 (Product
Mix).** A free 10-pc McNuggets or Big Mac offer shows up as a **unit spike at near-zero realized
price** for that item. PMIX would settle in one query what three months of calendar screenshots
could not.

## 3. The 2025 post-twin was MORE heavily promoted than the 2026 post period

2025, Apr 22 – Aug 13 — the LY baseline the post period is measured against:

- **McCrispy Strips** all-store selling 4/29–6/15, advertising 5/11–6/16 — **major product launch**
- **Snack Wraps Launch** 7/10, live on all channels with paid advertising — **major product launch**
- **French Fry Flash Offer** 6/17–7/13 — free medium fry, $1 min, **four weeks**
- S'mores McFlurry 6/10–8/11 · **Daily Double** 6/24 and 7/22 · McValue Rehit 7/2 ·
  McValue advertising from 8/19 · monthly free-item offers throughout

Against 2026's post period: McValue 2.0, a Beverage Launch, a **failed** World Cup Happy Meal, a
Fried Apple Pie LTO, a rehit, a **one-day** French Fry Day, and two flavour launches.

**Two major product launches and a four-week free-fry offer in 2025 versus a failed tentpole and a
one-day flash offer in 2026.** The LY baseline is inflated, which pushes the same direction as
finding 2 — **traffic decline overstated**.

## 4. Price rounds ARE roughly symmetric across years — the one clean answer

2025: Price Round 1 announced 3/9, recommendations due 3/28; Price Round 2 announced 9/18,
recommendations 10/6. 2026: Round 1 deadlines Feb–May, Round 2 recommendations 6/1–6/26.

Similar cadence in both years, so pricing largely differences out — consistent with the owner's
account of minimal participation. **This confound can be closed.**

## What this does to the document

The honest position has moved. The measured DiD is **not** a clean estimate of McValue 2.0's effect:
it is contaminated by a promotional calendar that was materially stronger in the 2025 post-twin than
in the 2026 post period, in the same direction as the finding.

**Three options, in order of preference:**

1. **Lead with B1 and the like-for-like framing.** B1 (04-22 → 05-05) predates the price deadline
   and sits closest to launch. Frame the whole document as *McValue 2.0 versus McValue 1.0*, which
   is what it actually measures.
2. **Report the DiD with the calendar asymmetry stated as a bound**, i.e. "the true effect is
   smaller than −4.55pp because the LY baseline carried two product launches and a four-week
   free-fry offer this year did not."
3. **Do not report the headline DiD as a point estimate of McValue's effect.** It is defensible as
   a description of what happened; it is not defensible as attribution.

Option 2 is probably the strongest for an FBP audience — it keeps the number, states the direction
of the bias, and demonstrates that the calendar was checked. **A number offered with its own
limitation is far harder to dismiss than a number offered bare.**
