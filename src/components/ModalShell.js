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
export const Z = { modal: 300, nested: 400, alert: 500, toast: 600 };

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

export default ModalShell;
