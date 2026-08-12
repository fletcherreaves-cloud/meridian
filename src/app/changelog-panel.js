// @ts-nocheck
// #230 — lazy-loaded About-modal changelog list. Kept as its own component (rather than inline
// in App.js) specifically so App.js never statically imports MERIDIAN_CHANGELOG — see
// changelog-data.js for why, and App.js's ChangelogPanel = lazyPanel(...) declaration for how
// this gets loaded on demand.
//
// Sorts newest-first at render (changelog-restructure fix, 2026-08-12) — changelog-data.js's own
// array is append-only now (new entries land at the tail, not interleaved by version), so display
// order can no longer be assumed from storage order. `versionSort` compares dotted version
// strings numerically per segment (5.10 > 5.9, unlike a plain string compare).
import * as React from 'react';
import { MERIDIAN_CHANGELOG } from './changelog-data.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);

export function versionSort(a, b) {
  const av = a.version.split('.').map(Number);
  const bv = b.version.split('.').map(Number);
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const d = (bv[i] || 0) - (av[i] || 0);
    if (d) return d;
  }
  return 0;
}

export function ChangelogPanel() {
  const sorted = MERIDIAN_CHANGELOG.slice().sort(versionSort);
  return h(React.Fragment, null,
    ...sorted.map(entry =>
      div({ key: entry.version, style: { borderLeft: '2px solid rgba(245,158,11,.3)', paddingLeft: '16px', marginBottom: '20px' } },
        div({ style: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' } },
          div({ style: { fontFamily: "'Syne',sans-serif", fontSize: '13px', fontWeight: 800, color: 'var(--amber)' } },
            'v' + entry.version),
          div({ style: { fontSize: '11px', color: 'var(--text3)' } }, '·'),
          div({ style: { fontSize: '11px', color: 'var(--text3)' } }, ' ' + entry.date)),
        h('ul', { style: { paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '5px' } },
          entry.changes.map((c, i) =>
            h('li', { key: i, style: { fontSize: '12px', color: 'var(--text2)', lineHeight: '1.6' } }, c)))
      )
    )
  );
}
