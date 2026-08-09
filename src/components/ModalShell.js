// @ts-nocheck
// Shared modal shell — standardizes the app's modal/panel close pattern (UX coherence pass).
// Canonical "Group A" style: centered surface, plain '✕' btn-sm close, design tokens.
// Measured from src/views/*.js: backdrop rgba(0,0,0,.82) is the most common value app-wide (39 sites).
import React from 'react';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

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
        display: 'flex', alignItems: 'center', justifyContent: justify, padding: 20,
      },
      onClick: closeOnBackdrop ? (e => { if (e.target === e.currentTarget) onClose?.(); }) : undefined,
    },
    div(
      {
        className: cardClassName,
        style: {
          background: 'var(--surf)', borderRadius: 'var(--rl)', border: '.5px solid var(--bdr2)',
          width: '100%', maxWidth, display: 'flex', flexDirection: 'column',
          maxHeight: '88vh', overflow: 'hidden',
        },
      },
      div(
        {
          className: headerClassName,
          style: {
            padding: '10px 18px', borderBottom: '.5px solid var(--bdr)',
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

export default ModalShell;
