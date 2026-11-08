// @ts-nocheck
// The Ledger — the Operator home screen (owner request 2026-11-07/2026-11-08). Same discipline
// as Game Plan/The Patch: every number here is real or it doesn't render, and a multi-state
// operator's footprint is drawn as the real, separate regions it actually is — never one
// fabricated shape stretched across a gap that doesn't exist on the ground.
//
// Cascading-views ask, same pattern as The Patch: clicking any store here drills straight into
// that store's own real Game Plan.
import * as React from 'react';
import { operatorStores, operatorRegions, distanceBetweenRegions, operatorPeerComparison, rankNeedsAttention } from '../engine/operator-ledger.js';
import { computePatchRollup } from '../engine/patch-plan.js';
import { RollupStat, TerritoryMap, NeedsAttentionList, fmtPct, fmtDollar } from './patch-plan-view.js';
import { GamePlanFormat } from './game-plan-view.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

const STATE_LABEL = { OK: 'Oklahoma', FL: 'Florida Panhandle' };
const stateLabel = (code) => STATE_LABEL[code] || code;

function RegionCard({ region, onPick }) {
  return div({ style: { flex: '1 1 300px', minWidth: 260, background: 'var(--surf,#fffdf7)',
    border: '1px solid var(--bdr,#e4dac4)', borderRadius: 16, padding: '16px 18px' } },
    span({ style: { fontSize: 13.5, fontWeight: 700, color: 'var(--text,#2b241a)' } }, stateLabel(region.state)),
    span({ style: { fontSize: 11.5, color: 'var(--text3,#7a6f5c)', marginLeft: 8 } },
      region.storeCount + ' store' + (region.storeCount !== 1 ? 's' : '') + ' · ' + fmtPct(region.rollup.vsLYPct) + ' vs LY · Labor ' +
      (region.rollup.laborPct == null ? '—' : (region.rollup.laborPct * 100).toFixed(1) + '%')),
    div({ style: { marginTop: 10 } }, h(TerritoryMap, { points: region.mapPoints, onPick })),
  );
}

function PeerBar({ peers }) {
  if (!peers.length) return null;
  const maxPct = Math.max(1, ...peers.map(p => p.vsLYPct ?? 0));
  return div({ style: { background: 'var(--surf,#fffdf7)', border: '1px solid var(--bdr,#e4dac4)', borderRadius: 14, padding: '14px 16px' } },
    span({ style: { fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text3,#7a6f5c)' } },
      'Where you stand among the operators'),
    div({ style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 } },
      peers.map(p => div({ key: p.operator, style: { display: 'grid', gridTemplateColumns: '140px 1fr 60px', gap: 10, alignItems: 'center' } },
        span({ style: { fontSize: 12, fontWeight: p.isViewer ? 700 : 500, color: p.isViewer ? 'var(--text,#2b241a)' : 'var(--text3,#7a6f5c)' } },
          p.isViewer ? 'You' : p.operator),
        div({ style: { height: 8, borderRadius: 4, background: 'var(--bdr,#e4dac4)', position: 'relative', overflow: 'hidden' } },
          div({ style: { position: 'absolute', inset: '0 auto 0 0', width: Math.max(3, ((p.vsLYPct ?? 0) / maxPct) * 100) + '%',
            borderRadius: 4, background: p.isViewer ? 'var(--teal,#1c6b63)' : 'var(--bdr2,#cbbf9e)' } })),
        span({ style: { fontSize: 12.5, fontWeight: p.isViewer ? 700 : 500, textAlign: 'right', color: p.isViewer ? 'var(--teal,#1c6b63)' : 'var(--text,#2b241a)' } },
          fmtPct(p.vsLYPct)),
      ))),
  );
}

export function OperatorLedgerFormat({ ds, stores, items, userName, operatorGroup, onNav }) {
  const [drillLoc, setDrillLoc] = React.useState(null);
  const myStores = React.useMemo(() => operatorStores(stores, operatorGroup), [stores, operatorGroup]);
  const withData = React.useMemo(() => myStores.filter(s => s.hasData), [myStores]);
  const rollup = React.useMemo(() => computePatchRollup(withData), [withData]);
  const regions = React.useMemo(() => operatorRegions(withData), [withData]);
  const apartMi = React.useMemo(() => distanceBetweenRegions(regions), [regions]);
  const ranked = React.useMemo(() => rankNeedsAttention(withData), [withData]);
  const peers = React.useMemo(() => operatorPeerComparison(stores, operatorGroup), [stores, operatorGroup]);

  const onPick = (loc) => setDrillLoc(loc);

  if (drillLoc) {
    const store = withData.find(s => s.loc === drillLoc);
    const storeItems = (items || []).filter(it => it.storesAffected?.[0] === (store?.name || store?.loc));
    return div(null,
      h('button', { type: 'button', onClick: () => setDrillLoc(null), style: {
        background: 'none', border: '1px solid var(--bdr,#e4dac4)', borderRadius: 999, padding: '5px 12px',
        fontSize: 11, fontWeight: 600, color: 'var(--text3,#7a6f5c)', cursor: 'pointer', marginBottom: 14,
      } }, '← Back to The Ledger'),
      h(GamePlanFormat, { ds, loc: drillLoc, storeName: store?.name, items: storeItems,
        summary: { totalFlags: storeItems.length }, userName, onNav }),
    );
  }

  return div({ style: { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820, margin: '0 auto' } },
    div(null,
      div({ style: { fontSize: 17, fontWeight: 700, color: 'var(--text,#2b241a)' } }, operatorGroup || 'Your Restaurants'),
      div({ style: { fontSize: 11.5, color: 'var(--text3,#7a6f5c)', marginTop: 2 } },
        rollup.storeCount + ' restaurant' + (rollup.storeCount !== 1 ? 's' : '') +
        (regions.length > 1 ? ' · ' + regions.map(r => stateLabel(r.state)).join(' & ') : '') +
        (rollup.needsAttention ? ' · ' + rollup.needsAttention + ' need' + (rollup.needsAttention === 1 ? 's' : '') + ' you today' : ' · all clear')),
    ),
    div({ style: { display: 'flex', flexWrap: 'wrap', gap: 10 } },
      h(RollupStat, { label: 'Combined Sales', value: fmtDollar(rollup.totalSales) }),
      h(RollupStat, { label: 'vs Last Year', value: fmtPct(rollup.vsLYPct), tone: rollup.vsLYPct == null ? null : (rollup.vsLYPct >= 0 ? 'var(--good,#2f8f5b)' : 'var(--crit,#b4432c)') }),
      h(RollupStat, { label: 'Labor % (combined)', value: rollup.laborPct == null ? '—' : (rollup.laborPct * 100).toFixed(1) + '%' }),
      h(RollupStat, { label: 'OSAT', value: rollup.smgOsat == null ? '—' : rollup.smgOsat.toFixed(1) + '%' }),
    ),
    regions.length > 0 && div({ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
      span({ style: { fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text3,#7a6f5c)' } },
        regions.length > 1 ? 'Your regions, right now' : 'Your restaurants, right now'),
      div({ style: { display: 'flex', flexWrap: 'wrap', gap: 14 } },
        regions.map(r => h(RegionCard, { key: r.state, region: r, onPick }))),
      apartMi != null && div({ style: { textAlign: 'center', fontSize: 11, color: 'var(--text3,#7a6f5c)' } },
        '≈ ' + apartMi.toLocaleString('en-US') + ' mi apart (straight-line, center to center)'),
    ),
    peers.length > 1 && h(PeerBar, { peers }),
    div({ style: { background: 'var(--surf,#fffdf7)', border: '1px solid var(--bdr,#e4dac4)', borderRadius: 14, padding: '14px 16px' } },
      span({ style: { fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text3,#7a6f5c)' } }, 'Needs you today'),
      div({ style: { marginTop: 8 } }, h(NeedsAttentionList, { ranked, onPick })),
    ),
  );
}
