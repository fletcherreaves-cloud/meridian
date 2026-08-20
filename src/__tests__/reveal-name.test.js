// @vitest-environment happy-dom
// @ts-nocheck
// RevealName (dispatch #38) — the click -> reason -> RPC -> cached-name state machine that
// resolves an analyzeRegisterAudit token back to a real name, per dispatch #37's
// reveal_employee_identity() RPC. Mocked supabase.rpc(), matching dispatch #37's own test
// pattern for getOrCreateToken() (src/__tests__/identity-vault.test.js) — this sandbox has no
// live Supabase session to click through the real reveal flow end-to-end (flagged in
// memory/dispatch-38.md and the writeup this dispatch ships).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const rpcMock = vi.fn();
vi.mock('../lib/supabase.js', () => ({ supabase: { rpc: (...args) => rpcMock(...args) } }));

import { RevealName } from '../views/store-analytics.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('RevealName', () => {
  let container, root, promptSpy;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    rpcMock.mockReset();
    // happy-dom's window has no prompt() implementation at all -- assign a stub rather than
    // vi.spyOn() (which requires an existing function to wrap).
    promptSpy = vi.fn();
    window.prompt = promptSpy;
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    delete window.prompt;
  });

  it('renders plain "Unknown" (no click affordance) for a null token, never calling the RPC', async () => {
    await act(async () => { root.render(React.createElement(RevealName, { token: null, cache: {}, onReveal: vi.fn() })); });
    expect(container.textContent).toBe('Unknown');
    container.querySelector('span')?.click();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('renders plain "Unknown" for the pre-backfill literal "Unknown" token — no click target', async () => {
    await act(async () => { root.render(React.createElement(RevealName, { token: 'Unknown', cache: {}, onReveal: vi.fn() })); });
    expect(container.textContent).toBe('Unknown');
  });

  it('shows a masked reveal affordance — not the raw token, not "Unknown" — for an unrevealed real token', async () => {
    await act(async () => { root.render(React.createElement(RevealName, { token: 'tok-abc-123', cache: {}, onReveal: vi.fn() })); });
    expect(container.textContent).not.toContain('tok-abc-123');
    expect(container.textContent).not.toBe('Unknown');
    expect(container.textContent).toMatch(/reveal/i);
  });

  it('shows the resolved name directly, no click needed, once the token is already in cache', async () => {
    await act(async () => { root.render(React.createElement(RevealName, { token: 'tok-abc-123', cache: { 'tok-abc-123': 'Aaden W' }, onReveal: vi.fn() })); });
    expect(container.textContent).toBe('Aaden W');
  });

  it('prompts for a reason, calls reveal_employee_identity with {p_token, p_reason}, and reports the resolved name via onReveal', async () => {
    promptSpy.mockReturnValue('drawer variance investigation');
    rpcMock.mockResolvedValue({ data: 'Aaden W', error: null });
    const onReveal = vi.fn();
    await act(async () => { root.render(React.createElement(RevealName, { token: 'tok-abc-123', cache: {}, onReveal })); });

    await act(async () => { container.querySelector('span').dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('reveal_employee_identity', { p_token: 'tok-abc-123', p_reason: 'drawer variance investigation' });
    expect(onReveal).toHaveBeenCalledWith('tok-abc-123', 'Aaden W');
  });

  it('never calls the RPC when the reason prompt is cancelled (null) or left blank', async () => {
    const onReveal = vi.fn();
    await act(async () => { root.render(React.createElement(RevealName, { token: 'tok-abc-123', cache: {}, onReveal })); });

    promptSpy.mockReturnValue(null); // cancelled
    await act(async () => { container.querySelector('span').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(rpcMock).not.toHaveBeenCalled();

    promptSpy.mockReturnValue('   '); // blank
    await act(async () => { container.querySelector('span').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(onReveal).not.toHaveBeenCalled();
  });

  it('shows the RPC\'s own rejection message on failure — never a generic swallowed error', async () => {
    promptSpy.mockReturnValue('checking a flag');
    rpcMock.mockResolvedValue({ data: null, error: { message: 'manager reveal is not enabled for this org' } });
    const onReveal = vi.fn();
    await act(async () => { root.render(React.createElement(RevealName, { token: 'tok-abc-123', cache: {}, onReveal })); });
    await act(async () => { container.querySelector('span').dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(onReveal).not.toHaveBeenCalled();
    expect(container.querySelector('span').title).toBe('manager reveal is not enabled for this org');
    expect(container.textContent).toMatch(/reveal failed/i);
  });
});
