import { describe, it, expect } from 'vitest';
import { mdToHtml } from '../utils/markdown.js';

describe('mdToHtml', () => {
  it('renders headers, bold, and bullet lists', () => {
    const h = mdToHtml('# Title\n\n**bold** text\n\n- a\n- b');
    expect(h).toContain('<h1>Title</h1>');
    expect(h).toContain('<strong>bold</strong>');
    expect(h).toContain('<ul>');
    expect(h).toContain('<li>a</li>');
  });
  it('renders a pipe table with header + rows', () => {
    const h = mdToHtml('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(h).toContain('<table>');
    expect(h).toContain('<th>A</th>');
    expect(h).toContain('<td>1</td>');
  });
  it('escapes raw HTML (XSS-safe)', () => {
    expect(mdToHtml('<script>alert(1)</script>')).toContain('&lt;script&gt;');
    expect(mdToHtml('<script>alert(1)</script>')).not.toContain('<script>');
  });
});
