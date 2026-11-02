// @ts-nocheck
// Owner req (2026-11-02): after a late Business Day Close left Product Net Sales/Cash +/- stale
// for several stores (Elgin the example), a manual re-dispatch of the FOB and Operations Report
// pulls caught them up. This button does the same thing from inside the app, instead of needing
// a GitHub Actions dispatch run by hand — same `trigger-dar-sync` Edge Function + `triggerSync()`
// mechanism the Data Manager panel's own "↻ Sync" buttons already use (src/views/analytics.js),
// just fired as one combined action (FOB + Operations Report together) since EOM numbers depend
// on both, and placed on the panels where a stale number would actually be noticed: the
// Supervisor Rollup and the EOM Dashboard.
import * as React from 'react';
import { triggerSync } from '../lib/supabase.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

/** compact: smaller footprint for a toolbar; omit for a standalone block. */
export function EOMDataRefreshButton({ compact = false }) {
  const { useState: uSt } = React;
  const [busy, setBusy] = uSt(false);
  const [result, setResult] = uSt(null); // { ok, msg }

  const run = async () => {
    setBusy(true); setResult(null);
    const [fob, ops] = await Promise.all([triggerSync('fob', {}), triggerSync('ops', {})]);
    setBusy(false);
    const fail = [fob, ops].filter(r => r?.error);
    if (fail.length) {
      setResult({ ok: false, msg: fail.map(r => r.error).join('; ') });
    } else {
      setResult({ ok: true, msg: 'FOB + Operations Report sync started — Product Net Sales and Cash +/- refresh in ~10 min.' });
    }
  };

  return div({ style: { display: 'flex', alignItems: 'center', gap: 8 } },
    h('button', {
      onClick: run, disabled: busy, title: 'Re-pull Product Net Sales (FOB) and Cash +/- (Operations Report) from QSRSoft now',
      style: {
        fontSize: compact ? '9px' : '10px', fontWeight: 700, padding: compact ? '3px 8px' : '5px 10px',
        borderRadius: 'var(--r)', cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap',
        background: busy ? 'var(--surf3)' : 'rgba(245,188,0,.15)',
        color: busy ? 'var(--text3)' : 'var(--accent)',
        border: '.5px solid ' + (busy ? 'var(--bdr2)' : 'rgba(245,188,0,.4)'),
      },
    }, busy ? '…refreshing' : '🔄 Refresh EOM Data'),
    result && span({ style: { fontSize: compact ? '8px' : '9px', color: result.ok ? '#10b981' : '#ef4444', maxWidth: 360 } },
      (result.ok ? '✓ ' : '✗ ') + result.msg),
  );
}
