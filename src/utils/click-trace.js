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
let _renders = [];   // { phase, actual, base }
export function reportRender(id, phase, actualDuration, baseDuration) {
  if (!_on) return;
  if (actualDuration < 3) return;
  _renders.push({ id, phase, actual: actualDuration, base: baseDuration });
  if (_renders.length > 600) _renders.shift();
  if (actualDuration >= 200)
    console.log(`%c[click-trace] React ${phase} ${Math.round(actualDuration)}ms  (${id})`, 'color:#fb923c');
}

export function printClickTrace() {
  if (!_tasks.length && !_marks.length && !_renders.length) {
    console.log('%c[click-trace] nothing recorded yet — click something first', 'color:#f5bc00');
    return;
  }
  const byLabel = {};
  for (const t of _tasks) {
    const k = t.label || '(no click)';
    (byLabel[k] ||= { n: 0, total: 0, worst: 0 });
    byLabel[k].n++; byLabel[k].total += t.ms;
    if (t.ms > byLabel[k].worst) byLabel[k].worst = t.ms;
  }
  console.log('%c─── click-trace: long main-thread tasks (>50ms) ───', 'color:#f5bc00;font-weight:700');
  Object.entries(byLabel).sort((a, b) => b[1].worst - a[1].worst).slice(0, 15)
    .forEach(([label, s]) =>
      console.log(`  worst ${Math.round(s.worst)}ms · ${s.n}x · total ${Math.round(s.total)}ms  ←  ${label}`));

  if (_marks.length) {
    const byName = {};
    for (const m of _marks) {
      (byName[m.name] ||= { n: 0, total: 0, worst: 0 });
      byName[m.name].n++; byName[m.name].total += m.ms;
      if (m.ms > byName[m.name].worst) byName[m.name].worst = m.ms;
    }
    console.log('%c─── named spans (what actually ran) ───', 'color:#f5bc00;font-weight:700');
    Object.entries(byName).sort((a, b) => b[1].total - a[1].total).slice(0, 15)
      .forEach(([name, s]) =>
        console.log(`  ${name.padEnd(26)} ${s.n}x · worst ${Math.round(s.worst)}ms · total ${Math.round(s.total)}ms`));
  }
  if (_renders.length) {
    const by = {};
    for (const r of _renders) {
      const k = `${r.id} (${r.phase})`;
      (by[k] ||= { n: 0, total: 0, worst: 0 });
      by[k].n++; by[k].total += r.actual;
      if (r.actual > by[k].worst) by[k].worst = r.actual;
    }
    console.log('%c─── React commits (render + commit time) ───', 'color:#f5bc00;font-weight:700');
    Object.entries(by).sort((a, b) => b[1].total - a[1].total).slice(0, 12)
      .forEach(([k, s2]) =>
        console.log(`  ${k.padEnd(24)} ${s2.n}x · worst ${Math.round(s2.worst)}ms · total ${Math.round(s2.total)}ms`));
  }
  console.log('%cmfClickTrace.reset() to clear · mfClickTrace.off() to disable', 'color:#6b7280');
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
  } catch (e) { /* never break the app for a diagnostic */ }
}
