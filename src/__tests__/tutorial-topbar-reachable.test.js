// @ts-nocheck
// Owner-reported "menu not dropping down," 2026-11-13. Reproduced live (Playwright, 390x844
// mobile viewport): TutorialOverlay's backdrop used position:fixed/inset:0/zIndex:500, covering
// the ENTIRE viewport including AppTopbar's 44px bar (shell.js) -- the hamburger, search, SAGE,
// bell, and profile menu all sit at zIndex:auto/position:static there, so they always lose the
// stacking fight against any fixed, positioned sibling regardless of its own z-index. While the
// first-run tour is showing (or stuck showing, if its own localStorage write ever fails -- see
// its own try/catch), every persistent topbar control is unreachable. Fixed by starting the
// backdrop at top:44 instead of inset:0, so the topbar is never covered.
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('TutorialOverlay leaves the topbar reachable (dispatch 2026-11-13)', () => {
  const src = fs.readFileSync(new URL('../views/tutorial.js', import.meta.url), 'utf8');

  it('does not use inset:0 for its backdrop (that covers the topbar)', () => {
    const overlayFn = src.slice(src.indexOf('export function TutorialOverlay'));
    expect(overlayFn).not.toMatch(/position:\s*'fixed',\s*inset:\s*0/);
  });

  it('starts the backdrop below the topbar height (top:44)', () => {
    const overlayFn = src.slice(src.indexOf('export function TutorialOverlay'));
    const styleBlock = overlayFn.slice(0, overlayFn.indexOf('onClick:'));
    expect(styleBlock).toMatch(/position:\s*'fixed'/);
    expect(styleBlock).toMatch(/top:\s*44/);
    expect(styleBlock).toMatch(/left:\s*0/);
    expect(styleBlock).toMatch(/right:\s*0/);
    expect(styleBlock).toMatch(/bottom:\s*0/);
  });
});
