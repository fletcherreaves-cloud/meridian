// @ts-nocheck
// ── Raw-source variance (the var-0 fix) ─────────────────────────────────────────────────────────
// The per-item variance is logged IMMEDIATELY in the Raw Item history the moment a manager submits a
// count (owner-confirmed 2026-07-31) — the count event carries `difference` ($) and `variance` (units).
// The aggregate Variance/Stat report (qsr_variance_stat), by contrast, LAGS — which is what produced
// the $0 baselines in the Change Monitor. So for the "as-counted" variance we read the raw item's
// LATEST count event (≤ asOf) instead of the aggregate. Pure + unit-tested.
//
// rawItems = qsr_raw_item_detail rows: { wrin, descr, cls, history:[{ dt, tm, isCount, difference, variance }] }.

// Parse a count event's date+time to ms. The raw ledger stores dates as MM/DD/YYYY (e.g. "07/30/2026"),
// which Date.parse of `${dt}T${tm}` turns into NaN — so this MUST handle US format, not just ISO. (This
// bug silently zeroed out every raw-source variance, forcing the lagging-aggregate fallback everywhere.)
const tsOf = (dt, tm) => {
  if (!dt) return null;
  const s = String(dt);
  let y, mo, d;
  const isoM = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const usM = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (isoM) { y = +isoM[1]; mo = +isoM[2]; d = +isoM[3]; }
  else if (usM) { mo = +usM[1]; d = +usM[2]; y = +usM[3]; }
  else return null;
  const tM = String(tm || '').match(/^(\d{1,2}):(\d{2})/);
  return new Date(y, mo - 1, d, tM ? +tM[1] : 0, tM ? +tM[2] : 0).getTime();
};

// Per-item variance from the LATEST count DAY on or before `asOf`, NETTED across every count event
// that landed on that day. Returns wrin -> { dolDiff (the $ variance), variance (unit variance),
// lastCounted (YYYY-MM-DD), at (ms) }.
//
// 2026-08-31 fix: this used to keep only the single latest count event's raw `difference`, discarding
// any earlier same-day submission entirely. An item counted area-by-area (fries in 2-3 spots) submits
// several events in one day, each carrying the $ IMPACT of that one submission, not the item's real
// day-end variance -- a -$1,941 then +$1,988 pair is a normal two-area build-up that nets to ~+$47,
// not a real -$1,988 swing (owner-reported live example: McNuggets #32525, 2026-08-29, 08:39/09:01).
// Match eom-count-sessions.js's own netDolVar model (the reference implementation, already correct)
// instead of re-deriving a second, drifted definition of "the day's variance".
export function latestVarianceByWrin(rawItems, { asOf } = {}) {
  const cut = asOf == null ? Infinity : (asOf instanceof Date ? asOf.getTime() : Date.parse(asOf));
  const out = {};
  for (const r of (rawItems || [])) {
    const eligible = [];
    for (const h of (r.history || [])) {
      if (!h || !h.isCount || !h.dt) continue;
      const when = tsOf(h.dt, h.tm);
      if (when == null || when > cut) continue;
      eligible.push({ when, dolVar: Number(h.difference) || 0, unitVar: h.variance != null ? Number(h.variance) : null, dt: String(h.dt).slice(0, 10) });
    }
    if (!eligible.length) continue;
    let latest = eligible[0];
    for (const e of eligible) if (e.when > latest.when) latest = e;
    const sameDay = eligible.filter(e => e.dt === latest.dt);
    const dolDiff = sameDay.reduce((s, e) => s + e.dolVar, 0);
    const unitVals = sameDay.map(e => e.unitVar).filter(v => v != null);
    const variance = unitVals.length ? unitVals.reduce((s, v) => s + v, 0) : null;
    out[String(r.wrin)] = { dolDiff, variance, lastCounted: latest.dt, at: latest.when };
  }
  return out;
}

// Merge raw-source variance over a base (aggregate) per-item value: prefer the raw count event when it
// exists (immediate + correct), fall back to the aggregate. `baseByWrin` = { wrin -> { dolDiff, variance } }.
export function mergeVariance(baseByWrin = {}, rawByWrin = {}) {
  const out = {};
  for (const w of new Set([...Object.keys(baseByWrin), ...Object.keys(rawByWrin)])) {
    const b = baseByWrin[w] || {}, r = rawByWrin[w] || {};
    out[w] = {
      dolDiff: r.dolDiff != null ? r.dolDiff : (b.dolDiff ?? null),
      variance: r.variance != null ? r.variance : (b.variance ?? null),
      lastCounted: r.lastCounted ?? b.lastCounted ?? null,
      source: (r.dolDiff != null) ? 'raw' : 'aggregate',
    };
  }
  return out;
}
