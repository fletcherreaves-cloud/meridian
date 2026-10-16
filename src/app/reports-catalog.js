// @ts-nocheck
// ── Reports Hub catalog (Phase 3, 2026-10-16) ─────────────────────────────────
// Single source listing every report-shaped panel in the app, grouped by category, for the
// Reports Hub's (src/views/reports-hub.js) cross-listed tiles. Owner decision (2026-10-15,
// memory/project-reports-redesign.md): CROSS-LIST, NOT RELOCATE — every panel below keeps its
// own existing nav entry and section; this catalog is a second, categorized index into them,
// not a new home. Flagged intent to relocate later is noted in that memory file; do not re-raise
// it as still open here.
//
// Two tile shapes:
//   'panel'        — a direct-launch entry: clicking it just routes straight to that panel's own
//                     existing route (goRoute(id)), since the panel already owns its own
//                     LocationSelector/date controls internally. label/icon/perm are pulled live
//                     from panel-registry.js's PANEL_BY_ID (the one source of truth for those) —
//                     only `category` and `desc` are new, catalog-only fields, so a label/perm
//                     change in panel-registry.js can never drift out of sync here.
//   'subscription' — cross-referenced from report-subscriptions.js's own REPORTS array (the
//                     existing save/pre-scope/launch mechanic 'my-reports' already proves out) —
//                     label/icon/desc/category all live there now, not duplicated a third time.
import { PANEL_BY_ID } from './panel-registry.js';
import { REPORTS as SUBSCRIBABLE_REPORTS } from '../views/report-subscriptions.js';

export const REPORT_CATEGORIES = [
  'Daily & Operations',
  'Sales & Forecasting',
  'Guest Experience',
  'Labor & Payroll',
  'Financial & Promotions',
  'Leadership & Above-Store',
  // Phase 4 (2026-10-16) -- the owner's own "under its own subtitled section of customized
  // reporting" ask. One tile (the builder itself); saved/shared definitions live inside that
  // panel, not as separate hub tiles -- same "list + build form in one screen" shape the My
  // Reports tab already uses for its own saved subscriptions.
  'Custom Reports',
];

// Direct-launch panels, each given its hub category + a one-line description (panel-registry.js
// carries neither field — both are catalog-only, scoped to this file).
const DIRECT_PANELS = [
  { id: 'report', category: 'Daily & Operations',
    desc: 'Pick any metric, date range and stores — compare across locations, export or print.' },
  { id: 'forecast-reports', category: 'Sales & Forecasting',
    desc: 'Forecast accuracy by model, plus MBI vs. LifeLenz labor accuracy.' },
  { id: 'trend-report', category: 'Sales & Forecasting',
    desc: 'Current MTD / last month / two months back, sortable by top/bottom quartile.' },
  { id: 'pay-rate-history', category: 'Labor & Payroll',
    desc: 'Every pay raise / review-cycle event with its real $ impact, per employee.' },
  { id: 'promo-roi', category: 'Financial & Promotions',
    desc: 'Matched-day promo/discount ROI against comparable non-promo days.' },
  { id: 'loss-prevention', category: 'Financial & Promotions',
    desc: 'T-Reds, cash O/S, refunds, POS-over — district loss-prevention summary.' },
  { id: 'one-pager', category: 'Leadership & Above-Store',
    desc: 'Single-store recap: sales, labor, FOB, service, controls, voice.' },
  { id: 'operator-summary', category: 'Leadership & Above-Store',
    desc: 'District/org rollup across every core KPI.' },
  { id: 'ranking', category: 'Leadership & Above-Store',
    desc: 'Leaderboards, record days, top/bottom performers.' },
  { id: 'custom-reports', category: 'Custom Reports',
    desc: 'Pick any metrics, side by side, over a date range and scope. Save and share across roles.' },
];

/** Builds the full Reports Hub catalog: direct-launch panel tiles + subscribable report tiles,
 *  grouped by category, permission-filtered. `can` is App's perm(key) helper — same single gate
 *  every other panel in the registry already goes through (panel-registry.js's canOpen). */
export function reportsCatalog(can) {
  const direct = DIRECT_PANELS
    .map(d => {
      const p = PANEL_BY_ID[d.id];
      if (!p) return null; // defensive — a renamed/retired panel id should disappear, not crash
      return { kind: 'panel', id: d.id, label: p.label, icon: p.icon, perm: p.perm, category: d.category, desc: d.desc };
    })
    .filter(Boolean)
    .filter(d => !d.perm || can(d.perm));
  // No perm filter on subscribable entries — report-subscriptions.js's REPORTS carries no perm
  // field of its own; reaching this screen at all already requires the 'my-reports' nav entry's
  // own perm ('analytics.dashboard'), same boundary every other panel's own sub-content respects.
  const subs = SUBSCRIBABLE_REPORTS.map(r => ({
    kind: 'subscription', key: r.key, label: r.label, icon: r.icon, desc: r.desc,
    category: r.category || 'Daily & Operations',
  }));
  return [...direct, ...subs];
}
