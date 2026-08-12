// @ts-nocheck
// #230 — lazy-loaded About-modal changelog list. Kept as its own component (rather than inline
// in App.js) specifically so App.js never statically imports MERIDIAN_CHANGELOG — see
// changelog-data.js for why, and App.js's ChangelogPanel = lazyPanel(...) declaration for how
// this gets loaded on demand.
import * as React from 'react';
import { MERIDIAN_CHANGELOG } from './changelog-data.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);

export function ChangelogPanel() {
  return h(React.Fragment, null,
    ...MERIDIAN_CHANGELOG.map(entry =>
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
