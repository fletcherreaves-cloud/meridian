// @ts-nocheck
// ── FOB Cross-Check ───────────────────────────────────────────────────────────
// Reconcile an EXTERNAL AI's FOB analysis (e.g. CoachQ) against Meridian's own real
// FOB numbers, per store. Two independent checks:
//   1. Internal consistency of the external output — do the 6 FOB components sum to the
//      external FOB$ it stated? A mismatch means the external tool fabricated/hallucinated that
//      row (real data always reconciles). This is how we caught CoachQ inventing 4 stores.
//   2. Reconciliation vs Meridian — does the external FOB$ / % match Meridian's real figure
//      (from the same QSRSoft source)? Divergence = one side is wrong; Meridian is the ground truth.
//
// The 6 FOB components (order Meridian uses): comp waste, raw waste, condiments, emp/mgr meals,
// stat variance, unexplained. FOB$ = their sum. (Disc/Coupon is context, NOT part of FOB$.)
// Pure + unit-tested — no I/O, no React.

const norm = s => String(s || '').replace(/^0+/, '') || String(s || '');

// Parse a pasted external FOB table. Tolerant: for each line, if it starts with (or contains near the
// start) one of OUR store numbers, pull the numeric sequence. CoachQ layout is:
//   store  prodSales  FOB$  FOB%  comp  raw  cond  emp  disc  statv  unex   …prose…
// We map the first 10 numbers accordingly. Lines that don't begin with a known store are skipped.
// Returns [{ store, prodSales, extFob, extFobPct, comps:{...}, sum6, sumOk, nNums, line }].
export function parseExternalFob(text, ourLocs = []) {
  const ours = new Set((ourLocs || []).map(norm));
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const tokens = line.split(/[\s|]+/);
    let store = null, idx = -1;
    for (let i = 0; i < Math.min(tokens.length, 3); i++) {
      const t = tokens[i].replace(/[^0-9]/g, '');
      if (t && ours.has(norm(t))) { store = norm(t); idx = i; break; }
    }
    if (!store) continue;

    // ── LABELED format (CoachQ 2026-07): "FOB: $14,589.13 (4.58%) … • Comp Waste: $1,003.98 …". Parse
    // by label, not position — the old positional parser mis-read the median-delta as FOB% (owner bug). ──
    if (/FOB\s*:/i.test(line) || /Comp\s*Waste\s*:/i.test(line)) {
      const money = re => { const m = line.match(re); return m ? Number(String(m[1]).replace(/[$,\s]/g, '')) : null; };
      const comp = label => money(new RegExp(label + '\\s*:\\s*(-?\\$?[\\d,]+(?:\\.\\d+)?)', 'i'));
      const extFob = money(/FOB\s*:\s*(-?\$?[\d,]+(?:\.\d+)?)/i);
      const extFobPct = money(/FOB\s*:[^(]*\(\s*([\d.]+)\s*%/i) ?? money(/\(\s*([\d.]+)\s*%\)/);
      const comps = { comp: comp('Comp\\s*Waste'), raw: comp('Raw\\s*Waste'), cond: comp('Condiment'), emp: comp('Emp\\s*Meal'), disc: comp('Disc(?:ount)?[\\s/]*Coupon'), statv: comp('Stat\\s*Var'), unex: comp('Unexplained') };
      const has6 = ['comp', 'raw', 'cond', 'emp', 'statv', 'unex'].every(k => comps[k] != null);
      const sum6 = has6 ? (comps.comp + comps.raw + comps.cond + comps.emp + comps.statv + comps.unex) : null;
      out.push({
        store, prodSales: null, extFob, extFobPct, comps, sum6,
        // Fabrication check only when all 6 components were listed (CoachQ often lists only the FLAGGED
        // ones, so sum-check is null there — that's the data's limit, not a mismatch).
        sumOk: (sum6 != null && extFob != null) ? Math.abs(sum6 - extFob) <= 1 : null,
        nComps: ['comp', 'raw', 'cond', 'emp', 'statv', 'unex'].filter(k => comps[k] != null).length,
        labeled: true, line,
      });
      continue;
    }

    // ── POSITIONAL fallback: [prodSales, fob$, fob%, comp, raw, cond, emp, disc, statv, unex] ──
    const rest = tokens.slice(idx + 1).join(' ');
    const nums = (rest.match(/-?\$?\s?[\d,]+(?:\.\d+)?/g) || []).map(x => Number(x.replace(/[$,\s]/g, ''))).filter(n => Number.isFinite(n));
    const g = i => (nums.length > i ? nums[i] : null);
    const comps = { comp: g(3), raw: g(4), cond: g(5), emp: g(6), disc: g(7), statv: g(8), unex: g(9) };
    const has6 = ['comp', 'raw', 'cond', 'emp', 'statv', 'unex'].every(k => comps[k] != null);
    const sum6 = has6 ? (comps.comp + comps.raw + comps.cond + comps.emp + comps.statv + comps.unex) : null;
    const extFob = g(1);
    out.push({ store, prodSales: g(0), extFob, extFobPct: g(2), comps, sum6, sumOk: (sum6 != null && extFob != null) ? Math.abs(sum6 - extFob) <= 1 : null, nNums: nums.length, line });
  }
  return out;
}

// Reconcile parsed external rows against Meridian's real per-store FOB.
// meridianByStore: { [normLoc]: { fob, fobPct, sales, comp, raw, cond, emp, statv, unex } }
// Returns per-store rows with deltas + a status: 'match' | 'diverge' | 'fabricated' | 'no-meridian'.
export function reconcileFob(parsed = [], meridianByStore = {}, { dollarTol = 50, pctTol = 0.1 } = {}) {
  const rows = (parsed || []).map(p => {
    const mer = meridianByStore[norm(p.store)] || null;
    const dFob = (mer && p.extFob != null) ? p.extFob - (mer.fob || 0) : null;
    const dPct = (mer && p.extFobPct != null && mer.fobPct != null) ? p.extFobPct - mer.fobPct * 100 : null;
    let status;
    if (p.sumOk === false) status = 'fabricated';          // external doesn't even reconcile to itself
    else if (!mer) status = 'no-meridian';                  // we have no FOB for this store to compare
    else if (dFob != null && Math.abs(dFob) <= dollarTol) status = 'match';
    else status = 'diverge';
    return { ...p, meridian: mer, dFob, dPct, status };
  });
  const tally = { match: 0, diverge: 0, fabricated: 0, 'no-meridian': 0 };
  rows.forEach(r => { tally[r.status] = (tally[r.status] || 0) + 1; });
  return { rows, tally, total: rows.length };
}
