// @ts-nocheck
// ── KPI Registry (directory of selectable metrics) ────────────────────────────
// One catalog of the "major KPIs" a Performance Review (or One-Pager, or Signal)
// can be built from — so review-builders SELECT a metric from a dropdown instead
// of free-texting it. Selecting a KPI controls the *source* (ties to a real
// field/stream) and seeds its unit / direction / default thresholds + a plain-
// English "how it scores" explanation (Notes 30 #3). DRY: the review KPIs are
// flattened from DEFAULT_REVIEW_CONFIG (single source of truth), plus a small set
// of extra operational KPIs available for future review-building.
import { DEFAULT_REVIEW_CONFIG, CAT_LABELS } from './review-engine.js';
import { provenanceFor, provenanceText } from './metric-provenance.js';

// Extra operational KPIs (available from the metric universe) not already a review
// metric — offered in the directory for building new reviews/categories.
const EXTRA_KPIS = [
  { key: 'tpph',       label: 'TPPH (Transactions/Prod Hr)', cat: 'profit', unit: 'abs', better: 'higher', t: [0.2, -0.3, -0.6], src: 'auto', field: 'tpph',      note: 'Higher TPPH = more productive labor' },
  { key: 'cashOSPct',  label: 'Cash Over/Short %',           cat: 'profit', unit: 'abs', better: 'lower',  t: [0.0003, 0.001, 0.003], src: 'auto', field: 'cashOSPct', note: 'Loss-prevention — closer to 0 is better' },
  { key: 'tRedAPct',   label: 'T-Reds After %',              cat: 'profit', unit: 'abs', better: 'lower',  t: [0.002, 0.004, 0.006], src: 'auto', field: 'tRedAPct',  note: 'Transaction reductions after — lower is better' },
  { key: 'parkPct',    label: 'DT Park %',                   cat: 'rgr',    unit: 'abs', better: 'lower',  t: [-0.02, 0.02, 0.04], src: 'auto', field: 'park',      note: 'Lower parked % = better DT flow' },
  // Digital / delivery growth (auto from QSRSoft; add to any category via Customize).
  { key: 'digitalGCRD',  label: 'Digital App GC/R/D',        cat: 'rgr',    unit: 'abs', better: 'higher', t: [0, -3, -6], src: 'auto', field: 'digitalGCRD',  note: 'Digital App guest counts per restaurant-day (MOA + scanned offers + self-ID loyalty + internal delivery)' },
  { key: 'deliveryGCRD', label: 'Delivery GC/R/D (3PO)',     cat: 'rgr',    unit: 'abs', better: 'higher', t: [0, -3, -6], src: 'auto', field: 'deliveryGCRD', note: '3PO delivery guest counts per restaurant-day (Combined Vendors)' },
];

// Build a normalized registry entry from a review metric def or an extra KPI.
function entry(m, cat) {
  return {
    key: m.key,
    label: m.label,
    category: cat,
    categoryLabel: CAT_LABELS[cat] || cat,
    unit: m.unit || 'abs',                 // 'abs' | 'pct'
    better: m.better || 'higher',          // 'higher' | 'lower'
    defaultT: Array.isArray(m.t) ? m.t.slice() : [0, 0, 0], // [t4, t3, t2]
    src: m.src || 'manual',                // 'auto' | 'manual'
    field: m.field || null,                // metric-source key / review field
    pctInput: !!m.pctInput,
    dollar: !!m.dollar,
    tgtField: m.tgtField || null,
    note: m.note || '',
    provenance: provenanceFor(m.key),      // source lineage (Notes 33 transparency)
    inReview: cat != null && !m.__extra,   // already a default review metric?
  };
}

// The catalog: every default-review metric + the extras, de-duped by key.
export const KPI_REGISTRY = (() => {
  const out = [];
  const seen = new Set();
  for (const [cat, mets] of Object.entries(DEFAULT_REVIEW_CONFIG.metrics || {})) {
    for (const m of mets) { if (!seen.has(m.key)) { seen.add(m.key); out.push(entry(m, cat)); } }
  }
  for (const m of EXTRA_KPIS) { if (!seen.has(m.key)) { seen.add(m.key); out.push(entry({ ...m, __extra: true }, m.cat)); } }
  return out;
})();

export const kpiByKey = key => KPI_REGISTRY.find(k => k.key === key) || null;
export const kpisByCategory = () => {
  const g = {};
  for (const k of KPI_REGISTRY) (g[k.category] || (g[k.category] = [])).push(k);
  return g;
};

// Plain-English explanation of how a KPI's 1–4 rating is computed, generated from
// unit/direction/thresholds — self-documenting for whoever authors a threshold.
export function explainThreshold(kpi) {
  if (!kpi) return '';
  const [t4, t3, t2] = kpi.defaultT || [];
  const unitWord = kpi.unit === 'pct' ? '% deviation from target' : 'raw units (sec / count / $ / points)';
  const dir = kpi.better === 'higher' ? 'Higher is better' : 'Lower is better';
  const fmt = v => v == null ? '?' : (kpi.unit === 'pct' ? (v * 100).toFixed(2) + '%' : String(v));
  const cmp = kpi.better === 'higher'
    ? `4 if actual ≥ target${signed(t4, kpi)}, 3 if ≥ target${signed(t3, kpi)}, 2 if ≥ target${signed(t2, kpi)}, else 1`
    : `4 if actual ≤ target${signed(t4, kpi)}, 3 if ≤ target${signed(t3, kpi)}, 2 if ≤ target${signed(t2, kpi)}, else 1`;
  const prov = provenanceText(kpi.key);
  return `${dir}. Thresholds are in ${unitWord}. Scoring: ${cmp}. ` +
    `(T4=${fmt(t4)}, T3=${fmt(t3)}, T2=${fmt(t2)}; the metric is compared to the store's target for this KPI.)` +
    (prov ? `\n${prov}` : '');
}
function signed(v, kpi) {
  if (v == null) return '';
  const s = kpi.unit === 'pct' ? (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%' : (v >= 0 ? '+' : '') + v;
  return v === 0 ? '' : ` ${s}`;
}

// Turn a registry KPI into a fresh review metric def (for inserting into a category).
export function makeMetricFromKpi(kpi, { weight = 0.1 } = {}) {
  if (!kpi) return null;
  return {
    key: kpi.key, label: kpi.label, weight, better: kpi.better, unit: kpi.unit,
    scored: true, t: (kpi.defaultT || [0, 0, 0]).slice(), src: kpi.src,
    ...(kpi.field ? { field: kpi.field } : {}), ...(kpi.tgtField ? { tgtField: kpi.tgtField } : {}),
    ...(kpi.pctInput ? { pctInput: true } : {}), ...(kpi.dollar ? { dollar: true } : {}),
    note: kpi.note || '',
  };
}
