// @ts-nocheck
// ── EOM Share View (Phase 1) ────────────────────────────────────────────────────────────────────
// The public, no-login, read-only page a shared EOM link opens to. Self-contained (does NOT import the
// heavy dashboard) — fetches the snapshot via the eom-share edge function and renders the FOB strip +
// recap (with a Full-report expander) + a single "I've reviewed this" acknowledge tap. Mobile-first.
import * as React from 'react';
import { fetchSharedEom, acknowledgeSharedEom } from '../lib/supabase.js';
import { mdToHtml } from '../utils/markdown.js';

const { useState, useEffect } = React;
const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

const $ = v => (v == null || isNaN(v)) ? '—' : '$' + Math.round(v).toLocaleString();
const pct2 = v => (v == null || isNaN(v)) ? '—' : (v * 100).toFixed(2) + '%';

function FobStripLite({ fob }) {
  const f = fob || {};
  if (f.fob == null && f.fobPct == null) return null;
  const box = { padding: '5px 10px', background: '#171a21', border: '1px solid #262b36', borderRadius: '7px', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '84px' };
  const lab = { fontSize: '8.5px', color: '#78839a', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' };
  const big = (c) => ({ fontSize: '13px', fontWeight: 700, color: c || '#e7ebf3', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' });
  const cell = (label, amt) => div({ style: box }, span({ style: lab }, label), span({ style: big() }, $(amt)), f.sales ? span({ style: { fontSize: '8.5px', color: '#78839a' } }, pct2(amt / f.sales)) : null);
  return div({ style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' } },
    div({ style: box }, span({ style: lab }, 'FOB'), span({ style: big('#f5bc00') }, `${pct2(f.fobPct)}`), span({ style: { fontSize: '9px', color: '#aab3c5' } }, $(f.fob))),
    cell('Comp Waste', f.comp), cell('Raw Waste', f.raw), cell('Condiments', f.cond),
    cell('Emp Meals', f.emp), cell('Stat Var', f.statv), cell('Unexplained', f.unex),
    f.sales ? div({ style: box }, span({ style: lab }, 'Prod Sales'), span({ style: big() }, $(f.sales))) : null);
}

export function EomShareView({ token }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [full, setFull] = useState(false);
  const [ackBusy, setAckBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetchSharedEom(token).then(r => {
      if (!live) return;
      if (r?.error || (!r?.recapMd && !r?.fullMd)) setErr(r?.error || 'This report could not be loaded.');
      else setData(r);
      setLoading(false);
    }).catch(e => { if (live) { setErr(String(e?.message || e)); setLoading(false); } });
    return () => { live = false; };
  }, [token]);

  const ack = async () => {
    setAckBusy(true);
    const r = await acknowledgeSharedEom(token);
    if (!r?.error) setData(d => ({ ...d, acknowledgedAt: r?.acknowledgedAt || new Date().toISOString() }));
    setAckBusy(false);
  };

  const page = (...kids) => div({ style: { minHeight: '100vh', background: '#0f1117', color: '#e7ebf3', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif', padding: '22px 16px 60px' } },
    div({ style: { maxWidth: '760px', margin: '0 auto' } }, ...kids));

  if (loading) return page(div({ style: { color: '#78839a', textAlign: 'center', padding: '60px 0' } }, 'Loading your EOM report…'));
  if (err) return page(
    div({ style: { fontWeight: 800, fontSize: '18px', marginBottom: '8px' } }, 'Meridian'),
    div({ style: { color: '#fb923c', background: '#171a21', border: '1px solid #262b36', borderRadius: '10px', padding: '20px', fontSize: '14px', lineHeight: 1.5 } }, err));

  const activeMd = full ? (data.fullMd || data.recapMd) : (data.recapMd || data.fullMd);
  const exp = data.expiresAt ? new Date(data.expiresAt) : null;
  const acked = !!data.acknowledgedAt;

  return page(
    div({ style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '2px' } },
      span({ style: { fontWeight: 800, fontSize: '18px', color: '#f5bc00' } }, 'Meridian'),
      span({ style: { fontSize: '11px', color: '#78839a' } }, 'EOM report · view-only')),
    div({ style: { fontWeight: 700, fontSize: '20px', margin: '4px 0 14px' } }, `${data.storeName || ''} · ${data.title || `EOM FOB ${data.period}`}`),

    h(FobStripLite, { fob: data.fob }),

    (data.fullMd && data.fullMd !== data.recapMd)
      ? div({ style: { display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' } },
          h('button', { onClick: () => setFull(f => !f), style: { background: 'none', border: '1px solid #333a48', color: full ? '#f5bc00' : '#aab3c5', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' } }, full ? '← Summary' : 'Full report →'))
      : null,

    div({ className: 'md-rpt', style: { background: '#171a21', border: '1px solid #262b36', borderRadius: '10px', padding: '16px', fontSize: '14px', lineHeight: 1.55 },
      dangerouslySetInnerHTML: { __html: mdToHtml(activeMd) } }),

    div({ style: { marginTop: '18px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
      acked
        ? span({ style: { color: '#4ade80', fontWeight: 700, fontSize: '14px' } }, `✓ Reviewed${data.acknowledgedAt ? ` · ${new Date(data.acknowledgedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}`)
        : h('button', { onClick: ack, disabled: ackBusy, style: { background: '#f5bc00', color: '#1a1400', border: 'none', borderRadius: '8px', padding: '11px 18px', fontWeight: 800, fontSize: '15px', cursor: 'pointer' } }, ackBusy ? '…' : "✓ I've reviewed this")),

    div({ style: { marginTop: '26px', paddingTop: '14px', borderTop: '1px solid #262b36', fontSize: '11px', color: '#78839a' } },
      `View-only snapshot${exp ? ` · link expires ${exp.toLocaleDateString()}` : ''}. Questions? Reply to whoever sent you this.`),
    h('style', null, `.md-rpt h1{font-size:17px;margin:0 0 10px}.md-rpt h2{font-size:14px;margin:16px 0 6px;color:#f5bc00}.md-rpt ul,.md-rpt ol{padding-left:20px;margin:6px 0}.md-rpt li{margin:3px 0}.md-rpt table{border-collapse:collapse;width:100%;font-size:12.5px;margin:8px 0}.md-rpt th,.md-rpt td{border:1px solid #262b36;padding:4px 7px;text-align:left}.md-rpt strong{color:#fff}.md-rpt em{color:#aab3c5}`)
  );
}
