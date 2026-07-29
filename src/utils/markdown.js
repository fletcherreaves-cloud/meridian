// @ts-nocheck
// Minimal, safe Markdown → HTML: headings, bold/italic/code, bullet + numbered lists,
// pipe tables, horizontal rules, paragraphs. HTML is escaped first (XSS-safe for our own
// generated reports). Enough to render the EOM diagnosis / SAGE-style reports.
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Chip syntax: {{label}} or {{tone|label}} → a small pill span. tone ∈ warn|bad|good|info
// (defaults to info) so generated reports can highlight current-state tags compactly.
const CHIP_TONES = { warn: 1, bad: 1, good: 1, info: 1 };
const inline = s => esc(s)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\{\{([^}]+)\}\}/g, (_, body) => {
    const parts = String(body).split('|');
    const tone = parts.length > 1 && CHIP_TONES[parts[0].trim()] ? parts.shift().trim() : 'info';
    return `<span class="chip chip-${tone}">${parts.join('|').trim()}</span>`;
  })
  .replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em>$2</em>')
  .replace(/(^|[\s(])_([^_]+)_(?=$|[\s).,;:])/g, '$1<em>$2</em>');

export function mdToHtml(md) {
  const lines = String(md || '').split('\n');
  const out = [];
  let i = 0, inUl = false, inOl = false;
  const closeLists = () => { if (inUl) { out.push('</ul>'); inUl = false; } if (inOl) { out.push('</ol>'); inOl = false; } };
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    // Table: header row of pipes, then a |---| separator row.
    if (/\|/.test(t) && i + 1 < lines.length && /^\|?[\s:|-]*-[\s:|-]*\|?$/.test(lines[i + 1].trim())) {
      closeLists();
      const header = t.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) {
        rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
        i++;
      }
      out.push('<table><thead><tr>' + header.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>'
        + rows.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    if (t === '') { closeLists(); i++; continue; }
    if (/^###\s/.test(t)) { closeLists(); out.push(`<h3>${inline(t.slice(4))}</h3>`); i++; continue; }
    if (/^##\s/.test(t)) { closeLists(); out.push(`<h2>${inline(t.slice(3))}</h2>`); i++; continue; }
    if (/^#\s/.test(t)) { closeLists(); out.push(`<h1>${inline(t.slice(2))}</h1>`); i++; continue; }
    if (/^(-{3,}|_{3,})$/.test(t)) { closeLists(); out.push('<hr>'); i++; continue; }
    if (/^[-*]\s/.test(t)) { if (!inUl) { closeLists(); out.push('<ul>'); inUl = true; } out.push(`<li>${inline(t.slice(2))}</li>`); i++; continue; }
    if (/^\d+\.\s/.test(t)) { if (!inOl) { closeLists(); out.push('<ol>'); inOl = true; } out.push(`<li>${inline(t.replace(/^\d+\.\s/, ''))}</li>`); i++; continue; }
    closeLists();
    out.push(`<p>${inline(t)}</p>`);
    i++;
  }
  closeLists();
  return out.join('');
}
