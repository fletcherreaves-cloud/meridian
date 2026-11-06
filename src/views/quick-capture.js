// @ts-nocheck
// ── Quick-Capture Phase 1 (memory/plan-overnight-notes-72-2026-11-06.md §1, task #101) ──────────
// Front-screen "+ Log Something" entry point — always reachable from the top bar, not three
// clicks into a store tab. Category tiles + quick-suggest chips reuse the EXISTING EVENT_TYPES
// taxonomy (constants.js) unchanged; free text is a genuine fallback, not an afterthought. Writes
// through saveOrgEvents() — the SAME pipeline the Events Calendar's manual/bulk entry points use
// (src/lib/supabase.js) — so a quick-captured event is indistinguishable downstream (Event Impact
// Registry, Scanner, the Events panel) from one typed in the calendar. No gamification/badges —
// per the plan doc, the feedback loop is the REAL measured number from the Event Impact Registry,
// shown back on submit, honestly reporting "no history yet" rather than inventing one.
import * as React from 'react';
import { saveOrgEvents, loadEventImpact } from '../lib/supabase.js';
import { buildQuickCaptureEvent, lookupMeasuredImpact } from '../engine/quick-capture.js';
import { EVENT_TYPES, EVENT_TYPE_GROUPS, STORE_NAMES, sName } from '../constants.js';
import { businessDate } from '../utils/date.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const tileStyle = (active) => ({
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: 6, padding: '16px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
  border: '1px solid ' + (active ? 'var(--gold)' : 'var(--bdr)'),
  background: active ? 'rgba(245,188,0,.08)' : 'var(--surf2)',
  fontSize: 12, fontWeight: 700, color: 'var(--text)',
});

const chipStyle = (active) => ({
  padding: '7px 13px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600,
  border: '1px solid ' + (active ? 'var(--gold)' : 'var(--bdr2)'),
  background: active ? 'rgba(245,188,0,.1)' : 'var(--surf3)',
  color: active ? 'var(--gold)' : 'var(--text2)', whiteSpace: 'nowrap',
});

export function QuickCapturePanel({ stores, selStore, settings, onClose }) {
  const [step, setStep] = React.useState('category'); // 'category' | 'detail' | 'done'
  const [group, setGroup] = React.useState(null);
  const [type, setType] = React.useState(null);
  const [freeText, setFreeText] = React.useState('');
  const [loc, setLoc] = React.useState(() => String(selStore || (stores && stores[0] && stores[0].loc) || ''));
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [result, setResult] = React.useState(null); // { label, type, storeName, impact }

  const storeOptions = React.useMemo(
    () => (stores || []).map(s => ({ loc: String(s.loc), name: sName(s.loc) || STORE_NAMES[s.loc] || s.loc }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [stores]
  );

  function pickGroup(g) {
    setGroup(g);
    setType(null);
    setFreeText('');
    setStep('detail');
  }

  function pickChip(key) {
    setType(key);
    setFreeText(''); // a chip pick is unambiguous -- don't also carry stale free text into the label
  }

  async function submit() {
    const label = (type && EVENT_TYPES[type] ? EVENT_TYPES[type].label : '') || freeText.trim();
    if (!loc || !label) { setErr('Pick an item or describe what happened, and make sure a store is selected.'); return; }
    const effectiveType = type || (freeText.trim() ? 'other' : null);
    setBusy(true); setErr(null);
    try {
      const ev = buildQuickCaptureEvent({
        loc, type: effectiveType, label, note: note.trim() || null,
        dateStart: businessDate(), enteredBy: (settings && settings._userEmail) || null,
      });
      const { saved, errors } = await saveOrgEvents([ev], { method: 'quick-capture', enteredBy: ev.enteredBy });
      if (!saved) { setErr((errors && errors[0]) || 'Could not save — try again.'); setBusy(false); return; }

      const impactRows = await loadEventImpact().catch(() => []);
      const impact = lookupMeasuredImpact(impactRows, loc, effectiveType);
      const storeName = sName(loc) || STORE_NAMES[loc] || loc;
      setResult({ label, type: effectiveType, storeName, impact });
      setStep('done');
    } catch (e) {
      setErr(String(e && e.message || e));
    } finally {
      setBusy(false);
    }
  }

  function logAnother() {
    setStep('category'); setGroup(null); setType(null); setFreeText(''); setNote(''); setErr(null); setResult(null);
  }

  if (step === 'category') {
    return div({ style: { display: 'flex', flexDirection: 'column', gap: 14 } },
      div({ style: { fontSize: 12, color: 'var(--text3)' } }, 'What happened? Pick a category — you can describe it in your own words on the next step either way.'),
      div({ style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 } },
        ...EVENT_TYPE_GROUPS.map(g =>
          div({ key: g.label, style: tileStyle(false), onClick: () => pickGroup(g) }, g.label)
        )
      ),
      div({ style: { fontSize: 11, color: 'var(--text3)', textAlign: 'center' } },
        'Not sure which? ',
        span({ style: { color: 'var(--acc2, var(--gold))', cursor: 'pointer', fontWeight: 700 }, onClick: () => pickGroup(EVENT_TYPE_GROUPS.find(g => g.items.includes('other')) || EVENT_TYPE_GROUPS[EVENT_TYPE_GROUPS.length - 1]) }, 'just describe it →')
      )
    );
  }

  if (step === 'detail') {
    return div({ style: { display: 'flex', flexDirection: 'column', gap: 14 } },
      div({ style: { display: 'flex', alignItems: 'center', gap: 8 } },
        btn({ className: 'btn btn-sm', onClick: () => setStep('category') }, '← Back'),
        div({ style: { fontSize: 12, fontWeight: 700, color: 'var(--text)' } }, group ? group.label : 'Describe it')
      ),
      storeOptions.length > 1 && div({ style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        span({ style: { fontSize: 11, fontWeight: 700, color: 'var(--text2)' } }, 'STORE'),
        h('select', {
          value: loc, onChange: e => setLoc(e.target.value),
          style: { background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 12.5 },
        }, ...storeOptions.map(s => h('option', { key: s.loc, value: s.loc }, s.name)))
      ),
      group && div({ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        span({ style: { fontSize: 11, fontWeight: 700, color: 'var(--text2)' } }, 'QUICK PICK'),
        div({ style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
          ...group.items.filter(k => EVENT_TYPES[k]).map(k =>
            span({ key: k, style: chipStyle(type === k), onClick: () => pickChip(k) }, EVENT_TYPES[k].icon + ' ' + EVENT_TYPES[k].label)
          )
        )
      ),
      div({ style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        h('label', { htmlFor: 'qc-free', style: { fontSize: 11, fontWeight: 700, color: 'var(--text2)' } }, type ? 'OR DESCRIBE IT INSTEAD' : 'DESCRIBE IT'),
        h('textarea', {
          id: 'qc-free', rows: 2, value: freeText,
          placeholder: 'Type anything — it still gets logged and correlated the same way.',
          onChange: e => { setFreeText(e.target.value); if (e.target.value.trim()) setType(null); },
          style: { background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 8, padding: 10, color: 'var(--text)', fontFamily: 'inherit', fontSize: 12.5, resize: 'none' },
        })
      ),
      div({ style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        h('label', { htmlFor: 'qc-note', style: { fontSize: 11, fontWeight: 700, color: 'var(--text2)' } }, 'NOTE (OPTIONAL)'),
        h('textarea', {
          id: 'qc-note', rows: 2, value: note, placeholder: 'Any extra detail worth keeping.',
          onChange: e => setNote(e.target.value),
          style: { background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 8, padding: 10, color: 'var(--text)', fontFamily: 'inherit', fontSize: 12.5, resize: 'none' },
        })
      ),
      err && div({ style: { fontSize: 12, color: 'var(--crit, #ef4444)' } }, err),
      div({ style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
        btn({ className: 'btn btn-sm', disabled: busy, onClick: onClose }, 'Cancel'),
        btn({ className: 'btn btn-sm', disabled: busy, onClick: submit,
          style: { background: 'var(--gold)', color: '#1a1200', fontWeight: 800, borderColor: 'var(--gold)' } },
          busy ? 'Logging…' : 'Log it →')
      )
    );
  }

  // step === 'done'
  const imp = result && result.impact;
  return div({ style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    div({ style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--text)' } },
      span({ style: { color: 'var(--green, #10b981)' } }, '✓'),
      `${result.storeName} — "${result.label}" logged`
    ),
    div({ style: { background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 10, padding: 14 } },
      imp
        ? div(null,
            div({ style: { fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 700, color: imp.pct >= 0 ? 'var(--green, #10b981)' : 'var(--crit, #ef4444)' } },
              (imp.pct >= 0 ? '+' : '') + (imp.pct * 100).toFixed(1) + '%'),
            div({ style: { fontSize: 11.5, color: 'var(--text3)', marginTop: 2 } },
              `measured sales impact, ${imp.measured ? 'measured' : 'estimated'}, n=${imp.n} prior occurrence${imp.n === 1 ? '' : 's'} at this store`)
          )
        : div({ style: { fontSize: 12.5, color: 'var(--text2)' } },
            `No measured history yet for "${result.type}" at ${result.storeName} — this may be the first time it's been logged here. It'll start contributing to the Event Impact Registry and Signals' Scanner correlations going forward.`)
    ),
    div({ style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
      btn({ className: 'btn btn-sm', onClick: logAnother }, 'Log another'),
      btn({ className: 'btn btn-sm', onClick: onClose, style: { background: 'var(--gold)', color: '#1a1200', fontWeight: 800, borderColor: 'var(--gold)' } }, 'Done')
    )
  );
}
