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

import { runDiagnosis, formatDiagnosisReport, DEFAULT_CHECKS, fobComponentDeltas } from './eom-diagnosis.js';
import { diagnoseIncompleteCount } from './eom-inventory.js';

const num = v => (v == null || v === '' ? null : Number(v));
const toDate = v => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v);
  return new Date(/T/.test(s) ? s : s.slice(0, 10) + 'T00:00:00');
};

// Shape on-hand rows (snake or camel) into the runDiagnosis / count shape.
// active + updatedAt (2026-08-31, dispatch: Ada's Fried Apple Pie [00076-126] reconciliation) --
// this was dropping both fields, the SAME bug v5.283 fixed in qsrsoft-onhand-pull.mjs's
// toEngineRows() for the emailed-digest/notification-resend paths. This function is the single
// shared builder the Share view calls (eom-share-view.js) -- without these two fields,
// diagnoseIncompleteCount()'s droppedFromCurrentPull() signal can never fire here even after
// the edge function (supabase/functions/eom-share/index.ts) forwards them, because this is the
// last stop before diagnoseIncompleteCount() runs. The in-app EOM Dashboard doesn't go through
// this function (it calls diagnoseIncompleteCount() directly on the browser loader's rows, which
// already carry both fields) -- that's why the bug only showed up in the share-link report.
function shapeOnHand(rows) {
  return (rows || []).map(r => ({
    wrin: r.wrin, cls: r.cls, descr: r.descr,
    onHandAmt: r.on_hand_amt ?? r.onHandAmt ?? null,
    totalUnits: r.total_units ?? r.totalUnits ?? null,
    lastCounted: toDate(r.last_counted ?? r.lastCounted),
    lastSubmitted: toDate(r.last_submitted ?? r.lastSubmitted),
    active: r.active ?? null,
    updatedAt: r.updated_at ?? r.updatedAt ?? null,
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
  // NOT checksConfig() — that returns the check registry stripped down to its serializable config
  // shape (id/label/order/enabled/params, no `run`), for saving/displaying an editable check list.
  // Passed straight to runDiagnosis() as `checks`, a `run`-less object makes every check silently
  // error (caught, logged as `ran:[{..., error}]`) and produce zero findings — found while verifying
  // dispatch #176's fix: it would otherwise have kept masking fob-components (and every other check)
  // for every buildEomReport() caller, none of which currently pass an explicit `checks` override.
  const activeChecks = checks || DEFAULT_CHECKS;

  const result = runDiagnosis({
    store: loc, storeName: name, period, asOf, checks: activeChecks,
    data: {
      fob: c.sales ? { sales: c.sales, compWaste: c.comp, rawWaste: c.raw, condiments: c.cond, empMgrMeals: c.emp, statVariance: c.statv, unexplained: c.unex } : null,
      onHand: shaped,
      variance: variance || [], waste: waste || [], transfers: transfers || [],
      unmatchedTransfers: unmatchedTransfers || [], selfServeTower: !!selfServeTower, rawItems: rawItems || [],
      targets: targets || {}, // dispatch #176: was omitted, so ctx.data.targets was always {} — fob-components check never fired
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
