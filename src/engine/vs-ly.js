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

// Matched-day comparison summed across one or more locs. → { cur, ly, pct, days }.
export function matchedVsLY(ds, locs, range, kind = 'sales') {
  const list = Array.isArray(locs) ? locs : [locs];
  let cur = 0, ly = 0, days = 0;
  for (const loc of list) {
    const { curByDate, lyByDate } = autoFirstDaily(ds, loc, range, kind);
    for (const k in curByDate) { const l = lyByDate[k]; if (l > 0) { cur += curByDate[k]; ly += l; days++; } }
  }
  return { cur, ly, pct: ly > 0 ? (cur - ly) / ly : null, days };
}

// Full current-period total for a loc (every day with data, auto-first) — the display figure,
// distinct from the matched-day `cur` used for the ratio.
export function autoFirstTotal(ds, loc, range, kind = 'sales') {
  const { curByDate } = autoFirstDaily(ds, loc, range, kind);
  return Object.values(curByDate).reduce((a, b) => a + b, 0);
}
