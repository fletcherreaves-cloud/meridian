// @ts-nocheck
// ── Spot-Check Ruler report (owner request, 2026-11-17: "That's the Spot-Check Ruler — Thank
// you, can we add that to reports?") ────────────────────────────────────────────────────────────
// The worksheet itself (SpotCheckRulerModal, spot-check-ruler-view.js, task #129) is already
// fully built — 7 post-count self-audit questions, weekly or EOM — but it's single-store /
// single-count-date scoped and today only opens REACTIVELY, from two places: Count Cycle's own
// "📋 Follow-Up" button on a store that JUST logged a qualifying count (count-cycle-panel.js),
// and Curated Home's banner for that same "just logged" window (curated-home.js). Neither lets
// someone open ANY store's most recent qualifying count on demand. This report is that on-demand
// entry point — pick a store, see its current lastWeekly/daysSinceWeekly (the SAME
// cycleCompliance() resolution those two reactive entry points already use, not a new compliance
// engine), open the worksheet.
import * as React from 'react';
import { RoutePanelShell } from '../components/ModalShell.js';
import { LocationSelector } from '../components/PanelControls.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { cycleCompliance, diffNewWrins } from '../engine/count-cycle.js';
import { defaultPeriod, lastPeriods } from './eom-dashboard.js';
import { loadQsrOnHand } from '../lib/supabase.js';
import { SpotCheckRulerModal } from './spot-check-ruler-view.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);

const _allStores = Object.keys(STORE_NAMES).map(l => ({ loc: l }));

export function SpotCheckRulerReportPanel({ stores, onClose }) {
  const { useState, useEffect } = React;
  const [loc, setLoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [compByLoc, setCompByLoc] = useState({});
  const [openRuler, setOpenRuler] = useState(false);

  // Loaded once a store is picked, not up front for all 27 -- qsr_onhand is a wide table and
  // every OTHER entry point into this same compliance math (Count Cycle, Curated Home) already
  // scopes its own load the same way, not a standing full-district pull.
  useEffect(() => {
    if (!loc) { setCompByLoc({}); setOpenRuler(false); return; }
    let cancelled = false;
    setLoading(true);
    const period = defaultPeriod();
    const prevPeriod = lastPeriods(period, 2)[0];
    Promise.all([
      loadQsrOnHand({ period }).catch(() => []),
      loadQsrOnHand({ period: prevPeriod }).catch(() => []),
    ]).then(([oh, poh]) => {
      if (cancelled) return;
      const newWrinsByLoc = diffNewWrins(oh, poh);
      const byLoc = {};
      for (const c of cycleCompliance(oh, { newWrinsByLoc })) byLoc[c.loc] = c;
      setCompByLoc(byLoc);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loc]);

  const comp = loc ? compByLoc[loc] : null;
  const storeName = loc ? (sNameC(loc) || loc) : '';
  const treeStores = (stores && stores.length) ? stores : _allStores;

  return h(RoutePanelShell, {
    title: 'Spot-Check Ruler', icon: '📋', onBack: onClose,
    subtitle: "Open a store's most recent qualifying count and run the 7-question follow-up worksheet on demand",
  },
    div({ style: { fontSize: '10.5px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: 14, padding: '8px 10px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
      'Pick a store below. If it has a full weekly or EOM count on file for the current period, you can open the same ' +
      '7-question follow-up worksheet that already prompts automatically right after a fresh count — on demand, any ' +
      'time, not just in the moment it happened.'),
    h(LocationSelector, {
      stores: treeStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, mode: 'store', variant: 'dropdown',
      value: loc ? { level: 'store', id: loc } : { level: 'all', id: null },
      onChange: v => setLoc(v.id || null),
    }),
    !loc
      ? div({ style: { padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 11 } }, 'Choose a store to continue.')
      : loading
        ? div({ style: { padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 11 } }, 'Loading…')
        : !comp || !comp.lastWeekly
          ? div({ style: { padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 11 } }, `No qualifying weekly or EOM count on file for ${storeName} this period.`)
          : div({ style: { marginTop: 14, padding: '12px 14px', border: '.5px solid var(--bdr)', borderRadius: 8, background: 'var(--surf)' } },
              div({ style: { fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 4 } },
                `${storeName} — last full ${comp.lastWeekly.isEom ? 'EOM' : 'weekly'} count`),
              div({ style: { fontSize: 11, color: 'var(--text2)', marginBottom: 10 } },
                `${comp.lastWeekly.date} · ${comp.daysSinceWeekly}d ago`),
              h('button', { className: 'btn btn-primary btn-sm', onClick: () => setOpenRuler(true) }, '📋 Open Follow-Up'),
            ),
    openRuler ? h(SpotCheckRulerModal, {
      loc, storeName, periodType: comp.lastWeekly.isEom ? 'eom' : 'weekly', countDate: comp.lastWeekly.date,
      onClose: () => setOpenRuler(false),
    }) : null,
  );
}
