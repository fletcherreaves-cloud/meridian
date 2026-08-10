// @ts-nocheck
// ── Sustained one-directional swing detection ────────────────────────────────
// Notes 58 #4 (owner, "an absolute must"): when any metric — sales and guest counts
// first — takes a large one-directional swing, it has to light up the app. There must
// be no way for it to go unnoticed.
//
// The live case that motivated it: store 10422 lost a quarter of its business over
// five weeks and nothing in Meridian said so.
//
// ── HOW THE THRESHOLD WAS CHOSEN ────────────────────────────────────────────
// Not picked by feel. Measured against 676 store-weeks of real vs-LY data across all
// 27 stores (2026-02-01 → 2026-08-07, qsr_daily_activity_rollup):
//
//     median  +0.8%      p10  -6.3%
//     stdev   10.7pp     p5   -8.7%      p1  -12.9%
//
// Weekly vs-LY is NOISY — a 10pp standard deviation means a single bad week is
// unremarkable. So a single week can't be the trigger; what separates a real problem
// from noise is a SUSTAINED run in one direction. Requiring two consecutive weeks
// below a threshold, measured on that same real data:
//
//     both weeks < -8%   →  2 of 27 stores   (10422, 35242)
//     both weeks < -10%  →  1 of 27 stores   (10422)
//     both weeks < -12%  →  1 of 27 stores   (10422)
//     both weeks < -20%  →  0 of 27 stores
//
// So CRIT at two consecutive weeks ≤ -10% isolates exactly the store the owner
// flagged, and WARN at ≤ -8% adds the one genuine near-miss (35242, -10.6% sales /
// -16.5% guests, $14.9k behind LY). A single week ≤ -13% is a p1 event and worth
// flagging on its own without waiting for a second week to confirm.
//
// Recalibrate with scripts/ against fresh data if the business changes shape — the
// numbers above are an empirical snapshot, not a law.
//
// ── WHY GUESTS MATTER SEPARATELY ────────────────────────────────────────────
// Comparing the sales swing to the guest swing says WHAT KIND of problem it is, which
// is the first thing the owner asked the alarm to establish:
//   guests down ≈ sales down   → traffic loss (operational, competitive, external)
//   sales down, guests flat    → check mix / pricing / promo
//   guests down MORE than sales→ traffic loss with average check holding or rising
// 10422 is the third case: sales -20.8%, guests -22.4%.

export const SWING_DEFAULTS = {
  critPct: -10,      // two+ consecutive periods at or below this → critical
  warnPct: -8,       // two+ consecutive periods at or below this → watch
  spikePct: -13,     // a SINGLE period this bad (≈p1) fires on its own
  minRun: 2,         // consecutive periods required for the sustained rule
  upCritPct: 15,     // large positive swings are surfaced too — the owner asked for
  upWarnPct: 12,     // "one-directional", not "negative". An unexplained +20% is a
                     // data problem or an opportunity, and both deserve a look.
};

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/**
 * Build a vs-baseline percentage series from period buckets.
 * `periods`: [{ label, cur, base, curGuests?, baseGuests? }] ordered OLDEST → NEWEST.
 */
export function pctSeries(periods = []) {
  return (periods || []).filter(p => p && p.base > 0).map(p => ({
    label: p.label,
    pct: ((p.cur - p.base) / p.base) * 100,
    dollars: p.cur - p.base,
    guestPct: (p.baseGuests > 0 && p.curGuests != null)
      ? ((p.curGuests - p.baseGuests) / p.baseGuests) * 100 : null,
  }));
}

/**
 * Detect a sustained one-directional swing at the END of the series (the current
 * situation — not a historical excursion that has already recovered).
 * Returns null when nothing fires.
 */
export function detectSwing(periods = [], opts = {}) {
  const o = { ...SWING_DEFAULTS, ...opts };
  const s = pctSeries(periods);
  if (!s.length) return null;

  const last = s[s.length - 1];

  // Length of the run ending at the most recent period, in each direction.
  const runBelow = (thr) => {
    let n = 0;
    for (let i = s.length - 1; i >= 0 && s[i].pct <= thr; i--) n++;
    return n;
  };
  const runAbove = (thr) => {
    let n = 0;
    for (let i = s.length - 1; i >= 0 && s[i].pct >= thr; i--) n++;
    return n;
  };

  let severity = null, rule = null, run = 0;

  if (runBelow(o.critPct) >= o.minRun)      { severity = 'crit'; rule = 'sustained-down'; run = runBelow(o.critPct); }
  else if (last.pct <= o.spikePct)          { severity = 'crit'; rule = 'spike-down';     run = 1; }
  else if (runBelow(o.warnPct) >= o.minRun) { severity = 'warn'; rule = 'sustained-down'; run = runBelow(o.warnPct); }
  else if (runAbove(o.upCritPct) >= o.minRun) { severity = 'warn'; rule = 'sustained-up'; run = runAbove(o.upCritPct); }
  else if (runAbove(o.upWarnPct) >= o.minRun) { severity = 'info'; rule = 'sustained-up'; run = runAbove(o.upWarnPct); }

  if (!severity) return null;

  const window = s.slice(-Math.max(run, 1));
  const avgPct = mean(window.map(w => w.pct));
  const guestVals = window.map(w => w.guestPct).filter(v => v != null);
  const avgGuestPct = guestVals.length ? mean(guestVals) : null;

  return {
    rule,
    severity,
    direction: avgPct < 0 ? 'down' : 'up',
    run,                                   // consecutive periods in this state
    pct: avgPct,                           // avg vs-baseline % across the run
    latestPct: last.pct,
    dollars: window.reduce((a, w) => a + w.dollars, 0),
    guestPct: avgGuestPct,
    from: window[0].label,
    to: last.label,
    kind: classify(avgPct, avgGuestPct),
  };
}

/**
 * What kind of problem the sales-vs-guest relationship implies. This is the
 * "operational or otherwise" first cut the owner asked the alarm to make.
 */
export function classify(pct, guestPct) {
  if (guestPct == null) return 'unknown';
  const gap = pct - guestPct;                       // + means sales held up better
  if (Math.abs(guestPct) < 2 && Math.abs(pct) >= 5) return 'check-mix';
  if (gap > 4) return 'traffic-loss-check-holding';  // guests fell much harder
  if (gap < -4) return 'check-erosion';              // sales fell harder than traffic
  return 'traffic';                                  // both moved together
}

export const KIND_LABEL = {
  traffic: 'Traffic moved with sales — points to volume, not pricing.',
  'traffic-loss-check-holding': 'Guest count fell faster than sales — losing visits while average check holds.',
  'check-erosion': 'Sales fell faster than guest count — average check is eroding.',
  'check-mix': 'Guest count is roughly flat — look at mix, pricing or promo, not traffic.',
  unknown: 'No guest-count data for this window.',
};

/**
 * Turn a swing into an attention-feed item (same shape as src/engine/attention-feed.js
 * so it ranks alongside every other signal).
 */
export function swingItem(loc, swing, storeName = String, metricLabel = 'Sales') {
  if (!swing) return null;
  const dir = swing.direction === 'down' ? 'down' : 'up';
  const arrow = dir === 'down' ? '📉' : '📈';
  const pct = `${swing.pct >= 0 ? '+' : ''}${swing.pct.toFixed(1)}%`;
  const guests = swing.guestPct != null
    ? ` · guests ${swing.guestPct >= 0 ? '+' : ''}${swing.guestPct.toFixed(1)}%` : '';
  const runTxt = swing.run > 1 ? `${swing.run} weeks running` : 'this week';
  return {
    id: `swing-${loc}-${metricLabel.toLowerCase()}`,
    severity: swing.severity,
    category: 'Swing',
    icon: arrow,
    title: `${storeName(loc)} — ${metricLabel.toLowerCase()} ${dir} ${pct} vs LY (${runTxt})`,
    detail: `${swing.from} → ${swing.to} · ${Math.round(Math.abs(swing.dollars)).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} vs LY${guests}. ${KIND_LABEL[swing.kind]}`,
    dollars: swing.dollars,
    loc,
    nav: 'analytics',
    // Consumed by the acknowledgement layer: a crit swing must be clicked to clear,
    // so it cannot be scrolled past. Notes 58 #4.
    requiresAck: swing.severity === 'crit',
    swing,
  };
}
