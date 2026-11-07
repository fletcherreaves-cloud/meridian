// @ts-nocheck
// The Patch — the new front-facing DO/OM/Area Supervisor home screen (owner request
// 2026-11-07, following "Four Decks" + "go ahead and build The Patch next"). Same discipline as
// Game Plan (src/views/game-plan-view.js): every number here is real or it doesn't render, and
// nothing is a fabricated territory shape -- the map uses real INV_ORG_COORDS lat/lng.
//
// Cascading-views ask ("allow cascading roles to see views at or below their level through use
// of tabs or toggles"): clicking any store here drills straight into that store's OWN real Game
// Plan (the exact GamePlanFormat component a GM would see), not a simplified summary of it --
// one real drill-down per tier, composable (Bridge will embed The Patch the same way later).
import * as React from 'react';
import { withAlpha } from '../utils/fmt.js';
import { computePatchRollup, computePatchMap, rankNeedsAttention } from '../engine/patch-plan.js';
import { GamePlanFormat } from './game-plan-view.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

const SEV_DOT = { RED: 'var(--crit,#f43f5e)', AMBER: 'var(--amber,#f59e0b)', GREEN: 'var(--good,#10b981)' };

function fmtPct(v, digits = 1) { return v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(digits) + '%'; }
function fmtDollar(v) { return v == null ? '—' : '$' + Math.round(v).toLocaleString('en-US'); }

function RollupStat({ label, value, tone }) {
  return div({ style: { flex: '1 1 110px', minWidth: 100, background: 'var(--surf,#fffdf7)',
    border: '1px solid var(--bdr,#e4dac4)', borderRadius: 14, padding: '11px 14px' } },
    div({ style: { fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text3,#7a6f5c)' } }, label),
    div({ style: { fontSize: 19, fontWeight: 700, marginTop: 3, color: tone || 'var(--text,#2b241a)' } }, value),
  );
}

function TerritoryMap({ points, onPick }) {
  if (!points.length) {
    return div({ style: { fontSize: 12.5, color: 'var(--text3,#7a6f5c)', padding: '20px 0', textAlign: 'center' } },
      'No store coordinates available for this patch.');
  }
  const pad = 14;
  return h('svg', { viewBox: '0 0 100 62', style: { width: '100%', height: 'auto', display: 'block' } },
    points.map(p => h('g', {
      key: p.loc, style: { cursor: 'pointer' }, onClick: () => onPick(p.loc),
    },
      h('circle', {
        cx: pad + p.x * (100 - 2 * pad), cy: pad * 0.6 + p.y * (62 - 1.2 * pad),
        r: 6.5, fill: SEV_DOT[p.severity] || 'var(--bdr,#e4dac4)', stroke: 'var(--surf,#fffdf7)', strokeWidth: 1.2,
      }),
      h('text', {
        x: pad + p.x * (100 - 2 * pad), y: pad * 0.6 + p.y * (62 - 1.2 * pad) + 2.6,
        fontSize: 4.2, textAnchor: 'middle', fill: '#fff', fontWeight: 700,
      }, (p.name || p.loc).slice(0, 2).toUpperCase()),
    )),
  );
}

function NeedsAttentionList({ ranked, onPick }) {
  if (!ranked.length) {
    return div({ style: { fontSize: 12.5, color: 'var(--good,#10b981)', fontWeight: 600, padding: '8px 0' } },
      'Every store in your patch is clean right now.');
  }
  return div({ style: { display: 'flex', flexDirection: 'column', gap: 2 } },
    ranked.map(r => div({ key: r.loc, onClick: () => onPick(r.loc), style: {
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 2px', cursor: 'pointer', borderBottom: '1px solid var(--bdr,#e4dac4)',
    } },
      span({ style: { flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: SEV_DOT[r.severity] } }),
      div({ style: { flex: 1, minWidth: 0 } },
        div({ style: { fontWeight: 600, fontSize: 13, color: 'var(--text,#2b241a)' } }, r.name),
        div({ style: { fontSize: 11.5, color: 'var(--text3,#7a6f5c)' } }, (r.why || 'Flagged') + (r.moreCount ? ` (+${r.moreCount} more)` : '')),
      ),
      span({ style: { flexShrink: 0, fontSize: 11, fontWeight: 600, color: 'var(--teal,#1c6b63)' } }, 'Open →'),
    )),
  );
}

export function PatchPlanFormat({ ds, stores, items, userName, onNav }) {
  const [drillLoc, setDrillLoc] = React.useState(null);
  const withData = React.useMemo(() => (stores || []).filter(s => s.hasData), [stores]);
  const rollup = React.useMemo(() => computePatchRollup(withData), [withData]);
  const mapPoints = React.useMemo(() => computePatchMap(withData), [withData]);
  const ranked = React.useMemo(() => rankNeedsAttention(withData), [withData]);

  if (drillLoc) {
    const store = withData.find(s => s.loc === drillLoc);
    const storeItems = (items || []).filter(it => it.storesAffected?.[0] === (store?.name || store?.loc));
    return div(null,
      h('button', { type: 'button', onClick: () => setDrillLoc(null), style: {
        background: 'none', border: '1px solid var(--bdr,#e4dac4)', borderRadius: 999, padding: '5px 12px',
        fontSize: 11, fontWeight: 600, color: 'var(--text3,#7a6f5c)', cursor: 'pointer', marginBottom: 14,
      } }, '← Back to The Patch'),
      h(GamePlanFormat, { ds, loc: drillLoc, storeName: store?.name, items: storeItems,
        summary: { totalFlags: storeItems.length }, userName, onNav }),
    );
  }

  return div({ style: { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760, margin: '0 auto' } },
    div(null,
      div({ style: { fontSize: 17, fontWeight: 700, color: 'var(--text,#2b241a)' } }, 'Your Patch' + (userName ? ' · ' + userName : '')),
      div({ style: { fontSize: 11.5, color: 'var(--text3,#7a6f5c)', marginTop: 2 } },
        rollup.storeCount + ' store' + (rollup.storeCount !== 1 ? 's' : '') + (rollup.needsAttention ? ' · ' + rollup.needsAttention + ' need' + (rollup.needsAttention === 1 ? 's' : '') + ' you today' : ' · all clear')),
    ),
    div({ style: { display: 'flex', flexWrap: 'wrap', gap: 10 } },
      h(RollupStat, { label: 'Patch Sales', value: fmtDollar(rollup.totalSales) }),
      h(RollupStat, { label: 'vs Last Year', value: fmtPct(rollup.vsLYPct), tone: rollup.vsLYPct == null ? null : (rollup.vsLYPct >= 0 ? 'var(--good,#2f8f5b)' : 'var(--crit,#b4432c)') }),
      h(RollupStat, { label: 'Labor %', value: rollup.laborPct == null ? '—' : (rollup.laborPct * 100).toFixed(1) + '%' }),
      h(RollupStat, { label: 'OSAT', value: rollup.smgOsat == null ? '—' : rollup.smgOsat.toFixed(1) + '%' }),
    ),
    div({ style: { background: 'var(--surf,#fffdf7)', border: '1px solid var(--bdr,#e4dac4)', borderRadius: 16, padding: '16px 18px' } },
      span({ style: { fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text3,#7a6f5c)' } }, 'Your patch, right now'),
      div({ style: { marginTop: 10 } }, h(TerritoryMap, { points: mapPoints, onPick: setDrillLoc })),
    ),
    div({ style: { background: 'var(--surf,#fffdf7)', border: '1px solid var(--bdr,#e4dac4)', borderRadius: 14, padding: '14px 16px' } },
      span({ style: { fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text3,#7a6f5c)' } }, 'Needs you today'),
      div({ style: { marginTop: 8 } }, h(NeedsAttentionList, { ranked, onPick: setDrillLoc })),
    ),
  );
}
