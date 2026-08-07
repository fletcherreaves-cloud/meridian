// @ts-nocheck
// ── Swing alarm ──────────────────────────────────────────────────────────────
// Notes 58 #4, the surface half. The owner's requirement: a large one-directional swing
// in sales or guest counts must light up the app, with "no reason it is not surfaced and
// made aware," and a click acknowledgement so it cannot be scrolled past.
//
// Two surfaces, deliberately:
//   · a persistent BAR at the top of the app for anything unacknowledged. Watch-level
//     swings live here quietly.
//   · a MODAL for critical swings, which cannot be dismissed by clicking away or by
//     pressing Escape. Acknowledging is the only exit, and it records who and when.
//
// The modal is the one place in Meridian that deliberately ignores the universal Escape
// hatch (App.js v4.215). That hatch exists so a stuck panel always has a way out; this
// is not stuck, it is waiting for a decision the owner explicitly asked to be forced.
// It shows one store at a time so acknowledging is a considered act per store rather
// than one dismissal that clears everything.

import * as React from 'react';
import { KIND_LABEL } from '../engine/swing-detect.js';
import { ackKey } from '../engine/swing-feed.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

const money = (n) => Math.round(Math.abs(n || 0)).toLocaleString('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const pct = (n) => `${n >= 0 ? '+' : ''}${(n || 0).toFixed(1)}%`;

/** The blocking modal for a single critical swing. */
function CriticalSwing({ item, onAck, onOpenStore }) {
  const s = item.swing || {};
  const down = s.direction === 'down';
  const col = down ? '#ef4444' : '#10b981';

  return div({
    style: {
      position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,.86)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    },
    // No onClick handler — clicking the backdrop must NOT dismiss this.
  },
    div({ style: {
      width: '100%', maxWidth: 560, background: 'var(--surf,#151821)', borderRadius: 14,
      border: `1px solid ${col}`, boxShadow: `0 24px 70px rgba(0,0,0,.7), 0 0 0 1px ${col}33`,
      overflow: 'hidden',
    } },
      div({ style: { padding: '14px 20px', background: `${col}1f`, borderBottom: `.5px solid ${col}55`,
                     display: 'flex', alignItems: 'center', gap: 10 } },
        span({ style: { fontSize: 22 } }, item.icon || '📉'),
        div({ style: { flex: 1 } },
          div({ style: { fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: col, textTransform: 'uppercase' } },
            down ? 'Critical — sustained decline' : 'Critical — sustained swing'),
          div({ style: { fontSize: 15, fontWeight: 800, color: 'var(--text,#e8eaed)', marginTop: 2 } }, item.title))),

      div({ style: { padding: '18px 20px' } },
        div({ style: { display: 'flex', gap: 22, marginBottom: 14 } },
          div(null,
            div({ style: { fontSize: 28, fontWeight: 800, color: col, lineHeight: 1 } }, pct(s.pct)),
            div({ style: { fontSize: 9, color: 'var(--text3,#6b7280)', textTransform: 'uppercase', marginTop: 3 } }, 'sales vs LY')),
          s.guestPct != null ? div(null,
            div({ style: { fontSize: 28, fontWeight: 800, color: col, lineHeight: 1 } }, pct(s.guestPct)),
            div({ style: { fontSize: 9, color: 'var(--text3,#6b7280)', textTransform: 'uppercase', marginTop: 3 } }, 'guest count')) : null,
          div(null,
            div({ style: { fontSize: 28, fontWeight: 800, color: 'var(--text,#e8eaed)', lineHeight: 1 } }, money(s.dollars)),
            div({ style: { fontSize: 9, color: 'var(--text3,#6b7280)', textTransform: 'uppercase', marginTop: 3 } }, 'behind LY'))),

        div({ style: { fontSize: 12, color: 'var(--text2,#9aa4b2)', lineHeight: 1.55, marginBottom: 6 } },
          `${s.run} consecutive weeks · ${s.from} → ${s.to}`),
        // The first-pass diagnosis the owner asked for: operational or otherwise.
        div({ style: { fontSize: 12, color: 'var(--text,#e8eaed)', lineHeight: 1.55, padding: '9px 12px',
                       background: 'var(--surf2,#0f1117)', borderRadius: 8, border: '.5px solid var(--bdr,#2a2f3a)' } },
          span({ style: { fontWeight: 700 } }, 'What this looks like: '),
          KIND_LABEL[s.kind] || '')),

      div({ style: { padding: '12px 20px', borderTop: '.5px solid var(--bdr,#2a2f3a)',
                     display: 'flex', gap: 8, alignItems: 'center' } },
        h('button', {
          onClick: () => onOpenStore && onOpenStore(item.loc),
          style: { background: 'none', border: '1px solid var(--bdr2,#3a4050)', borderRadius: 7,
                   color: 'var(--text2,#9aa4b2)', padding: '7px 12px', cursor: 'pointer', fontSize: 12 },
        }, 'Open store →'),
        div({ style: { flex: 1 } }),
        h('button', {
          onClick: () => onAck(item),
          style: { background: col, border: 'none', borderRadius: 7, color: '#0b0d12',
                   padding: '8px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 800 },
        }, 'Acknowledge'))));
}

/**
 * Top-level alarm. Renders a modal for the first unacknowledged critical swing and a
 * bar for everything else outstanding.
 *
 * props: { items, acks, onAck(item), onOpenStore(loc), onOpenPanel() }
 */
export function SwingAlarm({ items = [], acks = {}, onAck, onOpenStore, onOpenPanel }) {
  const pending = (items || []).filter(i => !acks || !acks[ackKey(i)]);
  const crits = pending.filter(i => i.requiresAck);
  const rest = pending.filter(i => !i.requiresAck);

  // One at a time — acknowledging should be a decision per store, not a bulk dismissal.
  if (crits.length) {
    return h(React.Fragment, null,
      h(CriticalSwing, { item: crits[0], onAck, onOpenStore }),
      crits.length > 1
        ? div({ style: { position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)',
                         zIndex: 9001, fontSize: 11, color: '#fca5a5', fontFamily: 'var(--mono)' } },
            `${crits.length - 1} more store${crits.length > 2 ? 's' : ''} awaiting acknowledgement`)
        : null);
  }

  if (!rest.length) return null;

  const worst = rest[0];
  return div({
    style: {
      display: 'flex', alignItems: 'center', gap: 10, padding: '5px 12px',
      background: 'rgba(245,158,11,.13)', borderBottom: '.5px solid rgba(245,158,11,.45)',
      fontSize: 11, color: '#fcd34d', fontFamily: 'var(--mono)', cursor: onOpenPanel ? 'pointer' : 'default',
    },
    onClick: () => onOpenPanel && onOpenPanel(),
    title: rest.map(i => `${i.title} — ${i.detail}`).join('\n'),
  },
    span({ style: { fontWeight: 700 } }, '📉 SWING WATCH'),
    span(null, rest.length === 1
      ? worst.title
      : `${rest.length} stores moving sharply vs LY — worst: ${worst.title}`),
    div({ style: { flex: 1 } }),
    span({ style: { opacity: .8 } }, 'view →'));
}
