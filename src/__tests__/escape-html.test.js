// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../utils/fmt.js';

describe('escapeHtml (audit C3 print/export hardening)', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml(`"quoted" 'single'`)).toBe('&quot;quoted&quot; &#39;single&#39;');
  });

  it('is safe in an attribute context (breaks out of quotes)', () => {
    // A value that tries to break out of src="..." and add an onerror handler.
    const evil = `x" onerror="alert(1)`;
    const out = escapeHtml(evil);
    expect(out).not.toContain('"');
    expect(out).toBe('x&quot; onerror=&quot;alert(1)');
  });

  it('renders null/undefined as empty string, not the literal word', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('coerces non-strings and leaves safe text untouched', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml('Freeport #1234')).toBe('Freeport #1234');
  });

  it('does not double-escape when applied once (ampersand ordering)', () => {
    // & must be escaped first so <, >, etc. do not become &amp;lt;.
    expect(escapeHtml('<a & b>')).toBe('&lt;a &amp; b&gt;');
  });

  it('preserves markdown markers so downstream transforms still match', () => {
    // coaching.js / sage.js escape first, THEN run **bold** and `code` transforms.
    const out = escapeHtml('**bold** and `code` with <tag>');
    expect(out).toContain('**bold**');
    expect(out).toContain('`code`');
    expect(out).toContain('&lt;tag&gt;');
  });
});
