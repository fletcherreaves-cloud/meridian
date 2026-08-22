// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #72 B1 -- src/features/projections.js's ProjectionWorkflow computed
// `settings.operators||DEF_SETTINGS.operators||{}` without ever importing DEF_SETTINGS from
// constants.js. Short-circuit-guarded (only reachable when `settings.operators` is falsy), so
// this was silent until a caller passed settings with no .operators -- then it threw instead
// of falling back to the real default operator groups.
//
// Per the standing "would this verification still pass if reverted" rule, this renders the
// ACTUAL ProjectionWorkflow consumer with settings.operators intentionally absent, rather than
// calling some extracted helper -- the bug lived inline in the component body, evaluated on
// every render regardless of what's returned.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, supabase: null };
});

import { ProjectionWorkflow } from '../features/projections.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ProjectionWorkflow falls back to DEF_SETTINGS.operators (dispatch #72 B1)', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('does not throw when settings carries no .operators key', () => {
    const ds = { loaded: true };
    const settings = {}; // no .operators -- exercises the fallback branch
    expect(() => {
      act(() => {
        root.render(React.createElement(ProjectionWorkflow, {
          stores: [], ds, settings, userEvents: [], lockedProjections: [], onSaveLocked: () => {},
        }));
      });
    }).not.toThrow();
  });
});
