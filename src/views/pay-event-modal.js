// @ts-nocheck
// ── Pay event modal (owner request 2026-10-15) ────────────────────────────────
// Logs a raise/review-cycle pay increase against a store. Pre-filled with the store (and, when
// opened from a detected jump, the effective date defaulted a couple weeks back to roughly
// bracket when the AROP step actually happened) — the only required typing is picking a raise
// type; everything else is optional context.
import * as React from 'react';
import { ModalShell } from '../components/ModalShell.js';
import { STORE_NAMES } from '../constants.js';
import { PAY_EVENT_TYPES, AROP_WINDOW_DAYS } from '../engine/pay-events.js';
import { metricAvg } from '../engine/metric-source.js';
import { lastClosedBusinessDay, addD, dKey } from '../utils/date.js';
import { savePayEvent } from '../lib/supabase.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const lbl = (text) => span({ style: { fontSize: '9px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px' } }, text);
const fieldWrap = (...c) => div({ style: { display: 'flex', flexDirection: 'column', gap: 4 } }, ...c);

/** props: { loc, ds, defaultEffectiveDate, onClose, onSaved } */
export function PayEventModal({ loc, ds, defaultEffectiveDate, onClose, onSaved }) {
  const { useState, useMemo } = React;
  const today = dKey(new Date());
  const [effectiveDate, setEffectiveDate] = useState(defaultEffectiveDate || today);
  const [reviewDate, setReviewDate] = useState('');
  const [raiseType, setRaiseType] = useState('review_raise');
  const [amountPerHour, setAmountPerHour] = useState('');
  const [employeeLabel, setEmployeeLabel] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const storeName = STORE_NAMES[loc] || loc;
  const currentArop = useMemo(() => {
    const end = lastClosedBusinessDay();
    return metricAvg(ds, loc, { s: addD(end, -(AROP_WINDOW_DAYS - 1)), e: end }, 'avgRate');
  }, [ds, loc]);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const { error } = await savePayEvent({
        loc, raiseType, employeeLabel, note,
        amountPerHour: amountPerHour === '' ? null : Number(amountPerHour),
        reviewDate: reviewDate || null, effectiveDate,
      });
      if (error) throw new Error(error);
      onSaved && onSaved();
      onClose && onClose();
    } catch (e) {
      setErr(String(e?.message || e));
    } finally { setSaving(false); }
  };

  return h(ModalShell, {
    title: `Log Pay Event — ${storeName}`,
    subtitle: currentArop != null
      ? `Current AROP (trailing ${AROP_WINDOW_DAYS} days): $${currentArop.toFixed(2)}/hr`
      : 'No recent AROP data for this store.',
    icon: '💰',
    maxWidth: 460,
    onClose,
  },
    div({ style: { padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 } },
      div({ style: { display: 'flex', gap: 10 } },
        fieldWrap(lbl('Effective date'),
          h('input', { type: 'date', value: effectiveDate, max: today, onChange: e => e.target.value && setEffectiveDate(e.target.value),
            style: { background: 'var(--surf3)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: '11px', padding: '5px 8px', fontFamily: 'inherit', width: 140 } })),
        fieldWrap(lbl('Review date (optional)'),
          h('input', { type: 'date', value: reviewDate, max: today, onChange: e => setReviewDate(e.target.value),
            style: { background: 'var(--surf3)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: '11px', padding: '5px 8px', fontFamily: 'inherit', width: 140 } })),
      ),
      fieldWrap(lbl('Raise type'),
        h('select', { value: raiseType, onChange: e => setRaiseType(e.target.value),
          style: { background: 'var(--surf3)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: '11px', padding: '5px 8px', fontFamily: 'inherit' } },
          ...Object.entries(PAY_EVENT_TYPES).map(([k, v]) => h('option', { key: k, value: k }, v.label)))),
      div({ style: { display: 'flex', gap: 10 } },
        fieldWrap(lbl('$/hr increase (optional)'),
          h('input', { type: 'number', step: '0.01', value: amountPerHour, placeholder: 'e.g. 0.50',
            onChange: e => setAmountPerHour(e.target.value),
            style: { background: 'var(--surf3)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: '11px', padding: '5px 8px', fontFamily: 'inherit', width: 110 } })),
        fieldWrap(lbl('Who / what (optional)'),
          h('input', { type: 'text', value: employeeLabel, placeholder: 'e.g. crew minimum bump',
            onChange: e => setEmployeeLabel(e.target.value),
            style: { background: 'var(--surf3)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: '11px', padding: '5px 8px', fontFamily: 'inherit', flex: 1 } })),
      ),
      fieldWrap(lbl('Note (optional)'),
        h('textarea', { value: note, onChange: e => setNote(e.target.value), rows: 3,
          placeholder: 'e.g. annual review raise, approved by DO',
          style: { background: 'var(--surf3)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: '11px', padding: '6px 8px', resize: 'vertical', fontFamily: 'inherit' } })),
      err && div({ style: { fontSize: '9px', color: 'var(--crit)' } }, '⚠ ' + err),
      div({ style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        btn({ className: 'btn btn-sm', onClick: onClose, disabled: saving }, 'Cancel'),
        btn({ className: 'btn btn-sm btn-primary', onClick: save, disabled: saving || !effectiveDate }, saving ? 'Saving…' : 'Log Pay Event'),
      ),
    ),
  );
}
