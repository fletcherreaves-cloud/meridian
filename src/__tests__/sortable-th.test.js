// @vitest-environment happy-dom
// @ts-nocheck
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useSortedRows, SortTh } from '../components/SortableTh.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

function TestTable({ rows }) {
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(rows);
  return h('table', null,
    h('thead', null, h('tr', null,
      h(SortTh, { label: 'Name', colKey: 'name', sortKey, sortDir, onSort }),
      h(SortTh, { label: 'Value', colKey: 'value', sortKey, sortDir, onSort, align: 'right' }),
      h(SortTh, { label: 'Unsortable', colKey: null, sortKey, sortDir, onSort }),
    )),
    h('tbody', null, ...sorted.map(r => h('tr', { key: r.name },
      h('td', null, r.name), h('td', null, String(r.value))))),
  );
}

async function mount(rows) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(h(TestTable, { rows })); });
  return { container, root };
}

function rowText(container) {
  return [...container.querySelectorAll('tbody tr')].map(tr => tr.textContent);
}

describe('useSortedRows + SortTh', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  const ROWS = [
    { name: 'Charlie', value: 30 },
    { name: 'Alice', value: 10 },
    { name: 'Bob', value: 20 },
  ];

  it('renders in natural order before any header is clicked', async () => {
    ({ container, root } = await mount(ROWS));
    expect(rowText(container)).toEqual(['Charlie30', 'Alice10', 'Bob20']);
  });

  it('clicking a numeric column header sorts ascending, then descending on repeat click', async () => {
    ({ container, root } = await mount(ROWS));
    const valueHeader = [...container.querySelectorAll('th')].find(t => t.textContent.startsWith('Value'));

    await act(async () => { valueHeader.click(); });
    expect(rowText(container)).toEqual(['Alice10', 'Bob20', 'Charlie30']);
    expect(valueHeader.textContent).toBe('Value ▲');

    await act(async () => { valueHeader.click(); });
    expect(rowText(container)).toEqual(['Charlie30', 'Bob20', 'Alice10']);
    expect(valueHeader.textContent).toBe('Value ▼');
  });

  it('clicking a string column header sorts alphabetically', async () => {
    ({ container, root } = await mount(ROWS));
    const nameHeader = [...container.querySelectorAll('th')].find(t => t.textContent.startsWith('Name'));
    await act(async () => { nameHeader.click(); });
    expect(rowText(container)).toEqual(['Alice10', 'Bob20', 'Charlie30']);
  });

  it('switching to a different column resets direction to ascending', async () => {
    ({ container, root } = await mount(ROWS));
    const valueHeader = [...container.querySelectorAll('th')].find(t => t.textContent.startsWith('Value'));
    const nameHeader = [...container.querySelectorAll('th')].find(t => t.textContent.startsWith('Name'));
    await act(async () => { valueHeader.click(); });
    await act(async () => { valueHeader.click(); }); // now descending on Value
    await act(async () => { nameHeader.click(); });  // switch column -> back to ascending
    expect(rowText(container)).toEqual(['Alice10', 'Bob20', 'Charlie30']);
    expect(nameHeader.textContent).toBe('Name ▲');
  });

  it('null values always sort last regardless of direction', async () => {
    const withNull = [...ROWS, { name: 'Dave', value: null }];
    ({ container, root } = await mount(withNull));
    const valueHeader = [...container.querySelectorAll('th')].find(t => t.textContent.startsWith('Value'));
    await act(async () => { valueHeader.click(); }); // ascending
    expect(rowText(container)).toEqual(['Alice10', 'Bob20', 'Charlie30', 'Davenull']);
    await act(async () => { valueHeader.click(); }); // descending
    expect(rowText(container)).toEqual(['Charlie30', 'Bob20', 'Alice10', 'Davenull']);
  });

  it('a column with colKey:null never becomes clickable/sortable', async () => {
    ({ container, root } = await mount(ROWS));
    const unsortable = [...container.querySelectorAll('th')].find(t => t.textContent.startsWith('Unsortable'));
    expect(unsortable.style.cursor).not.toBe('pointer');
    await act(async () => { unsortable.click(); });
    expect(rowText(container)).toEqual(['Charlie30', 'Alice10', 'Bob20']); // unchanged
  });
});
