// @ts-nocheck
// ── Structured metadata for buildBrief's findings ────────────────────────────
// buildBrief emits findings as `{t, m}` — a severity tag plus one long prose sentence.
// That shape carries no rule id, no category, no dollar amount and no store, so every
// consumer that needed those had to recover them by reading the prose:
//
//   · analytics.js  string-sniffed `f.m` for 'CASH' / 'T-Red' / 'OVERTIME' / 'OEPE' …
//                   to bucket district issue counts
//   · store-analytics.js  matched `f.m.startsWith('TREND ALERT')` to find the two
//                   predictive alerts
//   · analytics.js  split `f.m` on an en-dash to separate title from detail — while
//                   buildBrief emits an em-dash, so the split never actually fired
//
// This attaches the real fields instead. It is deliberately ADDITIVE: `t` and `m` are
// left exactly as they were, so all ~25 existing consumers keep working untouched.
// New consumers read the structured fields.
//
// Field names mirror src/engine/attention-feed.js's item shape (`severity`, `category`,
// `dollars`, `loc`, `icon`) so both systems can share one ranker.
//
// `dollars` is DOLLARS AT STAKE PER DAY, the same basis attention-feed uses — not a
// total, not a projection. Rules with no honest dollar figure return 0 rather than a
// guess, because this value orders what the owner sees first.

// t (buildBrief's vocabulary) → severity (attention-feed's vocabulary)
export const T_TO_SEVERITY = { crit: 'crit', watch: 'warn', ok: 'info', fc: 'info' };

// Daily sales base. p.weeklySales/7 is the honest one: pSales/28 under-counts because
// it only sums matched days.
const daily = (p) => (p.weeklySales || 0) / 7;
const pos = (n) => (Number.isFinite(n) && n > 0 ? n : 0);

export const FINDING_RULES = {
  // ── Controls / integrity ──
  cashOS:      { category: 'Controls',   icon: '💵', dollars: (p, t) => Math.abs(p.cashOSPct || 0) * daily(p) },
  tRedAfter:   { category: 'Controls',   icon: '🧾', dollars: (p, t) => pos((p.tRedAPct || 0) - (t.tRedAPct || 0)) * daily(p) },
  pettyCash:   { category: 'Controls',   icon: '💵', dollars: () => 0 },   // amount isn't averaged onto p — see notes
  deposit:     { category: 'Controls',   icon: '🏦', dollars: (p) => {
                   // p.depositBaseline is a preformatted string like '20.00%'.
                   const base = parseFloat(String(p.depositBaseline || '')) / 100;
                   return base > 0 ? pos(base - (p.depositVsSalesRatio || 0)) * daily(p) : 0;
                 } },
  compound:    { category: 'Integrity',  icon: '🔍', dollars: (p, t) => pos((p.tRedAPct || 0) - (t.tRedAPct || 0.003)) * daily(p) },
  r2p:         { category: 'Integrity',  icon: '🔍', dollars: () => 0 },   // no dollar basis tied to R2P
  posOver:     { category: 'Controls',   icon: '🧾', dollars: () => 0 },   // count only, no per-overring amount
  discounts:   { category: 'Controls',   icon: '🏷', dollars: (p) => pos((p.discPct || 0) - 0.065) * daily(p) },

  // ── Labor ──
  overtime:    { category: 'Labor',      icon: '⏱',  dollars: (p) => (p.otHrs || 0) * 1.5 * (p.avgRate || 12) },
  labor:       { category: 'Labor',      icon: '👥', dollars: (p, t) => pos((p.laborPct || 0) - (t.tLabor || 0)) * daily(p) },
  tpph:        { category: 'Labor',      icon: '👥', dollars: (p, t) =>
                   (t.tTpph > 0 && p.tpph > 0) ? pos((p.actHrs || 0) * (1 - p.tpph / t.tTpph)) * (p.avgRate || 12) : 0 },
  laborTrend:  { category: 'Labor',      icon: '📈', dollars: () => 0 },   // projection, not a current loss

  // ── Speed ──
  oepe:        { category: 'Speed',      icon: '🚗', dollars: (p, t) =>
                   // same abandoned-cars proxy the message quotes, priced at avg check
                   (t.tOepe > 0 && p.oepe > t.tOepe) ? ((p.oepe - t.tOepe) / 30 * 4) * (p.avgCheck || 0) : 0 },
  oepeOk:      { category: 'Speed',      icon: '🚗', dollars: () => 0 },
  r2pDineIn:   { category: 'Speed',      icon: '🍽', dollars: () => 0 },
  parking:     { category: 'Speed',      icon: '🅿️', dollars: () => 0 },   // no guest count on p to price it
  oepeRecord:  { category: 'Speed',      icon: '🏆', dollars: () => 0 },   // an opportunity, not a loss
  oepeTrend:   { category: 'Speed',      icon: '📈', dollars: () => 0 },   // projection, not a current loss

  // ── Scheduling ──
  floorCrit:   { category: 'Scheduling', icon: '🗓', dollars: (p) => pos((p.floorMgmtNeeded || 0) - (p.floorHrsSched || 0)) * (p.avgRate || 12) },
  floorWatch:  { category: 'Scheduling', icon: '🗓', dollars: (p) => pos((p.floorMgmtNeeded || 0) - (p.floorHrsSched || 0)) * (p.avgRate || 12) },
  floorOk:     { category: 'Scheduling', icon: '🗓', dollars: () => 0 },

  // ── Positive / informational ──
  ctrlElite:   { category: 'Strength',   icon: '✅', dollars: () => 0 },
  ctrlStrong:  { category: 'Strength',   icon: '✅', dollars: () => 0 },
  opsElite:    { category: 'Strength',   icon: '✅', dollars: () => 0 },
  opsStrong:   { category: 'Strength',   icon: '✅', dollars: () => 0 },
  allClear:    { category: 'Strength',   icon: '✅', dollars: () => 0 },
  salesRecord: { category: 'Sales',      icon: '🏆', dollars: () => 0 },
  forecast:    { category: 'Forecast',   icon: '🔮', dollars: () => 0 },
};

// buildBrief writes the prose as "PREFIX — body". Splitting there gives a usable title
// and detail. (analytics.js:5114 tries this already but splits on an EN-dash while
// buildBrief emits an EM-dash, so it has always been a no-op.)
const EM_DASH = '—';
export function splitFindingText(m) {
  const s = String(m || '');
  const i = s.indexOf(EM_DASH);
  if (i < 0) {
    // No prefix — use the first sentence as the title.
    const dot = s.indexOf('. ');
    return dot > 0 ? { title: s.slice(0, dot + 1).trim(), detail: s.slice(dot + 1).trim() } : { title: s, detail: '' };
  }
  const head = s.slice(0, i).trim();                 // 'CRITICAL', 'WATCH', 'TREND ALERT'…
  const rest = s.slice(i + 1).trim();                // 'CASH INTEGRITY: Cash Over/Short…'
  const colon = rest.indexOf(':');
  return colon > 0
    ? { title: `${head} — ${rest.slice(0, colon).trim()}`, detail: rest.slice(colon + 1).trim() }
    : { title: head, detail: rest };
}

/**
 * Attach structured fields to findings in place. `t` and `m` are never modified.
 * Findings without a known `rule` (e.g. the synthetic forecast-accuracy watch that
 * analytics.js injects) still get severity/title/detail, just no category or dollars.
 */
export function attachFindingMeta(findings, p = {}, t = {}, loc = null) {
  for (const f of (findings || [])) {
    if (!f || f.severity) continue;                  // already attached — don't double-apply
    const meta = FINDING_RULES[f.rule];
    const { title, detail } = splitFindingText(f.m);
    f.severity = T_TO_SEVERITY[f.t] || 'info';
    f.title = title;
    f.detail = f.detail || detail;                   // never clobber an explicit detail
    if (loc != null) f.loc = f.loc != null ? f.loc : loc;
    f.category = meta ? meta.category : (f.category || 'Other');
    f.icon = meta ? meta.icon : (f.icon || '•');
    let d = 0;
    if (meta) { try { d = meta.dollars(p, t) || 0; } catch { d = 0; } }
    f.dollars = Number.isFinite(d) ? d : 0;
  }
  return findings;
}
