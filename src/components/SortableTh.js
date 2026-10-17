// @ts-nocheck
// ── Shared click-to-sort table header (2026-10-17) ────────────────────────────────────────────
// Every report built on ReportShell.js rendered a fully static table -- no report wired up
// sorting, even though cash-variance-pattern.js's own on-screen copy says "Sort any column"
// (a promise the UI never kept). ReportShell itself only owns the criteria bar + export menu
// (see its own header comment); each report owns its table markup, so sorting belongs here as a
// small opt-in helper rather than baked into ReportShell. Mirrors the pattern security-panel.js's
// sortTh/thStyle (dispatch #120) and trend-report.js's SortableTh already proved out independently
// -- one shared implementation now instead of a 12th hand-rolled copy.
import * as React from 'react';

const h = React.createElement;

// `rows`: array of plain row objects. `initialKey`/`initialDir` seed the starting sort (both
// optional -- omit to start unsorted, in the table's own natural/computed order).
// Returns `sorted` (NOT the same array identity as `rows` once a sort is applied, so callers
// using `rows` elsewhere -- e.g. CSV export of the unsorted source -- are unaffected) plus the
// sort state and the `onSort(key)` toggle to wire into each column header.
export function useSortedRows(rows, initialKey = null, initialDir = 'asc') {
  const { useState, useMemo, useCallback } = React;
  const [sortKey, setSortKey] = useState(initialKey);
  const [sortDir, setSortDir] = useState(initialDir);

  const onSort = useCallback((key) => {
    setSortKey(prevKey => {
      setSortDir(prevDir => (prevKey === key ? (prevDir === 'asc' ? 'desc' : 'asc') : 'asc'));
      return key;
    });
  }, []);

  const sorted = useMemo(() => {
    if (!sortKey || !rows || !rows.length) return rows;
    const copy = rows.slice();
    copy.sort((a, b) => {
      const av = a ? a[sortKey] : null, bv = b ? b[sortKey] : null;
      // Nulls always sort last, regardless of direction -- a missing value isn't "lowest".
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp;
      if (typeof av === 'string' || typeof bv === 'string') cmp = String(av).localeCompare(String(bv));
      else cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  return { sorted, sortKey, sortDir, onSort };
}

function sortThStyle(sortable, align, extra) {
  return {
    textAlign: align || 'left', fontSize: '8px', fontWeight: 700, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: '.3px', padding: '4px 8px',
    borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap',
    cursor: sortable ? 'pointer' : 'default', userSelect: 'none',
    ...extra,
  };
}

// `colKey`: the field on each row this column sorts by. Pass `null`/omit for a non-sortable
// header (e.g. a column with no single comparable value). Shows ▲/▼ only on the active column.
export function SortTh({ label, colKey, sortKey, sortDir, onSort, align, style, title }) {
  const active = colKey != null && sortKey === colKey;
  const arrow = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
  const sortable = colKey != null && !!onSort;
  return h('th', {
    style: sortThStyle(sortable, align, style),
    onClick: sortable ? () => onSort(colKey) : undefined,
    title: title || (sortable ? `Sort by ${label}` : undefined),
  }, label + arrow);
}
