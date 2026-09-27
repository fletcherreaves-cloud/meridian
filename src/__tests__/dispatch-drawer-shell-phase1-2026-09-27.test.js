// @vitest-environment happy-dom
// @ts-nocheck
// IA-reorg backlog Phase 1 (memory/backlog-open-2026-09-06.md §2's "shared non-blocking,
// minimizable popup shell" item) — SAGE's bespoke minimize-to-a-floating-pill pattern
// (previously ~25 lines of hand-rolled JSX directly in App.js: a right-anchored fixed drawer
// with no backdrop + a separate floating pill shown when minimized) is extracted into two
// reusable components, DrawerShell + MinimizedDock (src/components/ModalShell.js), and SAGE is
// retrofit onto them.
//
// These tests render the REAL components directly (not a description of them), per this repo's
// "would this verification still pass if the change were reverted?" rule — a revert to the old
// hand-rolled App.js JSX would fail both the harness-integration tests below (DrawerShell/
// MinimizedDock wouldn't exist to import) and the source-level test at the bottom (App.js would
// no longer reference them).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DrawerShell, MinimizedDock, Z } from '../components/ModalShell.js';

const h = React.createElement;
const span = (p, ...c) => h('span', p, ...c);

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('DrawerShell', () => {
  it('renders title + pillBadge content in the header, and the minimize/close buttons call their handlers', async () => {
    const onMinimize = vi.fn();
    const onClose = vi.fn();
    await act(async () => {
      root.render(h(DrawerShell, {
        title: '🧠 SAGE', minimized: false, onMinimize, onClose,
        pillBadge: span({ 'data-testid': 'dot' }, 'DOT'),
      }, h('div', {}, 'panel body')));
    });

    expect(container.textContent).toContain('🧠 SAGE');
    expect(container.textContent).toContain('DOT');
    expect(container.textContent).toContain('panel body');

    const minBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '—');
    const closeBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '✕');
    expect(minBtn).toBeTruthy();
    expect(closeBtn).toBeTruthy();

    await act(async () => { minBtn.click(); });
    expect(onMinimize).toHaveBeenCalledTimes(1);
    await act(async () => { closeBtn.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('never renders a backdrop, and is right-anchored full-height, not centered', async () => {
    await act(async () => {
      root.render(h(DrawerShell, { title: 'X', minimized: false, onMinimize() {}, onClose() {} }, 'body'));
    });
    const drawer = container.firstChild;
    expect(drawer.style.position).toBe('fixed');
    expect(drawer.style.top).toBe('0px');
    expect(drawer.style.right).toBe('0px');
    expect(drawer.style.bottom).toBe('0px');
    // The drawer's own surface, not a dark full-screen tint — and exactly one fixed-position
    // element in the whole tree (no separate backdrop layer behind it).
    expect(drawer.style.background).toBe('var(--surf)');
    const fixedEls = [...container.querySelectorAll('*')].filter(el => el.style.position === 'fixed');
    expect(fixedEls.length).toBe(1);
  });

  // happy-dom's CSSStyleDeclaration doesn't parse CSS `min()`/`calc()` function values (silently
  // drops them, confirmed directly against happy-dom's own style setter) — a test-environment
  // limitation, not a bug: this exact `min(460px,100vw)` formula already shipped in SAGE's
  // pre-extraction JSX. So this checks the real component's OWN output (calling the actual
  // exported function, not a re-implementation of it) rather than a DOM-serialized style string.
  it('honors a custom width via the min(<width>px,100vw) formula', () => {
    const el = DrawerShell({ title: 'X', width: 320, minimized: false, onMinimize() {}, onClose() {}, children: 'body' });
    expect(el.props.style.width).toBe('min(320px, 100vw)');
  });

  it('defaults to width 460 when none is given (SAGE\'s own pre-extraction value)', () => {
    const el = DrawerShell({ title: 'X', minimized: false, onMinimize() {}, onClose() {}, children: 'body' });
    expect(el.props.style.width).toBe('min(460px, 100vw)');
  });

  it('minimized:true stays MOUNTED (display:none), not unmounted — in-progress state underneath survives', async () => {
    function StatefulChild() {
      const [count, setCount] = React.useState(0);
      return h('button', { onClick: () => setCount(c => c + 1), 'data-testid': 'counter' }, `count:${count}`);
    }
    let setMinimized;
    function Harness() {
      const [minimized, setM] = React.useState(false);
      setMinimized = setM;
      return h(DrawerShell, { title: 'X', minimized, onMinimize: () => setM(true), onClose() {} },
        h(StatefulChild, {}));
    }
    await act(async () => { root.render(h(Harness, {})); });

    const counterBtn = () => container.querySelector('[data-testid="counter"]');
    await act(async () => { counterBtn().click(); });
    await act(async () => { counterBtn().click(); });
    expect(counterBtn().textContent).toBe('count:2');

    await act(async () => { setMinimized(true); });
    // Still in the DOM (mounted), just hidden -- this is the whole point of the controlled
    // `minimized` prop toggling display rather than the parent unmounting the drawer.
    expect(container.querySelector('[data-testid="counter"]')).toBeTruthy();
    expect(container.firstChild.style.display).toBe('none');

    await act(async () => { setMinimized(false); });
    // Restored with state intact -- never re-created from scratch.
    expect(counterBtn().textContent).toBe('count:2');
    expect(container.firstChild.style.display).toBe('flex');
  });

  it('works with pillBadge omitted entirely (a future adopter with no busy/idle concept)', async () => {
    await act(async () => {
      root.render(h(DrawerShell, { title: 'Plain Panel', minimized: false, onMinimize() {}, onClose() {} }, 'ok'));
    });
    expect(container.textContent).toContain('Plain Panel');
    expect(container.textContent).toContain('ok');
  });
});

describe('MinimizedDock', () => {
  it('renders nothing when items is empty or omitted', async () => {
    await act(async () => { root.render(h(MinimizedDock, { items: [] })); });
    expect(container.innerHTML).toBe('');
    await act(async () => { root.render(h(MinimizedDock, { items: undefined })); });
    expect(container.innerHTML).toBe('');
  });

  it('renders one pill per item, each calling its own onRestore, stacked at increasing offsets', async () => {
    const restoreA = vi.fn();
    const restoreB = vi.fn();
    await act(async () => {
      root.render(h(MinimizedDock, {
        items: [
          { id: 'a', label: 'Panel A', onRestore: restoreA },
          { id: 'b', label: 'Panel B', onRestore: restoreB },
        ],
      }));
    });
    expect(container.textContent).toContain('Panel A');
    expect(container.textContent).toContain('Panel B');
    const pills = [...container.children];
    expect(pills.length).toBe(2);

    await act(async () => { pills[0].click(); });
    expect(restoreA).toHaveBeenCalledTimes(1);
    expect(restoreB).not.toHaveBeenCalled();
  });

  // Same happy-dom calc()-serialization limitation as DrawerShell's width test above (confirmed
  // directly against happy-dom's own style setter) — checked on the real component's own element
  // output instead of a DOM-serialized style string.
  it('stacks each pill at an increasing offset from the bottom edge (calc formula)', () => {
    const el = MinimizedDock({
      items: [
        { id: 'a', label: 'A', onRestore() {} },
        { id: 'b', label: 'B', onRestore() {} },
        { id: 'c', label: 'C', onRestore() {} },
      ],
    });
    const pillEls = el.props.children;
    const bottoms = pillEls.map(p => p.props.style.bottom);
    expect(new Set(bottoms).size).toBe(3); // three distinct offsets, strictly increasing below
    expect(bottoms[0]).toBe('calc(16px + env(safe-area-inset-bottom,0px))');
    expect(bottoms[1]).toBe('calc(72px + env(safe-area-inset-bottom,0px))');
    expect(bottoms[2]).toBe('calc(128px + env(safe-area-inset-bottom,0px))');
  });

  it('renders a pill\'s pillBadge content (the status indicator), independent from any other item', async () => {
    await act(async () => {
      root.render(h(MinimizedDock, {
        items: [{ id: 'x', label: 'X', pillBadge: span({}, 'STATUS-TEXT'), onRestore() {} }],
      }));
    });
    expect(container.textContent).toContain('STATUS-TEXT');
  });
});

describe('DrawerShell + MinimizedDock wired together the way App.js wires SAGE', () => {
  // This harness mirrors the actual App.js retrofit shape (see App.js's showSage/sageMin/
  // sageBusy JSX): one boolean opens the drawer, a second (controlled) boolean minimizes it
  // without unmounting, a third drives a busy/ready badge shown in BOTH places. It is not
  // App.js itself (that component is not unit-render-friendly), but it exercises the exact same
  // component contract App.js's real wiring depends on, so a regression in either half (the
  // shared components, or how a panel is expected to wire them) fails here.
  function dot(busy) {
    return span({ style: { background: busy ? '#ef4444' : '#10b981' } }, busy ? 'BUSY-DOT' : 'READY-DOT');
  }

  function SageLikeHarness() {
    const [show, setShow] = React.useState(true);
    const [minimized, setMinimized] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [draft, setDraft] = React.useState('');

    const items = (show && minimized) ? [{
      id: 'sage',
      label: '🧠 SAGE',
      pillBadge: dot(busy),
      onRestore: () => setMinimized(false),
    }] : [];

    return h(React.Fragment, null,
      show && h(DrawerShell, {
        title: '🧠 SAGE',
        minimized,
        onMinimize: () => setMinimized(true),
        onClose: () => { setShow(false); setMinimized(false); setBusy(false); },
        pillBadge: dot(busy),
      },
        h('input', { 'data-testid': 'draft', value: draft, onChange: e => setDraft(e.target.value) }),
        h('button', { 'data-testid': 'toggle-busy', onClick: () => setBusy(b => !b) }, 'toggle busy'),
      ),
      h(MinimizedDock, { items }),
    );
  }

  it('minimize hides the drawer, shows a dock pill with the right busy-color, and restore brings the drawer back with session state intact', async () => {
    await act(async () => { root.render(h(SageLikeHarness, {})); });

    // Type a "draft message" into the open drawer -- stand-in for an in-progress SAGE session.
    // Standard native-setter trick for a React-controlled input (React's own onChange listens
    // via a property descriptor that a plain `.value = x` assignment bypasses).
    const input = () => container.querySelector('[data-testid="draft"]');
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      nativeSetter.call(input(), 'unsent draft');
      input().dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(input().value).toBe('unsent draft');

    // Flip busy on (SAGE "thinking") before minimizing.
    await act(async () => { container.querySelector('[data-testid="toggle-busy"]').click(); });
    expect(container.textContent).toContain('BUSY-DOT');

    // Minimize.
    const minBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '—');
    await act(async () => { minBtn.click(); });

    // Drawer hidden (display:none) but still mounted -- the input node (and its value) survives.
    const drawerRoot = container.querySelector('input').closest('div[style]');
    // Find the actual outer drawer div (has position:fixed inline style).
    const outerDrawer = [...container.querySelectorAll('div')].find(d => d.style.position === 'fixed' && d.style.top === '0px');
    expect(outerDrawer.style.display).toBe('none');
    expect(container.querySelector('[data-testid="draft"]').value).toBe('unsent draft');

    // The dock now shows exactly one pill, carrying the busy-colored dot.
    const pill = [...container.querySelectorAll('div')].find(d => d.textContent.includes('🧠 SAGE') && d !== outerDrawer && !outerDrawer.contains(d));
    expect(pill).toBeTruthy();
    expect(pill.textContent).toContain('BUSY-DOT');

    // Restore via the pill.
    await act(async () => { pill.click(); });
    expect(outerDrawer.style.display).toBe('flex');
    // Session survived the whole round trip.
    expect(container.querySelector('[data-testid="draft"]').value).toBe('unsent draft');
    // Dock is empty again now that the panel isn't minimized.
    expect([...container.querySelectorAll('div')].some(d => d.textContent === '🧠 SAGE READY-DOT' || d.textContent === '🧠 SAGE BUSY-DOT')).toBe(false);
  });
});

describe('Z tiers', () => {
  it('exposes a `drawer` tier distinct from the existing modal/nested/alert/toast tiers', () => {
    expect(Z.drawer).toBeTypeOf('number');
    const values = Object.values(Z);
    expect(new Set(values).size).toBe(values.length); // no collisions
  });
});

describe('App.js retrofit (source-level -- App.js itself is not unit-render-friendly)', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/App.js'), 'utf8');

  it('imports DrawerShell and MinimizedDock from the shared ModalShell module', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bDrawerShell\b[^}]*\}\s*from\s*['"]\.\.\/components\/ModalShell\.js['"]/);
    expect(src).toMatch(/import\s*\{[^}]*\bMinimizedDock\b[^}]*\}\s*from\s*['"]\.\.\/components\/ModalShell\.js['"]/);
  });

  it('renders SAGE through h(DrawerShell,...) and h(MinimizedDock,...), not the old hand-rolled JSX', () => {
    expect(src).toMatch(/h\(DrawerShell,\{/);
    expect(src).toMatch(/h\(MinimizedDock,\{/);
    // The old hand-rolled magic numbers/markup this dispatch removed -- their absence from
    // App.js (now living only inside ModalShell.js) is what a revert of the retrofit half
    // (while leaving the shared components in place) would undo.
    expect(src).not.toMatch(/zIndex:360/);
    expect(src).not.toMatch(/zIndex:361/);
    expect(src).not.toMatch(/background:'var\(--surf,#1e293b\)'/);
  });

  it('still wires the same showSage/sageMin/sageBusy state names -- a pure refactor, not a rename', () => {
    expect(src).toContain('showSage');
    expect(src).toContain('sageMin');
    expect(src).toContain('sageBusy');
  });
});
