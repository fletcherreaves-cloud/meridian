import { describe, it, expect } from 'vitest';
import { parseFeed, tagText, decodeEntities, feedTitle } from '../engine/rss.js';
import { FEEDS, FEED_BY_ID, feedUrl, feedsForRegion, activeFeeds } from '../engine/news-sources.js';
import { attribute } from '../engine/locality.js';

// Shapes taken from what these publishers actually emit — WordPress with CDATA titles,
// TownNews with plain text, Atom with attribute-href links.
const WORDPRESS = `<?xml version="1.0"?><rss version="2.0"><channel>
  <title>KFOR Local</title>
  <item>
    <title><![CDATA[Fire crews respond to Durant restaurant]]></title>
    <link>https://kfor.com/news/local/fire-durant/</link>
    <pubDate>Tue, 05 Aug 2026 14:02:11 +0000</pubDate>
    <description><![CDATA[<p>Crews were called to a <b>McDonald's</b> on Main.</p>]]></description>
    <guid isPermaLink="false">https://kfor.com/?p=99182</guid>
  </item>
  <item>
    <title>Chickasha council approves budget &amp; new hires</title>
    <link>https://kfor.com/news/local/chickasha-budget/</link>
    <pubDate>Mon, 04 Aug 2026 09:30:00 +0000</pubDate>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example</title>
  <entry>
    <title>Holdenville water main break</title>
    <link rel="alternate" href="https://example.com/a"/>
    <updated>2026-08-01T10:00:00Z</updated>
    <summary>Repairs underway.</summary>
    <id>tag:example,2026:a</id>
  </entry>
</feed>`;

describe('parseFeed', () => {
  it('parses RSS items with CDATA titles and strips inner markup', () => {
    const items = parseFeed(WORDPRESS);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('Fire crews respond to Durant restaurant');
    expect(items[0].summary).toBe("Crews were called to a McDonald's on Main.");
    expect(items[0].link).toBe('https://kfor.com/news/local/fire-durant/');
    expect(items[0].published.toISOString()).toBe('2026-08-05T14:02:11.000Z');
  });

  it('decodes entities in plain titles', () => {
    expect(parseFeed(WORDPRESS)[1].title).toBe('Chickasha council approves budget & new hires');
  });

  it('parses Atom entries, taking the link from the href attribute', () => {
    const items = parseFeed(ATOM);
    expect(items).toHaveLength(1);
    expect(items[0].link).toBe('https://example.com/a');
    expect(items[0].title).toBe('Holdenville water main break');
    expect(items[0].published.toISOString()).toBe('2026-08-01T10:00:00.000Z');
  });

  it('falls back to link or title when guid is absent', () => {
    expect(parseFeed(ATOM)[0].guid).toBe('tag:example,2026:a');
    const noGuid = parseFeed('<rss><item><title>T</title><link>http://x/1</link></item></rss>');
    expect(noGuid[0].guid).toBe('http://x/1');
  });

  // A nightly pull across nine outlets must survive one publisher serving junk.
  it('returns [] rather than throwing on garbage', () => {
    for (const bad of ['', '   ', 'not xml at all', '<html><body>502 Bad Gateway</body></html>',
                       '<rss><channel><item><title>unclosed']) {
      expect(() => parseFeed(bad)).not.toThrow();
      expect(Array.isArray(parseFeed(bad))).toBe(true);
    }
  });

  it('skips an unusable entry but keeps the good ones', () => {
    const mixed = `<rss><channel>
      <item></item>
      <item><title>Real story</title><link>http://x/2</link></item>
    </channel></rss>`;
    const items = parseFeed(mixed);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Real story');
  });

  it('handles a missing or unparseable date without dropping the item', () => {
    const items = parseFeed('<rss><item><title>T</title><link>http://x</link><pubDate>nonsense</pubDate></item></rss>');
    expect(items).toHaveLength(1);
    expect(items[0].published).toBeNull();
  });

  it('reads the channel title without picking up an item title', () => {
    expect(feedTitle(WORDPRESS)).toBe('KFOR Local');
  });
});

describe('decodeEntities', () => {
  it('does not double-decode &amp;lt;', () => {
    // The classic bug: decoding &amp; first turns &amp;lt; into <, losing the literal.
    expect(decodeEntities('&amp;lt;')).toBe('&lt;');
  });
  it('handles numeric and hex references', () => {
    expect(decodeEntities('caf&#233; &#x41;')).toBe('café A');
  });
});

describe('tagText', () => {
  it('is not fooled by a similarly-named tag', () => {
    expect(tagText('<titles>no</titles><title>yes</title>', 'title')).toBe('yes');
  });
  it('handles attributes on the tag', () => {
    expect(tagText('<title type="text">hi</title>', 'title')).toBe('hi');
  });
  it('returns empty string when the tag is absent', () => {
    expect(tagText('<item></item>', 'title')).toBe('');
  });
});

describe('feed registry', () => {
  it('every feed has a unique id and an https url', () => {
    expect(new Set(FEEDS.map(f => f.id)).size).toBe(FEEDS.length);
    for (const f of FEEDS) {
      expect(f.url, f.id).toMatch(/^https:\/\//);
      expect(f.outlet, f.id).toBeTruthy();
      expect(['OK', 'FL'], f.id).toContain(f.region);
    }
  });

  it('builds a TownNews keyword URL with the documented parameters', () => {
    const u = feedUrl(FEED_BY_ID.kten, 'Tishomingo');
    expect(u).toContain('f=rss');
    expect(u).toContain('t=article');
    expect(u).toContain('q=Tishomingo');
    expect(u).toContain('s=start_time');
  });

  it('REFUSES a quoted term — quoted phrases break these endpoints', () => {
    // Learned during research: this silently returns nothing rather than erroring,
    // so failing loudly here is the only way to catch it.
    expect(() => feedUrl(FEED_BY_ID.kten, '"Pauls Valley"')).toThrow(/quotes/);
  });

  it('ignores a keyword for non-TownNews feeds instead of building a bad URL', () => {
    expect(feedUrl(FEED_BY_ID.kfor, 'Durant')).toBe(FEED_BY_ID.kfor.url);
  });

  it('a TownNews feed with no term still yields a valid recent-articles URL', () => {
    const u = feedUrl(FEED_BY_ID.adanews);
    expect(u).toContain('f=rss');
    expect(u).not.toContain('q=');
  });

  it('splits feeds by state, excluding disabled ones', () => {
    expect(feedsForRegion('FL').map(f => f.id)).toEqual(['wmbb']);
    expect(feedsForRegion('OK').every(f => f.active !== false)).toBe(true);
  });

  it('every disabled feed records why', () => {
    for (const f of FEEDS.filter(f => f.active === false)) {
      expect(f.disabledReason, f.id).toBeTruthy();
    }
  });
});

describe('end to end: feed item → store attribution', () => {
  it('attributes a parsed item to the right store', () => {
    const item = parseFeed(WORDPRESS)[0];
    const r = attribute(`${item.title} ${item.summary}`);
    expect(r.locs).toEqual(['5985']);        // Durant
    expect(r.confident).toBe(true);
  });

  it('leaves an unrelated story unattributed', () => {
    const item = parseFeed(ATOM)[0];
    expect(attribute(item.title).locs).toEqual(['35064']);   // Holdenville
    expect(attribute('State fair opens Thursday').locs).toEqual([]);
  });
});
