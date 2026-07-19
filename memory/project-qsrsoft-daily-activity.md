---
name: project-qsrsoft-daily-activity
description: "QSRSoft Daily Activity Report automation — confirmed endpoint, response schema, scripts built"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5b414dcb-fdd6-4da2-ac88-7ae8b2b824d9
---

## Daily Activity Report (IMPLEMENTED — v4.353)

**Script:** `scripts/qsrsoft-dar-pull.mjs`
**Workflow:** `.github/workflows/qsrsoft-dar-pull.yml`
**Supabase table:** `qsr_daily_activity` — see SQL section below

**Endpoint:** `https://api.reports.myqsrsoft.com/v1/reports/shift/daily-activity-raw`

**Auth:** `QSRSOFT_TOKEN` (same reporting API token — no Playwright, no eBOS token)

**Key params:**
- `nsn=3708,5183,...,43701` — ALL 27 stores in ONE request
- `startDate` + `endDate` — same date for a single day
- `orgId=a546d4ef-684a-4f25-8bc0-6580af068875`
- `timeInterval=hour`, `segmentBy=hour`, `timeSegment=openClose`
- `compType=trading`, `weekStart=3`

**Response shape:** `{ "result": [...] }` — flat array, one object per `{nsn, endQtrHourTime}`

**Hour slots:** `"05:00"` through `"28:00"` (28:00 = 4am next day for 24hr stores). `endQtrHourTime` is the CLOSING edge: "06:00" = 5am–6am hour block.

**Two data modes per row:**
- Past hours: `prodSalesScrubbed`, `transactions`, `dt_trans_cnt`, timing fields populated with ACTUALS
- Future hours: above fields = 0; `totalTransactions`/`salesDollars`/`sandwichCounts` = system PROJECTIONS
- All hours: `totalSalesMean`, `totalTransactionsMean` = ~5-week rolling historical means
- All hours: `ly.*` fields = last year same day + time slot

**Timing fields:** raw µs sums. Divide by `dt_trans_cnt` for per-car avg. (1,591,863 µs ÷ 12 trans = ~133s avg serve time.)

**Schedule logic (gap detection):**
- First run: pulls `QSRSOFT_DAR_DAYS_BACK` days (default 90)
- Daily: re-pulls `QSRSOFT_DAR_DAYS_RECENT` days (default 7) rolling
- `QSRSOFT_DAR_FORCE_FULL=1`: bypasses gap detection, pulls full `DAYS_BACK` range

**No GitHub secrets needed beyond existing:** `QSRSOFT_TOKEN`, `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Supabase Table SQL

```sql
create table if not exists qsr_daily_activity (
  loc          text not null,   -- NSN zero-padded to 7 chars (matches qsr_ebos_daily)
  dt           date not null,
  hour_slot    text not null,   -- endQtrHourTime: '06:00', '13:00', '25:00', '28:00' etc.

  -- Actual metrics (zero for future hours at time of pull)
  transactions          int     default 0,
  product_sales         numeric default 0,
  net_sales             numeric default 0,
  dt_transactions       int     default 0,
  dt_sales              numeric default 0,
  is_transactions       int     default 0,
  is_sales              numeric default 0,
  trans_scrubbed        int     default 0,
  prod_sales_scrubbed   numeric default 0,

  -- DT timing (raw µs sums — divide by dt_trans_cnt for per-car avg)
  dt_trans_cnt    int    default 0,
  dt_untilserve   bigint default 0,
  dt_untilstore   bigint default 0,
  dt_untilrecall  bigint default 0,
  dt_heldtime     bigint default 0,
  dt_carsheld     int    default 0,

  -- Front counter timing
  fc_trans_cnt         int    default 0,
  fc_untilserve        bigint default 0,
  fc_untilclosedrawer  bigint default 0,

  -- MFY lanes
  mfy1_itemscount int    default 0,
  mfy1_trans_cnt  int    default 0,
  mfy1_untilserve bigint default 0,
  mfy2_itemscount int    default 0,
  mfy2_trans_cnt  int    default 0,
  mfy2_untilserve bigint default 0,

  -- Beverages
  bev_trans_cnt        int    default 0,
  bev_itemscount       int    default 0,
  bev_untilserve       bigint default 0,
  bev_untilclosedrawer bigint default 0,

  -- Labor
  actual_punched_hours             numeric default 0,
  total_scheduled_hours            numeric default 0,
  total_needed_hours               numeric default 0,
  salaried_manager_scheduled_hours numeric default 0,
  actual_punched_dollars           numeric default 0,

  -- Order accuracy
  healthy_count   int default 0,
  unhealthy_count int default 0,

  -- System projections (valid for all hours including future)
  proj_trans_scrubbed       int     default 0,
  proj_dt_trans_scrubbed    int     default 0,
  proj_is_trans_scrubbed    int     default 0,
  proj_prod_sales_scrubbed  numeric default 0,
  proj_kvs_items_scrubbed   int     default 0,
  proj_total_transactions   int     default 0,
  proj_dt_transactions      int     default 0,
  proj_sales_dollars        numeric default 0,
  proj_sandwich_counts      int     default 0,
  proj_is_transactions      int     default 0,

  -- Historical means (~5-week rolling from system)
  mean_sales           numeric default 0,
  mean_transactions    int     default 0,
  mean_dt_transactions int     default 0,
  mean_sandwiches      int     default 0,
  mean_fry_hashes      int     default 0,
  mean_beverages       int     default 0,

  -- Last year same day + time slot
  ly_transactions    int     default 0,
  ly_product_sales   numeric default 0,
  ly_dt_transactions int     default 0,
  ly_dt_sales        numeric default 0,
  ly_is_transactions int     default 0,
  ly_sales_dollars   numeric default 0,
  ly_punched_hours   numeric default 0,

  updated_at timestamptz default now(),

  primary key (loc, dt, hour_slot)
);

create index if not exists qsr_daily_activity_dt_idx     on qsr_daily_activity(dt);
create index if not exists qsr_daily_activity_loc_dt_idx on qsr_daily_activity(loc, dt);

comment on table qsr_daily_activity is
  'QSRSoft hourly intraday data — all 27 stores. Actuals in past hours, projections in future hours. DT timing in raw µs; divide by trans_cnt for per-car avg.';
```

## Shift Dashboard (PLANNED — not yet implemented)

**URL:** `https://v3.myqsrsoft.com/reports/mcd/shift-dashboard`

**Data endpoint:** `prod.ebos.qsrsoft.com/api/cash/{nsn}/instore_event_messages` — live per-store ops: scorecard, GC projections, employee roster, product outages. Uses eBOS `api/cash/` token (different from `api/inv/` token used for purchases).

**Architecture:** On-demand, NOT a batch pull. User triggers per-store refresh from store dash → Supabase Edge Function or Playwright → returns current shift state.

**Why gold:** Store managers run shifts from this page — live diagnostics across all stores without logging into QSRSoft per-store.

## How to apply

When ready to build DAR panels in Meridian: `qsr_daily_activity` has everything needed for:
- Intraday sales pace vs. projection vs. historical mean
- DT speed-of-service trending by hour
- Labor hours punched vs. scheduled vs. needed by hour
- LY comparisons at the hour slot level
- Cross-store speed-of-service ranking (aggregate `dt_untilserve / dt_trans_cnt` across stores)
