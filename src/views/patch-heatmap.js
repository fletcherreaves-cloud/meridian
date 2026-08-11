// @ts-nocheck
// ── Patch Heatmap (#201) ────────────────────────────────────────────────────────
// All 27 stores as a colored status grid at the top of At A Glance — "which store needs
// me today?" answered spatially instead of by reading a tile strip and a list.
//
// Color = Needs Attention severity (engine/attention-feed.js's groupAttentionByStore),
// the SAME engine AttentionPanel (analytics.js) already uses — per the issue's own
// instruction ("use what already exists — do NOT invent a new score"), this is that
// existing per-store rollup rendered as a grid, not a new composite. Answers the issue's
// own open question ("needs me right now, or how is this store doing overall?") as
// "needs me right now" — the issue names Needs Attention severity as the strongest
// candidate for exactly that reading; Ops Score / tracking-to-plan are the "overall
// health" and "today's pace" readings respectively and are deliberately NOT blended in.
//
// No charting library (CSS grid + colored cells), no animation (owner: "declined —
// draws the eye to what is live rather than what is important"), colorblind-safe (color
// is paired with a glyph AND a count, never color alone), and a store with no data is
// shown as a distinct "unknown" state, never green — the exact failure the FOB Report
// false all-clear shipped a fix for two commits ago in this same session (v4.976).
import * as React from 'react';
import { STORE_NAMES, sNameC, INV_ORG_COORDS } from '../constants.js';
import { useAttentionFeed, unpad } from './attention-now.js';
import { groupAttentionByStore, SEV_META } from '../engine/attention-feed.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

const CLEAN_COLOR = '#34d399';     // established "good" green (session.js/projections.js/AuthGate.js)
const UNKNOWN_COLOR = 'var(--text3)';

function cellStatus(bucket, store) {
  if (bucket && bucket.crits.length) return { key: 'crit', n: bucket.crits.length, glyph: '!', color: SEV_META.crit.color, worst: bucket.worst };
  if (bucket && bucket.warns.length) return { key: 'warn', n: bucket.warns.length, glyph: '•', color: SEV_META.warn.color, worst: bucket.worst };
  if (store && store.hasData === false) return { key: 'unknown', n: null, glyph: '?', color: UNKNOWN_COLOR, worst: null };
  return { key: 'clean', n: null, glyph: '✓', color: CLEAN_COLOR, worst: null };
}

export function PatchHeatmap({ ds, stores, dateRange, onOpenStore }) {
  const { useMemo, useState } = React;
  const [selected, setSelected] = useState(null); // loc of the expanded detail cell

  // Effectively-unbounded max, same reasoning as AttentionPanel: a flat top-N cap would
  // silently drop whole stores from a store-grouped view.
  const feed = useAttentionFeed({ ds, stores, dateRange, max: Infinity });

  const storesByLoc = useMemo(() => {
    const m = new Map();
    for (const s of (stores || [])) m.set(unpad(s.loc), s);
    return m;
  }, [stores]);

  const grouped = useMemo(() => groupAttentionByStore(feed, storesByLoc, unpad), [feed, storesByLoc]);
  const bucketByLoc = useMemo(() => { const m = new Map(); for (const g of grouped) m.set(unpad(g.store.loc), g); return m; }, [grouped]);

  const cells = useMemo(() => {
    const all = (stores || []).filter(s => /^\d+$/.test(String(s.loc)));
    return all.map(store => {
      const loc = unpad(store.loc);
      const status = cellStatus(bucketByLoc.get(loc), store);
      const state = (INV_ORG_COORDS[loc] || {}).state || 'OK';
      return { loc, store, state, status };
    }).sort((a, b) => a.state !== b.state ? a.state.localeCompare(b.state) : sNameC(a.loc).localeCompare(sNameC(b.loc)));
  }, [stores, bucketByLoc]);

  if (!cells.length) return null;

  const selectedCell = selected ? cells.find(c => c.loc === selected) : null;

  const countsByStatus = cells.reduce((acc, c) => { acc[c.status.key] = (acc[c.status.key] || 0) + 1; return acc; }, {});

  return div({ style: { background: 'var(--surf)', borderBottom: '.5px solid var(--bdr)', padding: '10px 24px 12px', flexShrink: 0 } },
    div({ style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' } },
      span({ style: { fontSize: '11px', fontWeight: 800, color: 'var(--text)' } }, '🗺 Patch Heatmap'),
      span({ style: { fontSize: '8.5px', color: 'var(--text3)' } }, 'colored by Needs Attention · click a store for why'),
      div({ style: { display: 'flex', gap: 8, marginLeft: 'auto', fontSize: '8.5px', color: 'var(--text3)' } },
        countsByStatus.crit ? span({ style: { color: SEV_META.crit.color } }, '! ' + countsByStatus.crit + ' critical') : null,
        countsByStatus.warn ? span({ style: { color: SEV_META.warn.color } }, '• ' + countsByStatus.warn + ' watch') : null,
        span({ style: { color: CLEAN_COLOR } }, '✓ ' + (countsByStatus.clean || 0) + ' clean'),
        countsByStatus.unknown ? span({ style: { color: UNKNOWN_COLOR } }, '? ' + countsByStatus.unknown + ' unknown') : null,
      )
    ),
    div({ style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 5 } },
      ...cells.map(c => div({
        key: c.loc,
        onClick: () => setSelected(sel => sel === c.loc ? null : c.loc),
        title: c.status.worst ? c.status.worst.title : (c.status.key === 'unknown' ? 'No data this period' : 'No open findings'),
        style: {
          cursor: 'pointer', borderRadius: 5, padding: '6px 7px', fontSize: '9.5px',
          background: c.status.key === 'clean' ? 'rgba(52,211,153,.08)' : c.status.key === 'unknown' ? 'rgba(148,163,184,.06)' : c.status.color + '18',
          border: '1px solid ' + (selected === c.loc ? c.status.color : c.status.color + '35'),
          display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
        },
      },
        div({ style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 } },
          span({ style: { color: c.status.color, fontWeight: 800, fontSize: '10px' } }, c.status.glyph),
          c.status.n != null ? span({ style: { color: c.status.color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' } }, c.status.n) : null,
        ),
        span({ style: { color: 'var(--text2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          sNameC(c.loc).split(',')[0].trim())
      ))
    ),
    selectedCell && div({ style: {
      marginTop: 8, padding: '8px 10px', borderRadius: 6, background: 'var(--surf2)',
      border: '.5px solid ' + selectedCell.status.color + '40', fontSize: '10px',
    } },
      div({ style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
        span({ style: { fontWeight: 800, color: 'var(--text)' } }, sNameC(selectedCell.loc)),
        span({ style: { color: selectedCell.status.color, fontSize: '9px', fontWeight: 700 } },
          selectedCell.status.key === 'crit' ? 'Critical' : selectedCell.status.key === 'warn' ? 'Watch' : selectedCell.status.key === 'unknown' ? 'No data' : 'Clean'),
        h('button', {
          onClick: () => onOpenStore && onOpenStore(selectedCell.loc),
          style: { marginLeft: 'auto', fontSize: '9px', padding: '2px 8px', borderRadius: 4, background: 'transparent', color: 'var(--amber)', border: '.5px solid rgba(245,188,0,.4)', cursor: 'pointer' },
        }, 'Open store →'),
      ),
      (() => {
        const b = bucketByLoc.get(selectedCell.loc);
        const items = b ? [...b.crits, ...b.warns] : [];
        if (!items.length) return div({ style: { color: 'var(--text3)' } },
          selectedCell.status.key === 'unknown' ? 'No auto/emailed data landed for this store in the selected period.' : 'No open Needs Attention findings for this store right now.');
        return div({ style: { display: 'flex', flexDirection: 'column', gap: 3 } },
          ...items.slice(0, 6).map((it, i) => div({ key: it.id || i, style: { display: 'flex', gap: 6, alignItems: 'baseline' } },
            span({ style: { color: it.severity === 'crit' ? SEV_META.crit.color : SEV_META.warn.color, fontWeight: 700, fontSize: '9px' } }, it.severity === 'crit' ? '!' : '•'),
            span({ style: { color: 'var(--text2)' } }, it.title))),
          items.length > 6 && span({ style: { color: 'var(--text3)', fontSize: '9px' } }, '+' + (items.length - 6) + ' more — open the store for the full list'));
      })()
    )
  );
}
