// @ts-nocheck
// ── Minimal RSS / Atom parser ────────────────────────────────────────────────
// Notes 59 local-news backbone. Deliberately dependency-free: the project has no XML
// parser and adding one for nine well-formed feeds isn't worth the bundle or the
// supply-chain surface.
//
// This is NOT a general XML parser and doesn't pretend to be. It handles the subset
// real newsroom feeds emit — RSS 2.0 <item> and Atom <entry> — and is written to fail
// soft: a malformed entry is skipped, never thrown, because one bad item in one feed
// must not take down a nightly pull across nine outlets.
//
// Known and accepted limitation: CDATA and entity handling cover what these publishers
// actually produce (WordPress, TownNews, Sinclair). If a feed is ever added that nests
// markup inside a title in some novel way, the title degrades to text rather than
// breaking the pull.

const strip = (s) => String(s == null ? '' : s);

// Order matters: &amp; must be last or it double-decodes (&amp;lt; → < instead of &lt;).
const ENTITIES = [
  [/&#(\d+);/g, (_, d) => String.fromCharCode(+d)],
  [/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))],
  [/&quot;/g, '"'], [/&apos;/g, "'"], [/&nbsp;/g, ' '],
  [/&lt;/g, '<'], [/&gt;/g, '>'],
  [/&amp;/g, '&'],
];

export function decodeEntities(s) {
  let out = strip(s);
  for (const [re, rep] of ENTITIES) out = out.replace(re, rep);
  return out;
}

/** Pull the text of the first <tag> in a chunk, unwrapping CDATA and stripping markup. */
export function tagText(chunk, tag) {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(strip(chunk));
  if (!m) return '';
  let v = m[1];
  const cd = /<!\[CDATA\[([\s\S]*?)\]\]>/i.exec(v);
  if (cd) v = cd[1];
  return decodeEntities(v.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/** Atom links carry the URL in an attribute rather than as element text. */
function atomLink(chunk) {
  const alt = /<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(chunk);
  if (alt) return decodeEntities(alt[1]);
  const any = /<link\b[^>]*href=["']([^"']+)["']/i.exec(chunk);
  return any ? decodeEntities(any[1]) : '';
}

const toDate = (s) => {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
};

/**
 * Parse an RSS or Atom document into normalised items.
 * Returns [] for anything unparseable rather than throwing — a nightly cron across
 * nine outlets must survive one publisher serving an error page.
 */
export function parseFeed(xml) {
  const doc = strip(xml);
  if (!doc.trim()) return [];

  const blocks = [
    ...doc.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi),
    ...doc.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi),
  ];

  const out = [];
  for (const b of blocks) {
    try {
      const c = b[1];
      const title = tagText(c, 'title');
      const link = tagText(c, 'link') || atomLink(c);
      if (!title && !link) continue;                       // nothing usable
      const published = toDate(tagText(c, 'pubDate')) || toDate(tagText(c, 'published'))
                     || toDate(tagText(c, 'updated'))  || toDate(tagText(c, 'dc:date'));
      out.push({
        title,
        link,
        published,
        summary: tagText(c, 'description') || tagText(c, 'summary') || tagText(c, 'content'),
        guid: tagText(c, 'guid') || tagText(c, 'id') || link || title,
      });
    } catch {
      // Skip the bad entry; keep the rest of the feed.
    }
  }
  return out;
}

/** Feed-level title, useful for labelling an outlet we haven't seen before. */
export function feedTitle(xml) {
  const head = strip(xml).split(/<item\b|<entry\b/i)[0];
  return tagText(head, 'title');
}
