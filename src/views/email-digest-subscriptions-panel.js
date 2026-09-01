// @ts-nocheck
// ── Email Digest Subscriptions (owner req, 2026-09-01) ────────────────────────────────────────
// Owner, verbatim: "can we build out a section... to configure email reports? If we are being
// smart we will go ahead make this available based on users and allow anyone to sign up or opt
// in to whichever reports they want emailed to them."
//
// A flat, generic list driven by EMAIL_DIGEST_CATALOG (src/engine/email-digest-catalog.js) — one
// row per scheduled digest, a single subscribe/unsubscribe toggle each, no scope/period picker
// (these are org-wide scheduled emails, not the per-scope launchable reports "My Reports" already
// covers — see this file's own supabase.js counterpart for the full distinction). Adding a new
// digest to the catalog is the only change needed to make it selectable here.
import * as React from 'react';
import { ModalShell } from '../components/ModalShell.js';
import { EMAIL_DIGEST_CATALOG } from '../engine/email-digest-catalog.js';
import { loadMyEmailDigestSubscriptions, setEmailDigestSubscription } from '../lib/supabase.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

export function EmailDigestSubscriptionsPanel({ onClose }) {
  const { useState, useEffect } = React;
  const [subs, setSubs] = useState(null);    // Set of subscribed digest_keys, null = loading
  const [busyKey, setBusyKey] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    loadMyEmailDigestSubscriptions()
      .then(s => { if (live) setSubs(s); })
      .catch(e => { if (live) { setErr(String(e?.message || e)); setSubs(new Set()); } });
    return () => { live = false; };
  }, []);

  const toggle = async (key, next) => {
    setBusyKey(key); setErr('');
    const res = await setEmailDigestSubscription(key, next);
    if (res.saved) {
      setSubs(prev => { const n = new Set(prev); next ? n.add(key) : n.delete(key); return n; });
    } else {
      setErr(res.error || 'Could not save — try again.');
    }
    setBusyKey(null);
  };

  return h(ModalShell, {
    title: 'Email Digests',
    subtitle: 'Opt in to whichever scheduled reports you want emailed to you.',
    icon: '📧',
    maxWidth: 520,
    onClose,
  },
    div({ style: { padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 } },
      subs === null && div({ style: { fontSize: '11px', color: 'var(--text3)' } }, 'Loading…'),
      err && div({ style: { fontSize: '11px', color: 'var(--red)' } }, err),
      subs !== null && EMAIL_DIGEST_CATALOG.length === 0
        && div({ style: { fontSize: '11px', color: 'var(--text3)' } }, 'No scheduled digests are configured yet.'),
      subs !== null && EMAIL_DIGEST_CATALOG.map(d => {
        const on = subs.has(d.key);
        const busy = busyKey === d.key;
        return div({
          key: d.key,
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '10px 12px', border: '.5px solid var(--bdr)', borderRadius: 8, background: 'var(--surf2)',
          },
        },
          div({ style: { minWidth: 0 } },
            div({ style: { fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' } }, d.icon + ' ' + d.label),
            div({ style: { fontSize: '10.5px', color: 'var(--text3)', marginTop: 3, maxWidth: 340 } }, d.description),
          ),
          btn({
            className: 'btn btn-sm', disabled: busy, style: { flexShrink: 0, fontWeight: 700,
              ...(on ? { background: 'var(--amber)', color: '#111', borderColor: 'var(--amber)' } : {}) },
            onClick: () => toggle(d.key, !on),
          }, busy ? '…' : (on ? '✓ Subscribed' : 'Subscribe')),
        );
      }),
      div({ style: { fontSize: '9.5px', color: 'var(--text3)', borderTop: '1px solid var(--bdr)', paddingTop: 8, marginTop: 2 } },
        'Sent to your account email. You can unsubscribe from any digest here at any time.'),
    ),
  );
}
