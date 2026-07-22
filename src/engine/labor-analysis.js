// @ts-nocheck
// ── Weekly Fixed-Labor-Hours (FLH) analysis engine ───────────────────────────
// Reproduces the "MBI - Labor Analysis" worksheet's math EXACTLY (cell-for-cell)
// so Meridian can generate the same per-store weekly labor report from cloud data
// instead of a hand-maintained spreadsheet. Pure + unit-tested
// (src/__tests__/labor-analysis.test.js).
//
// Bands, per the source sheet:
//   1 · From LifeLenz (inputs)  — salesFcst(C), laborPctActual(D), gcFcst(E),
//        hoursFcst(F), hoursSched(G), schedFixedPct(H), tpph(I), rate(J),
//        laborTargetOrg(L), actualHours(W)
//   2 · Efficiency calcs        — K..V below (all derived here)
//   3 · Recommended Fixed/Floor — X..AB (threshold × projected target hours)
//   4 · Known fixed hours       — maintenance/prep/lobby/24hr (config, not math)
//   5 · Hours of operation      — open/close times + hours-open-per-day (config)
//
// Unit note (resolved): in the source sheet Hours Forecast (F), Hours Scheduled
// (G) and Actual Hours (W) are `[h]:mm` durations — Excel stores them as
// fractions of a DAY (1.0 = 24h), so a raw 62.52 is really 1500.5 hours. The
// parser converts these to real hours (×24) on the way in, so THIS engine takes
// F/G/W already in hours and the math is unit-consistent (no ×24 needed). The
// sheet's original "(G*24)-O" was just compensating for that day-serial storage.

export const FLH_THRESHOLDS = { fixed10: 0.10, fixed15: 0.15, floor10: 0.10, floor15: 0.15, combined25: 0.25 };

const _n = x => (typeof x === 'number' && !Number.isNaN(x) && Number.isFinite(x)) ? x : null;
const _mul = (a, b) => { const x = _n(a), y = _n(b); return (x == null || y == null) ? null : x * y; };
const _div = (a, b) => { const x = _n(a), y = _n(b); return (x == null || y == null || y === 0) ? null : x / y; };
const _sub = (a, b) => { const x = _n(a), y = _n(b); return (x == null || y == null) ? null : x - y; };
const _add = (a, b) => { const x = _n(a), y = _n(b); return (x == null || y == null) ? null : x + y; };

// Compute one store's full derived row from its Band-1 inputs.
// inputs keys: salesFcst, laborPctActual, gcFcst, hoursFcst, hoursSched,
//              schedFixedPct, tpph, rate, laborTargetOrg, actualHours
export function computeLaborRow(inp = {}) {
  const C = _n(inp.salesFcst), D = _n(inp.laborPctActual), F = _n(inp.hoursFcst),
        G = _n(inp.hoursSched), J = _n(inp.rate), L = _n(inp.laborTargetOrg);

  const K = _mul(C, D);                       // Scheduled Labor $  = C*D
  const M = (L == null) ? null : L + 0.02;    // Labor Target +2%   = L+0.02
  const N = _mul(C, L);                       // Target Labor $     = C*L
  const O = _div(_mul(C, L), J);              // Proj Hrs/Wk (target)      = (C*L)/J
  const P = _div(_mul(C, M), J);              // Proj Hrs/Wk (target+2%)   = (C*M)/J
  const Q = _sub(G, F);                       // Hours ± sched vs forecast   = G-F
  const R = _sub(G, O);                       // Hours ± sched vs target     = G-O
  const S = _sub(G, P);                       // Hours ± sched vs target+2%  = G-P
  const T = _mul(Q, J);                       // $ ± vs projected (LifeLenz) = Q*J
  const U = _mul(R, J);                       // $ ± vs projected (target)   = R*J
  const V = _mul(S, J);                       // $ ± vs projected (target+2%)= S*J

  return {
    scheduledLaborD: K, laborTargetPlus2: M, targetLaborD: N,
    projHrsTarget: O, projHrsTargetPlus2: P,
    hrsVsForecast: Q, hrsVsTarget: R, hrsVsTargetPlus2: S,
    dollarsVsProjLL: T, dollarsVsTarget: U, dollarsVsTargetPlus2: V,
    // Band 3 — recommended fixed/floor/combined hours (threshold × target hours O)
    recFixed10: _mul(O, FLH_THRESHOLDS.fixed10),
    recFixed15: _mul(O, FLH_THRESHOLDS.fixed15),
    recFloor10: _mul(O, FLH_THRESHOLDS.floor10),
    recFloor15: _mul(O, FLH_THRESHOLDS.floor15),
    combined25: _mul(O, FLH_THRESHOLDS.combined25),
  };
}

// Merge inputs + derived into one flat record for a store.
export function analyzeStore(inp = {}) {
  return { ...inp, ...computeLaborRow(inp) };
}

// Group subtotal (OK / FL / Grand) — dollar-weighted and count-weighted, NEVER a
// mean of store percentages. Sums the extensive quantities, then recomputes the
// intensive ones (%, rate, TPPH, per-$ ratios) from the sums.
export function aggregateGroup(rows = []) {
  const S = { salesFcst: 0, gcFcst: 0, hoursFcst: 0, hoursSched: 0, actualHours: 0,
    scheduledLaborD: 0, targetLaborD: 0, projHrsTarget: 0, projHrsTargetPlus2: 0,
    hrsVsForecast: 0, hrsVsTarget: 0, hrsVsTargetPlus2: 0,
    dollarsVsProjLL: 0, dollarsVsTarget: 0, dollarsVsTargetPlus2: 0,
    recFixed10: 0, recFixed15: 0, recFloor10: 0, recFloor15: 0, combined25: 0 };
  let n = 0;
  for (const r of rows) {
    if (!r) continue; n++;
    for (const k of Object.keys(S)) { const v = _n(r[k]); if (v != null) S[k] += v; }
  }
  if (!n) return null;
  // Intensive metrics recomputed from the weighted sums:
  const laborPctActual = _div(S.scheduledLaborD, S.salesFcst);   // Σ$ / Σsales
  const laborTargetOrg = _div(S.targetLaborD, S.salesFcst);      // Σtarget$ / Σsales
  const rate = _div(S.scheduledLaborD, S.hoursSched);            // Σ$ / Σhours (weighted rate)
  const tpph = _div(S.gcFcst, S.hoursSched);                     // Σgc / Σhours
  const schedFixedPct = _div(S.recFixed10, S.hoursSched);        // indicative only
  return { ...S, n, laborPctActual, laborTargetOrg, laborTargetPlus2: laborTargetOrg == null ? null : laborTargetOrg + 0.02, rate, tpph, schedFixedPct };
}

// Convenience: analyze a set of store input rows and attach OK/FL/grand subtotals.
// `isFL(loc)` decides the FL bucket. Returns { rows, subtotals:{ok,fl,grand} }.
export function analyzeSheet(inputRows = [], isFL = () => false) {
  const rows = inputRows.map(r => ({ loc: r.loc, ...analyzeStore(r) }));
  const ok = rows.filter(r => !isFL(r.loc));
  const fl = rows.filter(r => isFL(r.loc));
  return { rows, subtotals: { ok: aggregateGroup(ok), fl: aggregateGroup(fl), grand: aggregateGroup(rows) } };
}

// ── Hours of operation ───────────────────────────────────────────────────────
// Store hours are Excel time fractions (0.208≈5:00, 0.916≈22:00). Hours open for
// a day = (close-open)*24; a close of 0 or ≤ open means the store runs to/through
// midnight (24-hour day) → 24 - open*24 ... treated as crossing midnight (+1 day).
export function hoursOpen(openFrac, closeFrac) {
  const o = _n(openFrac), c = _n(closeFrac);
  if (o == null) return null;
  if (c == null) return null;
  let span = (c - o) * 24;
  if (span <= 0) span += 24;          // close at/after midnight → crossed a day
  return Math.round(span * 100) / 100;
}

// Excel time fraction → "H:MM AM/PM" for display.
export function fracToTime(frac) {
  const f = _n(frac);
  if (f == null) return null;
  let mins = Math.round(f * 24 * 60) % (24 * 60);
  if (mins < 0) mins += 24 * 60;
  let h = Math.floor(mins / 60), m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  let hh = h % 12; if (hh === 0) hh = 12;
  return hh + ':' + String(m).padStart(2, '0') + ' ' + ampm;
}
