// @ts-nocheck
// SAGE's system prompt had no way to know what the owner was actually looking at when they
// asked a question -- backlog item "pass active panel state as context instead of screenshots"
// (memory/backlog-open-2026-09-06.md's SAGE enhancements list). SAGE renders as a right-anchored
// drawer over whatever panel is open behind it (App.js), so "what is the owner looking at right
// now" is real, live state already sitting in App.js's view/selStore/routePanel -- not something
// that needs a pasted screenshot to answer "what's driving this?" while looking at one store.
//
// App.js builds `sageActiveContext` from that state and passes it to SagePanel as `activeContext`,
// threaded into buildSystemPrompt's new 4th parameter. These tests exercise buildSystemPrompt
// directly with the same shape App.js constructs.
//
// Per "would this verification still pass if reverted?": buildSystemPrompt ignored a 4th
// argument entirely before this change, so every assertion below on prompt content fails against
// the old 3-arg signature.
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../views/sage.js';

const ds = { loaded: false };

describe('SAGE system prompt -- active panel context (no screenshot needed)', () => {
  it('names the store when viewing Store Dashboard', () => {
    const ctx = { view: 'store', storeLoc: '3708', storeName: 'Ardmore-Broadway', routePanel: null, routePanelLabel: null };
    const prompt = buildSystemPrompt(ds, [], [], ctx);
    expect(prompt).toContain('Currently viewing: Store Dashboard — Ardmore-Broadway (3708)');
  });

  it('names a routed panel by its registry label when one is open (routePanel wins over view)', () => {
    const ctx = { view: 'command', storeLoc: null, storeName: null, routePanel: 'proj', routePanelLabel: 'Projections' };
    const prompt = buildSystemPrompt(ds, [], [], ctx);
    expect(prompt).toContain('Currently viewing: Projections');
    expect(prompt).not.toContain('At A Glance');
  });

  it('falls back to a friendly label for each plain view with no routePanel', () => {
    expect(buildSystemPrompt(ds, [], [], { view: 'command', routePanel: null })).toContain('Currently viewing: At A Glance');
    expect(buildSystemPrompt(ds, [], [], { view: 'district', routePanel: null })).toContain('Currently viewing: Analytics (District Grid)');
    expect(buildSystemPrompt(ds, [], [], { view: 'org', routePanel: null })).toContain('Currently viewing: Org View');
  });

  it('omits the "Currently viewing" line entirely when no activeContext is passed (e.g. a headless/scheduled call)', () => {
    const prompt = buildSystemPrompt(ds, [], []);
    expect(prompt).not.toContain('Currently viewing:');
  });

  it('store view without a resolved storeName does not fabricate a line', () => {
    const ctx = { view: 'store', storeLoc: '9999', storeName: null, routePanel: null, routePanelLabel: null };
    const prompt = buildSystemPrompt(ds, [], [], ctx);
    expect(prompt).not.toContain('Currently viewing: Store Dashboard');
  });
});
