// @ts-nocheck
// ── EOM report builder (single source) ──────────────────────────────────────────────────────────
// One pure function that turns a store's raw EOM rows into the diagnosis result + recap/full markdown
// + the FOB one-liner inputs. Both the EOM Dashboard (buildDiagResult/diagOptsFor/computeDraft) AND
// the public Share view call this, so the shared link renders the SAME report from LIVE data with no
// drift (standing rule: never re-implement a metric per-panel).
//
// Inputs are tolerant of snake_case (qsr_onhand / qsr_raw_item_detail straight from Supabase) or the
// camelCase the client already carries. `components` = the FOB $ breakdown; `targets` = DEFAULT_TARGETS
// for the store (for the FOB target line). `exception` = a granted count-date exception (or null).

import { runDiagnosis, formatDiagnosisReport, checksConfig, fobComponentDeltas } from './eom-diagnosis.js';
import { diagnoseIncompleteCount } from './eom-inventory.js';

const num = v => (v == null || v === '' ? null : Number(v));
const toDate = v => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v);
  return new Date(/T/.test(s) ? s : s.slice(0, 10) + 'T00:00:00');
};

// Shape on-hand rows (snake or camel) into the runDiagnosis / count shape.
function shapeOnHand(rows) {
  return (rows || []).map(r => ({
    wrin: r.wrin, cls: r.cls, descr: r.descr,
    onHandAmt: r.on_hand_amt ?? r.onHandAmt ?? null,
    totalUnits: r.total_units ?? r.totalUnits ?? null,
    lastCounted: toDate(r.last_counted ?? r.lastCounted),
    lastSubmitted: toDate(r.last_submitted ?? r.lastSubmitted),
  }));
}

export function buildEomReport({
  loc, name, period, asOf = new Date(),
  components = null, onHand = [], variance = [], waste = [], transfers = [], rawItems = [],
  unmatchedTransfers = [], selfServeTower = false, targets = {}, exception = null,
  checks = null,
} = {}) {
  const c = components || {};
  const shaped = shapeOnHand(onHand);
  const activeChecks = checks || checksConfig();

  const result = runDiagnosis({
    store: loc, storeName: name, period, asOf, checks: activeChecks,
    data: {
      fob: c.sales ? { sales: c.sales, compWaste: c.comp, rawWaste: c.raw, condiments: c.cond, empMgrMeals: c.emp, statVariance: c.statv, unexplained: c.unex } : null,
      onHand: shaped,
      variance: variance || [], waste: waste || [], transfers: transfers || [],
      unmatchedTransfers: unmatchedTransfers || [], selfServeTower: !!selfServeTower, rawItems: rawItems || [],
    },
  });

  const incomplete = diagnoseIncompleteCount(shaped, { period, asOf, acceptEarly: !!exception });

  const caseSzByWrin = {};
  for (const it of (rawItems || [])) { const cs = num(it.caseSz ?? it.case_sz); if (cs > 0) caseSzByWrin[String(it.wrin)] = cs; }

  // FOB $ = the given total, or the sum of the six components (robust to callers that omit .fob/.fobPct).
  const fobDollars = c.fob != null ? Number(c.fob)
    : (c.sales != null ? ((Number(c.comp) || 0) + (Number(c.raw) || 0) + (Number(c.cond) || 0) + (Number(c.emp) || 0) + (Number(c.statv) || 0) + (Number(c.unex) || 0)) : null);
  const pct = c.fobPct != null ? c.fobPct : (c.sales ? (fobDollars / c.sales) : null);
  const tg = targets || {};
  const fob = pct != null ? { pct, tgt: tg.tFOBTarget != null ? Number(tg.tFOBTarget) : null, dollars: fobDollars, components: fobComponentDeltas(c, tg) } : null;

  const opts = { incomplete, caseSzByWrin, selfServeTower: !!selfServeTower, fob, exception };
  const recapMd = formatDiagnosisReport(result, { ...opts, mode: 'recap' });
  const fullMd = formatDiagnosisReport(result, { ...opts, mode: 'full' });

  return { result, incomplete, caseSzByWrin, fob, recapMd, fullMd };
}
