# Data acquisition shopping list — everything we still need a pull for

Owner request, 2026-08-14: *"give me a recap summary of all the items that we need potential data
for. I am almost certain that every bit of it can be auto pulled once I have the list. I'll match
it to a report and then when I'm back at a computer, I can get the headers and responses."*

This is that list. Every entry states **what already exists in the codebase**, because in several
cases the parser, the table, and the analysis engine are all built and the only missing piece is
the endpoint. Verified against the repo on 2026-08-14, not recalled.

---

## The framing: an attribution ladder

Almost everything below is one of three rungs. Naming the rungs makes the priorities obvious.

| rung | grain | status |
|---|---|---|
| 1 | **store × day** | ✅ Have it. `qsr_cash_sheet` + siblings, 27 months (Apr 2024 → Jun 2026). Six of the seven standard POS exception families. |
| 2 | **employee × store × day** | ⚠️ **Parser, table and scoring engine all exist. Manual upload only.** This is the gap, and it is nearly free to close. |
| 3 | **transaction** | ❌ Nothing built. Needs a probe first. |

Rung 1 answers *"which store-day is out of line."* Rung 2 answers *"who."* Rung 3 answers
*"which transaction, at what time, for how much."*

Every finding this year has died or survived on rung 1 alone. The Holdenville padding finding
survived because a 27-store peer test backed it; the cash-pairs hunt stalled precisely because
rung 2 was unavailable in the data we had loaded.

**Normalization rule for all of it (owner, 2026-08-14):** every exception metric is expressed
**per $1,000 sales or per 1,000 transactions**, never as a raw count. This is already how the
organization thinks — *"we call the usage per thousand… sales movement is done in units per
thousand to normalize a low volume store versus a highline store."* A raw refund count ranks
stores by volume; a rate ranks them by behavior. This applies to rung 2 and 3 equally: an
employee's refund rate must be per $1,000 of **their own drawer sales**, not per shift.

---

## A. Register Audit — the single highest-value pull on this list

**Owner's note was right, and the situation is better than he remembered.** This is not a
"could we get one step deeper" question. We already parse it, already store it in Supabase,
and already score it.

| piece | status | location |
|---|---|---|
| Parser | ✅ built | `src/parsers/index.js:974` `parseRegisterAudit` |
| Supabase table | ✅ exists | `audit_rows`, PK `(loc, date, emp)` — `src/lib/supabase.js:832` `saveAuditRows` |
| Loader | ✅ built | `loadAuditRows`, paged (measured 23 pages 2026-08-07 — real data is in there) |
| Risk-scoring engine | ✅ built | `src/utils/register-audit.js` `analyzeRegisterAudit` — per-employee aggregation + flags |
| **Auto pull** | ❌ **missing** | manual Excel upload only; `auditRows` is in `MANUAL_FED_SOURCES` |

**Fields it already carries, per employee per store per business date:** drawer sales, drawer
GC, average check, drawer opens, cash over/short $ and %, manual refund/over-ring $, refund
count + cash $ + cashless $, POS over-rings count + $, promo count/$/%, T-Red **Before**
count/%/avg/$, T-Red **After** count/%/avg/$, employee meal discount $, manager meal $ and count.

That is rung 2 of the ladder, complete, for every exception family we track at store level.

**Structural note for whoever writes the pull:** the source workbook uses *grouped rows* — an
employee summary row carries the name with a null date, and the detail rows beneath it carry
dates with a null name. The parser handles this by carrying the name forward and skipping the
grand-total row. **If the API returns flat rows instead of the grouped layout, the parser needs
a second entry path** — do not assume the API response matches the Excel export's shape.

**Two caveats to design in from the start:**

1. `analyzeRegisterAudit`'s current thresholds are **absolute counts** (`avgDrawerOpens > 8`,
   `cashOSTotal < -5`). Those violate the per-thousand rule and will rank high-volume cashiers
   as high-risk purely for working busy shifts. Rate-normalize before this goes anywhere near a
   person.
2. This is squarely personnel-sensitive data under the 2026-08-13 policy — DO and above, gate
   on subject as well as role, handling notice travels with the finding. See
   `memory/project-sage-knowledge-grounding.md`. Same concern already filed as #272 for the
   shift-manager tables.

---

## B. Transaction detail — the "Any Transaction" report

Owner: *"there's a report titled in QSRSoft called any transaction."* Currently the UI makes you
pick a date **and a time interval within the day**, which he reasonably reads as a volume guard.

Nothing is built for this. It needs a probe before anything is designed.

### On the volume question — his instinct is right, but for a different reason

Rough arithmetic, stated openly as an estimate: ~27 stores at roughly 700–900 transactions a day
each is **~20,000 transactions/day district-wide, ~7M a year**, and if the report returns item
lines rather than transaction headers, multiply by 3–5. That is genuinely large for a standing
daily pull, and Supabase would feel it.

**But we almost never want all transactions.** Exception transactions — refunds, voids/T-Reds,
over-rings, promos, manager discounts — run roughly 1–3% of the total. District-wide that is a
few hundred rows a day, ~150k a year. **That is nothing.**

So the recommendation is three tiers, not two. **Owner-approved 2026-08-14** — *"that option
made logical sense to me so I'm OK with you proceeding as presented."*

| tier | what | cadence | volume |
|---|---|---|---|
| **A** | **exception transactions only**, district-wide | daily, standing | ~200–600 rows/day — trivial |
| **B** | full transaction detail, one store × a date range | **on-demand**, triggered by an investigation | bounded by the ask |
| **C** | full transaction detail, district-wide, standing | **never** | no |

**The approval is of the design, not a guarantee that Tier A exists.** Tier A is contingent on
the probe, and there are three possible outcomes:

1. **The report filters to exception types server-side** → Tier A as designed. Best case.
2. **No server-side filter, but it accepts a date range per store** → we would have to pull
   everything and discard non-exceptions on our side. Storage stays small (we keep the same
   ~1–3%), but egress does not — that is the full firehose crossing the wire daily. Needs a
   measured call on request time and rate limits before committing, not an assumption.
3. **One date per request, no range, no filter** → 27 stores × 365 days of individual requests
   makes a standing pull impractical. Tier A dies, Tier B stands alone, and **Register Audit
   (§A) carries all standing attribution** — which is another reason §A ranks first regardless
   of how the probe lands.

Outcome 2 is the one that needs a judgement call rather than a build, so flag it rather than
proceeding straight into implementation if that is what the probe returns.

Tier A is the prize. It gives permanent transaction-level attribution for exactly the
transactions that matter, with no volume problem at all, and it does not require anyone to
suspect anything first — which is the weakness of a purely on-demand design: it only ever finds
what someone already went looking for.

**So the probe needs to answer one question above all others:** *can the report filter to
exception types server-side?* If yes, Tier A is on. If it only returns everything for a window,
we fall back to the owner's on-demand design for Tier B and lean harder on Register Audit (A)
for standing coverage.

### What to capture when probing
- Does it accept a **date range**, or strictly one date at a time?
- Does the time-interval selector reduce the response, or just the display?
- Is there a **transaction-type / exception filter** parameter?
- Response shape: one row per transaction, or per line item?
- Does it carry **employee id** (`geid` or equivalent), register/terminal id, and timestamp?
- Is there a receipt-image or receipt-text field, or only structured fields?

Tier B's on-demand design is sound and worth building either way: dispatch the workflow with a
store + date range, wait for it, load the result. The wait is acceptable for an investigation.

---

## C. SMG VOICE — customer satisfaction

**Currently:** PDF drop (comments) + Excel drop (FullScale aggregate) + daypart PDF.
Parsers all exist — `parseSMGVoicePDF`, `parseVoiceDaypartPDF`, `parseSMGFullScale`. Tables
exist — `smg_fullscale`, `smg_comments`, plus `saveVoiceDaypart`. Thresholds already set
(OSAT ≥ 90%, Accuracy B2B ≥ 95%).

**Missing:** any automated pull.

**Complication to check first:** SMG is a separate vendor portal, not QSRSoft. The two-path auth
pattern our other pulls use (token → Playwright fallback) will need a different login entirely.
Worth checking whether QSRSoft mirrors any VOICE data before building a second auth stack —
if it does, that's a much cheaper route.

---

## D. PACE / Propel — graded visits (CFV, RGRV)

**This is the one that turns a model into a measured system.**

Visit Readiness (v4.501, `src/engine/visit-readiness.js`) *predicts* graded-visit outcomes from
daily ops metrics. It has never been validated against actual visit results, because we have
almost no actuals — `graded_visits` exists as a table with a loader, hand-entered.

A predictor with no outcomes to score against is an assertion, not a model. Getting real CFV and
RGRV results in makes it falsifiable, which is the whole point.

**Also unblocks:** the "last actual visit" field already in the panel, and per-store risk-driver
validation.

Separate portal from QSRSoft (McDonald's Propel/PACE), so again a distinct auth path.

---

## E. EcoSure — food safety grading

Owner's long-standing item: *"I still owe you… our Eco reports, which is another grading
mechanism to which I still don't have access to, but haven't forgotten about."*

**Blocked on access, not on engineering.** Third-party (Ecolab), not QSRSoft.

Visit Readiness already reserves an EcoSure target slot for when a sample lands. Its Food-Safety
risk flag currently runs on waste/holding proxies — EcoSure would replace a proxy with a
measurement.

---

## F. Product Mix (PMix) — parser exists, goes nowhere

`parsePMixData` is built (`src/parsers/index.js:1209`) and **there is no table, no loader, and no
pull.** It parses into nothing. This has been on the backlog as Notes 25 #1 / Notes 28 #5.

**What it unlocks:**
- Pricing engine (price/mix/volume decomposition — the thing the McValue 2.0 analysis has to
  reason about indirectly right now)
- Filet-O-Fish-Friday correlation and every other product-level seasonality question
- **Units per thousand** at the item level — which is the owner's own stated normalization for
  product movement, so this is the dataset where that convention is native rather than imposed

Highest analytical upside per unit of work on this list after Register Audit.

---

## G. eBOS `inventory_history`

Owner captured the curl + full JSON response last session and asked for a puller. Confirm
whether it shipped — `qsrsoft-onhand-pull.mjs` (→ `qsr_onhand`) and `qsrsoft-variance-pull.mjs`
(→ `qsr_variance_stat`) exist, and `qsrsoft-ebos-pull.mjs` covers purchases. `inventory_history`
specifically may still be outstanding. **Check before rebuilding.**

Its value was reaching further back than the UI allows.

---

## H. Labor punch exceptions — parser exists, goes nowhere

`parseLaborExceptions` (`src/parsers/index.js:1542`) reads missed breaks, early-outs, late-ins,
overtime exceptions, and **minors** violations, by location. No table, no loader, no pull.

Worth listing under integrity as well as labor: punch-edit and buddy-punch patterns are a
standard internal-control signal, and minors violations carry direct regulatory exposure.
Same per-thousand treatment applies (exceptions per 1,000 punched hours).

---

## I. Cleanliness

Acknowledged data gap in Visit Readiness — there is no metric for it anywhere in the system.
Realistically it only arrives via **D (graded visits)**; there is no daily operational proxy
worth trusting. Listed so it is not repeatedly rediscovered as an omission.

---

## J. Do NOT chase: deposit / bank reconciliation

Settled 2026-08-13 and recorded so nobody re-derives it. **Deposit lapping is structurally
invisible in QSRSoft.** A deposit counts as accounted for the moment it is *entered*, so a held
deposit produces no cash-over/short variance at all. Only bank-side data — actual deposit
timestamps against recorded deposit dates — shows the lag that is the detection signature.

If a bank feed ever becomes available, that is the pull. QSRSoft cannot answer it, and no amount
of transaction detail changes that.

---

## Already automated — do not re-solve

DAR (`qsr_daily_activity`), eBOS purchases, FOB (`qsr_fob`), Operations Report (six endpoints,
27 months backfilled), LifeLenz schedules + people skills, employee roster, roster statistics,
turnover, shift-manager monthly (+ range, #267), digital app, McDelivery, on-hand, variance,
EOM snapshot, KB, forms, news RSS, YouTube mentions, weather, hourly projection accuracy, cash
anomaly check, live pulse.

Emailed (forward-only, floor at 2026-07-01): Daily Glimpse, Sales Ledger, Cash Sheet. Per the
**API-over-email** standing rule these should migrate to API pulls where an endpoint exists —
audit tracked in #260.

---

## Probe protocol — what to capture at a computer

For each report, in DevTools → Network, with the report actually loaded:

1. **Full request URL** including every query parameter, and what each one changed when you
   varied it in the UI.
2. **Request headers** — specifically which token header it wants (`X-Auth-Token` vs a Cognito
   bearer), since our two QSRSoft token secrets are currently distinct and both stale.
3. **One complete JSON response**, unedited — the field names matter more than the values, and
   an abridged sample has already cost us a wrong schema assumption once.
4. **Whether it accepts a date range** or one date per request. This decides loop shape:
   `qsrsoft-ops-pull.mjs` does one request per endpoint per date (~6.6 s/day); the
   shift-manager pull takes an arbitrary range in a single request.
5. **Whether `loc` comes back padded** (`0035064`) or bare (`35064`). Four documented silent
   failures trace to this exact mismatch (v4.809, v4.823, v4.827, v4.831).

## And per the standing rule, every new pull ships with

1. Its exact workflow `name:` added to `.github/workflows/sync-failure-watch.yml`
   (`sync-failure-watch.test.js` enforces this both directions)
2. Per-stream staleness visibility, not pooled into a single `Math.max` (#171)
3. Supabase table with `tenant_id` + RLS
4. A manual upload fallback retained
5. Two-path auth (direct token → Playwright fallback)

---

## Suggested order

1. **Register Audit auto-pull (A)** — parser, table and engine already built; closes rung 2 of
   the attribution ladder; by far the best work-to-value ratio here.
2. **Transaction detail probe (B)** — a probe, not a build. The answer to "can it filter to
   exception types" determines whether Tier A exists, and that shapes everything after it.
3. **Product Mix (F)** — parser exists, biggest analytical unlock, and its native unit is
   already the per-thousand convention.
4. **Graded visits (D)** — turns Visit Readiness from a prediction into a measured system.
5. **SMG VOICE (C)** — check for a QSRSoft mirror before standing up a second auth stack.
6. **Labor punch exceptions (H)** — small, and it carries regulatory exposure via minors.
7. **EcoSure (E)** — blocked on access; nothing to build until that clears.

---

# ADDENDUM 2026-08-15 — two endpoints arrived ready to build

Both were captured by the owner on 2026-08-15 and measured against the real payloads. Full schema,
grain, sanitation rules and traps are in **`memory/qsrsoft-report-catalog.md`**; this section is the
build order only.

## K. Product Outage — NEW, and the cheapest pull on the whole list

`GET /reporting/v2/product/outages` with `catalogType=outages&reportType=currentOutages&nsd=d&dsd=d`
returned **27 stores × 14 days in a single HTTP request** — 142 rows, every one carrying `storeNum`
and `date`. There is nothing else on this list with that work-to-value ratio.

**What it unlocks that nothing in Meridian can express today:** an out-of-stock. Joined to Product
Mix on `(store, date, menuItemNumber)` it turns *"Fried Apple Pie was out at five stores"* into
lost-sales dollars at each store's own sell rate. It is a plausible partial explanation for
unexplained sales softness and for VOICE accuracy complaints, and a repeat outage on one item is an
ordering failure with a name — which feeds FOB and inventory directly.

**Two things must be settled before it is built, and only one needs the owner:**

1. **`restoredTimestamp` came back empty on all 142 rows** (it *was* in `selectCols`).
   `reportType=currentOutages` returns still-open outages only, so **duration is not available from
   this shape**. A second capture at a different `reportType` is required before any
   minutes-lost / restore-SLA metric is designed. ← needs the owner, one capture.
2. **Key on `(loc, dt, item, outage_ts)`, not `(loc, dt, item)`.** The narrow key has 0 duplicates
   on this sample — which is exactly how #292's `(loc, date, item)` looked before measurement showed
   it dropped 29% of rows. An item can go out, be restored and go out again in one day.

**And it must not be ranked by row count.** 42 real events produced 142 rows; one event at 38609
flagged 12 SKUs (every Caramel-Apple-Pie beverage size) and one at 33109 flagged 10 (every XS
drink). Collapse to `(storeNum, outageTimestamp)` first, then normalise per trading day. Same
un-normalised-count trap as `security/top_contributors`.

## L. Menu Price Comparison ("RFM Price Comparison") — the per-store list price book

`GET /reports/mcd/product/menuPriceComparison` with `nsd=d` and a comma NSN list. Grain is a clean
`(nsn, menuItemNumber)` — **0 duplicates in 1,966 rows**. Native `startDate`/`endDate`, so price
history is backfillable.

**It is not a shortcut for F (Product Mix).** It carries no volume, no dollars and no cost — it is
the **list** price where Product Mix carries the **realized** price. The pair is what measures
discount depth; neither does it alone.

**Two findings are already available from a single day's capture, with no dependency on F:**

- **114 clean product rows (7.2%) have a delivery premium of exactly zero** — sold on a 3PO platform
  at the in-store price, with the platform commission coming out of the same margin.
- **9 rows are negative**, delivery priced *below* in-store. `3655 Sau Egg McMuff Ml-Hb` is negative
  at **all three** sampled stores (−11.1% / −7.9% / −10.5%), so it is a configuration pattern rather
  than a fat finger.

These are the first concrete Pricing-Engine outputs and they do not wait on #292.

A dated price book is also the only way to settle *when* a price action took effect — the missing
half of the owner's *"WE DID NOT PARTICIPATE IN THE WHOLE PRICE CHANGE STRATEGY."* Confirm or refute
it per store per item from the record, not from memory.

## Revised order

K first — it is one request, it is new capability rather than a refinement, and it is small enough
to ship inside the existing `qsrsoft-ops-pull.mjs` auth. Then A (Register Audit) as before. L slots
in beside F, since both live in the same script and answer the same question from two sides.
