// Shared, Deno/Node-agnostic gating + result-shaping logic for SAGE's search_project_memory
// tool (dispatch #80). Imported directly by both supabase/functions/sage-chat/index.ts and its
// Vitest test in src/__tests__/, so the SAME code that runs in production is what the test
// exercises -- not a re-implementation of it. Plain JS, no TypeScript, per repo convention.
// See memory/dispatch-80.md.

// "DO and above" per the SAGE-memory design (memory/project-sage-knowledge-grounding.md) means
// admin/supervisor/manager and up in the aspirational 8-tier RBAC table in CLAUDE.md -- but
// profiles.role's real DB constraint (supabase/schema.sql: check (role in ('admin','supervisor',
// 'manager'))) only ever holds those 3 values. 'admin' is the one real value that can stand in
// for "DO and above" while still honoring the design doc's explicit "Supervisor, GM and Office
// Staff do not receive them" instruction. This is a considered interpretation given the real
// constraint, not a guess -- see memory/dispatch-80.md's Resolution section, and revisit if a
// future ruling adds an explicit DB-level tier above 'admin'.
export function qualifiesForRestricted(role) {
  return role === 'admin';
}

// Gates by the DOCUMENT's classification, not only the caller's role (dispatch #80's explicit
// requirement) -- a caller whose role could in principle see restricted content still only sees
// it on rows actually classified restricted, and anything not cleanly 'open' or 'restricted'
// (unset, 'excluded', a typo) is invisible to everyone. Fail closed.
export function rowVisible(sensitivity, role) {
  if (sensitivity === 'open') return true;
  if (sensitivity === 'restricted') return qualifiesForRestricted(role);
  return false;
}

// Query-term extraction shared between the SQL ILIKE-OR clause builder in index.ts and this
// module's own relevance scoring, so the two can't drift apart. Mirrors search_qsr_kb's term
// handling.
export function searchTerms(raw) {
  const cleaned = String(raw || '').replace(/[,%()]/g, ' ').trim();
  const terms = cleaned.split(/\s+/).filter(w => w.length >= 3).slice(0, 8);
  return { phrase: cleaned, terms: terms.length ? terms : (cleaned ? [cleaned] : []) };
}

// Shapes raw sage_memory_kb rows into the tool's return value.
//
// Re-applies rowVisible as defense-in-depth even though index.ts is expected to have already
// filtered restricted rows out of the SQL query itself for a non-qualifying caller: a row that
// should not be visible must never survive this function, regardless of whether the SQL-level
// filter that was supposed to keep it out of `rawRows` actually ran. This is the layer the
// dispatch's verification bar checks against -- the tool's actual return value, not the prompt.
export function buildMemorySearchResult(rawRows, role, query, limit) {
  const { phrase, terms } = searchTerms(query);
  const visible = (rawRows || []).filter(r => rowVisible(r.sensitivity, role));

  const scored = visible.map(r => {
    const title = String(r.title || '').toLowerCase();
    const body = String(r.chunk_text || '').toLowerCase();
    const pl = phrase.toLowerCase();
    let score = 0;
    if (pl && title.includes(pl)) score += 10;
    if (pl && body.includes(pl)) score += 4;
    for (const t of terms) {
      const tl = t.toLowerCase();
      if (title.includes(tl)) score += 3;
      if (body.includes(tl)) score += 1;
    }
    return { row: r, score };
  }).filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  // One result per source file -- keep only the best-scoring chunk per filename, so a
  // heavily-chunked document doesn't crowd out everything else.
  const bestByFile = new Map();
  for (const s of scored) {
    const existing = bestByFile.get(s.row.filename);
    if (!existing || s.score > existing.score) bestByFile.set(s.row.filename, s);
  }
  const top = Array.from(bestByFile.values()).sort((a, b) => b.score - a.score).slice(0, limit);

  const results = top.map(({ row }) => {
    const body = String(row.chunk_text || '');
    let idx = -1;
    const scanTerms = terms.length ? terms : (phrase ? [phrase] : []);
    for (const t of scanTerms) {
      const i = body.toLowerCase().indexOf(String(t).toLowerCase());
      if (i >= 0 && (idx < 0 || i < idx)) idx = i;
    }
    const start = idx > 120 ? idx - 120 : 0;
    const excerpt = body.slice(start, start + 700).replace(/\s+/g, ' ').trim();
    return {
      filename: row.filename,
      title: row.title,
      sensitivity: row.sensitivity,
      excerpt: (start > 0 ? '…' : '') + excerpt + (body.length > start + 700 ? '…' : ''),
    };
  });

  return {
    query,
    count: results.length,
    results,
    note: "Internal Meridian project memory -- curated findings/reference/analysis/design notes, not the owner's live store data. Cite the filename when you rely on it.",
  };
}
