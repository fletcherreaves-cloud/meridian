// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-04: Crew Schedule (src/views/crew-schedule-panel.js)
// -- the merged Schedule/Punches employee lookup -- had zero KB coverage despite answering the
// GM routine's "Time Punch Review, OT monitoring" line. Added `crew_schedule_guide` to
// KB_ARTICLES (src/engine/forecast.js), verified against the real two-tab identity-space split
// (assignedEmploymentId vs geid, no crosswalk) and the direct-names dispatch #125 decision.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { KnowledgeBasePanel } from '../engine/forecast.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
afterEach(() => { act(() => root.unmount()); container.remove(); });

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(React.createElement(KnowledgeBasePanel, { onClose: () => {} })));
}

function openArticle(matchText) {
  const entry = [...container.querySelectorAll('div')]
    .filter(d => d.textContent.includes(matchText)).pop();
  expect(entry, `article matching "${matchText}" not found`).toBeTruthy();
  act(() => { entry.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('Knowledge Base — new crew_schedule_guide article (task #75)', () => {
  it('is findable and explains the two independent tab identity spaces', () => {
    mount();
    openArticle('Look up a specific employee\'s upcoming shifts');
    expect(container.textContent).toContain('assignedEmploymentId');
    expect(container.textContent).toContain('geid');
  });

  it('states names render directly, unlike Security\'s gated reveal', () => {
    mount();
    openArticle('Look up a specific employee\'s upcoming shifts');
    expect(container.textContent).toContain('there is no reason to hide names');
    expect(container.textContent).toContain('Security');
  });
});
