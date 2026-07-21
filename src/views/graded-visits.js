// @ts-nocheck
import * as React from 'react';
import { STORE_NAMES, sNameC } from '../constants.js';
import { parseGradedVisit } from '../parsers/graded-visits.js';
import { loadGradedVisits, saveGradedVisits } from '../lib/supabase.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const PASS = 80; // CFV pass threshold (%)
const scoreColor = s => s == null ? 'var(--text3)' : s >= PASS ? '#10b981' : s >= 70 ? '#f59e0b' : '#ef4444';
const fmtPct = v => v == null ? '—' : (Math.round(v * 10) / 10) + '%';
const niceDate = iso => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

// Primary (non-Counter) module score for the compact table column.
const primaryModule = v => {
  const e = Object.entries(v.modules || {}).find(([k]) => k.toLowerCase() !== 'behind the counter');
  return e ? { name: e[0], pct: e[1].pct } : null;
};
const counterModule = v => {
  const e = Object.entries(v.modules || {}).find(([k]) => k.toLowerCase() === 'behind the counter');
  return e ? e[1].pct : null;
};

export function GradedVisitsPanel({ ds, onClose }) {
  const { useState, useEffect, useMemo, useRef } = React;
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selLoc, setSelLoc] = useState('all');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const refresh = () => { setLoading(true); loadGradedVisits().then(v => { setVisits(v); setLoading(false); }).catch(() => setLoading(false)); };
  useEffect(() => { refresh(); }, []);

  const onFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(f => /\.html?$/i.test(f.name));
    if (!files.length) { setMsg({ t: 'err', x: 'Drop .html visit reports.' }); return; }
    setBusy(true); setMsg(null);
    const parsed = [];
    for (const f of files) {
      try { const v = parseGradedVisit(await f.text(), { passThreshold: PASS }); if (v.store && v.dateISO) parsed.push(v); }
      catch (e) { /* skip unreadable */ }
    }
    if (!parsed.length) { setBusy(false); setMsg({ t: 'err', x: 'No valid CFV reports found in those files.' }); return; }
    const res = await saveGradedVisits(parsed);
    setBusy(false);
    if (res.errors.length) setMsg({ t: 'err', x: 'Save error: ' + res.errors[0] });
    else { setMsg({ t: 'ok', x: `Imported ${res.saved} visit${res.saved > 1 ? 's' : ''}.` }); refresh(); }
  };

  const filtered = useMemo(() => selLoc === 'all' ? visits : visits.filter(v => String(v.store) === String(selLoc)), [visits, selLoc]);
  const stats = useMemo(() => {
    const scored = filtered.filter(v => v.score != null);
    const passes = scored.filter(v => v.score >= PASS).length;
    const app = filtered.filter(v => v.mobileApp === true).length;
    const trad = filtered.filter(v => v.mobileApp === false).length;
    const avg = scored.length ? scored.reduce((a, v) => a + v.score, 0) / scored.length : null;
    return { n: filtered.length, passes, passRate: scored.length ? passes / scored.length * 100 : null, app, trad, avg };
  }, [filtered]);
  const storesWithData = useMemo(() => [...new Set(visits.map(v => String(v.store)))].sort(), [visits]);

  const card = (label, value, color) => div({ style: { flex: '1 1 120px', minWidth: 120, background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, padding: '9px 12px' } },
    div({ style: { fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 } }, label),
    div({ style: { fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', color: color || 'var(--text)' } }, value));

  const thS = { padding: '6px 8px', fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text3)', borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap', textAlign: 'right', background: 'var(--surf2)' };
  const tdS = { padding: '6px 8px', fontSize: 11, borderBottom: '.5px solid rgba(255,255,255,.04)', whiteSpace: 'nowrap', textAlign: 'right' };

  return div({ style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 460, display: 'flex', flexDirection: 'column', paddingTop: 20 } },
    div({ style: { flex: '0 0 20px', cursor: 'pointer' }, onClick: onClose }),
    div({ style: { flex: 1, background: 'var(--surf)', maxWidth: 1080, margin: '0 auto', width: 'calc(100% - 32px)', borderRadius: 'var(--rl) var(--rl) 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,.4)' } },

      // Header
      div({ style: { padding: '10px 16px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        span({ style: { fontSize: 18 } }, '📋'),
        div({ style: { flex: 1 } },
          div({ style: { fontSize: 14, fontWeight: 800, color: 'var(--text)' } }, 'Graded Visits — Customer First Visit'),
          div({ style: { fontSize: 9, color: 'var(--text3)' } }, 'Channel · mobile-app vs traditional · pass ≥ ' + PASS + '% · RGR / Ecosure slot in once uploaded')),
        h('select', { value: selLoc, onChange: e => setSelLoc(e.target.value), style: { background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 10, padding: '3px 7px' } },
          h('option', { value: 'all' }, 'All Stores'),
          storesWithData.map(l => h('option', { key: l, value: l }, sNameC(l)))),
        btn({ className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),

      // Body
      div({ style: { flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 } },

        // Upload row
        div({ style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 12px', background: 'rgba(245,188,0,.05)', border: '.5px dashed rgba(245,188,0,.3)', borderRadius: 8 } },
          btn({ onClick: () => fileRef.current && fileRef.current.click(), disabled: busy,
            style: { padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(245,158,11,.4)', background: 'rgba(245,158,11,.1)', color: 'var(--amber)', fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer' } },
            busy ? 'Importing…' : '＋ Upload CFV reports (.html)'),
          h('input', { ref: fileRef, type: 'file', accept: '.html,.htm', multiple: true, style: { display: 'none' }, onChange: e => onFiles(e.target.files) }),
          span({ style: { fontSize: 10, color: 'var(--text3)' } }, 'Comprehensive Visit Report exports. Re-importing a store+date overwrites it.'),
          msg && span({ style: { fontSize: 11, fontWeight: 600, marginLeft: 'auto', color: msg.t === 'ok' ? '#10b981' : '#ef4444' } }, msg.x)),

        loading ? div({ style: { textAlign: 'center', padding: '40px', color: 'var(--text3)', fontSize: 12 } }, 'Loading visits…')
          : visits.length === 0 ? div({ style: { textAlign: 'center', padding: '48px 20px', color: 'var(--text3)', fontSize: 12, border: '1px dashed var(--bdr)', borderRadius: 8 } },
            div({ style: { fontSize: 26, marginBottom: 10 } }, '📋'),
            div({ style: { fontWeight: 700, marginBottom: 6 } }, 'No graded visits yet'),
            'Upload your Customer First Visit HTML exports above to get started.')
            : [
              // Summary cards
              div({ key: 'cards', style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
                card('Visits', String(stats.n)),
                card('Pass Rate', stats.passRate != null ? Math.round(stats.passRate) + '%' : '—', scoreColor(stats.passRate)),
                card('Avg Score', stats.avg != null ? fmtPct(stats.avg) : '—', scoreColor(stats.avg)),
                card('App / Traditional', stats.app + ' / ' + stats.trad)),

              // Visits table
              div({ key: 'tbl', style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'auto' } },
                h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                  h('thead', null, h('tr', null,
                    h('th', { style: { ...thS, textAlign: 'left' } }, 'Store'),
                    h('th', { style: { ...thS, textAlign: 'left' } }, 'Date'),
                    h('th', { style: { ...thS, textAlign: 'left' } }, 'Daypart'),
                    h('th', { style: { ...thS, textAlign: 'left' } }, 'Channel'),
                    h('th', { style: thS }, 'Order'),
                    h('th', { style: thS }, 'Primary'),
                    h('th', { style: thS }, 'Counter'),
                    h('th', { style: thS }, 'Score'),
                    h('th', { style: thS }, 'Result'))),
                  h('tbody', null, ...filtered.map((v, i) => {
                    const pm = primaryModule(v), cm = counterModule(v);
                    return h('tr', { key: v.id || i },
                      h('td', { style: { ...tdS, textAlign: 'left', fontWeight: 600 } }, sNameC(String(v.store))),
                      h('td', { style: { ...tdS, textAlign: 'left', color: 'var(--text2)' } }, niceDate(v.dateISO)),
                      h('td', { style: { ...tdS, textAlign: 'left', color: 'var(--text3)' } }, v.daypart || '—'),
                      h('td', { style: { ...tdS, textAlign: 'left' } }, v.channel || '—'),
                      h('td', { style: { ...tdS, color: v.mobileApp ? '#60a5fa' : 'var(--text3)', fontWeight: v.mobileApp ? 700 : 400 } }, v.mobileApp === true ? '📱 App' : v.mobileApp === false ? 'Traditional' : '—'),
                      h('td', { style: { ...tdS, fontFamily: 'var(--mono)', color: scoreColor(pm && pm.pct) }, title: pm ? pm.name : '' }, pm ? fmtPct(pm.pct) : '—'),
                      h('td', { style: { ...tdS, fontFamily: 'var(--mono)', color: scoreColor(cm) } }, cm != null ? fmtPct(cm) : '—'),
                      h('td', { style: { ...tdS, fontFamily: 'var(--mono)', fontWeight: 800, color: scoreColor(v.score) } }, v.score != null ? fmtPct(v.score) : '—'),
                      h('td', { style: tdS }, v.pass == null ? '—' : span({ style: { fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: (v.pass ? '#10b981' : '#ef4444') + '22', color: v.pass ? '#10b981' : '#ef4444' } }, v.pass ? '✓ Pass' : '✗ Fail')));
                  })))),
            ]),

      // Footer
      div({ style: { padding: '6px 16px', borderTop: '.5px solid var(--bdr)', flexShrink: 0, fontSize: 8, color: 'var(--text3)', background: 'var(--surf2)' } },
        'Channel = primary scored module (Drive Thru / Curbside / Front Counter / Delivery). App = Curbside (mobile by nature) or the DT “using your McDonald’s App” question. Foundation for the Graded-Visit Predictor.')
    ));
}
