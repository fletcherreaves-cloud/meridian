// @ts-nocheck
// ── Curated Home Phase 1 (memory/plan-overnight-notes-72-2026-11-06.md §2, task #92) ────────────
// Front door onto Morning Brief's already-proven correlation engine (computeMorningBrief(),
// src/features/morning-brief.js), with the two real additions the plan doc scopes for Phase 1:
// (a) role-cascaded VOICE (src/engine/curated-home.js's altitudeForRole()/buildCuratedHomeItems())
// -- same facts, different altitude of language, never a different data scope (RBAC already
// handles that); (b) a genuine per-user FORMAT preference (checklist/bullets/narrative), stored
// once in Supabase user_settings, respected by this panel's own render path.
//
// Deliberately shipped as its OWN panel (not a replacement of the app's literal Command/Home
// view) -- see this PR's own body for why that's a judgment call, not an oversight.
import * as React from 'react';
import { sNameC } from '../constants.js';
import { withAlpha } from '../utils/fmt.js';
import { loadUserSetting, saveUserSetting } from '../lib/supabase.js';
import { computeMorningBrief, getLatestBriefDate, useBriefDarByLoc } from '../features/morning-brief.js';
import { altitudeForRole, buildCuratedHomeItems } from '../engine/curated-home.js';

const h = React.createElement;
const div  = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

const FORMAT_KEY = 'curated_home_format';
const FORMAT_LS_KEY = 'mf_curated_home_format';
const FORMATS = [
  { id: 'checklist', label: 'Checklist' },
  { id: 'bullets', label: 'Bullets' },
  { id: 'narrative', label: 'Narrative' },
];

const SEV_COLOR = { RED: '#ef4444', AMBER: '#f59e0b', GREEN: '#10b981' };
const SEV_DOT   = { RED: '!', AMBER: '~', GREEN: '✓' };

// ── Format renderers ──────────────────────────────────────────────────────────
// All three take the SAME `items` (src/engine/curated-home.js's buildCuratedHomeItems() output)
// -- the facts and the action never change between formats, only how densely/how prose-like
// they're presented. Per CLAUDE.md's "Voice by role" rule: the number and the decision stay
// visible and exact in every one of these, never replaced by the plain-language framing.

function ChecklistFormat({ items }) {
  if (!items.length) return div({ style: { fontSize: 13, color: 'var(--text3,#6b7280)', padding: '20px 0', textAlign: 'center' } }, 'Nothing flagged right now.');
  return div({ style: { display: 'flex', flexDirection: 'column' } },
    items.map((it, i) => div({
      key: it.id, style: {
        display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 0',
        borderTop: i === 0 ? 'none' : '1px solid var(--bdr,#e5e7eb)',
      },
    },
      div({ className: 'ch-dot', style: {
        width: 20, height: 20, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 12, marginTop: 1,
        background: withAlpha(SEV_COLOR[it.severity], '26'), color: SEV_COLOR[it.severity],
      } }, SEV_DOT[it.severity]),
      div({ style: { flex: 1 } },
        div({ style: { fontWeight: 700, fontSize: 13.5, color: 'var(--text,#111827)' } }, it.headline),
        div({ style: { fontSize: 12, color: 'var(--text2,#4b5563)', marginTop: 2 } }, it.detail),
        div({ style: { fontSize: 11.5, color: 'var(--text3,#6b7280)', marginTop: 4 } },
          it.storesAffected.join(', ') + (it.action ? ' — ' + it.action : '')),
      ),
    )),
  );
}

function BulletsFormat({ items }) {
  if (!items.length) return div({ style: { fontSize: 13, color: 'var(--text3,#6b7280)', padding: '20px 0', textAlign: 'center' } }, 'Nothing flagged right now.');
  return h('ul', { style: { margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 10 } },
    items.map(it => h('li', { key: it.id, style: { fontSize: 13, color: 'var(--text,#111827)' } },
      span({ style: { fontWeight: 700, color: SEV_COLOR[it.severity] } }, it.headline),
      span({ style: { color: 'var(--text3,#6b7280)' } }, ' — ' + it.storesAffected.join(', ')),
    )),
  );
}

// Narrative groups items by severity into short, flowing paragraphs -- same facts as the other
// two formats, prose instead of itemization. Deliberately data-driven (never hardcodes wording
// for a specific category) since any of MORNING_RULES' 12 rules can produce the items here.
function NarrativeFormat({ items, summary }) {
  if (!items.length) {
    return div({ style: { fontSize: 13.5, color: 'var(--text2,#4b5563)', lineHeight: 1.7 } },
      'Nothing worth a call today — all clear across the board.');
  }
  const red = items.filter(i => i.severity === 'RED');
  const amber = items.filter(i => i.severity === 'AMBER');
  const paragraphs = [];
  if (red.length) {
    paragraphs.push(red.map(it =>
      `${it.headline}, at ${it.storesAffected.join(', ')}. ${it.detail} ${it.action || ''}`.trim()
    ).join(' '));
  }
  if (amber.length) {
    paragraphs.push(amber.map(it =>
      `${it.headline}, at ${it.storesAffected.join(', ')}. ${it.detail} ${it.action || ''}`.trim()
    ).join(' '));
  }
  return div({ style: { display: 'flex', flexDirection: 'column', gap: 12 } },
    paragraphs.map((p, i) => h('p', { key: i, style: { margin: 0, fontSize: 13.5, color: 'var(--text2,#4b5563)', lineHeight: 1.75 } }, p)),
  );
}

const RENDERERS = { checklist: ChecklistFormat, bullets: BulletsFormat, narrative: NarrativeFormat };

// ── Panel ──────────────────────────────────────────────────────────────────────
export function CuratedHomePanel({ ds, settings, role, darRows }) {
  const [briefDate] = React.useState(() => getLatestBriefDate(ds));
  const darByLoc = useBriefDarByLoc(briefDate, darRows);
  const brief = React.useMemo(() => computeMorningBrief(ds, briefDate, darByLoc), [ds, briefDate, darByLoc]);

  const altitude = altitudeForRole(role);
  const { items, summary } = React.useMemo(() => buildCuratedHomeItems(brief, role), [brief, role]);

  const [format, setFormat] = React.useState(() => {
    try { const v = localStorage.getItem(FORMAT_LS_KEY); return FORMATS.some(f => f.id === v) ? v : 'checklist'; } catch { return 'checklist'; }
  });
  React.useEffect(() => {
    let live = true;
    loadUserSetting(FORMAT_KEY).then(v => { if (live && FORMATS.some(f => f.id === v)) setFormat(v); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const pickFormat = (id) => {
    setFormat(id);
    try { localStorage.setItem(FORMAT_LS_KEY, id); } catch {}
    saveUserSetting(FORMAT_KEY, id).catch(() => {});
  };

  const Renderer = RENDERERS[format] || ChecklistFormat;
  const altitudeLabel = altitude === 'store' ? 'Store' : altitude === 'patch' ? 'Patch' : 'District';

  return div({ style: { padding: '16px', maxWidth: 860, margin: '0 auto' } },
    div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 16 } },
      div(null,
        div({ style: { fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text3,#6b7280)' } },
          altitudeLabel + ' view'),
        div({ style: { fontSize: 20, fontWeight: 800, color: 'var(--text,#111827)', marginTop: 2 } }, 'Today’s focus'),
        div({ style: { fontSize: 12, color: 'var(--text3,#6b7280)', marginTop: 3 } },
          summary.totalFlags + ' flag' + (summary.totalFlags !== 1 ? 's' : '') + ' · ' + items.length + ' item' + (items.length !== 1 ? 's' : '') + ' at ' + altitudeLabel.toLowerCase() + ' altitude'),
      ),
      div({ style: { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surf2,#f3f4f6)', border: '1px solid var(--bdr,#e5e7eb)', borderRadius: 999, padding: '4px 4px 4px 10px' } },
        span({ style: { fontSize: 11, color: 'var(--text3,#6b7280)', fontWeight: 600 } }, 'Format'),
        ...FORMATS.map(f => h('button', {
          key: f.id, type: 'button', onClick: () => pickFormat(f.id),
          style: {
            padding: '5px 10px', borderRadius: 999, border: 'none', fontSize: 11, fontWeight: 700,
            cursor: 'pointer',
            background: format === f.id ? 'var(--gold,#f5bc00)' : 'transparent',
            color: format === f.id ? '#1a1200' : 'var(--text3,#6b7280)',
          },
        }, f.label)),
      ),
    ),
    div({ style: { background: 'var(--surf,#fff)', border: '1px solid var(--bdr,#e5e7eb)', borderRadius: 14, padding: format === 'checklist' ? '6px 20px' : '20px 22px' } },
      h(Renderer, { items, summary }),
    ),
  );
}
