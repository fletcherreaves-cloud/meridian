#!/usr/bin/env node
// scripts/qsrsoft-kb-analyze.mjs
// ── QSRSoft KB analyzer ─────────────────────────────────────────────────────────
// Reads the whole qsrsoft_kb corpus (pulled by qsrsoft-kb-pull.mjs) and distills it into a structured
// intelligence digest we can commit + grow: a taxonomy map, a Meridian-metric cross-map, and a
// glossary of candidate definitions/formulas mined from the article bodies. Pure Supabase read →
// analyze → write two files:
//   memory/qsrsoft-kb-digest.md   — human + agent readable (the "what QSRSoft documents" map)
//   docs/qsrsoft-kb-index.json    — structured index for grounding SAGE / diagnostics / provenance
// Runs in CI (has Supabase egress). NO QSRSoft auth needed — reads what the pull already stored.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

async function selectAll(table, cols) {
  const out = []; const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + PAGE - 1);
    if (error) { console.error(`[kb-analyze] ${table} error:`, error.message); process.exit(1); }
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// Meridian's metric vocabulary → the QSRSoft terms/aliases that name the same thing. An article that
// mentions any alias is cross-mapped to that Meridian metric. Extend freely as we learn the corpus.
const METRIC_MAP = {
  'FOB / Food Cost':        ['fob', 'food over base', 'food cost', 'stat variance', 'statistical variance', 'ideal food cost', 'waste', 'raw waste', 'completed waste', 'condiment'],
  'OEPE / Service Time':    ['oepe', 'order end to present end', 'drive-thru time', 'drive thru time', 'service time', 'total experience time', 'tet', 'ott', 'otot', 'window time', 'r2p', 'ready to present', 'lane'],
  'KVS / Kitchen':          ['kvs', 'kitchen video', 'make line', 'mfy', 'assembly', 'production time'],
  'Sales / Guest Counts':   ['net sales', 'gross sales', 'guest count', 'transactions', 'average check', 'ticket', 'product sales'],
  'Digital / 3PO':          ['digital', 'mobile order', 'mop', 'curbside', 'oepe digital', 'delivery', 'mcdelivery', 'doordash', 'uber', 'grubhub', '3po', 'third party'],
  'Labor / VLH':            ['labor', 'vlh', 'variable labor', 'productivity', 'crew', 'scheduling', 'punched', 'hours', 'sptmh', 'transactions per labor hour'],
  'Controls / Loss Prev':   ['t-red', 'transaction reduction', 'refund', 'void', 'discount', 'promo', 'overring', 'cash', 'drawer', 'over/short', 'manager meal', 'employee meal'],
  'Inventory / Counts':     ['inventory', 'count', 'on hand', 'on-hand', 'ebos', 'raw item', 'usage', 'ideal usage', 'theoretical', 'order', 'delivery', 'transfer', 'unit of measure', 'uom', 'case'],
  'Customer / SMG':         ['smg', 'voice', 'osat', 'satisfaction', 'complaint', 'accuracy', 'friendliness'],
  'Reports / eBOS / DAR':   ['ebos', 'dar', 'daily activity', 'report', 'shift', 'model', 'red model', 'green model', 'glimpse', 'sales ledger', 'cash sheet'],
};

// Definitional / formula cues — a sentence carrying one of these is a glossary candidate.
const DEF_CUES = [
  /\bis (?:defined as|calculated|computed|the (?:sum|total|percentage|number|amount|ratio|average))\b/i,
  /\b(?:is|are) determined by\b/i, /\brefers to\b/i, /\bmeasures\b/i, /\brepresents\b/i,
  /\bequals?\b/i, /\bdivided by\b/i, /\bmultiplied by\b/i, /\bcalculated as\b/i,
  /=\s*[\w(]/, /\bformula\b/i, /\bthe percentage of\b/i, /\bexpressed as a percent/i,
];

const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const splitSentences = t => clean(t).split(/(?<=[.!?:])\s+(?=[A-Z0-9(])/).map(clean).filter(s => s.length >= 24 && s.length <= 320);

function main() {
  return selectAll('qsrsoft_kb', 'id,title,body_text,category,section,html_url,labels').then(rows => {
    console.log(`[kb-analyze] loaded ${rows.length} articles`);

    // 1) Taxonomy: category → section → [titles].
    const tax = {};
    for (const r of rows) {
      const cat = clean(r.category) || '(uncategorized)';
      const sec = clean(r.section) || '(no section)';
      ((tax[cat] || (tax[cat] = {}))[sec] || (tax[cat][sec] = [])).push({ id: r.id, title: clean(r.title), url: r.html_url });
    }

    // 2) Metric cross-map: which articles touch each Meridian metric (title hit weighted 3, body 1).
    const metricMap = {};
    for (const [metric, aliases] of Object.entries(METRIC_MAP)) {
      const hits = [];
      for (const r of rows) {
        const title = (r.title || '').toLowerCase(), body = (r.body_text || '').toLowerCase();
        let score = 0;
        for (const a of aliases) { if (title.includes(a)) score += 3; else if (body.includes(a)) score += 1; }
        if (score > 0) hits.push({ id: r.id, title: clean(r.title), section: clean(r.section), url: r.html_url, score });
      }
      hits.sort((x, y) => y.score - x.score);
      metricMap[metric] = hits;
    }

    // 3) Glossary candidates: definitional/formula sentences, deduped, tagged to their article.
    const glossary = [];
    const seen = new Set();
    for (const r of rows) {
      for (const s of splitSentences(r.body_text)) {
        if (!DEF_CUES.some(re => re.test(s))) continue;
        const key = s.slice(0, 90).toLowerCase();
        if (seen.has(key)) continue; seen.add(key);
        glossary.push({ sentence: s, article: clean(r.title), section: clean(r.section), url: r.html_url, id: r.id });
        if (glossary.length >= 600) break;
      }
      if (glossary.length >= 600) break;
    }

    // ── Write JSON index ──────────────────────────────────────────────────────
    const index = {
      generatedAt: new Date().toISOString(),
      nArticles: rows.length,
      taxonomy: tax,
      metricMap,
      glossary,
      articles: rows.map(r => ({ id: r.id, title: clean(r.title), category: clean(r.category), section: clean(r.section), url: r.html_url, nChars: (r.body_text || '').length })),
    };
    writeFile('docs/qsrsoft-kb-index.json', JSON.stringify(index, null, 2));

    // ── Write human/agent digest ──────────────────────────────────────────────
    const L = [];
    L.push('# QSRSoft Knowledge Base — Intelligence Digest', '');
    L.push(`_Auto-generated by \`scripts/qsrsoft-kb-analyze.mjs\` from the \`qsrsoft_kb\` corpus. ${rows.length} articles as of ${index.generatedAt.slice(0, 10)}._`, '');
    L.push('> Grounds SAGE, EOM/food-cost diagnostics, and the metric-provenance registry in QSRSoft\'s own documentation. Regenerate after each KB pull.', '');

    L.push('## Coverage map (category → section → articles)', '');
    for (const cat of Object.keys(tax).sort()) {
      const nSec = Object.keys(tax[cat]).length;
      const nArt = Object.values(tax[cat]).reduce((s, a) => s + a.length, 0);
      L.push(`### ${cat}  ·  ${nArt} article${nArt === 1 ? '' : 's'} in ${nSec} section${nSec === 1 ? '' : 's'}`);
      for (const sec of Object.keys(tax[cat]).sort()) {
        const arts = tax[cat][sec];
        L.push(`- **${sec}** (${arts.length}): ${arts.slice(0, 12).map(a => a.title).filter(Boolean).join(' · ')}${arts.length > 12 ? ` _+${arts.length - 12} more_` : ''}`);
      }
      L.push('');
    }

    L.push('## Meridian metric ↔ KB cross-map', '');
    L.push('_Which QSRSoft articles document each metric family we track. Highest-relevance first._', '');
    for (const [metric, hits] of Object.entries(metricMap)) {
      L.push(`### ${metric}  ·  ${hits.length} article${hits.length === 1 ? '' : 's'}`);
      if (!hits.length) { L.push('_No KB coverage found — gap to note._', ''); continue; }
      for (const h of hits.slice(0, 10)) L.push(`- ${h.title || '(untitled)'}${h.section ? ` — _${h.section}_` : ''}  ${h.url ? `([open](${h.url}))` : ''}`);
      if (hits.length > 10) L.push(`- _+${hits.length - 10} more_`);
      L.push('');
    }

    L.push('## Glossary & formula candidates', '');
    L.push(`_${glossary.length} definitional / formula sentences mined from the bodies — the raw material for a QSRSoft glossary. Verify before relying on any single line._`, '');
    for (const g of glossary.slice(0, 200)) L.push(`- "${g.sentence}" — _${g.article}_`);
    if (glossary.length > 200) L.push(`- _+${glossary.length - 200} more in \`docs/qsrsoft-kb-index.json\`_`);
    L.push('');

    writeFile('memory/qsrsoft-kb-digest.md', L.join('\n'));
    console.log(`[kb-analyze] ✓ wrote memory/qsrsoft-kb-digest.md (${L.length} lines) + docs/qsrsoft-kb-index.json`);
    console.log(`[kb-analyze] taxonomy: ${Object.keys(tax).length} categories · glossary candidates: ${glossary.length}`);
    for (const [m, h] of Object.entries(metricMap)) console.log(`[kb-analyze]   ${m}: ${h.length} articles`);
  });
}

function writeFile(rel, content) {
  try { mkdirSync(dirname(rel), { recursive: true }); } catch { /* exists */ }
  writeFileSync(rel, content);
}

main().catch(e => { console.error('[kb-analyze] fatal:', e); process.exit(1); });
