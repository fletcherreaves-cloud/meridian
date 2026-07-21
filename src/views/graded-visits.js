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
  const [typeFilter, setTypeFilter] = useState('all');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [skipList, setSkipList] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const dirRef = useRef(null);

  const refresh = () => { setLoading(true); loadGradedVisits().then(v => { setVisits(v); setLoading(false); }).catch(() => setLoading(false)); };
  useEffect(() => { refresh(); }, []);

  const onFiles = async (fileList) => {
    const all = Array.from(fileList || []);
    const htmls = all.filter(f => /\.html?$/i.test(f.name));
    const notHtml = all.length - htmls.length;
    if (!htmls.length) { setMsg({ t: 'err', x: `No .html files (got ${all.length}). Export the visit as HTML, not PDF.` }); return; }
    setBusy(true); setMsg(null); setSkipList([]);
    const parsed = [], skipped = [];
    for (const f of htmls) {
      try {
        const v = parseGradedVisit(await f.text(), { passThreshold: PASS });
        if (v.store && v.dateISO) { v._file = f.name; parsed.push(v); }
        else skipped.push(f.name + (v.store ? ' — no date found' : ' — unrecognized format (no store id)'));
      } catch (e) { skipped.push(f.name + ' — parse error'); }
    }
    // Key collisions = the parser read the same store+date for different files.
    const keys = parsed.map(v => String(v.store) + '|' + v.dateISO + '|' + (v.reportType || 'CFV'));
    const uniqueKeys = new Set(keys).size;
    const collisions = {};
    keys.forEach((k, i) => { (collisions[k] = collisions[k] || []).push(parsed[i]); });
    const collided = Object.entries(collisions).filter(([, arr]) => arr.length > 1)
      .map(([k, arr]) => `${arr.length}× same key ${k}  → e.g. ${arr[0]._file || ''} / ${arr[1]._file || ''}`);
    console.log('[graded-visits] selected', all.length, '· HTML', htmls.length, '· parsed', parsed.length, '· unique keys', uniqueKeys, '· skipped', skipped.length, keys, all.map(f => f.name));
    if (fileRef.current) fileRef.current.value = ''; // allow re-selecting the same files
    const res = parsed.length ? await saveGradedVisits(parsed) : { saved: 0, errors: [] };
    setBusy(false);
    setSkipList(skipped.concat(collided.length ? ['— key collisions (parser read same store+date for different files):', ...collided] : []));
    if (res.errors.length) { setMsg({ t: 'err', x: 'Save error: ' + res.errors[0] }); return; }
    const dupN = parsed.length - uniqueKeys;
    const bits = [`Selected ${all.length}`];
    if (notHtml) bits.push(`${htmls.length} HTML (${notHtml} non-HTML ignored)`);
    bits.push(`parsed ${parsed.length}`, `saved ${res.saved}`);
    if (dupN > 0) bits.push(`${dupN} collapsed on duplicate store+date`);
    if (skipped.length) bits.push(`${skipped.length} skipped`);
    setMsg({ t: (notHtml || skipped.length || dupN > 0) ? 'warn' : 'ok', x: bits.join(' · ') });
    if (res.saved) refresh();
  };

  const filtered = useMemo(() => visits.filter(v =>
    (selLoc === 'all' || String(v.store) === String(selLoc)) &&
    (typeFilter === 'all' || (v.reportType || 'CFV') === typeFilter)
  ), [visits, selLoc, typeFilter]);
  const types = useMemo(() => [...new Set(visits.map(v => v.reportType || 'CFV'))], [visits]);
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
          div({ style: { fontSize: 14, fontWeight: 800, color: 'var(--text)' } }, 'Graded Visits'),
          div({ style: { fontSize: 9, color: 'var(--text3)' } }, 'CFV (channel · app) & RGR (whole-restaurant, component-scored) · pass ≥ ' + PASS + '% · Ecosure slots in once uploaded')),
        types.length > 1 && h('select', { value: typeFilter, onChange: e => setTypeFilter(e.target.value), style: { background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 10, padding: '3px 7px' } },
          h('option', { value: 'all' }, 'All Types'),
          types.map(t => h('option', { key: t, value: t }, t))),
        h('select', { value: selLoc, onChange: e => setSelLoc(e.target.value), style: { background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 10, padding: '3px 7px' } },
          h('option', { value: 'all' }, 'All Stores'),
          storesWithData.map(l => h('option', { key: l, value: l }, sNameC(l)))),
        btn({ className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),

      // Body
      div({ style: { flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 } },

        // Upload / drop zone
        div({
          onDragOver: e => { e.preventDefault(); if (!dragOver) setDragOver(true); },
          onDragLeave: e => { e.preventDefault(); setDragOver(false); },
          onDrop: e => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); },
          style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px', background: dragOver ? 'rgba(245,188,0,.16)' : 'rgba(245,188,0,.05)', border: `1px dashed rgba(245,188,0,${dragOver ? '.75' : '.3'})`, borderRadius: 8, transition: 'background .1s' } },
          btn({ onClick: () => fileRef.current && fileRef.current.click(), disabled: busy,
            style: { padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(245,158,11,.4)', background: 'rgba(245,158,11,.1)', color: 'var(--amber)', fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer' } },
            busy ? 'Importing…' : '＋ Upload files'),
          btn({ onClick: () => dirRef.current && dirRef.current.click(), disabled: busy,
            style: { padding: '5px 12px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer' } },
            '📁 Upload folder'),
          h('input', { ref: fileRef, type: 'file', accept: '.html,.htm', multiple: true, style: { display: 'none' }, onChange: e => onFiles(e.target.files) }),
          h('input', { ref: dirRef, type: 'file', webkitdirectory: '', directory: '', multiple: true, style: { display: 'none' }, onChange: e => onFiles(e.target.files) }),
          span({ style: { fontSize: 10, color: dragOver ? 'var(--amber)' : 'var(--text3)' } }, dragOver ? 'Drop to import' : 'Drag files or a whole folder here (or use the buttons). CFV & RGR HTML. Re-import overwrites same store+date.'),
          msg && span({ style: { fontSize: 11, fontWeight: 600, marginLeft: 'auto', color: msg.t === 'ok' ? '#10b981' : msg.t === 'warn' ? '#f59e0b' : '#ef4444' } }, msg.x)),

        // Skipped files — so you can see exactly which didn't import and why.
        skipList.length > 0 && div({ style: { padding: '8px 12px', background: 'rgba(239,68,68,.05)', border: '.5px solid rgba(239,68,68,.2)', borderRadius: 8, fontSize: 10, color: 'var(--text2)' } },
          div({ style: { fontWeight: 700, color: '#f59e0b', marginBottom: 4 } }, `Skipped ${skipList.length} file${skipList.length > 1 ? 's' : ''} (send me one and I'll add its format):`),
          div({ style: { display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 120, overflowY: 'auto', fontFamily: 'var(--mono)', fontSize: 9 } },
            skipList.map((s, i) => div({ key: i, style: { color: 'var(--text3)' } }, '• ' + s)))),

        loading ? div({ style: { textAlign: 'center', padding: '40px', color: 'var(--text3)', fontSize: 12 } }, 'Loading visits…')
          : visits.length === 0 ? div({ style: { textAlign: 'center', padding: '48px 20px', color: 'var(--text3)', fontSize: 12, border: '1px dashed var(--bdr)', borderRadius: 8 } },
            div({ style: { fontSize: 26, marginBottom: 10 } }, '📋'),
            div({ style: { fontWeight: 700, marginBottom: 6 } }, 'No graded visits yet'),
            'Upload your visit report HTML exports (CFV or RGR) above to get started.')
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
                    h('th', { style: { ...thS, textAlign: 'left' } }, 'Type'),
                    h('th', { style: { ...thS, textAlign: 'left' } }, 'Store'),
                    h('th', { style: { ...thS, textAlign: 'left' } }, 'Date'),
                    h('th', { style: { ...thS, textAlign: 'left' } }, 'Detail'),
                    h('th', { style: thS }, 'Score'),
                    h('th', { style: thS }, 'Result'))),
                  h('tbody', null, ...filtered.map((v, i) => {
                    const isRGR = (v.reportType || 'CFV') === 'RGR';
                    const compTip = Object.entries(v.modules || {}).map(([k, m]) => `${k}: ${fmtPct(m.pct)}`).join('  ·  ');
                    const belowN = Object.values(v.modules || {}).filter(m => m.pct < 80).length;
                    const detail = isRGR
                      ? span({ title: compTip },
                          v.status ? span({ style: { fontWeight: 600, color: 'var(--text2)' } }, v.status) : null,
                          span({ style: { marginLeft: v.status ? 6 : 0, color: belowN ? '#f59e0b' : 'var(--text3)' } }, belowN + ' comp <80'))
                      : span(null,
                          span({ style: { color: 'var(--text2)' } }, v.channel || '—'),
                          v.mobileApp != null ? span({ style: { marginLeft: 6, color: v.mobileApp ? '#60a5fa' : 'var(--text3)', fontWeight: v.mobileApp ? 700 : 400 } }, v.mobileApp ? '📱 App' : 'Traditional') : null);
                    return h('tr', { key: v.id || i },
                      h('td', { style: { ...tdS, textAlign: 'left' } }, span({ style: { fontSize: 8.5, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: (isRGR ? '#a78bfa' : '#60a5fa') + '22', color: isRGR ? '#a78bfa' : '#60a5fa' } }, v.reportType || 'CFV')),
                      h('td', { style: { ...tdS, textAlign: 'left', fontWeight: 600 } }, sNameC(String(v.store))),
                      h('td', { style: { ...tdS, textAlign: 'left', color: 'var(--text2)' } }, niceDate(v.dateISO)),
                      h('td', { style: { ...tdS, textAlign: 'left', fontSize: 10 } }, detail),
                      h('td', { style: { ...tdS, fontFamily: 'var(--mono)', fontWeight: 800, color: scoreColor(v.score) } }, v.score != null ? fmtPct(v.score) : '—'),
                      h('td', { style: tdS }, v.pass == null ? '—' : span({ style: { fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: (v.pass ? '#10b981' : '#ef4444') + '22', color: v.pass ? '#10b981' : '#ef4444' } }, v.pass ? '✓ Pass' : '✗ Fail')));
                  })))),
            ]),

      // Footer
      div({ style: { padding: '6px 16px', borderTop: '.5px solid var(--bdr)', flexShrink: 0, fontSize: 8, color: 'var(--text3)', background: 'var(--surf2)' } },
        'Channel = primary scored module (Drive Thru / Curbside / Front Counter / Delivery). App = Curbside (mobile by nature) or the DT “using your McDonald’s App” question. Foundation for the Graded-Visit Predictor.')
    ));
}
