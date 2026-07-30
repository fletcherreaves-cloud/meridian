// @ts-nocheck
// ── Metric Lineage panel (transparency) ───────────────────────────────────────
// The single "how is this number built?" reference. Renders the metric-provenance
// registry — every metric CALCULATED FROM OTHER METRICS shown with its exact math,
// its upstream inputs, and the verifiable source report/table — so any user can pull
// up a metric and check it against the applicable QSRSoft / LifeLenz / SMG report.
// 100% transparency directive (Notes 33 / feedback-metric-provenance.md). Pure read —
// no ds/Supabase coupling; the registry IS the source of truth.
import * as React from 'react';
import { METRIC_PROVENANCE } from '../engine/metric-provenance.js';

const h = React.createElement;
const { useState, useMemo } = React;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

const SYS_COLOR = {
  'QSRSoft': '#f5bc00', 'LifeLenz': '#3b82f6', 'SMG VOICE': '#10b981', 'Meridian-derived': '#a78bfa',
};

export function MetricLineagePanel({ onClose }) {
  const [q, setQ] = useState('');
  const [onlyComposed, setOnlyComposed] = useState(true);

  const entries = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = Object.entries(METRIC_PROVENANCE).map(([key, p]) => ({ key, ...p }));
    return all
      .filter(e => (onlyComposed ? e.composed : true))
      .filter(e => {
        if (!needle) return true;
        const hay = [e.key, e.label, e.system, e.report, e.table, e.formula, (e.inputs || []).join(' ')].join(' ').toLowerCase();
        return hay.includes(needle);
      })
      // composed first, then alpha by label
      .sort((a, b) => (b.composed - a.composed) || (a.label || a.key).localeCompare(b.label || b.key));
  }, [q, onlyComposed]);

  const composedCount = Object.values(METRIC_PROVENANCE).filter(p => p.composed).length;

  const btn = { padding: '6px 12px', borderRadius: 7, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 700 };
  const th = t => h('th', { style: { textAlign: 'left', padding: '7px 10px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text2)', borderBottom: '1px solid var(--bdr)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--surf)' } }, t);

  return div({ style: { position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,.55)', overflow: 'auto', padding: 18 }, onClick: onClose },
    div({ onClick: e => e.stopPropagation(), style: { width: 'min(1100px,100%)', margin: '0 auto', background: 'var(--bg)', border: '1px solid var(--bdr)', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.5)' } },
      // Header
      div({ style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--bdr)', background: 'var(--surf)', flexWrap: 'wrap' } },
        div({},
          div({ style: { fontSize: 15, fontWeight: 800, color: 'var(--text)' } }, '🔍 Metric Lineage'),
          div({ style: { fontSize: 11, color: 'var(--text2)', marginTop: 2 } }, `How every calculated metric is built — ${composedCount} composed metrics, traceable to source`)),
        h('button', { onClick: onClose, style: { ...btn, fontWeight: 800 } }, '✕')),

      // Directive note + controls
      div({ style: { padding: '10px 16px', borderBottom: '1px solid var(--bdr)', background: 'var(--surf)' } },
        div({ style: { fontSize: 11.5, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.5 } },
          'Every number Meridian shows must be traceable to its verifiable source. Metrics ',
          span({ style: { fontWeight: 700, color: 'var(--text)' } }, 'calculated from other metrics'),
          ' show their exact math and inputs below — pull one up and check it against the applicable report.'),
        div({ style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          h('input', { value: q, onChange: e => setQ(e.target.value), placeholder: 'Search metric, formula, field, report…',
            style: { flex: 1, minWidth: 200, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--bdr)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12.5 } }),
          h('button', { onClick: () => setOnlyComposed(v => !v),
            style: { ...btn, border: '1px solid ' + (onlyComposed ? 'var(--accent,#f5bc00)' : 'var(--bdr)'), background: onlyComposed ? 'var(--accent-dim,rgba(245,188,0,.12))' : 'var(--surf)' },
            title: 'Toggle whether direct (single-source) reads are shown alongside calculated metrics' },
            onlyComposed ? 'Calculated only' : 'All metrics'))),

      // Table
      div({ style: { padding: 16 } },
        entries.length === 0
          ? div({ style: { padding: 30, textAlign: 'center', color: 'var(--text2)' } }, 'No metrics match.')
          : div({ style: { overflowX: 'auto', border: '1px solid var(--bdr)', borderRadius: 10 } },
              h('table', { style: { width: '100%', borderCollapse: 'collapse', minWidth: 820 } },
                h('thead', null, h('tr', null, th('Metric'), th('Source'), th('Inputs'), th('Formula'), th('Grain'))),
                h('tbody', null, entries.map(e => h('tr', { key: e.key, style: { borderTop: '.5px solid var(--bdr)', verticalAlign: 'top' } },
                  h('td', { style: { padding: '8px 10px', whiteSpace: 'nowrap' } },
                    div({ style: { fontSize: 12.5, fontWeight: 700, color: 'var(--text)' } }, e.label || e.key),
                    div({ style: { fontSize: 9.5, color: 'var(--text3,var(--text2))', fontFamily: 'ui-monospace,monospace' } }, e.key),
                    e.composed ? span({ style: { display: 'inline-block', marginTop: 3, fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', color: '#111', background: 'var(--accent,#f5bc00)', borderRadius: 4, padding: '1px 5px' } }, 'Calculated') : null),
                  h('td', { style: { padding: '8px 10px', fontSize: 11, color: 'var(--text2)', minWidth: 130 } },
                    div({ style: { fontWeight: 700, color: SYS_COLOR[e.system] || 'var(--text)' } }, e.system),
                    div(null, e.report),
                    e.table ? div({ style: { fontSize: 9.5, fontFamily: 'ui-monospace,monospace', color: 'var(--text3,var(--text2))' } }, e.table) : null),
                  h('td', { style: { padding: '8px 10px', fontSize: 10.5, color: 'var(--text2)', minWidth: 150 } },
                    (e.inputs || []).length
                      ? h('ul', { style: { margin: 0, paddingLeft: 15 } }, (e.inputs || []).map((inp, i) => h('li', { key: i, style: { marginBottom: 2 } }, inp)))
                      : '—'),
                  h('td', { style: { padding: '8px 10px', fontSize: 11.5, color: 'var(--text)', lineHeight: 1.5 } }, e.formula),
                  h('td', { style: { padding: '8px 10px', fontSize: 10.5, color: 'var(--text2)', whiteSpace: 'nowrap' } }, e.grain)
                )))))
            ,
        div({ style: { fontSize: 10, color: 'var(--text3,var(--text2))', marginTop: 10, lineHeight: 1.5 } },
          'This registry (src/engine/metric-provenance.js) is the single source of truth — the same text also powers the ⓘ source tooltip on each KPI. Speed metrics (OEPE / R2P / TPPH / Avg Win TTL / Avg DT TTL) were each reconciled field-by-field to the QSRSoft Daily Activity report.')
      )
    )
  );
}
