// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { normalizeForm, buildFormPrintHTML } from '../engine/forms-model.js';

// Synthetic fixture mirroring the QSRSoft /api/forms/questions schema (real forms
// are captured by scripts/qsrsoft-forms-pull.mjs → public/forms/*.json).
const RAW = [
  { id: 'h1', formId: 'F', title: 'Outside Guest Area:', type: 'header', order: 5, options: [] },
  { id: 'r1', formId: 'F', title: 'Windows clean', type: 'radio', order: 16, options: [
    { title: 'Complete', id: 'a' },
    { title: 'Needs Action', id: 'b', question: { type: 'checkbox', options: [{ title: 'Clean Windows', id: 'x' }] } },
    { title: 'Action Taken', id: 'c' },
  ] },
  { id: 't1', formId: 'F', title: 'Name', type: 'textShort', order: 3, options: [] },
  { id: 'd1', formId: 'F', title: "Today's Date:", type: 'datePicker', order: 1, options: [] },
  { id: 'ti1', formId: 'F', title: 'Start Time', type: 'timePicker', order: 2, options: [] },
  { id: 'tl1', formId: 'F', title: '#1 Safety', type: 'textLong', order: 184, options: [] },
];

describe('normalizeForm', () => {
  it('sorts by order and groups items under headers', () => {
    const f = normalizeForm(RAW, { formId: 'F', title: 'Test Form' });
    // Date(1)/Time(2)/Name(3) precede the header(5) → land in a leading untitled section.
    expect(f.sections[0].title).toBe('');
    expect(f.sections[0].items.map(i => i.title)).toEqual(["Today's Date:", 'Start Time', 'Name']);
    // The header opens a titled section holding the radio + trailing textLong.
    expect(f.sections[1].title).toBe('Outside Guest Area:');
    expect(f.sections[1].items[0].title).toBe('Windows clean');
  });

  it('keeps only top-level radio options (drops nested follow-ups)', () => {
    const f = normalizeForm(RAW, { formId: 'F', title: 'T' });
    const check = f.sections[1].items.find(i => i.kind === 'check');
    expect(check.options).toEqual(['Complete', 'Needs Action', 'Action Taken']);
  });

  it('maps field/text types correctly', () => {
    const f = normalizeForm(RAW, { formId: 'F', title: 'T' });
    const all = f.sections.flatMap(s => s.items);
    expect(all.find(i => i.title === "Today's Date:")).toMatchObject({ kind: 'field', field: 'date' });
    expect(all.find(i => i.title === 'Start Time')).toMatchObject({ kind: 'field', field: 'time' });
    expect(all.find(i => i.title === 'Name')).toMatchObject({ kind: 'text', lines: 1 });
    expect(all.find(i => i.title === '#1 Safety')).toMatchObject({ kind: 'text', lines: 3 });
  });

  it('counts items', () => {
    expect(normalizeForm(RAW, {}).itemCount).toBe(5);
  });
});

describe('buildFormPrintHTML', () => {
  it('QSRSoft style (default): escaped titles, colored section banner, option labels', () => {
    const f = normalizeForm(RAW, { formId: 'F', title: 'Pre-Shift <Test>' });
    const html = buildFormPrintHTML(f, { storeLabel: 'Store & Co <1>' });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Pre-Shift &lt;Test&gt;');   // title escaped
    expect(html).toContain('Store &amp; Co &lt;1&gt;'); // store label escaped
    expect(html).toContain('Outside Guest Area:');      // section banner
    expect(html).toContain('Complete');                 // option label present
    expect(html).toContain('class="card"');             // navy item card
  });

  it('carries the section color through the model and into the banner', () => {
    // header settings.color 'success-high' → green banner background
    const withColor = [{ id: 'h', formId: 'F', title: 'Kitchen', type: 'header', order: 1, settings: { color: 'success-high' } },
                       { id: 'r', formId: 'F', title: 'x', type: 'radio', order: 2, options: [{ title: 'Complete' }] }];
    const f = normalizeForm(withColor, { title: 'T' });
    expect(f.sections[0].color).toBe('success-high');
    expect(buildFormPrintHTML(f)).toContain('#1f8a4c'); // success-high bg
  });

  it('compact style stays black-on-white with checkbox glyphs', () => {
    const f = normalizeForm(RAW, { formId: 'F', title: 'T' });
    const html = buildFormPrintHTML(f, { style: 'compact' });
    expect(html).toContain('&#9744;');             // checkbox glyph
    expect(html).toContain('Outside Guest Area:');
  });

  it('handles empty input without throwing (both styles)', () => {
    const f = normalizeForm([], { title: 'Empty' });
    expect(f.sections).toEqual([]);
    expect(() => buildFormPrintHTML(f)).not.toThrow();
    expect(() => buildFormPrintHTML(f, { style: 'compact' })).not.toThrow();
  });
});
