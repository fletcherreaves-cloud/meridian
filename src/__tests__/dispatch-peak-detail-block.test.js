// @ts-nocheck
// PeakDetailBlock (src/views/graded-visits.js) is the UI half of the PEAK per-visit-detail work
// -- the parser + enrichment import (dispatch, memory/finding-peak-visit-detail-api-2026-09-05.md)
// wrote peakDetail onto real graded_visits rows, but nothing rendered it until this component.
// Rendered with react-dom/server (no jsdom needed for static markup), same pattern
// shell-nav-snapshot.test.js already uses for a different component in this app.
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import ReactDOMServer from 'react-dom/server';
import { PeakDetailBlock } from '../views/graded-visits.js';

const h = React.createElement;

function fixtureVisit(peakDetail) {
  return { id: 'v1', reportType: 'RGR', store: '06972', dateISO: '2026-02-10', peakDetail };
}

describe('PeakDetailBlock', () => {
  it('renders nothing when the visit has no peakDetail', () => {
    const html = ReactDOMServer.renderToStaticMarkup(h(PeakDetailBlock, { v: fixtureVisit(null) }));
    expect(html).toBe('');
  });

  it('defaults to showing only the commented questions, not the full set', () => {
    const pd = {
      questionCount: 3, commentedCount: 1,
      questions: [
        { category: 'A', text: 'Q1', comment: null, score: 3, possibleScore: 3, isCritical: false },
        { category: 'A', text: 'Q2', comment: 'a real inspector note', score: 0, possibleScore: 3, isCritical: true },
        { category: 'B', text: 'Q3', comment: null, score: 3, possibleScore: 3, isCritical: false },
      ],
    };
    const html = ReactDOMServer.renderToStaticMarkup(h(PeakDetailBlock, { v: fixtureVisit(pd) }));
    expect(html).toContain('Q2');
    expect(html).toContain('a real inspector note');
    expect(html).not.toContain('Q1');
    expect(html).not.toContain('Q3');
    expect(html).toContain('CRITICAL');
    expect(html).toContain('3 question(s)');
    expect(html).toContain('1 with comments');
    // A toggle to see the rest should be offered, since commentedCount < questionCount.
    expect(html).toContain('Show all 3');
  });

  it('no "show all" toggle when every question already has a comment', () => {
    const pd = {
      questionCount: 1, commentedCount: 1,
      questions: [{ category: 'A', text: 'Q1', comment: 'note', score: 1, possibleScore: 1, isCritical: false }],
    };
    const html = ReactDOMServer.renderToStaticMarkup(h(PeakDetailBlock, { v: fixtureVisit(pd) }));
    expect(html).not.toContain('Show all');
  });

  it('renders the overall visit comment when present', () => {
    const pd = { questionCount: 0, commentedCount: 0, questions: [], visitComment: 'Great visit overall.' };
    const html = ReactDOMServer.renderToStaticMarkup(h(PeakDetailBlock, { v: fixtureVisit(pd) }));
    expect(html).toContain('Great visit overall.');
  });

  it('a visit with zero commented questions shows the empty-state line, not a blank table', () => {
    const pd = {
      questionCount: 2, commentedCount: 0,
      questions: [
        { category: 'A', text: 'Q1', comment: null, score: 3, possibleScore: 3, isCritical: false },
        { category: 'A', text: 'Q2', comment: null, score: 3, possibleScore: 3, isCritical: false },
      ],
    };
    const html = ReactDOMServer.renderToStaticMarkup(h(PeakDetailBlock, { v: fixtureVisit(pd) }));
    expect(html).toContain('No commented questions on this visit.');
  });

  it('never renders the tokenized auditor id -- comments and the visit comment only', () => {
    const pd = {
      questionCount: 1, commentedCount: 1, auditor: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      questions: [{ category: 'A', text: 'Q1', comment: 'a note', score: 1, possibleScore: 1, isCritical: false }],
    };
    const html = ReactDOMServer.renderToStaticMarkup(h(PeakDetailBlock, { v: fixtureVisit(pd) }));
    expect(html).not.toContain('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  });
});
