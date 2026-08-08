// @ts-nocheck
// ── Local News panel (Notes 59) ──────────────────────────────────────────────
// What's being said near our restaurants. Sourced from the nine local outlets in
// src/engine/news-sources.js, classified by news-classify.js, attributed to stores by
// locality.js, and written nightly by scripts/news-rss-pull.mjs.
//
// TWO THINGS THIS PANEL IS DELIBERATE ABOUT
//
// 1. AMBIGUITY IS SHOWN, NOT HIDDEN. Ardmore has two stores and DeFuniak Springs has two
//    by mailing address, so a town-level story genuinely belongs to both. The attribution
//    engine returns both rather than guessing, and this renders "either store" instead of
//    silently picking one. Assigning a bad news story to the wrong store is worse than
//    saying you don't know which.
//
// 2. IT DOES NOT CLAIM TO BE BRAND MONITORING. Every row here is LOCAL CONTEXT — road
//    closures, crime, closures, community events near a store. Local RSS carries almost
//    no McDonald's mentions (the seeding run found zero across all nine feeds), and the
//    footer says so, because a "News" panel that looks empty of brand mentions should
//    explain why rather than read as broken.
//
// The reason this is operationally useful and not just interesting: a store can lose
// traffic for reasons no operational metric can see. A highway closed beside a store is
// invisible to sales-per-hour until the sales are already gone.

import * as React from 'react';
import { loadNewsMentions } from '../lib/supabase.js';
import { sName, STORE_NAMES } from '../constants.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

const SIGNAL_META = {
  roads:     { icon: '🚧', label: 'Roads',     col: '#f59e0b' },
  crime:     { icon: '🚨', label: 'Crime',     col: '#ef4444' },
  business:  { icon: '🏪', label: 'Business',  col: '#60a5fa' },
  weather:   { icon: '🌪', label: 'Weather',   col: '#a78bfa' },
  health:    { icon: '🧾', label: 'Health',    col: '#10b981' },
  community: { icon: '🎪', label: 'Community', col: '#6b7280' },
};

const fmtDate = (d) => d
  ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  : 'undated';

function Story({ row }) {
  const meta = row.signals.map(s => SIGNAL_META[s]).filter(Boolean);
  const who = row.ambiguous
    ? row.locs.map(l => sName(l) || l).join(' or ')
    : (sName(row.loc) || row.loc);

  return div({ style: {
    padding: '9px 12px', borderBottom: '.5px solid var(--bdr,#2a2f3a)',
    borderLeft: `2px solid ${row.tier === 'brand' ? '#f5bc00' : 'transparent'}`,
  } },
    div({ style: { display: 'flex', gap: 8, alignItems: 'baseline' } },
      row.url
        ? h('a', { href: row.url, target: '_blank', rel: 'noopener noreferrer',
                   style: { fontSize: 12.5, fontWeight: 600, color: 'var(--text,#e8eaed)', textDecoration: 'none', flex: 1 } }, row.title)
        : span({ style: { fontSize: 12.5, fontWeight: 600, color: 'var(--text,#e8eaed)', flex: 1 } }, row.title),
      span({ style: { fontSize: 10, color: 'var(--text3,#6b7280)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)' } }, fmtDate(row.published))),

    div({ style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' } },
      span({ style: {
        fontSize: 10.5, fontWeight: 700,
        color: row.ambiguous ? '#f59e0b' : 'var(--text2,#9aa4b2)',
      } }, who),
      // Saying "either store" is the honest rendering — see the header note.
      row.ambiguous ? span({ style: { fontSize: 9, color: '#f59e0b', border: '.5px solid #f59e0b66', borderRadius: 4, padding: '0 4px' } }, 'EITHER') : null,
      span({ style: { fontSize: 10, color: 'var(--text3,#6b7280)' } }, row.outlet || row.feedId),
      ...meta.map(m => span({ key: m.label, title: m.label, style: { fontSize: 10, color: m.col } }, `${m.icon} ${m.label}`)),
      row.tier === 'brand' ? span({ style: { fontSize: 9, fontWeight: 800, color: '#f5bc00' } }, 'BRAND MENTION') : null));
}

export function NewsPanel({ onClose, initialLoc = null }) {
  const [rows, setRows] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [locFilter, setLocFilter] = React.useState(initialLoc);
  const [signalFilter, setSignalFilter] = React.useState(null);

  React.useEffect(() => {
    let live = true;
    loadNewsMentions({ days: 120 })
      .then(r => { if (live) { setRows(r || []); setErr(null); } })
      .catch(e => { if (live) setErr(e?.message || 'load failed'); });
    return () => { live = false; };
  }, []);

  // One row per (article, store). Collapse to articles for display so a two-store town
  // shows one story, not two identical ones.
  const articles = React.useMemo(() => {
    const byKey = new Map();
    for (const r of (rows || [])) if (!byKey.has(r.itemKey)) byKey.set(r.itemKey, r);
    return [...byKey.values()].sort((a, b) => (b.published?.getTime() || 0) - (a.published?.getTime() || 0));
  }, [rows]);

  const shown = React.useMemo(() => articles.filter(a =>
    (!locFilter || a.locs.includes(locFilter) || a.loc === locFilter) &&
    (!signalFilter || a.signals.includes(signalFilter))), [articles, locFilter, signalFilter]);

  const byLoc = React.useMemo(() => {
    const c = {};
    for (const a of articles) for (const l of (a.locs.length ? a.locs : [a.loc])) c[l] = (c[l] || 0) + 1;
    return Object.entries(c).sort((x, y) => y[1] - x[1]);
  }, [articles]);

  const chip = (active, label, onClick, key) => h('button', {
    key, onClick,
    style: {
      fontSize: 10.5, padding: '3px 8px', borderRadius: 12, cursor: 'pointer',
      border: `.5px solid ${active ? '#f5bc00' : 'var(--bdr2,#3a4050)'}`,
      background: active ? 'rgba(245,188,0,.14)' : 'none',
      color: active ? '#f5bc00' : 'var(--text3,#6b7280)',
    },
  }, label);

  const body = err
    ? div({ style: { padding: 30, textAlign: 'center', color: '#f59e0b', fontSize: 12 } }, 'Could not load news — ', err)
    : rows === null
      ? div({ style: { padding: 30, textAlign: 'center', color: 'var(--text3,#6b7280)', fontSize: 12 } }, 'Loading…')
      : !articles.length
        ? div({ style: { padding: '30px 20px', textAlign: 'center', color: 'var(--text3,#6b7280)', fontSize: 12, lineHeight: 1.6 } },
            'No local news collected yet.',
            div({ style: { marginTop: 6, fontSize: 11 } }, 'The nightly pull runs at 11:40 UTC. Run it from Data Manager → Sync to populate now.'))
        : div(null, shown.length
            ? shown.map(a => h(Story, { key: a.itemKey, row: a }))
            : div({ style: { padding: 24, textAlign: 'center', color: 'var(--text3,#6b7280)', fontSize: 11 } }, 'Nothing matches that filter.'));

  return div({
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 320, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' },
    onClick: onClose,
  },
    div({ onClick: e => e.stopPropagation(), style: {
      width: '100%', maxWidth: 820, background: 'var(--surf,#0f1117)', borderRadius: 12,
      border: '.5px solid var(--bdr,#2a2f3a)', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.6)',
    } },
      div({ style: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '.5px solid var(--bdr,#2a2f3a)', background: 'var(--surf2,#151821)' } },
        span({ style: { fontSize: 16 } }, '📰'),
        div({ style: { flex: 1 } },
          div({ style: { fontSize: 14, fontWeight: 800, color: 'var(--text,#e8eaed)' } }, 'Local News'),
          div({ style: { fontSize: 10, color: 'var(--text3,#6b7280)', marginTop: 2 } },
            rows === null ? 'loading…'
              : `${articles.length} stories · last 120 days · ${byLoc.length} of ${Object.keys(STORE_NAMES).filter(k=>/^\d+$/.test(k)).length} stores have coverage`)),
        h('button', { onClick: onClose, style: { background: 'none', border: '1px solid var(--bdr2,#3a4050)', borderRadius: 6, color: 'var(--text3,#6b7280)', padding: '5px 10px', cursor: 'pointer', fontSize: 12 } }, '✕ Close')),

      articles.length ? div({ style: { display: 'flex', gap: 5, flexWrap: 'wrap', padding: '9px 14px', borderBottom: '.5px solid var(--bdr,#2a2f3a)' } },
        chip(!signalFilter && !locFilter, 'All', () => { setSignalFilter(null); setLocFilter(null); }, 'all'),
        ...Object.entries(SIGNAL_META).map(([k, m]) =>
          chip(signalFilter === k, `${m.icon} ${m.label}`, () => setSignalFilter(signalFilter === k ? null : k), k)),
        // Every location that HAS a story gets a chip. This was capped at 8, so the header could
        // read "17 locations" while only 8 were selectable (Notes 62). The header counts stores
        // with coverage, not the 27-store estate — most towns simply have no local story.
        ...byLoc.map(([l, n]) =>
          chip(locFilter === l, `${sName(l) || l} ${n}`, () => setLocFilter(locFilter === l ? null : l), 'loc' + l))) : null,

      div({ style: { maxHeight: '60vh', overflowY: 'auto' } }, body),

      div({ style: { padding: '9px 18px', borderTop: '.5px solid var(--bdr,#2a2f3a)', fontSize: 9.5, color: 'var(--text3,#6b7280)', fontStyle: 'italic', lineHeight: 1.55 } },
        'Local outlets only — this is context near our restaurants, not brand monitoring. These feeds carry almost no McDonald’s mentions; ',
        'a story marked EITHER belongs to a town with two of our stores and has not been assigned to one.')));
}
