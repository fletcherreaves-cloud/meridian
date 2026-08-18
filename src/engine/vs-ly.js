// @ts-nocheck
// ── Shared auto-first + matched-day comparison ────────────────────────────────
// ONE implementation of the "current vs last-year" logic (Notes 28 #2 consolidation).
// The same matched-day/vs-LY math had been reimplemented in ≥4 places (At-A-Glance tile,
// buildStore pipeline, Org Summary, Rankings) and each had the SAME coverage bug — so any
// panel doing a current-vs-LY comparison should call these helpers instead of rolling its own.
//
// Two ideas, both essential to a correct comparison:
//   1. AUTO-FIRST — the current period's daily value comes from the manual Operations Report
//      (`laborRows`) when present, else the auto-synced DAR (`qsrActSummaryRows`). Without this,
//      recent days that only exist in the DAR are missing from "current", so the period looks
//      short and last year looks bigger.
//   2. MATCHED-DAY — a day counts on BOTH sides only when it has real data this year AND a
//      comparable last-year value, so the two sides always span the identical calendar days
//      (apples-to-apples). Prevents the uniform "-30% / -100%" artifact from partial coverage.
//
// `kind`: 'sales' (product/net sales) or 'gc' (guest counts). `range`: {s, e} Date bounds.

const _iso = d => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
const _addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// Per-(dateISO) current + last-year values for ONE loc + metric, freshest source first.
export function autoFirstDaily(ds, loc, range, kind = 'sales') {
  const L = String(loc);
  const curField = kind === 'gc' ? 'gc' : 'sales';
  const lyField = kind === 'gc' ? 'lyGc' : 'lySales';
  // Normalize the range bounds to ISO "YYYY-MM-DD" strings and compare row dates the same
  // way. The row `date`s are Date objects; callers (the One-Pager) pass STRING ranges, and a
  // raw `Date >= "2026-07-27"` coerces to `number >= NaN` = false, silently dropping every row
  // → matchedVsLY returned null (blank GC-vs-LY + District-Outliers vs-LY). Same Date-vs-string
  // class as the metric-source regression. Lexical compare of ISO dates is correct + tz-safe here.
  const rsD = range.s instanceof Date ? range.s : new Date(range.s);
  const reD = range.e instanceof Date ? range.e : new Date(range.e);
  const rs = _iso(rsD), re = _iso(reD);
  const lyS = _iso(_addD(rsD, -364)), lyE = _iso(_addD(reD, -364));
  const curByDate = {}, lyByDate = {};

  // Manual laborRows: current values + the 364-day-back row as last-year for that date.
  for (const r of (ds?.laborRows || [])) {
    if (String(r.loc) !== L || !r.date) continue;
    const d = _iso(r.date);
    if (d >= rs && d <= re) { const v = r[curField]; if (v > 0) curByDate[d] = v; }
    if (d >= lyS && d <= lyE) { const v = r[curField]; if (v > 0) { const k = _iso(_addD(r.date, 364)); if (lyByDate[k] == null) lyByDate[k] = v; } }
  }
  // Auto DAR (qsrActSummaryRows): fill current-day gaps + the row's OWN same-date last-year value.
  for (const r of (ds?.qsrActSummaryRows || [])) {
    if (String(r.loc) !== L || !r.date) continue;
    const k = _iso(r.date);
    if (k >= rs && k <= re) {
      const v = kind === 'gc' ? r.gc : (r.sales || r.allNetSales);
      if (v > 0 && curByDate[k] == null) curByDate[k] = v;
      const ly = r[lyField]; if (ly > 0) lyByDate[k] = ly;   // DAR's own LY is same-date → authoritative
    }
  }
  return { curByDate, lyByDate };
}

// Matched-day comparison summed across one or more locs. → { cur, ly, pct, days, flagged }.
// `flagged`: locs (of the ones passed in) whose LY leg falls within lyQuality's minMonths of
// that store's own first real trading date -- the young-restaurant honeymoon-ramp trap. The
// aggregate cur/ly/pct/days are UNCHANGED (still every loc passed in) so this is additive,
// not a silent behavior change for existing callers -- a caller doing a district rollup
// should filter `locs` itself using `flagged` (or call lyQuality per-store first) to actually
// exclude a young store, per the standing instruction to default it OUT of rollups; this
// function only surfaces which locs need that judgment call, it doesn't make it for every
// caller automatically.
export function matchedVsLY(ds, locs, range, kind = 'sales') {
  const list = Array.isArray(locs) ? locs : [locs];
  let cur = 0, ly = 0, days = 0;
  const flagged = [];
  for (const loc of list) {
    const { curByDate, lyByDate } = autoFirstDaily(ds, loc, range, kind);
    for (const k in curByDate) { const l = lyByDate[k]; if (l > 0) { cur += curByDate[k]; ly += l; days++; } }
    const q = lyQuality(ds, loc, range);
    if (q.reliable === false) flagged.push({ loc, monthsOld: q.monthsOld, firstTradingDate: q.firstTradingDate });
  }
  return { cur, ly, pct: ly > 0 ? (cur - ly) / ly : null, days, flagged };
}

// Full current-period total for a loc (every day with data, auto-first) — the display figure,
// distinct from the matched-day `cur` used for the ratio.
export function autoFirstTotal(ds, loc, range, kind = 'sales') {
  const { curByDate } = autoFirstDaily(ds, loc, range, kind);
  return Object.values(curByDate).reduce((a, b) => a + b, 0);
}

// ── lyQuality — the young-restaurant trap (dispatch20 addendum, 2026-08-18) ──────────────
// A store under ~24 months old is still lapping its own grand-opening honeymoon: its vs-LY
// improves on its own every month as the ramp decays, with zero credit due to operations.
// Tishomingo (opened 2024-12-16) ranked 2nd-best of 26 stores on a traffic DiD purely from
// this artifact -- pre -10.58%, post -6.51%, BOTH deeply negative, merely lapping a less
// inflated base. Ponce de Leon (opened 2026-03-13) has no LY twin at all.
//
// `product_sales > 0` is NOT a safe anchor for "when did real trading start" -- verified
// live against qsr_daily_activity_rollup: Tishomingo's first `> 0` day is 2024-12-13 with
// $104.97 / 14 transactions, a training/soft-open day; real trading starts 2024-12-16 at
// $10,058 / 816 transactions, a 58x jump the very next available day. A 3-day gap (12-14,
// 12-15 both zero) sits between them. `MIN_REAL_TRADING_TRANSACTIONS` below is a conservative
// floor chosen with that measured 14-vs-816 gap in mind, not a formal threshold study --
// there is enormous margin on both sides of it for the one real case measured so far.
export const MIN_REAL_TRADING_TRANSACTIONS = 50;
// A candidate day only counts if the NEXT day also clears the floor -- rules out an isolated
// training-day spike (Tishomingo's 12-13) that is immediately followed by zero real activity,
// while still accepting a genuine grand-opening day (Ponce's 03-13, immediately sustained).
export function firstRealTradingDate(ds, loc, { minTransactions = MIN_REAL_TRADING_TRANSACTIONS } = {}) {
  const L = String(loc);
  const byDate = {}; // dateISO -> transactions, auto-first (qsrActSummaryRows/DAR primary --
  // it's the source with real per-day transaction counts; laborRows' gc is a fallback for
  // whatever window it covers). Uses WHATEVER history is currently loaded in `ds` -- this
  // engine makes no assumption about how far back that reaches; a store whose real opening
  // predates everything loaded simply won't get flagged (see lyQuality's null-safe caller
  // contract), which is the safe failure direction (no data => no false "unreliable" flag).
  for (const r of (ds?.qsrActSummaryRows || [])) {
    if (String(r.loc) !== L || !r.date) continue;
    const d = _iso(r.date);
    const t = r.transactions != null ? r.transactions : r.gc;
    if (t != null) byDate[d] = t;
  }
  for (const r of (ds?.laborRows || [])) {
    if (String(r.loc) !== L || !r.date) continue;
    const d = _iso(r.date);
    if (byDate[d] == null && r.gc != null) byDate[d] = r.gc;
  }
  const dates = Object.keys(byDate).sort();
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    if (byDate[d] < minTransactions) continue;
    const next = dates[i + 1];
    // The next AVAILABLE date must both exist and be the calendar-adjacent day (a gap here
    // means we can't confirm sustained trading from this data alone -- skip, don't guess).
    if (next && _iso(_addD(new Date(d), 1)) === next && byDate[next] >= minTransactions) return d;
  }
  return null;
}

// {reliable, monthsOld, firstTradingDate} for comparing `range`'s LY leg against a store's
// own trading history. `reliable === null` means "can't judge" (no first-trading-date data
// available in ds) -- callers should treat null as "don't flag," never as "flag as bad."
export function lyQuality(ds, loc, range, { minMonths = 24 } = {}) {
  const firstTradingDate = firstRealTradingDate(ds, loc);
  if (!firstTradingDate) return { reliable: null, monthsOld: null, firstTradingDate: null };
  const reD = range.e instanceof Date ? range.e : new Date(range.e);
  const lyE = _addD(reD, -364); // the LY leg's own end date, same offset autoFirstDaily uses
  const monthsOld = (lyE - new Date(firstTradingDate)) / (1000 * 60 * 60 * 24 * 30.44);
  return { reliable: monthsOld >= minMonths, monthsOld, firstTradingDate };
}
