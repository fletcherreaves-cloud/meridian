// @ts-nocheck
// ── What Needs My Attention Now ───────────────────────────────────────────────
// One ranked cross-domain triage: food-cost outliers, stores behind LY, and
// data-sync health, fused by src/engine/attention-feed.js and ordered by
// severity then $ at stake. Additive + self-contained (no changes to the heavier,
// freeze-prone Needs-Attention / Priority-Brief panels). Click a row to jump to
// the panel that owns the issue. Visit-readiness + signal-decay are Phase 2 (the
// engine already supports more detectors; the panel just feeds them inputs).
import * as React from 'react';
import { STORE_NAMES, DEFAULT_TARGETS } from '../constants.js';
import { matchedVsLY } from '../engine/vs-ly.js';
import { computeVisitReadiness } from '../engine/visit-readiness.js';
import { buildAttentionFeed, SEV_META } from '../engine/attention-feed.js';
import { loadGradedVisits, loadSavedCorrelations, loadEomCountExceptions } from '../lib/supabase.js';

const h = React.createElement;
const { useMemo, useState, useEffect } = React;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const unpad = (l) => String(l || '').replace(/^0+/, '') || String(l || '');
const nm = (l) => STORE_NAMES[unpad(l)] || unpad(l);

// FOB-by-store for the latest month present in the auto qsr_fob stream (same
// Σ$ ÷ Σsales math the dashboard uses).
function fobByStoreLatest(rows) {
  const monthOf = (r) => (typeof r.date === 'string' ? r.date : (r.date && r.date.toISOString ? r.date.toISOString() : '')).slice(0, 7);
  const months = [...new Set((rows || []).map(monthOf).filter(Boolean))].sort();
  const latest = months.pop();
  if (!latest) return {};
  const acc = {};
  for (const r of rows) {
    if (monthOf(r) !== latest) continue;
    const loc = unpad(r.loc);
    const a = acc[loc] || (acc[loc] = { sales: 0, fob: 0 });
    a.sales += r.prodSalesAmt || 0;
    a.fob += (r.compWasteAmt || 0) + (r.rawWasteAmt || 0) + (r.condimentsAmt || 0) + (r.empMgrMealsAmt || 0) + (r.statVarianceAmt || 0) + (r.unexplainedAmt || 0);
  }
  for (const loc in acc) { const a = acc[loc]; a.fob$ = a.fob; a.fobPct = a.sales ? a.fob / a.sales : null; }
  return acc;
}

const NAV_MODAL = { fob: 'fob-analysis', signals: 'signals', analytics: 'eom-dashboard' };

export function WhatNeedsAttentionPanel({ ds, stores, dateRange, onOpenModal, onClose }) {
  const allLocs = useMemo(() => (stores || []).filter(s => /^\d+$/.test(s.loc)).map(s => s.loc), [stores]);

  // Phase-2 inputs load async (graded visits → readiness; saved correlations → decay; EOM exceptions).
  const [gradedVisits, setGradedVisits] = useState(ds?.gradedVisits || null);
  const [savedCorr, setSavedCorr] = useState(null);
  const [exceptions, setExceptions] = useState(null);   // eom_count_exceptions for the current period → Integrity
  useEffect(() => {
    let live = true;
    if (!ds?.gradedVisits) loadGradedVisits().then(v => { if (live) setGradedVisits(v || []); }).catch(() => { if (live) setGradedVisits([]); });
    loadSavedCorrelations().then(c => { if (live) setSavedCorr(c || []); }).catch(() => { if (live) setSavedCorr([]); });
    const period = new Date().toISOString().slice(0, 7);
    loadEomCountExceptions({ period }).then(m => { if (live) setExceptions(m || {}); }).catch(() => { if (live) setExceptions({}); });
    return () => { live = false; };
  }, [ds]);

  const visitStores = useMemo(() => {
    if (!gradedVisits) return [];
    try { return computeVisitReadiness({ ...ds, gradedVisits }); } catch { return []; }
  }, [ds, gradedVisits]);

  const feed = useMemo(() => {
    // Freshest business date across the auto streams → data age in days.
    const tMs = Date.now();
    const pick = (arr) => (arr || []).map(r => r.date).filter(Boolean)
      .map(d => d instanceof Date ? d.getTime() : new Date(d).getTime())
      .filter(ms => !Number.isNaN(ms) && ms <= tMs);
    const fresh = [...pick(ds?.laborRows), ...pick(ds?.qsrActSummaryRows), ...pick(ds?.qsrFobRows), ...pick(ds?.glimpseRows), ...pick(ds?.salesLedgerRows)];
    const ageDays = fresh.length ? Math.floor((tMs - Math.max(...fresh)) / 864e5) : null;

    const fobByStore = fobByStoreLatest(ds?.qsrFobRows || []);
    const salesLY = allLocs.map(loc => { const m = matchedVsLY(ds, [loc], dateRange); return { loc, cur: m.cur, ly: m.ly }; })
      .filter(r => r.ly > 0);

    const countExceptionRows = Object.entries(exceptions || {}).map(([loc, e]) => ({ loc, acceptedDate: e.acceptedDate, approvedBy: e.approvedBy }));
    return buildAttentionFeed({ fobByStore, targetsByLoc: DEFAULT_TARGETS, salesLY, ageDays, visitStores, savedCorrelations: savedCorr || [], countExceptionRows, storeName: nm, max: 20 });
  }, [ds, allLocs, dateRange, visitStores, savedCorr, exceptions]);

  const counts = feed.reduce((a, i) => { a[i.severity] = (a[i.severity] || 0) + 1; return a; }, {});
  const go = (item) => {
    const modal = NAV_MODAL[item.nav];
    onClose && onClose();
    if (modal && onOpenModal) onOpenModal(modal);
  };

  return div({
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 320, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' },
    onClick: onClose,
  },
    div({
      onClick: e => e.stopPropagation(),
      style: { width: '100%', maxWidth: 720, background: 'var(--surf)', borderRadius: 'var(--rl, 12px)', border: '.5px solid var(--bdr)', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.6)' },
    },
      // header
      div({ style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '.5px solid var(--bdr)', background: 'var(--surf2)' } },
        div(null,
          div({ style: { fontSize: '15px', fontWeight: 800, color: 'var(--text)' } }, '🎯 What Needs My Attention Now'),
          div({ style: { fontSize: '10px', color: 'var(--text3)', marginTop: 2 } },
            `${counts.crit || 0} critical · ${counts.warn || 0} watch · ${counts.info || 0} FYI · ranked by severity then $ at stake`)),
        h('button', { onClick: onClose, style: { background: 'none', border: '1px solid var(--bdr2)', borderRadius: 6, color: 'var(--text3)', padding: '5px 10px', cursor: 'pointer', fontSize: 12 } }, '✕ Close')),

      // body
      feed.length === 0
        ? div({ style: { padding: '48px 20px', textAlign: 'center', color: 'var(--text3)' } },
            div({ style: { fontSize: 30, marginBottom: 10 } }, '✅'),
            div({ style: { fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 } }, 'Nothing needs your attention right now'),
            div({ style: { fontSize: 11 } }, 'No food-cost outliers, no stores behind last year, sync is current.'))
        : div({ style: { padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' } },
            feed.map((item) => {
              const sev = SEV_META[item.severity] || SEV_META.info;
              return h('button', {
                key: item.id, onClick: () => go(item),
                style: { display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left', width: '100%', padding: '9px 12px', borderRadius: 8, cursor: 'pointer', background: 'var(--surf2)', border: `1px solid var(--bdr)`, borderLeft: `3px solid ${sev.color}` },
              },
                span({ style: { fontSize: 16, flexShrink: 0 } }, item.icon),
                div({ style: { flex: 1, minWidth: 0 } },
                  div({ style: { fontSize: '12.5px', fontWeight: 600, color: 'var(--text)' } }, item.title),
                  div({ style: { fontSize: '11px', color: 'var(--text3)', marginTop: 1 } }, item.detail)),
                span({ style: { fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: sev.color, padding: '2px 6px', borderRadius: 4, border: `1px solid ${sev.color}`, flexShrink: 0 } }, sev.word),
                span({ style: { fontSize: '10px', color: 'var(--text3)', flexShrink: 0 } }, '→'));
            })),

      div({ style: { padding: '8px 20px', borderTop: '.5px solid var(--bdr)', fontSize: '9.5px', color: 'var(--text3)', fontStyle: 'italic' } },
        'Fuses food-cost outliers · behind-LY · sync health · visit-readiness & food-safety risk · fading saved signals.')));
}
