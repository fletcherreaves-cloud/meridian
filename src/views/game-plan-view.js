// @ts-nocheck
// Game Plan — the new front-facing GM/SM/AM/DM home screen (owner request 2026-11-07, following
// the "Four Decks" mockup exploration: "I would maybe say create a new set of main overlay. Keep
// the other intact and make it optional for users, but make this the front facing version.").
//
// Renders from the SAME role-voice items/summary curated-home.js already computes (no second
// data engine, no fabricated content) plus one real addition: a trailing 7-closed-business-day
// sales-vs-plan trend + a matched-day vs-LY "win" read (src/engine/game-plan.js). Every number
// on this screen is real or it doesn't render -- a zero-item day gets an honest all-clear, a flat
// or negative week gets no celebration, a day with no plan data gets no fabricated percentage.
import * as React from 'react';
import { withAlpha } from '../utils/fmt.js';
import { computeGamePlanWeek, gamePlanActions } from '../engine/game-plan.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

const SEV_COLOR = { RED: 'var(--crit,#f43f5e)', AMBER: 'var(--amber,#f59e0b)' };

function greeting() {
  const hr = new Date().getHours();
  return hr < 11 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
}

function PriorityCard({ item, weekData }) {
  if (item) {
    return div({ style: {
      background: 'linear-gradient(155deg, var(--surf3,#1f2430), var(--surf2,#17202d))',
      border: '1px solid ' + withAlpha(SEV_COLOR[item.severity] || 'var(--amber)', '45'),
      borderRadius: 'var(--rl,16px)', padding: '22px 24px', color: 'var(--text,#fff)',
      display: 'flex', flexDirection: 'column', gap: 10,
    } },
      span({ style: { fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
        color: SEV_COLOR[item.severity] || 'var(--amber)' } }, "Today's one thing"),
      h('h2', { style: { margin: 0, fontSize: 'clamp(17px,2.6vw,21px)', fontWeight: 700, lineHeight: 1.35,
        color: 'var(--text,#fff)' } }, item.headline),
      item.detail && div({ style: { fontSize: 13.5, lineHeight: 1.6, color: 'var(--text2,#c9bfa8)', maxWidth: '52ch' } }, item.detail),
      item.storesAffected?.length > 0 && div({ style: { display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 2 } },
        item.storesAffected.map(s => span({ key: s, style: {
          fontSize: 10.5, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
          background: withAlpha(SEV_COLOR[item.severity] || 'var(--amber)', '20'), color: 'var(--text,#fff)',
        } }, s))),
    );
  }
  // All-clear -- a real, honest fallback, never an invented problem.
  const vs = weekData.vsLYPct;
  const vsLine = vs != null
    ? `You're running ${vs >= 0 ? '+' : ''}${vs.toFixed(1)}% vs last year this week (${weekData.rangeLabel}).`
    : null;
  return div({ style: {
    background: 'linear-gradient(155deg, var(--surf3,#1f2430), var(--surf2,#17202d))',
    border: '1px solid var(--bdr,#2a303d)', borderRadius: 'var(--rl,16px)', padding: '22px 24px',
    display: 'flex', flexDirection: 'column', gap: 8,
  } },
    span({ style: { fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
      color: 'var(--good,#10b981)' } }, 'Nothing flagged today'),
    h('h2', { style: { margin: 0, fontSize: 'clamp(17px,2.6vw,21px)', fontWeight: 700, color: 'var(--text,#fff)' } },
      'Steady as she goes — keep doing what’s working.'),
    vsLine && div({ style: { fontSize: 13.5, color: 'var(--text2,#c9bfa8)' } }, vsLine),
  );
}

function WeekBars({ weekData }) {
  if (!weekData.bars.length) {
    return div({ style: { fontSize: 12.5, color: 'var(--text3,#958975)', padding: '10px 0' } },
      'Not enough closed days with real data yet this week.');
  }
  const barColor = pct => pct == null ? 'var(--bdr2,#4d4435)' : pct >= 100 ? 'var(--good,#10b981)' : pct >= 90 ? 'var(--amber,#f59e0b)' : 'var(--crit,#f43f5e)';
  return div(null,
    div({ style: { display: 'flex', alignItems: 'flex-end', gap: 7, height: 64 } },
      weekData.bars.map(b => div({ key: b.dk, style: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' } },
        div({ title: b.pct != null ? Math.round(b.pct) + '% of plan' : 'No plan data',
          style: { background: barColor(b.pct), borderRadius: '5px 5px 0 0',
            height: (b.pct == null ? 4 : Math.max(6, Math.min(100, b.pct * 0.72))) + '%' } })))),
    div({ style: { display: 'flex', gap: 7, marginTop: 6 } },
      weekData.bars.map(b => span({ key: b.dk, style: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text3,#958975)' } }, b.label))),
  );
}

function ActionsCard({ actions, onNav }) {
  if (!actions.length) return null;
  return div({ style: { background: 'var(--surf,#171b24)', border: '1px solid var(--bdr,#2a303d)',
    borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 } },
    span({ style: { fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text3,#958975)' } },
      actions.length === 1 ? 'The one thing to act on' : actions.length + ' things worth a few minutes'),
    ...actions.map((it, i) => div({ key: it.id, style: { display: 'flex', gap: 10, alignItems: 'flex-start' } },
      span({ style: { flexShrink: 0, width: 20, height: 20, borderRadius: 6, border: '1.5px solid ' + (SEV_COLOR[it.severity] || 'var(--amber)'), marginTop: 1 } }),
      div({ style: { fontSize: 13, lineHeight: 1.55, color: 'var(--text2,#c9bfa8)' } },
        h('b', { style: { color: 'var(--text,#fff)' } }, it.headline + '. '),
        it.action || ''),
    )),
  );
}

function WinCard({ weekData }) {
  if (!weekData.isWin) return null;
  return div({ style: { background: withAlpha('var(--good,#10b981)', '12'), border: '1px solid ' + withAlpha('var(--good,#10b981)', '40'),
    borderRadius: 14, padding: '13px 16px', display: 'flex', gap: 12, alignItems: 'center' } },
    span({ style: { fontSize: 22 } }, '🎉'),
    div({ style: { fontSize: 13, lineHeight: 1.55, color: 'var(--text2,#c9bfa8)' } },
      h('b', { style: { color: 'var(--good,#10b981)' } }, `+${weekData.vsLYPct.toFixed(1)}% vs last year `),
      `this week (${weekData.rangeLabel}) — your best stretch in a while. Tell the crew, they earned it.`),
  );
}

export function GamePlanFormat({ ds, loc, storeName, items, summary, userName, onNav, onShowEverything }) {
  const weekData = React.useMemo(() => loc ? computeGamePlanWeek(ds, loc) : { bars: [], vsLYPct: null, isWin: false, rangeLabel: null }, [ds, loc]);
  const actions = React.useMemo(() => gamePlanActions(items), [items]);
  const top = items[0] || null;

  return div({ style: { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 620, margin: '0 auto' } },
    div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' } },
      div(null,
        div({ style: { fontSize: 17, fontWeight: 700, color: 'var(--text,#fff)' } }, greeting() + (userName ? ', ' + userName : '')),
        div({ style: { fontSize: 11.5, color: 'var(--text3,#958975)', marginTop: 2 } },
          (storeName || 'Your store') + ' · ' + new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          + (summary.totalFlags ? ' · ' + summary.totalFlags + ' flag' + (summary.totalFlags !== 1 ? 's' : '') : '')),
      ),
      onShowEverything && h('button', { type: 'button', onClick: onShowEverything, style: {
        background: 'none', border: '1px solid var(--bdr,#2a303d)', borderRadius: 999, padding: '5px 12px',
        fontSize: 11, fontWeight: 600, color: 'var(--text3,#958975)', cursor: 'pointer',
      } }, 'See everything flagged →'),
    ),
    h(PriorityCard, { item: top, weekData }),
    div({ style: { background: 'var(--surf,#171b24)', border: '1px solid var(--bdr,#2a303d)', borderRadius: 14, padding: '14px 16px' } },
      span({ style: { fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text3,#958975)' } },
        'Your week so far' + (weekData.rangeLabel ? ' (' + weekData.rangeLabel + ')' : '')),
      div({ style: { marginTop: 10 } }, h(WeekBars, { weekData })),
    ),
    h(ActionsCard, { actions, onNav }),
    h(WinCard, { weekData }),
  );
}
