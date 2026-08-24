---
name: handoff-2026-08-24-service-role
description: Handoff to a new session after the owner installed SUPABASE_SERVICE_ROLE_KEY in the agent environment. Two questions have been blocked on live data for a day; both are one query each. Includes the SQL, the two loc-format traps that would silently break it, and the binding operating rules for the key.
sensitivity: open
metadata:
  node_type: memory
  type: handoff
---

# Handoff — 2026-08-24, service-role key installed

**Why this file exists:** the environment of a *running* session is fixed at container start, so
the session that requested the key can never see it. A **new** session picks it up. This carries
across the two live threads that session was holding.

---

## 🔴 Read first: the operating rules are binding, not advisory

Full text in `memory/dispatch-89.md` item 4. In short, and non-negotiable:

1. **Reads only.** No write/update/upsert/delete with this credential without the owner's approval
   **for that specific operation**. It bypasses RLS — there is no policy underneath to catch a
   careless write.
2. **Never echo the value.** Not into a commit, memory file, fixture, log, PR body, test snapshot,
   or a message. Report **observations** (`content-range: */27`, a row count, a max date) — never
   the secret, never a substring of it.
3. **Name the credential and the observation** in any live-data claim. This does **not** relax now
   that access exists; it matters more. A session with a working key can produce a wrong number as
   easily as the session without one produced an invented claim (which is what #89 documents).
4. **RLS is bypassed, so reads are unfiltered by tenant** — including personnel data in the roster
   and schedule tables. Standing posture unchanged: crew and manager names are personnel data,
   **field names only**, never values into memory files or fixtures.

Rotation now touches **two** places: GitHub Secrets and the agent environment. Updating one
without the other breaks the scheduled workflows or the agent env. The owner has deliberately
deferred rotation — that is a conscious call, **do not re-raise it as urgent**.

---

## Question 1 — does `qsr_fob` reach August? (settles whether #633 fixed the owner's bug)

**Why it matters.** #633 fixed a real render-order race in `FOBAnalysisPanel`: the month
auto-select fired before the cloud fetch resolved, locking onto a stale manual-upload month. The
test reproduces it and the fix is correct.

**But the claim that ruled out the other explanation was never verifiable.** `dispatch-88.md`'s
Resolution says `qsr_fob` "was queried live … and has real, non-zero `prod_sales_amt` rows through
2026-08-24" using the **anon key** — and the anon key returns `content-range: */0` on that table
(measured, `dispatch-89.md`). So the *"the stream genuinely stops in May"* branch was never
actually ruled out.

**If the newest date is August:** #633 fixed the owner's symptom, close it.
**If the newest date is May:** the panel still shows May after the fix, for a different reason —
the real answer is a **backfill** (standing authorization, CLAUDE.md), not a UI change. Say so and
close the gap.

```sql
-- Q1. FOB cloud stream coverage.
select
  count(*)                              as rows_total,
  min(date)                             as oldest,
  max(date)                             as newest,
  count(*) filter (where date >= date_trunc('month', current_date)) as rows_this_month,
  count(distinct loc)                   as stores
from public.qsr_fob;

-- Q1b. The last 10 rows actually carrying a non-zero product-sales figure --
-- a row can exist with a null/zero amount, which would still render as "no data".
select loc, date, prod_sales_amt
from public.qsr_fob
where prod_sales_amt is not null and prod_sales_amt <> 0
order by date desc, loc
limit 10;
```

## Question 2 — how big is the `avgCheck` sales-basis gap?

**Why it matters.** `#628` gave `avgCheck` a derive of `sales ÷ gc`, where the `sales` key
resolves `qsr_daily_activity.product_sales`. The four precomputed sources it backs up compute avg
check on **all-net-sales**. Derives are gap-fill only, so no single day is wrong — but across a
period the series can **mix the two bases** day by day. The same PR explicitly declined to use
`sales` for the controls metrics on exactly these grounds and then used it here.

The open question is **magnitude**. `memory/dispatch-86.md`'s PM-verification section estimates
"~$0.30 on a ~$10.75 check" and **flags that as an order-of-magnitude guess, not a measurement.**
Replace it with the real number.

**Decision rule, so the answer is actionable:** if the median absolute gap is a rounding error,
document it in the code as a known, measured, accepted imperfection (the way `compWaste`'s
secondary one already is) and close it. If it is material, the fix is to widen `netSalesAmt`'s
chain beyond `opsCashRows` (`glimpseRows.allNetSales` is the obvious candidate) and repoint
`avgCheck` — which **also** moves the four controls derives' denominator coverage, so it is a
design change with a blast radius, not a one-liner.

```sql
-- Q2. product_sales vs all_net_sales, matched by store-day.
--
-- ⚠️ TWO TRAPS, both handled below -- do not simplify them away:
--   1. LOC FORMAT. qsr_daily_activity.loc is zero-padded to 7 chars ('0003708').
--      ⚠️ So is qsr_fob -- measured from real output 2026-08-24 ('0003708'); an earlier
--      draft of this file wrongly said it was not. daily_glimpse_daily is NOT padded.
--      Do not trust a remembered padding convention -- ltrim BOTH sides every time.
--      Joining raw matches ZERO rows and looks like "no overlapping data", not a bug.
--   2. GRAIN. qsr_daily_activity is HOURLY (pk loc, dt, hour_slot). It must be summed
--      to a day before comparing, or every ratio is ~1/24 of the truth.
with dar as (
  select
    ltrim(loc, '0')        as loc,
    dt                     as date,
    sum(product_sales)     as product_sales,
    count(*)               as slots          -- completeness check, see note below
  from public.qsr_daily_activity
  where dt >= current_date - interval '60 days'
  group by 1, 2
),
g as (
  select ltrim(loc, '0') as loc, date, all_net_sales, gc, avg_check
  from public.daily_glimpse_daily
  where date >= current_date - interval '60 days'
)
select
  count(*)                                                        as matched_store_days,
  round(avg(d.product_sales / nullif(g.all_net_sales, 0))::numeric, 4)    as avg_ratio_prod_to_net,
  round((percentile_cont(0.5) within group (
    order by abs(d.product_sales / nullif(g.all_net_sales, 0) - 1)))::numeric, 4) as median_abs_pct_gap,
  -- The number that actually matters: the avg-check difference in DOLLARS.
  round(avg(abs(d.product_sales / nullif(g.gc, 0)
                - g.all_net_sales / nullif(g.gc, 0)))::numeric, 4)  as avg_abs_check_gap_dollars,
  round(avg(g.avg_check)::numeric, 2)                             as avg_reported_check
from dar d
join g on g.loc = d.loc and g.date = d.date
where d.slots = 24;   -- complete DAR days only; a short day understates the numerator
                      -- (CLAUDE.md: "watch for incomplete DAR days")
```

⚠️ **If `matched_store_days` comes back 0**, do not conclude the streams don't overlap — check the
loc normalization first. That is the failure mode trap 1 describes, and it looks exactly like a
real finding.

---

## State at handoff

- `main` is clean; dispatches **#87, #88, #89** are merged and readable.
- **#635** (recording the owner's option-A decision + the operating rules) was **green on CI but
  unmerged** — the GitHub API hit a per-user rate limit at the merge step. The prior session armed
  a retry. **Check whether it landed** (`git log origin/main --oneline | head`) before assuming
  either way.
- **Dispatch #89 items 1–3 are still open work for the engineer** and are unaffected by the key:
  re-verify #633's `qsr_fob` claim (Q1 above now answers it), correct CLAUDE.md's "the agent can
  read live tables" line, and add the name-the-credential rule.

## Still on the owner's list

1. **`supabase functions deploy sage-chat --no-verify-jwt`** — #85's 1000-row truncation fix and
   #626's query-ordering fix have both been inert in production since 2026-08-23. Highest-value
   item outstanding.
2. Re-ask SAGE the staffing question afterward; if it returns ~+13.9 h/day the +141 h/day item
   closes with no further work.
3. **Tolerance bands** — needs a conversation with the owner before it can be a dispatch. Prior
   art worth reading first: `store-dash.js` already declares `tol:` on 24 metrics and **nothing in
   the app reads any of them.**

---

## ✅ ANSWERED 2026-08-24 — the owner ran both queries

Recorded here because the results arrived in chat and would otherwise be lost. Credential:
**service-role key, run by the owner in the Supabase SQL Editor.** Observations below are his
output, not a reconstruction.

### Q1 — `qsr_fob` reaches TODAY. The "stops in May" branch is dead.

Newest `date` = **2026-08-24**, with non-zero `prod_sales_amt` across all ten sampled stores
(`0003708` 237,550.49 · `0005985` 460,901.39 · `0006972` 411,547.50 · …).

**Therefore #633's render-order race fix IS the correct fix for the owner's Food Cost symptom**,
and no backfill is needed. `dispatch-88.md`'s conclusion was right; only its *stated method* (the
anon key, which returns `*/0` on this table) could not have produced it. **Close this thread — do
not re-open it as a data gap.**

⚠️ **Correction to this file's own earlier text:** `qsr_fob.loc` **is** zero-padded (`"0003708"`).
The trap note above said it was not. The Q2 SQL was unaffected because it `ltrim`s both sides —
which is exactly why the rule is "ltrim both sides every time" rather than "remember which tables
are padded."

### Q2 — the `avgCheck` basis gap is real, but the interesting number was one nobody asked for

Over **1,350 matched store-days**:

| measure | value |
|---|---|
| `avg_ratio_prod_to_net` | **0.9731** — product sales runs ~2.7% below all-net-sales |
| `median_abs_pct_gap` | **1.02%** |
| `avg_abs_check_gap_dollars` | **$0.3154** |
| `avg_reported_check` | **0.00** ⬅ |

`dispatch-86.md`'s PM-verification section estimated "~$0.30 on a ~$10.75 check" and explicitly
flagged it as an order-of-magnitude guess. It landed at **$0.3154** — right, but by luck, and the
flag was correct to be there.

🔴 **The finding is the last row.** `daily_glimpse_daily.avg_check` is **zero — not null, zero —
across all 1,350 matched store-days.** `avgCheck`'s chain is `glimpse → cash → salesLedger →
labor`, every entry `mode:'pos'`, so a 0 is **rejected** and falls through. If the other three are
also empty, the `#628` derive is not gap-filling at all: **it is the only thing producing
`avgCheck`, every day, for every store.**

That would *shrink* the concern this file was written to size. Uniform basis means **no cross-day
mixing**, so leaderboard **ordering** is sound; what remains is that `avgCheck` reads ~2.7% low
against a net-sales definition — a labelling question, not a ranking one.

**One query decides which world this is** (not yet run):

```sql
select
  count(*) filter (where coalesce(g.avg_check,0) <> 0) as glimpse_nonzero,
  count(*) filter (where coalesce(c.avg_check,0) <> 0) as cash_nonzero,
  count(*) filter (where coalesce(s.avg_check,0) <> 0) as ledger_nonzero,
  count(*)                                             as store_days
from public.daily_glimpse_daily g
full join public.cash_sheet_daily   c on c.loc = g.loc and c.date = g.date
full join public.sales_ledger_daily s on s.loc = g.loc and s.date = g.date
where coalesce(g.date, c.date, s.date) >= current_date - interval '60 days';
```

- **All three ~zero** → `avgCheck` is always derived. Downgrade to a documented ~2.7% definitional
  offset in the code, the way `compWaste`'s secondary imperfection already is. No chain change.
- **Any populated** → mixing is real, the $0.32 matters for ranking, and the fix is widening
  `netSalesAmt`'s chain beyond `opsCashRows` (`glimpseRows.allNetSales` the candidate) — which
  also moves the four controls derives' denominator coverage, so it is a design change.

### 🔴 A separate defect, worth its own look regardless

**`daily_glimpse_daily.avg_check` being flat zero is a data problem in its own right.** The chain
hides it (`mode:'pos'` falls through), but **anything reading that column directly rather than
through `metric-source.js` is showing 0 today.** Grep for direct `avgCheck` reads off
`glimpseRows` before assuming the chain protects every consumer. This was not on anyone's list —
it surfaced only because the Q2 query happened to select `avg_check` as a sanity column.
