// @ts-nocheck
// Shared modal shell — standardizes the app's modal/panel close pattern (UX coherence pass).
// Canonical "Group A" style: centered surface, plain '✕' btn-sm close, design tokens.
// Measured from src/views/*.js: backdrop rgba(0,0,0,.82) is the most common value app-wide (39 sites).
import React from 'react';
import { capturePanelScreenshot } from '../utils/panel-screenshot.js';
import { shareFileOrSave } from '../utils/share.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const { useRef: uR, useState: uSt } = React;

// Shared z-index tiers so stacked modals (e.g. a confirm dialog over a panel) layer predictably.
// `drawer` folds in the right-anchored non-blocking drawer pattern (DrawerShell/MinimizedDock,
// below) — SAGE hardcoded these as zIndex:360 (drawer) / 361 (pill) before this extraction;
// 360 sits between `modal` and `nested` (unchanged value, now named) and the dock's pill uses
// `Z.drawer + 1` directly rather than adding a second named tier for one caller.
export const Z = { modal: 300, nested: 400, alert: 500, toast: 600, drawer: 360 };

// Close buttons in the wild run 20-32px — short of the 44px touch-target spec.
// Bump hit area via padding without touching the shared .btn-sm class other buttons rely on.
const CLOSE_STYLE = {
  color: 'var(--text3)',
  minWidth: 44,
  minHeight: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

// App-wide screenshot Share button (owner request 2026-09-01) — lives INSIDE RoutePanelShell so
// every route:true panel gets it for free, zero per-panel wiring, same reasoning that put the
// close/back button here instead of per-panel. Deliberately NOT named/iconed "🔗 Share" — that
// label is already taken by the per-row report-LINK share buttons (count-cycle-panel.js,
// eom-dashboard.js's createShare), a different affordance (shares a URL, not an image); reusing
// the label here would read as the same feature and confuse which one a user is tapping.
// Captures `bodyRef.current`'s full content (see capturePanelScreenshot — includes anything
// scrolled out of view, not just the visible slice) and hands it to shareFileOrSave, which tries
// the native OS share sheet first, then copy-image-to-clipboard, then a plain PNG download —
// same three-tier fallback shape as shareOrCopy() (src/utils/share.js) uses for links.
function slugify(s) {
  return String(s || 'panel').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'panel';
}
function ScreenshotShareButton({ bodyRef, title }) {
  const [status, setStatus] = uSt(null); // null | 'busy' | 'share' | 'clipboard' | 'download' | 'error'
  const onClick = async () => {
    if (status === 'busy') return;
    setStatus('busy');
    try {
      const blob = await capturePanelScreenshot(bodyRef.current);
      if (!blob) { setStatus('error'); setTimeout(() => setStatus(null), 2500); return; }
      const filename = `meridian-${slugify(title)}-${new Date().toISOString().slice(0, 10)}.png`;
      const file = new File([blob], filename, { type: 'image/png' });
      const result = await shareFileOrSave({ file, title: title || 'Meridian', filename });
      setStatus(result.cancelled ? null : (result.ok ? result.method : 'error'));
    } catch {
      setStatus('error');
    }
    setTimeout(() => setStatus(null), 2500);
  };
  const label = status === 'busy' ? '⏳'
    : status === 'share' ? '✓ Shared'
    : status === 'clipboard' ? '✓ Copied image'
    : status === 'download' ? '✓ Saved PNG'
    : status === 'error' ? '✗ Share failed'
    : '📸 Share';
  return btn({
    className: 'btn btn-sm', onClick, disabled: status === 'busy',
    title: 'Share a screenshot of this panel (including anything scrolled out of view) via your device’s share sheet, or copy/save it',
    style: { color: 'var(--text3)', fontSize: '12px', whiteSpace: 'nowrap', minHeight: 44, padding: '0 10px' },
  }, label);
}

export function ModalShell({
  title,
  subtitle,
  icon,
  onClose,
  maxWidth = 640,
  zIndex = Z.modal,
  justify = 'center',
  closeOnBackdrop = false,
  headerExtra,
  subHeader,
  footer,
  bodyStyle,
  // Page-scroll variant (issue #126): the default is centered + maxHeight:88vh, which is right
  // for a compact dialog but wrong for the top-aligned, page-scrolling panels this codebase
  // already hand-rolls outside ModalShell (MetricCorrelationExplorer, DistrictLensPanel —
  // alignItems:'flex-start', no maxHeight cap on the card). Default false so all 42 existing
  // call sites keep the centered/capped behavior unchanged.
  scroll = false,
  // Tinted header band (issue #126): the same reference panels tint their header
  // background var(--surf2); ModalShell's header has always inherited the card's var(--surf).
  // Default false, same reasoning as `scroll`.
  tintHeader = false,
  // Print-targeted hooks (e.g. eom-supervisor.js's @media print rules key off
  // exact classNames on the backdrop/card/header) — undefined by default so
  // ordinary callers are unaffected.
  backdropClassName,
  cardClassName,
  headerClassName,
  children,
}) {
  return div(
    {
      className: backdropClassName,
      style: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex,
        display: 'flex', alignItems: scroll ? 'flex-start' : 'center', justifyContent: justify,
        padding: scroll ? '20px 16px' : 20, overflowY: scroll ? 'auto' : undefined,
      },
      onClick: closeOnBackdrop ? (e => { if (e.target === e.currentTarget) onClose?.(); }) : undefined,
    },
    div(
      {
        className: cardClassName,
        style: {
          background: 'var(--surf)', borderRadius: 'var(--rl)', border: '.5px solid var(--bdr2)',
          width: '100%', maxWidth, display: 'flex', flexDirection: 'column',
          maxHeight: scroll ? undefined : '88vh', overflow: 'hidden',
        },
      },
      div(
        {
          className: headerClassName,
          style: {
            padding: '10px 18px', borderBottom: '.5px solid var(--bdr)',
            background: tintHeader ? 'var(--surf2)' : undefined,
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          },
        },
        icon ? span({ style: { fontSize: '18px' } }, icon) : null,
        div(
          { style: { flex: 1, minWidth: 0 } },
          title != null ? div({ style: { fontSize: '13px', fontWeight: 800, color: 'var(--text)' } }, title) : null,
          subtitle != null ? div({ style: { fontSize: '9px', color: 'var(--text3)' } }, subtitle) : null,
        ),
        headerExtra || null,
        btn({ className: 'btn btn-sm', style: CLOSE_STYLE, onClick: onClose, 'aria-label': 'Close' }, '✕'),
      ),
      subHeader || null,
      div({ style: { flex: 1, overflowY: 'auto', ...bodyStyle } }, children),
      footer ? div({ style: { padding: '10px 18px', borderTop: '.5px solid var(--bdr)', flexShrink: 0 } }, footer) : null,
    ),
  );
}

// Full-page "route" shell (Dispatch27 Workstream E) — same header visual language as
// ModalShell above (icon/title/subtitle, a single dismiss action) but fills the content area IN
// PLACE of AtAGlance/StoreDash/DistrictGrid/OrgView rather than overlaying them, since a route
// REPLACES the view instead of interrupting it (memory/dispatch-27.md's rule). No backdrop, no
// maxWidth cap, no centering — App.js's own content-area wrapper already supplies the scroll
// container every other top-level view relies on, so this only needs to be a header + body.
// className/headerClassName (dispatch #202) — same print-targeted-hooks shape ModalShell above
// already carries (see its own comment), added here because eom-summary.js's @media print rules
// (previously keyed to a standalone ModalShell's backdrop/card/header classNames) now need to
// key off RoutePanelShell instead, once EOM Supervisor folds into the Inventory Control hub as a
// tab. Both default to undefined so every existing RoutePanelShell caller is unaffected.
export function RoutePanelShell({ title, subtitle, icon, onBack, headerExtra, bodyStyle, className, headerClassName, children }) {
  const bodyRef = uR(null);
  return div(
    { className, style: { display: 'flex', flexDirection: 'column', minHeight: '60vh' } },
    div(
      {
        className: headerClassName,
        style: {
          padding: '4px 0 14px', borderBottom: '.5px solid var(--bdr)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14,
        },
      },
      btn({ className: 'btn btn-sm', style: CLOSE_STYLE, onClick: onBack, 'aria-label': 'Back' }, '←'),
      icon ? span({ style: { fontSize: '18px' } }, icon) : null,
      div(
        { style: { flex: 1, minWidth: 0 } },
        title != null ? div({ style: { fontSize: '15px', fontWeight: 800, color: 'var(--text)' } }, title) : null,
        subtitle != null ? div({ style: { fontSize: '10px', color: 'var(--text3)' } }, subtitle) : null,
      ),
      headerExtra || null,
      h(ScreenshotShareButton, { bodyRef, title }),
    ),
    div({ ref: bodyRef, style: { flex: 1, ...bodyStyle } }, children),
  );
}

// Right-anchored, non-blocking "drawer" shell (IA reorg backlog, Phase 1 — extracted from SAGE's
// own bespoke minimize-to-pill pattern in App.js, see memory/backlog-open-2026-09-06.md §2's
// "shared non-blocking, minimizable popup shell" item). Unlike ModalShell/RoutePanelShell above,
// this NEVER shows a backdrop — the rest of the app stays visible and interactive underneath —
// and `minimized` is a CONTROLLED prop: the component stays mounted and only toggles
// `display:'none'`, so a live session underneath (SAGE's conversation, a future half-filled form)
// survives a minimize/restore cycle instead of being torn down and rebuilt. The floating
// "restore" pill for a minimized drawer is NOT rendered here — see MinimizedDock below, which
// renders once at the app root for every currently-minimized panel.
//
// Base button style for the header's minimize/close actions — CLOSE_STYLE's 44px touch-target
// sizing (the spec's own ask: "same visual language/44px touch targets as ModalShell's own
// CLOSE_STYLE constant"), but NOT its `.btn btn-sm` bordered/filled look — SAGE's drawer header
// has always used plain transparent icon buttons (no border, no background), the conventional
// look for an overlay/drawer chrome rather than an inline toolbar button.
const DRAWER_BTN_BASE = { ...CLOSE_STYLE, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 };

export function DrawerShell({
  title,
  subtitle,
  icon,
  width = 460,
  minimized,
  onMinimize,
  onClose,
  // Optional content for the header's status indicator (SAGE passes a red/green "thinking" vs
  // "ready" dot, built from its own `sageBusy` state) — rendered as-is, DrawerShell has no idea
  // what it means. Omit it entirely for a panel with no busy/idle concept.
  pillBadge,
  headerExtra,
  children,
}) {
  return div(
    {
      style: {
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: `min(${width}px, 100vw)`,
        background: 'var(--surf)', borderLeft: '.5px solid var(--bdr2)',
        boxShadow: '-12px 0 40px rgba(0,0,0,.45)', zIndex: Z.drawer,
        // Stays MOUNTED while minimized — display toggled, never unmounted — so in-progress
        // state underneath keeps running and is exactly as the user left it on restore.
        display: minimized ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden',
      },
    },
    div(
      {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'calc(12px + env(safe-area-inset-top,0px)) 20px 12px',
          borderBottom: '1px solid var(--bdr)', flexShrink: 0,
        },
      },
      div(
        { style: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 } },
        pillBadge || null,
        icon ? span({ style: { fontSize: '18px' } }, icon) : null,
        div(
          { style: { minWidth: 0 } },
          title != null ? span({
            style: {
              fontFamily: "'Syne',sans-serif", fontWeight: 900, fontSize: '15px',
              letterSpacing: '-.02em', color: 'var(--text)',
            },
          }, title) : null,
          subtitle != null ? div({ style: { fontSize: '9px', color: 'var(--text3)' } }, subtitle) : null,
        ),
      ),
      div(
        { style: { display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 } },
        headerExtra || null,
        btn({
          onClick: onMinimize, title: 'Minimize — keep running while you look at other data',
          'aria-label': 'Minimize', style: { ...DRAWER_BTN_BASE, fontSize: '22px' },
        }, '—'),
        btn({
          onClick: onClose, title: 'Close', 'aria-label': 'Close',
          style: { ...DRAWER_BTN_BASE, fontSize: '26px', margin: '-4px -8px' },
        }, '✕'),
      ),
    ),
    div({ style: { flex: 1, overflowY: 'hidden', background: 'var(--bg)', display: 'flex', flexDirection: 'column' } }, children),
  );
}

// Rendered ONCE at the app root (App.js computes `items` itself from whichever panels' own
// minimized booleans are currently true — this component holds no state and knows nothing about
// any specific panel, SAGE included). One rounded pill per minimized item, stacked bottom-right,
// each offset above the previous one so several can coexist without overlapping. Renders nothing
// for an empty list.
export function MinimizedDock({ items }) {
  if (!items || !items.length) return null;
  return h(
    React.Fragment,
    null,
    ...items.map((item, i) => div(
      {
        key: item.id,
        onClick: item.onRestore,
        style: {
          position: 'fixed', right: 16,
          bottom: `calc(${16 + i * 56}px + env(safe-area-inset-bottom,0px))`,
          zIndex: Z.drawer + 1,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderRadius: '999px',
          background: 'var(--surf,#1e293b)',
          // Optional per-item accent (SAGE tints this red/green for thinking/ready, same colors
          // as its pillBadge dot) — a plain, generic style parameter, not SAGE-specific logic.
          border: '1px solid ' + (item.accentColor || 'var(--bdr2)'),
          boxShadow: '0 8px 30px rgba(0,0,0,.5)', cursor: 'pointer',
        },
      },
      item.icon ? span({ style: { fontSize: '13px' } }, item.icon) : null,
      item.label != null ? span({
        style: { fontFamily: "'Syne',sans-serif", fontWeight: 900, fontSize: '13px', color: 'var(--text)' },
      }, item.label) : null,
      item.pillBadge || null,
    )),
  );
}

export default ModalShell;
