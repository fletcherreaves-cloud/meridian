// @ts-nocheck
// First-login nav walkthrough — task #107 (2026-11-07), the owner's "interactive overlay
// walkthrough" idea, deliberately scoped NARROW per that discussion: a short spotlight tour of
// the STABLE nav shell landmarks only (sidebar, Home, Data Manager, the notification bell), not
// a per-panel feature tour. A full click-through tour of every panel would be a maintenance trap
// in an app whose nav has already been reshuffled several times this year (sidebar collapse,
// section accordion, panel promotions) — see this file's own header comments in shell.js.
//
// Trigger: AuthGate.js's NotificationConsentScreen sets sessionStorage['mf_new_signin_tour_pending']
// right before handing control to the real app, on the EXACT SAME first-sign-in path as the
// consent screen (OTP-invite -> password-set). Deliberately a sessionStorage flag, not a
// profiles column — a DB flag would start out NULL for every existing account too (same trap the
// consent screen avoided), retroactively showing the tour to users who already know the app. The
// flag is consumed (removed) the instant this component sees it, so even a refresh mid-session
// never re-shows it; a fresh tab/device never had the flag at all.
import * as React from 'react';

const { useState, useEffect } = React;
const h = React.createElement;
const div  = (p, ...c) => h('div', p, ...c);
const btn  = (p, ...c) => h('button', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

// Exported so AuthGate.js's NotificationConsentScreen (the only place that ever sets this flag)
// references the same string rather than a second hand-typed copy.
export const TOUR_PENDING_FLAG_KEY = 'mf_new_signin_tour_pending';

// Matches the `data-tour` hooks added to src/app/shell.js (AppSidebar's outer container, the
// Home/Data Manager nav items, and NotificationBell's wrapper).
const STEPS = [
  { anchor: 'sidebar', title: 'Your navigation', body:
    'Every panel lives here, grouped by section. Click a section header to open it — opening one collapses the others, so the list stays short.' },
  { anchor: 'home', title: 'Home', body:
    'Your landing page. District-wide signals, priority briefs, and whatever needs attention today.' },
  { anchor: 'data-manager', title: 'Data Manager', body:
    'Upload fresh reports here, or check when each automated data stream last synced.' },
  { anchor: 'bell', title: 'Notifications', body:
    'Alerts land here — count reminders and anything else flagged for your role.' },
];

const SIDEBAR_ANCHORS = new Set(['sidebar', 'home', 'data-manager']);

function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function OnboardingTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);

  // Consume the flag once on mount. If the mobile nav drawer is closed (sidebar sitting
  // off-canvas), nudge it open via the same custom event the hamburger button already uses, so
  // the sidebar-anchored steps have something real on screen to spotlight.
  useEffect(() => {
    let pending = false;
    try { pending = sessionStorage.getItem(TOUR_PENDING_FLAG_KEY) === '1'; } catch {}
    if (!pending) return;
    try { sessionStorage.removeItem(TOUR_PENDING_FLAG_KEY); } catch {}

    const sidebarEl = document.querySelector('[data-tour="sidebar"]');
    const offCanvas = sidebarEl && sidebarEl.getBoundingClientRect().left < 0;
    if (offCanvas) {
      try { window.dispatchEvent(new CustomEvent('mf:toggleNav')); } catch {}
      setTimeout(() => setActive(true), 300); // shell.js's drawer transition is 250ms
    } else {
      setActive(true);
    }
  }, []);

  // Measure the current step's anchor; skip straight past a step whose anchor isn't on screen
  // (e.g. a role without Data Manager access) rather than spotlighting nothing.
  //
  // Data Manager lives in the sidebar's 'admin' section, which starts COLLAPSED by default for
  // every user (task #72's accordion) -- without the nudge below, this step would be skipped for
  // literally everyone, every time, defeating the point of including it. 'mf:expandSection' is
  // AppSidebar's own event (shell.js); dispatching it updates that component's state, so the
  // actual query+measure has to wait a couple of frames for that re-render to commit first.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const anchor = STEPS[step].anchor;

    const measureNow = () => {
      if (cancelled) return undefined;
      const el = document.querySelector(`[data-tour="${anchor}"]`);
      if (!el) {
        if (step < STEPS.length - 1) setStep(s => s + 1); else setActive(false);
        return undefined;
      }
      const update = () => setRect(rectOf(el));
      update();
      window.addEventListener('resize', update);
      window.addEventListener('scroll', update, true);
      return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
    };

    if (anchor === 'data-manager') {
      try { window.dispatchEvent(new CustomEvent('mf:expandSection', { detail: { id: 'admin' } })); } catch {}
      let cleanup;
      requestAnimationFrame(() => requestAnimationFrame(() => { if (!cancelled) cleanup = measureNow(); }));
      return () => { cancelled = true; cleanup && cleanup(); };
    }

    return measureNow();
  }, [active, step]);

  if (!active || !rect) return null;

  const isLast = step === STEPS.length - 1;
  const s = STEPS[step];
  const skip = () => setActive(false);
  const next = () => (isLast ? setActive(false) : setStep(n => n + 1));
  const back = () => setStep(n => Math.max(0, n - 1));

  const pad = 8;
  const cardW = Math.min(300, window.innerWidth - 24);
  const spaceBelow = window.innerHeight - (rect.top + rect.height);
  const placeBelow = spaceBelow > 160 || spaceBelow > rect.top;
  const cardTop = placeBelow ? rect.top + rect.height + 12 : Math.max(12, rect.top - 12 - 150);
  const cardLeft = Math.min(Math.max(rect.left, 12), window.innerWidth - cardW - 12);

  return div({ style: { position: 'fixed', inset: 0, zIndex: 9000 } },
    // Spotlight scrim — a transparent box exactly over the target, with a huge box-shadow spread
    // that darkens everything else. Captures clicks outside the target (deliberately no click-
    // through to the real sidebar mid-tour, which would desync the tour's own step state).
    div({ style: {
      position: 'fixed', top: rect.top - pad, left: rect.left - pad,
      width: rect.width + pad * 2, height: rect.height + pad * 2,
      borderRadius: 10, boxShadow: '0 0 0 9999px rgba(0,0,0,.6)',
      transition: 'all .2s ease', pointerEvents: 'none',
    } }),
    div({ style: { position: 'fixed', inset: 0, pointerEvents: 'auto' } }),

    div({ style: {
      position: 'fixed', top: cardTop, left: cardLeft, width: cardW, zIndex: 9001,
      background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: 12,
      boxShadow: '0 20px 60px rgba(0,0,0,.5)', padding: '16px 16px 12px',
    } },
      div({ style: { fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 } }, s.title),
      div({ style: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 14 } }, s.body),
      div({ style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
        btn({ onClick: skip, style: {
          background: 'none', border: 'none', color: 'var(--text3)', fontSize: 11,
          cursor: 'pointer', padding: 0,
        } }, 'Skip tour'),
        div({ style: { display: 'flex', alignItems: 'center', gap: 10 } },
          span({ style: { fontSize: 10, color: 'var(--text3)' } }, (step + 1) + ' of ' + STEPS.length),
          step > 0 && btn({ onClick: back, style: {
            background: 'none', border: '1px solid var(--bdr)', color: 'var(--text2)',
            borderRadius: 'var(--r)', padding: '5px 10px', fontSize: 11, cursor: 'pointer',
          } }, 'Back'),
          btn({ onClick: next, style: {
            background: 'var(--amber)', border: 'none', color: '#000', fontWeight: 700,
            borderRadius: 'var(--r)', padding: '5px 12px', fontSize: 11, cursor: 'pointer',
          } }, isLast ? 'Done' : 'Next')
        )
      )
    )
  );
}
