// @ts-nocheck
// ── Quick Upload View ───────────────────────────────────────────────────────────────────────────
// Minimal, mobile-first upload screen — the "pin this to your iPhone home screen" fast path
// (owner request, 2026-11-17): iOS Safari doesn't implement the Web Share Target API at all (a
// platform limitation, not something this codebase can fix — see v5.816's finding), so there's
// no way to make Meridian appear in the native Share Sheet on iPhone the way it already does on
// Android. The easiest thing that scales to EVERY future user with zero per-person setup is a
// dedicated, low-chrome route a user adds to their home screen once (Share → Add to Home
// Screen) — iOS binds that icon to whatever URL was open at the time, so it opens straight into
// this screen in standalone mode, no personalized Shortcut, no new backend, no per-user token to
// provision or debug.
//
// Rendered by App.js when ?quickupload=1 is present, AFTER normal AuthGate login — this is a
// real, authenticated screen using the exact SAME upload pipeline (handleFiles) and SAME
// confirmation UI (UploadSummaryModal) the full dashboard's sidebar "Load" button already uses.
// Nothing here is a second implementation of parsing/saving — this file is presentation only.
import * as React from 'react';
const { useState, useRef } = React;
const h = React.createElement;

const ACCEPT = '.xlsx,.xlsm,.xls,.csv,.pdf,.html,.htm,application/pdf,text/html';

export function QuickUploadView({ loadMsg, onFiles, onExitToFullApp }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const pick = () => inputRef.current && inputRef.current.click();
  const handleChange = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) onFiles(files);
  };
  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) onFiles(files);
  };

  const busy = !!loadMsg;

  return h('div', {
    style: {
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20, padding: '32px 20px',
      background: 'var(--bg)', color: 'var(--text)',
      fontFamily: 'var(--sans, -apple-system, system-ui, sans-serif)',
      textAlign: 'center',
    },
  },
    h('div', { style: { fontSize: 13, fontWeight: 700, letterSpacing: '.08em', color: 'var(--amber)', textTransform: 'uppercase' } }, 'Meridian'),
    h('div', { style: { fontSize: 24, fontWeight: 800, marginBottom: 4 } }, 'Quick Upload'),
    h('div', { style: { fontSize: 13, color: 'var(--text3)', maxWidth: 320, lineHeight: 1.5 } },
      'Download a report in QSRSoft, then come here and tap below to add it to Meridian.'),

    h('input', {
      ref: inputRef, type: 'file', multiple: true, accept: ACCEPT,
      style: { display: 'none' }, onChange: handleChange,
    }),

    h('button', {
      onClick: pick,
      disabled: busy,
      onDragOver: (e) => { e.preventDefault(); setDragOver(true); },
      onDragLeave: () => setDragOver(false),
      onDrop: handleDrop,
      style: {
        width: '100%', maxWidth: 360, minHeight: 180,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
        borderRadius: 20, border: '2px dashed ' + (dragOver ? 'var(--amber)' : 'var(--bdr2)'),
        background: dragOver ? 'rgba(245,188,0,.08)' : 'var(--surf2)',
        cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1,
        transition: 'background .15s,border-color .15s',
      },
    },
      h('div', { style: { fontSize: 42 } }, busy ? '⏳' : '📤'),
      h('div', { style: { fontSize: 16, fontWeight: 700 } }, busy ? 'Working…' : 'Tap to choose a file'),
      h('div', { style: { fontSize: 11, color: 'var(--text3)' } }, 'Excel · CSV · PDF · HTML'),
    ),

    loadMsg && h('div', {
      style: {
        fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 10,
        background: 'var(--surf3)', color: 'var(--text2)', maxWidth: 340,
      },
    }, loadMsg),

    h('button', {
      onClick: onExitToFullApp,
      style: {
        marginTop: 12, fontSize: 12, color: 'var(--text3)', background: 'none',
        border: 'none', textDecoration: 'underline', cursor: 'pointer',
      },
    }, 'Open full Meridian instead'),
  );
}
