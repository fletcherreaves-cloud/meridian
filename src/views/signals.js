// @ts-nocheck
import * as React from 'react';
const h = React.createElement;
const { useState: uSt, useMemo: uM } = React;

const amber = '#f59e0b', grn = '#10b981', red = '#ef4444', muted = '#6b7280', blue = '#60a5fa';

function rColor(r, expectedDir) {
  if (r === null || r === undefined) return muted;
  const a = Math.abs(r);
  if (a < 0.20) return muted;
  // Check if direction matches expectation
  const dirMatch = !expectedDir ||
    (expectedDir === 'negative' && r < 0) ||
    (expectedDir === 'positive' && r > 0) ||
    expectedDir === null;
  if (!dirMatch) return muted;
  if (a >= 0.70) return grn;
  if (a >= 0.50) return grn;
  if (a >= 0.30) return amber;
  return muted;
}

function strengthLabel(sig) {
  if (!sig.r || Math.abs(sig.r) < 0.20) return 'No signal';
  if (sig.confirmed) {
    if (Math.abs(sig.r) >= 0.70) return 'Strong';
    if (Math.abs(sig.r) >= 0.50) return 'Moderate';
    return 'Plausible';
  }
  if (Math.abs(sig.r) >= 0.30) return 'Weak / needs more data';
  return 'No signal';
}

function statusChip(sig) {
  const a = Math.abs(sig.r || 0);
  if (a < 0.20 || (sig.n || 0) < 8)
    return h('span', { style: { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: 'rgba(107,114,128,.15)', color: muted } }, 'Insufficient data');
  if (sig.confirmed)
    return h('span', { style: { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: 'rgba(16,185,129,.12)', color: grn } }, '✓ Confirmed');
  if (a >= 0.30)
    return h('span', { style: { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: 'rgba(245,158,11,.12)', color: amber } }, '~ Plausible');
  return h('span', { style: { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: 'rgba(107,114,128,.15)', color: muted } }, 'Weak');
}

function CorrelationBar({ r }) {
  const a = Math.abs(r || 0);
  const col = a >= 0.50 ? grn : a >= 0.30 ? amber : muted;
  const pct = Math.min(100, a * 100);
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
    h('div', { style: { flex: 1, height: '6px', background: 'rgba(255,255,255,.08)', borderRadius: '3px', overflow: 'hidden' } },
      h('div', { style: { width: pct + '%', height: '100%', background: col, borderRadius: '3px', transition: 'width .4s' } })
    ),
    h('span', { style: { fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: col, minWidth: '44px' } },
      r != null ? (r >= 0 ? '+' : '') + r.toFixed(3) : '—'
    ),
  );
}

function SignalCard({ sig, expanded, onToggle }) {
  const col = rColor(sig.r, sig.expectedDir);
  const isExp = expanded === sig.id;

  return h('div', {
    style: {
      border: `1px solid ${sig.confirmed ? 'rgba(16,185,129,.25)' : 'rgba(255,255,255,.1)'}`,
      borderRadius: '8px',
      background: sig.confirmed ? 'rgba(16,185,129,.03)' : 'rgba(255,255,255,.02)',
      marginBottom: '10px',
      overflow: 'hidden',
    }
  },
    // Header
    h('div', {
      onClick: onToggle,
      style: { cursor: 'pointer', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px', userSelect: 'none' }
    },
      // r value circle
      h('div', {
        style: {
          width: '48px', height: '48px', borderRadius: '50%', flexShrink: 0,
          background: `conic-gradient(${col} ${Math.abs(sig.r || 0) * 360}deg, rgba(255,255,255,.08) 0deg)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }
      },
        h('div', {
          style: {
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'var(--bg, #111827)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'monospace', fontSize: '10px', fontWeight: 700, color: col,
          }
        }, sig.r != null ? (sig.r >= 0 ? '+' : '') + sig.r.toFixed(2) : '—')
      ),
      // Info
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' } },
          h('span', { style: { fontWeight: 700, fontSize: '13px', color: 'var(--text, #111827)' } }, sig.name),
          statusChip(sig),
        ),
        h('div', { style: { fontSize: '11px', color: muted } }, sig.description),
        sig.note && h('div', { style: { fontSize: '10px', color: amber, marginTop: '2px' } }, '⚠ ' + sig.note),
      ),
      // Stats
      h('div', { style: { textAlign: 'right', flexShrink: 0 } },
        h('div', { style: { fontSize: '10px', color: muted } }, 'n = ' + (sig.n || 0) + ' pts'),
        h('div', { style: { fontSize: '10px', color: muted, marginTop: '1px' } }, strengthLabel(sig)),
      ),
      h('span', { style: { fontSize: '13px', color: muted, transition: 'transform .2s', transform: isExp ? 'rotate(180deg)' : 'none' } }, '▾'),
    ),
    // Expanded detail
    isExp && h('div', { style: { padding: '0 14px 12px', borderTop: '1px solid rgba(255,255,255,.07)' } },
      h('div', { style: { display: 'flex', gap: '24px', marginTop: '10px', flexWrap: 'wrap' } },
        h('div', { style: { flex: 1, minWidth: '200px' } },
          h('div', { style: { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: muted, marginBottom: '6px' } }, 'Correlation Strength'),
          h(CorrelationBar, { r: sig.r }),
          h('div', { style: { marginTop: '6px', fontSize: '10px', color: muted } },
            'Direction: ',
            h('span', { style: { color: 'var(--text,#111827)' } },
              sig.direction === 'negative' ? '↓ negative (inverse)' : '↑ positive (direct)'
            ),
            sig.expectedDir && h('span', { style: { color: sig.direction === sig.expectedDir ? grn : red } },
              ' — ' + (sig.direction === sig.expectedDir ? '✓ as expected' : '✗ unexpected direction')
            )
          ),
        ),
        h('div', { style: { flex: 1, minWidth: '200px' } },
          h('div', { style: { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: muted, marginBottom: '6px' } }, 'Data Points'),
          h('div', { style: { fontSize: '12px', color: 'var(--text,#111827)' } },
            h('span', { style: { fontFamily: 'monospace', fontWeight: 700, color: blue } }, sig.n || 0), ' matched pairs',
          ),
          h('div', { style: { fontSize: '10px', color: muted, marginTop: '4px' } },
            'X: ', h('em', null, sig.xLabel),
          ),
          h('div', { style: { fontSize: '10px', color: muted } },
            'Y: ', h('em', null, sig.yLabel),
          ),
        ),
        h('div', { style: { flex: 1, minWidth: '200px' } },
          h('div', { style: { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: muted, marginBottom: '6px' } }, 'Interpretation'),
          h('div', { style: { fontSize: '11px', color: 'var(--text,#111827)', lineHeight: 1.5 } },
            sig.confirmed
              ? `This signal is statistically meaningful (|r| = ${Math.abs(sig.r).toFixed(2)}). The relationship is consistent enough to act on.`
              : Math.abs(sig.r || 0) >= 0.30
              ? `Relationship exists but needs more data to confirm. Upload additional months to strengthen this signal.`
              : `No meaningful statistical relationship found yet. More data needed, or these metrics may be independent.`
          ),
        ),
      ),
    ),
  );
}

// ── Data readiness indicator ───────────────────────────────────────────────────
function DataReadiness({ ds }) {
  const checks = [
    { label: 'Labor Analysis', ok: (ds.laborRows?.length || 0) >= 30, count: ds.laborRows?.length || 0, unit: 'rows' },
    { label: 'Operations Report', ok: (ds.opsRows?.length || 0) >= 10, count: ds.opsRows?.length || 0, unit: 'rows' },
    { label: 'FOB Reports', ok: (ds.fobRows?.length || 0) >= 5, count: ds.fobRows?.length || 0, unit: 'rows' },
    { label: 'LifeLenz Schedule', ok: (ds.schedRows?.length || 0) >= 20, count: ds.schedRows?.length || 0, unit: 'rows' },
    { label: 'SMG FullScale', ok: (ds.smgFullscale?.length || 0) >= 3, count: ds.smgFullscale?.length || 0, unit: 'stores' },
    { label: 'Labor Exceptions', ok: (ds.exceptionRows?.length || 0) >= 5, count: ds.exceptionRows?.length || 0, unit: 'rows' },
  ];
  return h('div', {
    style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px', padding: '10px 14px', background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.08)', borderRadius: '8px' }
  },
    h('div', { style: { width: '100%', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: muted, marginBottom: '4px' } }, 'Data available for signal detection'),
    checks.map(c => h('div', { key: c.label, style: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: c.ok ? grn : c.count > 0 ? amber : muted } },
      h('span', null, c.ok ? '✓' : c.count > 0 ? '~' : '○'),
      c.label,
      h('span', { style: { fontFamily: 'monospace', fontSize: '10px', color: muted } }, '(' + c.count + ' ' + c.unit + ')'),
    ))
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export function SignalsPanel({ ds, signals }) {
  const [expanded, setExpanded] = uSt(null);

  const confirmedCount = (signals || []).filter(s => s.confirmed).length;
  const plausibleCount = (signals || []).filter(s => !s.confirmed && Math.abs(s.r || 0) >= 0.30).length;

  const hasData = (ds?.laborRows?.length || 0) >= 30 || (ds?.fobRows?.length || 0) >= 5;

  return h('div', { style: { padding: '16px', maxWidth: '900px', margin: '0 auto' } },

    // Header
    h('div', { style: { marginBottom: '20px' } },
      h('div', { style: { fontSize: '11px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: amber, marginBottom: '4px' } }, 'Intelligence'),
      h('div', { style: { fontFamily: "'Syne',sans-serif", fontSize: '22px', fontWeight: 900, letterSpacing: '-.03em', color: 'var(--text,#111827)' } }, 'Signals'),
      h('div', { style: { fontSize: '12px', color: muted, marginTop: '4px' } },
        'Cross-metric correlation analysis — runs automatically on every data upload. Finds statistical patterns between scheduling, labor, service, and financial outcomes.'
      ),
    ),

    // Summary chips
    (signals?.length > 0) && h('div', { style: { display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' } },
      h('div', { style: { padding: '6px 14px', borderRadius: '99px', background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.25)', fontSize: '12px', fontWeight: 700, color: grn } },
        confirmedCount + ' confirmed signal' + (confirmedCount !== 1 ? 's' : '')
      ),
      h('div', { style: { padding: '6px 14px', borderRadius: '99px', background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.25)', fontSize: '12px', fontWeight: 700, color: amber } },
        plausibleCount + ' plausible'
      ),
      h('div', { style: { padding: '6px 14px', borderRadius: '99px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', fontSize: '12px', color: muted } },
        (signals.length - confirmedCount - plausibleCount) + ' need more data'
      ),
    ),

    // Data readiness
    h(DataReadiness, { ds }),

    // Empty state — two variants: no data loaded vs data loaded but no patterns yet
    (!signals || signals.length === 0) && h('div', {
      style: { textAlign: 'center', padding: '48px', color: muted, fontSize: '13px', border: '1px dashed rgba(255,255,255,.1)', borderRadius: '8px' }
    },
      h('div', { style: { fontSize: '28px', marginBottom: '12px' } }, hasData ? '🔍' : '📡'),
      h('div', { style: { fontWeight: 700, marginBottom: '8px', fontSize: '14px', color: 'var(--text,#111827)' } },
        hasData ? 'No patterns detected yet' : 'No data loaded'
      ),
      hasData
        ? h('div', { style: { lineHeight: 1.7, maxWidth: '480px', margin: '0 auto' } },
            'Data is loaded but no statistical patterns crossed the threshold yet. ',
            h('strong', null, 'Re-upload your files'), ' to trigger recomputation, or load additional months of history — more data increases signal confidence. ',
            h('br', null),
            h('span', { style: { fontSize: '11px', marginTop: '8px', display: 'block', color: muted } },
              'Check DevTools console for [signals] lines to see which correlations are being computed.'
            )
          )
        : 'Upload Labor Analysis, Operations Reports, and FOB data to start detecting patterns.',
    ),

    // Signal cards
    (signals || []).map(sig =>
      h(SignalCard, {
        key: sig.id,
        sig,
        expanded,
        onToggle: () => setExpanded(expanded === sig.id ? null : sig.id),
      })
    ),

    // Footer note
    h('div', { style: { marginTop: '16px', fontSize: '10px', color: muted, lineHeight: 1.6 } },
      '⚙ Signals use Pearson correlation (r). |r| ≥ 0.70 = strong, 0.50 = moderate, 0.30 = plausible. Minimum 8 matched data points required per signal. Signals recompute automatically after every file upload.',
    ),
  );
}
