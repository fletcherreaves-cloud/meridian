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
  buildReportFilename, exportReportCSV, exportReportXLSX, exportReportPDF, exportReportPDFFromHTML, printReportHTML,
} from '../utils/report-export.js';
import { printHtml } from '../utils/print-html.js';
import { sNameC } from '../constants.js';
import { InfoIcon } from '../engine/forecast.js';

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
  onRun, getExportData, getPrintHTML, onBack, children, articleKey,
}) {
  const { useState, useMemo, useCallback } = React;
  const [range, setRange] = useState(() => resolveDatePreset(defaultPresetId, datePresets));
  const [locValue, setLocValue] = useState({ level: 'all', id: null });
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  // pdfStatus: null | 'busy' | 'done' | {error} -- owner report, live, 2026-11-15: "i was able to
  // successfully run one pdf report, subsequent attempts yield nothing. It will not generate on
  // screen for me." The PDF path (unlike CSV/Excel/Print) can run for several real seconds on a
  // multi-store report -- html2canvas rasterizes one store page at a time -- and the click handler
  // previously gave ZERO visible feedback while that ran or if it failed, so a slow run or a
  // silently-thrown error both looked identical to "nothing happened." The other strong suspect,
  // which this can't fix from inside the page at all: Chrome/Edge silently block a page's SECOND+
  // automatic download in a session without an explicit "Allow multiple downloads" click (no JS
  // API can detect this), which matches "one worked, then nothing" exactly -- so the done-state
  // message says to check for that, since a user who doesn't know to look for the address-bar icon
  // has no way to connect it to this feature.
  const [pdfStatus, setPdfStatus] = useState(null);

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

  // getPrintHTML is optional — most reports are fine with the generic flat-table print that
  // printReportHTML renders straight off the shared CSV/Excel/PDF data contract. A report that
  // wants Print to look like its own on-screen cards (CLAUDE.md's "Print/PDF export formatting
  // should match existing workbook aesthetic") supplies getPrintHTML() to render bespoke HTML
  // instead — printHtml() itself is the same shared same-page overlay every hand-rolled print
  // flow in the app already uses, so this isn't a new print mechanism, just a second way to feed it.
  //
  // ⚠️ BUG FIXED 2026-11-15 (owner report, live): PDF used to ALWAYS call exportReportPDF() (the
  // generic flat {headers,rows} jsPDF+autoTable table), even for a report supplying a bespoke
  // getPrintHTML() — so Print and PDF were two totally independent renderers, and every fix made
  // to a report's bespoke print HTML reached Print but silently never reached PDF. Now PDF reuses
  // the SAME bespoke HTML via exportReportPDFFromHTML() (html2canvas + jsPDF, one PDF page per
  // `.store-page` section) whenever a report supplies getPrintHTML(), so the two can never again
  // visually diverge. A report with no getPrintHTML() keeps the unchanged flat-table PDF.
  const handlePdfExport = useCallback(async () => {
    if (pdfStatus === 'busy') return; // guard a double-click while the first run is still rendering
    setPdfStatus('busy');
    try {
      if (getPrintHTML) await exportReportPDFFromHTML({ filename: filenameFor(), html: getPrintHTML() });
      else await exportReportPDF({ filename: filenameFor(), ...getExportData() });
      setPdfStatus('done');
      setTimeout(() => setPdfStatus(s => (s === 'done' ? null : s)), 8000);
    } catch (e) {
      setPdfStatus({ error: e?.message || 'PDF export failed' });
    }
  }, [getPrintHTML, getExportData, filenameFor, pdfStatus]);

  const exportItems = !hasRun ? [] : [
    { label: '🖨 Print', onClick: () => getPrintHTML ? printHtml(getPrintHTML()) : printReportHTML(getExportData()) },
    { label: '⬇ CSV', onClick: () => exportReportCSV({ filename: filenameFor(), ...getExportData() }) },
    { label: '⬇ Excel', onClick: () => exportReportXLSX({ filename: filenameFor(), sheetName: title, ...getExportData() }) },
    { label: pdfStatus === 'busy' ? 'Generating PDF…' : '⬇ PDF', disabled: pdfStatus === 'busy', onClick: handlePdfExport },
  ];

  const subtitleText = (subtitlePrefix ? subtitlePrefix + ' — ' : '') + scope + (range ? ` · ${range.s} to ${range.e}` : '');

  // Visible confirmation/error for the PDF export specifically (see pdfStatus's own comment) --
  // every other export action here is near-instant and has always relied on the browser's own
  // download-bar feedback, which is fine for those; PDF is the one that can run for several real
  // seconds and silently fail, so it's the one that needs its own on-screen word.
  const pdfStatusNode = pdfStatus === 'busy'
    ? h('span', { style: { fontSize: '10.5px', color: 'var(--text3)' } }, '⏳ Generating PDF…')
    : pdfStatus === 'done'
    ? h('span', { style: { fontSize: '10.5px', color: '#10b981' } }, '✓ PDF ready — check your downloads (if nothing appears, your browser may be blocking repeated downloads from this site; look for an icon in the address bar and choose Allow)')
    : pdfStatus?.error
    ? h('span', { style: { fontSize: '10.5px', color: 'var(--crit)' } }, `⚠ ${pdfStatus.error}`)
    : null;

  return h(RoutePanelShell, {
    title, icon, onBack,
    subtitle: articleKey
      ? div({ style: { display: 'flex', alignItems: 'center', gap: 6 } },
          h('span', null, subtitleText),
          h(InfoIcon, { articleKey }))
      : subtitleText,
    headerExtra: h(ActionMenu, { label: 'Export ▾', items: exportItems }),
  },
    // Rendered as its own full-width line in the BODY, not alongside the header's title -- an
    // earlier version put this next to headerExtra's ActionMenu, inside the header's own flex row,
    // and the success message's length squeezed the title's `flex:1,minWidth:0` column down to a
    // sliver, wrapping "Targets vs Actual" into an unreadable single-character-wide column
    // (caught live, screenshot-verified, before shipping).
    pdfStatusNode && div({ style: { padding: '6px 18px 0' } }, pdfStatusNode),
    div({ style: { padding: '12px 18px', borderBottom: '.5px solid var(--bdr)', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' } },
      div({ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        h(DateRangeControl, { presets: datePresets, value: range, onChange: setRange, variant: 'dropdown' }),
        h(LocationSelector, { stores, invOrgCoords, storeNames, value: locValue, onChange: setLocValue, mode: locationMode, variant: 'dropdown' }),
      ),
      btn({ className: 'btn btn-primary btn-sm', disabled: running || !range, onClick: run }, running ? 'Running…' : 'Run Report'),
    ),
    div({ style: { padding: '14px 18px' } }, children),
  );
}
