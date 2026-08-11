// @ts-nocheck
// ── Interaction tracer (?clicktrace=1) ───────────────────────────────────────
// Answers "why did that click take 1382ms", which the browser's own
// "[Violation] 'click' handler took 1382ms" message reports without ever saying WHAT ran.
//
// WHY THIS EXISTS RATHER THAN A GUESS: the obvious suspects were checked and cleared by
// reading them — App.js's single document-level click listener (onActivity) is throttled to
// 30 minutes, and the two expensive memos (mergedTargets, rawStores, the latter calling
// buildStore for all 27 stores) have correct dependency arrays and should not rebust on a
// plain click. Three times this session a confident theory about a slow/broken path was wrong
// and instrumentation was what actually settled it. This is the instrument.
//
// HOW IT WORKS: the browser already emits `longtask` PerformanceEntries for any main-thread
// block over 50ms — the same signal behind the [Violation] warning. We record what was last
// clicked, then attribute each long task to it. `mark()` lets hot code paths name themselves so
// a long task can be blamed on something specific rather than "anonymous script".
//
// SAFETY: completely inert unless enabled. Every entry point is wrapped so a bug here can never
// break the app, and it holds a bounded buffer so a long session cannot grow without limit.

const KEY = 'mf_click_trace';
const MAX_ENTRIES = 300;
const LONG_MS = 50;         // the browser's own longtask threshold

let _on = false;
let _installed = false;
let _tasks = [];            // { at, ms, label }
let _marks = [];            // { at, ms, name } — named spans from mark()
let _lastClick = null;      // { at, label }

function _describe(el) {
  try {
    if (!el || el === document || el === window) return 'document';
    const bits = [];
    if (el.tagName) bits.push(el.tagName.toLowerCase());
    if (el.id) bits.push('#' + el.id);
    const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (txt) bits.push(`"${txt}"`);
    return bits.join(' ') || 'unknown';
  } catch { return 'unknown'; }
}

/** Time a named span. Returns fn's result; records only when tracing is on. */
export function mark(name, fn) {
  if (!_on) return fn();
  const t0 = performance.now();
  try { return fn(); }
  finally {
    const ms = performance.now() - t0;
    if (ms >= 1) {
      _marks.push({ at: performance.now(), ms, name });
      if (_marks.length > MAX_ENTRIES) _marks.shift();
    }
  }
}

// React commit timings, via the built-in Profiler. mark() can only wrap plain function calls —
// it cannot see inside React's render/commit, which is precisely where the unattributed time
// was hiding: on 2026-08-08 the three named startup spans accounted for 325ms of 169,537ms.
//
// Aggregated totals (count/worst/total per id) answer "is this slow overall" but not "what was
// the user doing" — the same gap longtask attribution already closes via _lastClick. Every
// render entry gets the same treatment (2026-08-09: a fix that should have cut the worst single
// render measured no better on re-test, and the aggregate view gave no way to tell whether the
// worst render was one-time startup cost or a specific recurring click — this closes that gap).
let _renders = [];   // { id, phase, actual, base, at, label }
export function reportRender(id, phase, actualDuration, baseDuration) {
  if (!_on) return;
  if (actualDuration < 3) return;
  const at = performance.now();
  const near = _lastClick && (at - _lastClick.at) < 1000 && (at - _lastClick.at) > -50;
  _renders.push({ id, phase, actual: actualDuration, base: baseDuration, at, label: near ? _lastClick.label : '(no click — startup/background)' });
  if (_renders.length > 600) _renders.shift();
  if (actualDuration >= 200)
    console.log(`%c[click-trace] React ${phase} ${Math.round(actualDuration)}ms  (${id})`, 'color:#fb923c');
}

// ── Self-time decomposition (#189) ──────────────────────────────────────────
// The commits above are NESTED (same-commit layout effects all end at one flush), not additive
// — reading them as additive is a misreading #189 recorded happening once already. This
// auto-subtracts same-commit App tree / AppSidebar / active-panel spans instead of leaving it to
// be worked out by hand. Still can't split DOM-commit from JS render within the panel residual
// (needs React Profiler, already established unavailable here — see App.js's v4.917 note).
// Full reasoning: memory/project-instrument-fix-189.md.
const _PANEL_IDS = ['AtAGlance', 'DistrictGrid', 'StoreDash', 'OrgView'];
const _CORR_MS = 8;
function selfTimeLines() {
  if (!_renders.length) return [];
  const byId = id => _renders.filter(r => r.id === id);
  const appEvents = byId('App tree');
  if (!appEvents.length) return [];
  const nearestOf = (list, at) => {
    let best = null, bestDelta = Infinity;
    for (const r of list) { const d = Math.abs(r.at - at); if (d < bestDelta) { bestDelta = d; best = r; } }
    return (best && bestDelta <= _CORR_MS) ? best : null;
  };
  const agg = {}; // label -> {n, total, worst}
  const add = (label, ms) => {
    (agg[label] ||= { n: 0, total: 0, worst: 0 });
    agg[label].n++; agg[label].total += ms;
    if (ms > agg[label].worst) agg[label].worst = ms;
  };
  for (const app of appEvents) {
    const sidebar = nearestOf(byId('AppSidebar'), app.at);
    let panel = null;
    for (const pid of _PANEL_IDS) { const p = nearestOf(byId(pid), app.at); if (p) { panel = p; break; } }
    if (sidebar) {
      add('App (self, excl. AppSidebar)', Math.max(0, app.actual - sidebar.actual));
      if (panel) add('AppSidebar (self, excl. active panel)', Math.max(0, sidebar.actual - panel.actual));
      else add('AppSidebar (self, incl. active panel — no panel span matched this commit)', sidebar.actual);
    } else {
      add('App (self — no AppSidebar span matched this commit)', app.actual);
    }
    if (panel) add(`${panel.id} (residual: its own render + DOM commit + any deeper children)`, panel.actual);
  }
  if (!Object.keys(agg).length) return [];
  const lines = ['', '── self-time (nested spans subtracted, #189) ──'];
  Object.entries(agg).sort((a, b) => b[1].total - a[1].total).forEach(([label, s]) =>
    lines.push(`${label}  ${s.n}x · worst ${Math.round(s.worst)}ms · total ${Math.round(s.total)}ms`));
  return lines;
}

// Builds the same report both printClickTrace() (console) and the on-screen overlay (phones
// with no attached debugger) render — one source of truth for the numbers, two presentations.
function buildReportLines() {
  if (!_tasks.length && !_marks.length && !_renders.length) {
    return ['nothing recorded yet — click something first'];
  }
  const lines = [];
  const byLabel = {};
  for (const t of _tasks) {
    const k = t.label || '(no click)';
    (byLabel[k] ||= { n: 0, total: 0, worst: 0 });
    byLabel[k].n++; byLabel[k].total += t.ms;
    if (t.ms > byLabel[k].worst) byLabel[k].worst = t.ms;
  }
  if (_tasks.length) {
    lines.push('── long main-thread tasks (>50ms) ──');
    Object.entries(byLabel).sort((a, b) => b[1].worst - a[1].worst).slice(0, 15)
      .forEach(([label, s]) =>
        lines.push(`worst ${Math.round(s.worst)}ms · ${s.n}x · total ${Math.round(s.total)}ms  ←  ${label}`));
  } else {
    lines.push('(no longtask entries — unsupported on this browser, e.g. iOS Safari; named spans below still work)');
  }

  if (_marks.length) {
    const byName = {};
    for (const m of _marks) {
      (byName[m.name] ||= { n: 0, total: 0, worst: 0 });
      byName[m.name].n++; byName[m.name].total += m.ms;
      if (m.ms > byName[m.name].worst) byName[m.name].worst = m.ms;
    }
    lines.push('', '── named spans (what actually ran) ──');
    Object.entries(byName).sort((a, b) => b[1].total - a[1].total).slice(0, 15)
      .forEach(([name, s]) =>
        lines.push(`${name}  ${s.n}x · worst ${Math.round(s.worst)}ms · total ${Math.round(s.total)}ms`));
  }
  if (_renders.length) {
    const by = {};
    for (const r of _renders) {
      const k = `${r.id} (${r.phase})`;
      (by[k] ||= { n: 0, total: 0, worst: 0 });
      by[k].n++; by[k].total += r.actual;
      if (r.actual > by[k].worst) by[k].worst = r.actual;
    }
    lines.push('', '── React commits (render + commit time) ──');
    Object.entries(by).sort((a, b) => b[1].total - a[1].total).slice(0, 12)
      .forEach(([k, s2]) =>
        lines.push(`${k}  ${s2.n}x · worst ${Math.round(s2.worst)}ms · total ${Math.round(s2.total)}ms`));

    // Background/startup churn (ds re-resolving as each loader finishes — a separate, real,
    // already-documented issue, see v4.212's own comments on ~32 setDs call sites) and actual
    // click-triggered jank are two different problems. Mixing them into one "top 10 slowest"
    // list lets startup noise bury the click data entirely — exactly what happened on the
    // 2026-08-09 capture, where all 10 slowest entries were startup and zero were clicks, even
    // though the reported complaint is specifically about clicks. Split them.
    const withClick = _renders.filter(r => r.label !== '(no click — startup/background)');
    const noClick = _renders.filter(r => r.label === '(no click — startup/background)');
    lines.push('', `── slowest CLICK-attributed renders (${withClick.length} of ${_renders.length} total) ──`);
    if (!withClick.length) {
      lines.push('(none — every recorded render happened with no click in the preceding second; the slowness above is background/startup work, not a click)');
    } else {
      [...withClick].sort((a, b) => b.actual - a.actual).slice(0, 10)
        .forEach(r => lines.push(`${Math.round(r.actual)}ms  ${r.id} (${r.phase})  ←  ${r.label}`));
    }
    lines.push('', `── slowest background/startup renders (${noClick.length} of ${_renders.length} total) ──`);
    [...noClick].sort((a, b) => b.actual - a.actual).slice(0, 5)
      .forEach(r => lines.push(`${Math.round(r.actual)}ms  ${r.id} (${r.phase})`));
  }
  lines.push(...selfTimeLines());
  return lines;
}

export function printClickTrace() {
  const lines = buildReportLines();
  console.log('%c─── click-trace report ───', 'color:#f5bc00;font-weight:700');
  lines.forEach(l => console.log(l));
  console.log('%cmfClickTrace.reset() to clear · mfClickTrace.off() to disable', 'color:#6b7280');
}

// ── On-screen overlay (no attached debugger needed — e.g. iPhone with no Mac handy) ──────────
// A small floating button that toggles a plain-text report + a Copy button, so the report can
// be pasted straight into a chat/message. Pure DOM, no React — this file runs before React
// mounts and must stay usable even if the app itself is struggling to render.
function mountOnScreenButton() {
  try {
    if (document.getElementById('mf-clicktrace-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'mf-clicktrace-btn';
    btn.textContent = '📊';
    btn.setAttribute('aria-label', 'Show click-trace report');
    Object.assign(btn.style, {
      position: 'fixed', bottom: '14px', right: '14px', zIndex: 999999,
      width: '44px', height: '44px', borderRadius: '50%', border: '1px solid #4b5563',
      background: '#111827', color: '#f5bc00', fontSize: '18px', lineHeight: '1',
      cursor: 'pointer', opacity: '0.55', boxShadow: '0 2px 10px rgba(0,0,0,.4)',
    });

    let overlay = null;
    const close = () => { if (overlay) { overlay.remove(); overlay = null; } };
    btn.onclick = () => {
      if (overlay) { close(); return; }
      overlay = document.createElement('div');
      Object.assign(overlay.style, {
        position: 'fixed', inset: '0', zIndex: 999998, background: 'rgba(0,0,0,.92)',
        color: '#e5e7eb', font: '11px/1.6 ui-monospace,monospace', padding: '16px',
        overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      });
      const text = buildReportLines().join('\n');
      const bar = document.createElement('div');
      Object.assign(bar.style, { display: 'flex', gap: '8px', marginBottom: '10px', position: 'sticky', top: '0' });
      const mkBtn = (label, onClick) => {
        const b = document.createElement('button');
        b.textContent = label;
        Object.assign(b.style, {
          padding: '8px 14px', minHeight: '44px', borderRadius: '6px', border: '1px solid #4b5563',
          background: '#1f2937', color: '#f5bc00', fontSize: '12px', cursor: 'pointer',
        });
        b.onclick = onClick;
        return b;
      };
      const copyBtn = mkBtn('Copy report', () => {
        navigator.clipboard?.writeText(text).then(
          () => { copyBtn.textContent = 'Copied!'; setTimeout(() => { copyBtn.textContent = 'Copy report'; }, 1500); },
          () => { copyBtn.textContent = 'Copy failed — select text manually'; }
        );
      });
      bar.appendChild(copyBtn);
      bar.appendChild(mkBtn('Reset', () => { window.mfClickTrace.reset(); close(); }));
      bar.appendChild(mkBtn('Close ✕', close));
      const pre = document.createElement('div');
      pre.textContent = text;
      overlay.appendChild(bar);
      overlay.appendChild(pre);
      document.body.appendChild(overlay);
    };
    document.body.appendChild(btn);
  } catch (e) { /* never break the app for a diagnostic */ }
}

export function initClickTrace() {
  try {
    if (_installed) return;
    const q = new URLSearchParams(location.search).get('clicktrace');
    if (q === '1') { try { sessionStorage.setItem(KEY, '1'); } catch {} }
    if (q === '0') { try { sessionStorage.removeItem(KEY); } catch {} }
    let stored = false;
    try { stored = sessionStorage.getItem(KEY) === '1'; } catch {}
    _on = q === '1' || stored;
    _installed = true;
    if (!_on) return;

    document.addEventListener('click', (e) => {
      _lastClick = { at: performance.now(), label: _describe(e.target) };
    }, { capture: true, passive: true });

    if (typeof PerformanceObserver !== 'undefined') {
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration < LONG_MS) continue;
            // Attribute to the click only if it landed within a second of one.
            const near = _lastClick && (entry.startTime - _lastClick.at) < 1000 && (entry.startTime - _lastClick.at) > -50;
            _tasks.push({ at: entry.startTime, ms: entry.duration, label: near ? _lastClick.label : '(no click)' });
            if (_tasks.length > MAX_ENTRIES) _tasks.shift();
            if (entry.duration >= 200) {
              console.log(`%c[click-trace] ${Math.round(entry.duration)}ms blocked  ←  ${near ? _lastClick.label : 'no recent click'}`,
                'color:#f87171');
            }
          }
        }).observe({ entryTypes: ['longtask'] });
      } catch { /* longtask unsupported (Safari) — named spans still work */ }
    }

    window.mfClickTrace = printClickTrace;
    window.mfClickTrace.reset = () => { _tasks = []; _marks = []; _renders = []; };
    window.mfClickTrace.off = () => { try { sessionStorage.removeItem(KEY); } catch {} _on = false; };
    console.log('%c[click-trace] on — click around, then run mfClickTrace()', 'color:#f5bc00');

    // Phones with no attached debugger (e.g. iPhone, no Mac handy) still need a way to see this —
    // a small floating button + on-screen report. document.body exists by here: module scripts
    // execute after the document is parsed.
    if (document.body) mountOnScreenButton();
    else document.addEventListener('DOMContentLoaded', mountOnScreenButton, { once: true });
  } catch (e) { /* never break the app for a diagnostic */ }
}
