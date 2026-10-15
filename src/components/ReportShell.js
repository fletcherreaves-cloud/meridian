// @ts-nocheck
// ── Report Shell (Reports redesign Phase 2, 2026-10-15) ──────────────────────────────────────
// The one criteria-bar + export-menu chrome every NEW report built on it gets for free: date
// range + LocationSelector + Run, then Print/CSV/Excel/PDF once a run has produced data. Wraps
// RoutePanelShell (which already gives the back button + 📸 Share for free) rather than
// reinventing header chrome. Existing hand-rolled reports (DateRangeReport, AboveStoreOnePager,
// etc.) are untouched -- they adopt this opportunistically later, per the panel-contract
// "touch a panel, bring it into line" convention, not a retrofit sweep now.
//
// The caller owns what the report actually computes and renders (via `onRun`/`children`) --
// this component only owns the criteria controls and the export actions, which all resolve to
// one shared data contract: `getExportData()` must return {title, subtitle?, headers, rows},
// the exact shape report-export.js's four actions already consume.
import * as React from 'react';
import { RoutePanelShell } from './ModalShell.js';
import {
  DateRangeControl, DATE_RANGE_PRESETS, resolveDatePreset,
  LocationSelector, buildLocationHierarchy, locationSelectorLocs, ActionMenu,
} from './PanelControls.js';
import {
  buildReportFilename, exportReportCSV, exportReportXLSX, exportReportPDF, printReportHTML,
} from '../utils/report-export.js';
import { sNameC } from '../constants.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

// Pure: a LocationSelector value -> the short, filename/display-safe scope label every export
// filename and the on-screen subtitle use. Exported so a report's own body/subtitle can reuse
// the identical label the export filenames carry, instead of a second ad-hoc rendering of it.
export function reportScopeLabel(value, tree) {
  if (!value || value.level === 'all') return 'AllStores';
  if (value.level === 'store') return sNameC(value.id) || value.id;
  if (value.level === 'state') return (tree.states.find(s => s.id === value.id) || {}).label || value.id;
  if (value.level === 'patch') return (tree.patches.find(p => p.id === value.id) || {}).label || value.id;
  return 'AllStores';
}

export function ReportShell({
  title, icon, subtitlePrefix, stores, invOrgCoords, storeNames,
  defaultPresetId = '28d', datePresets = DATE_RANGE_PRESETS, locationMode = 'full',
  onRun, getExportData, onBack, children,
}) {
  const { useState, useMemo, useCallback } = React;
  const [range, setRange] = useState(() => resolveDatePreset(defaultPresetId, datePresets));
  const [locValue, setLocValue] = useState({ level: 'all', id: null });
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const tree = useMemo(() => buildLocationHierarchy(stores, invOrgCoords, storeNames), [stores, invOrgCoords, storeNames]);
  const locs = useMemo(() => locationSelectorLocs(locValue, tree), [locValue, tree]);
  const scope = reportScopeLabel(locValue, tree);

  const run = useCallback(async () => {
    if (!range) return;
    setRunning(true);
    try {
      await onRun?.({ range, locs, locValue, scope });
      setHasRun(true);
    } finally {
      setRunning(false);
    }
  }, [onRun, range, locs, locValue, scope]);

  const filenameFor = useCallback(() => buildReportFilename({ name: title, start: range?.s, end: range?.e, scope }), [title, range, scope]);

  const exportItems = !hasRun ? [] : [
    { label: '🖨 Print', onClick: () => printReportHTML(getExportData()) },
    { label: '⬇ CSV', onClick: () => exportReportCSV({ filename: filenameFor(), ...getExportData() }) },
    { label: '⬇ Excel', onClick: () => exportReportXLSX({ filename: filenameFor(), sheetName: title, ...getExportData() }) },
    { label: '⬇ PDF', onClick: () => exportReportPDF({ filename: filenameFor(), ...getExportData() }) },
  ];

  return h(RoutePanelShell, {
    title, icon, onBack,
    subtitle: (subtitlePrefix ? subtitlePrefix + ' — ' : '') + scope + (range ? ` · ${range.s} to ${range.e}` : ''),
    headerExtra: h(ActionMenu, { label: 'Export ▾', items: exportItems }),
  },
    div({ style: { padding: '12px 18px', borderBottom: '.5px solid var(--bdr)', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' } },
      div({ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        h(DateRangeControl, { presets: datePresets, value: range, onChange: setRange }),
        h(LocationSelector, { stores, invOrgCoords, storeNames, value: locValue, onChange: setLocValue, mode: locationMode }),
      ),
      btn({ className: 'btn btn-primary btn-sm', disabled: running || !range, onClick: run }, running ? 'Running…' : 'Run Report'),
    ),
    div({ style: { padding: '14px 18px' } }, children),
  );
}
