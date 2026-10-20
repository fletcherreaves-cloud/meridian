// @ts-nocheck
// ── Equipment Survey View (Phase 2, Equipment Profile project) ─────────────────────────────────
// The public, no-login page a crew walkthrough share link opens to. Self-contained (does NOT
// import the heavy dashboard) — fetches the catalog + a store's current entries via the
// equipment-survey edge function. Design (agreed with the owner, 2026-10-19):
//   - ONE link works for every store — an in-page picker selects which one, not a separate URL.
//   - Nothing is ever locked. Every add/edit/correction is a NEW append-only row (instance_id ties
//     corrections to the same physical item); there is no "save" that overwrites history.
//   - "Your name" is a free-text field cached in localStorage, not a real login — it exists so a
//     later review knows who reported what, not to gate who can use the link.
//   - A data-plate photo is optional; when taken, Claude-vision autofill (equipment-plate-extract)
//     suggests model/serial/manufacturer/date, but every field stays editable before submit — the
//     photo and the raw extraction are kept either way as the audit fallback.
import * as React from 'react';
import {
  fetchEquipmentCatalog, fetchEquipmentEntries, submitEquipmentEntry, addEquipmentCatalogItem,
  extractEquipmentPlate, fetchEquipmentRecipients, sendEquipmentSurveyEmail,
} from '../lib/supabase.js';
import { STORE_NAMES, getStoreOrg } from '../constants.js';
import {
  PLACEMENTS, SIDE_OPTIONS, RELATIVE_OPTIONS, sideLabel, relativeLabel,
  describeEquipmentEntry, buildEquipmentRollupRows, buildEquipmentRollupText,
} from '../engine/equipment-survey.js';

const { useState, useEffect, useCallback, useMemo, useRef } = React;
const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const NAME_KEY = 'mf_equip_submitted_by';

// ── Shared dark-theme primitives, matching eom-share-view.js's palette ─────────────────────────
const colors = { bg: '#0f1117', surf: '#171a21', surf2: '#1d222b', bdr: '#262b36', bdr2: '#333a48', text: '#e7ebf3', dim: '#78839a', gold: '#f5bc00', good: '#4ade80', warn: '#fb923c', bad: '#f87171' };
const page = (...kids) => div({ style: { minHeight: '100vh', background: colors.bg, color: colors.text, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif', padding: '20px 14px 70px' } },
  div({ style: { maxWidth: '620px', margin: '0 auto' } }, ...kids));
const card = (...kids) => div({ style: { background: colors.surf, border: `1px solid ${colors.bdr}`, borderRadius: '10px', padding: '16px' } }, ...kids);
const label = (text) => div({ style: { fontSize: '11px', fontWeight: 700, color: colors.dim, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '5px' } }, text);
const inputStyle = { width: '100%', boxSizing: 'border-box', background: colors.surf2, border: `1px solid ${colors.bdr2}`, color: colors.text, borderRadius: '7px', padding: '9px 10px', fontSize: '14px', marginBottom: '12px' };
const btn = (variant = 'primary') => ({
  background: variant === 'primary' ? colors.gold : variant === 'danger' ? 'transparent' : 'transparent',
  color: variant === 'primary' ? '#1a1400' : variant === 'danger' ? colors.bad : colors.text,
  border: variant === 'primary' ? 'none' : `1px solid ${variant === 'danger' ? colors.bad : colors.bdr2}`,
  borderRadius: '8px', padding: '10px 16px', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Name gate: asked once, cached ───────────────────────────────────────────────────────────
function NameGate({ onDone }) {
  const [name, setName] = useState('');
  return page(
    div({ style: { fontWeight: 800, fontSize: '20px', color: colors.gold, marginBottom: '4px' } }, 'Meridian'),
    div({ style: { fontSize: '14px', color: colors.dim, marginBottom: '18px' } }, 'Equipment Survey'),
    card(
      label('Your name'),
      h('input', { style: inputStyle, value: name, onChange: e => setName(e.target.value), placeholder: 'So we know who reported this', autoFocus: true }),
      h('button', { style: btn('primary'), disabled: !name.trim(), onClick: () => onDone(name.trim()) }, 'Continue →'),
    ),
  );
}

// ── Store picker ─────────────────────────────────────────────────────────────────────────────
const ORG_LABELS = { mcdok: 'MCDOK — Oklahoma', emerald: 'Emerald Arches — Florida' };

function StorePicker({ onPick }) {
  const byOrg = useMemo(() => {
    const groups = {};
    for (const loc of Object.keys(STORE_NAMES)) {
      const org = getStoreOrg ? getStoreOrg(loc) : 'other';
      (groups[org] = groups[org] || []).push(loc);
    }
    for (const org of Object.keys(groups)) groups[org].sort((a, b) => STORE_NAMES[a].localeCompare(STORE_NAMES[b]));
    return groups;
  }, []);
  return page(
    div({ style: { fontWeight: 800, fontSize: '20px', color: colors.gold, marginBottom: '4px' } }, 'Meridian'),
    div({ style: { fontSize: '14px', color: colors.dim, marginBottom: '18px' } }, 'Which store are you at?'),
    ...Object.entries(byOrg).map(([org, locs]) =>
      div({ key: org, style: { marginBottom: '18px' } },
        div({ style: { fontSize: '11px', fontWeight: 700, color: colors.dim, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '8px' } }, ORG_LABELS[org] || org),
        div({ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          ...locs.map(loc => h('button', {
            key: loc, onClick: () => onPick(loc),
            style: { textAlign: 'left', background: colors.surf, border: `1px solid ${colors.bdr}`, color: colors.text, borderRadius: '8px', padding: '12px 14px', fontSize: '14px', cursor: 'pointer' },
          }, STORE_NAMES[loc]))))),
  );
}

// ── Add/Edit equipment form ──────────────────────────────────────────────────────────────────
function EquipmentForm({ token, loc, catalog, consumables, submittedBy, editing, onCancel, onSaved }) {
  const [type, setType] = useState(editing?.type || '');
  const [manufacturer, setManufacturer] = useState(editing?.manufacturer || '');
  const [catalogItemId, setCatalogItemId] = useState(editing?.catalogItemId || '');
  const [manualMode, setManualMode] = useState(!!editing?.manualEntryText);
  const [manualType, setManualType] = useState(editing?.manualType || '');
  const [manualManufacturer, setManualManufacturer] = useState(editing?.manualManufacturer || '');
  const [manualModel, setManualModel] = useState(editing?.manualModel || '');
  const [placement, setPlacement] = useState(editing?.placementZone || '');
  const [side, setSide] = useState(editing?.positionDetail?.side || '');
  const [relative, setRelative] = useState(editing?.positionDetail?.relative || '');
  const [serial, setSerial] = useState(editing?.serialNumber || '');
  const [certDate, setCertDate] = useState(editing?.certDate || '');
  const [photoUrl, setPhotoUrl] = useState(editing?.photoUrl || null);
  const [aiExtraction, setAiExtraction] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractErr, setExtractErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  const types = useMemo(() => [...new Set(catalog.map(c => c.type))].sort(), [catalog]);
  const manufacturers = useMemo(() => [...new Set(catalog.filter(c => c.type === type).map(c => c.manufacturer))].sort(), [catalog, type]);
  const models = useMemo(() => catalog.filter(c => c.type === type && c.manufacturer === manufacturer), [catalog, type, manufacturer]);
  const selectedItem = useMemo(() => catalog.find(c => c.id === catalogItemId) || null, [catalog, catalogItemId]);
  const itemConsumables = useMemo(() => selectedItem ? consumables.filter(cc => cc.catalog_item_id === selectedItem.id) : [], [consumables, selectedItem]);
  const needsSerial = manualMode || (selectedItem && selectedItem.needs_serial);
  const needsCertDate = manualMode || (selectedItem && selectedItem.needs_cert_date);
  const effectiveType = (manualMode ? manualType : (selectedItem?.type || type || '')).toLowerCase();
  const showSide = effectiveType.includes('grill') || effectiveType.includes('fryer');
  const showRelative = effectiveType.includes('fryer');

  const onPhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setExtracting(true); setExtractErr('');
    try {
      const base64 = await fileToBase64(file);
      const r = await extractEquipmentPlate(token, base64, file.type || 'image/jpeg');
      if (r?.error) { setExtractErr(r.error); }
      else {
        if (r.photoUrl) setPhotoUrl(r.photoUrl);
        if (r.extraction) {
          setAiExtraction(r.extraction);
          if (r.extraction.serial && !serial) setSerial(r.extraction.serial);
          // Manufacture date is shown read-only below (aiExtraction.manufactureDate) rather than
          // auto-filled into certDate — a manufacture date and a certification date are different
          // facts and conflating them would silently write the wrong one in.
          if (!manualMode && r.extraction.model && models.length && !catalogItemId) {
            const match = models.find(m => (m.model_aliases || []).some(a => String(a).toLowerCase() === String(r.extraction.model).toLowerCase()));
            if (match) setCatalogItemId(match.id);
          }
        }
      }
    } catch (ex) { setExtractErr(String(ex?.message || ex)); }
    setExtracting(false);
  };

  const save = async (action) => {
    setSaving(true); setErr('');
    try {
      let finalCatalogItemId = manualMode ? null : (catalogItemId || null);
      let manualEntryText = null;
      if (manualMode) {
        if (!manualType.trim() || !manualManufacturer.trim() || !manualModel.trim()) { setErr('Type, manufacturer, and model are all required.'); setSaving(false); return; }
        const addRes = await addEquipmentCatalogItem(token, { type: manualType.trim(), manufacturer: manualManufacturer.trim(), model: manualModel.trim(), submittedBy });
        if (addRes?.error) { setErr(addRes.error); setSaving(false); return; }
        finalCatalogItemId = addRes.id;
        manualEntryText = `${manualType.trim()} / ${manualManufacturer.trim()} / ${manualModel.trim()}`;
      } else if (!finalCatalogItemId) {
        setErr('Pick a model, or switch to "Not listed."'); setSaving(false); return;
      }
      const positionDetail = (side || relative) ? { side: side || null, relative: relative || null } : null;
      const entry = {
        loc, instanceId: editing?.instanceId || undefined,
        catalogItemId: finalCatalogItemId, manualEntryText,
        placementZone: placement || null, positionDetail, serialNumber: serial || null, certDate: certDate || null,
        action, submittedBy, photoUrl, aiExtraction,
      };
      const r = await submitEquipmentEntry(token, entry);
      if (r?.error) { setErr(r.error); setSaving(false); return; }
      onSaved();
    } catch (ex) { setErr(String(ex?.message || ex)); setSaving(false); }
  };

  return card(
    div({ style: { fontWeight: 700, fontSize: '16px', marginBottom: '14px' } }, editing ? 'Correct This Item' : 'Add Equipment'),

    !manualMode && div({},
      label('Type'), h('select', { style: inputStyle, value: type, onChange: e => { setType(e.target.value); setManufacturer(''); setCatalogItemId(''); } },
        h('option', { value: '' }, '— Select —'), ...types.map(t => h('option', { key: t, value: t }, t))),
      type && div({},
        label('Manufacturer'), h('select', { style: inputStyle, value: manufacturer, onChange: e => { setManufacturer(e.target.value); setCatalogItemId(''); } },
          h('option', { value: '' }, '— Select —'), ...manufacturers.map(m => h('option', { key: m, value: m }, m)))),
      manufacturer && div({},
        label('Model'), h('select', { style: inputStyle, value: catalogItemId, onChange: e => setCatalogItemId(e.target.value) },
          h('option', { value: '' }, '— Select —'), ...models.map(m => h('option', { key: m.id, value: m.id }, m.model)))),
      itemConsumables.length > 0 && div({ style: { fontSize: '11.5px', color: colors.dim, marginBottom: '10px', background: colors.surf2, border: `1px solid ${colors.bdr2}`, borderRadius: '6px', padding: '8px 10px' } },
        'Correct consumables for this model: ', itemConsumables.map(c => `${c.label || c.consumable_type} (${c.wrin})`).join(' · ')),
      h('button', { onClick: () => setManualMode(true), style: { background: 'none', border: 'none', color: colors.dim, fontSize: '12px', textDecoration: 'underline', cursor: 'pointer', padding: 0, marginBottom: '14px' } }, "Not listed? Type it in →"),
    ),

    manualMode && div({},
      div({ style: { fontSize: '11.5px', color: colors.warn, marginBottom: '10px' } }, 'This variant will be added to the catalog and flagged for owner review — it becomes selectable by everyone right away.'),
      label('Type (e.g. Grill, Toaster, Fryer)'), h('input', { style: inputStyle, value: manualType, onChange: e => setManualType(e.target.value) }),
      label('Manufacturer'), h('input', { style: inputStyle, value: manualManufacturer, onChange: e => setManualManufacturer(e.target.value) }),
      label('Model'), h('input', { style: inputStyle, value: manualModel, onChange: e => setManualModel(e.target.value) }),
      h('button', { onClick: () => setManualMode(false), style: { background: 'none', border: 'none', color: colors.dim, fontSize: '12px', textDecoration: 'underline', cursor: 'pointer', padding: 0, marginBottom: '14px' } }, '← Back to the list'),
    ),

    label('Placement (optional)'),
    h('select', { style: inputStyle, value: placement, onChange: e => setPlacement(e.target.value) },
      h('option', { value: '' }, '— Select —'), ...PLACEMENTS.map(p => h('option', { key: p.value, value: p.value }, p.label))),

    showSide && div({},
      label('Side (optional — this store’s own Side 1/Side 2, as your crew knows it)'),
      h('select', { style: inputStyle, value: side, onChange: e => setSide(e.target.value) },
        h('option', { value: '' }, '— Select —'), ...SIDE_OPTIONS.map(o => h('option', { key: o.value, value: o.value }, o.label)))),
    showRelative && div({},
      label('Relative to the grill(s) (optional)'),
      h('select', { style: inputStyle, value: relative, onChange: e => setRelative(e.target.value) },
        h('option', { value: '' }, '— Select —'), ...RELATIVE_OPTIONS.map(o => h('option', { key: o.value, value: o.value }, o.label)))),

    div({ style: { marginBottom: '12px' } },
      label('Data plate photo (optional — helps fill in the fields below)'),
      h('input', { ref: fileRef, type: 'file', accept: 'image/*', capture: 'environment', onChange: onPhoto, style: { fontSize: '13px', color: colors.text } }),
      extracting && div({ style: { fontSize: '12px', color: colors.dim, marginTop: '6px' } }, 'Reading the plate…'),
      extractErr && div({ style: { fontSize: '12px', color: colors.bad, marginTop: '6px' } }, extractErr),
      aiExtraction && div({ style: { fontSize: '11.5px', color: colors.good, marginTop: '6px' } }, 'Fields below were suggested from the photo — check them before saving.'),
      aiExtraction?.confidenceNotes && div({ style: { fontSize: '11px', color: colors.warn, marginTop: '4px' } }, '⚠ ' + aiExtraction.confidenceNotes),
      aiExtraction?.manufactureDate && div({ style: { fontSize: '11px', color: colors.dim, marginTop: '4px' } }, `Manufacture date on plate: ${aiExtraction.manufactureDate}`),
    ),

    needsSerial && div({}, label('Serial number'), h('input', { style: inputStyle, value: serial, onChange: e => setSerial(e.target.value) })),
    needsCertDate && div({}, label('Current certification date'), h('input', { type: 'date', style: inputStyle, value: certDate, onChange: e => setCertDate(e.target.value) })),

    err && div({ style: { color: colors.bad, fontSize: '13px', marginBottom: '10px' } }, err),

    div({ style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
      h('button', { style: btn('primary'), disabled: saving, onClick: () => save(editing ? 'corrected' : 'added') }, saving ? 'Saving…' : editing ? 'Save Correction' : 'Add Equipment'),
      h('button', { style: btn('secondary'), disabled: saving, onClick: onCancel }, 'Cancel'),
      editing && h('button', { style: btn('danger'), disabled: saving, onClick: () => save('removed') }, 'Remove This Item'),
    ),
  );
}

// ── Review & Share (owner request 2026-10-19): rolled-up copy the crew member can keep, plus an
// optional email to the store's GM and/or anyone else they pick ────────────────────────────────
// "identify the user and send results to their email as well... If unsure, loop in a
// clarification section... Or alternatively, use a selection list to let them select one or more
// people." Built as a selection list (checkboxes), never an auto-send — this is a public,
// no-login page, so there is no verified identity to silently guess an email from; the GM/owner
// candidates come from fetchEquipmentRecipients (the one directory Meridian already keeps,
// src/features/morning-brief.js's live gmAssignments, resolved server-side) and the crew member
// explicitly confirms who it goes to, same as they'd confirm any other send.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ReviewShare({ token, loc, submittedBy, entries, catalogById, onBack }) {
  const storeName = STORE_NAMES[loc] || loc;
  const rows = useMemo(() => buildEquipmentRollupRows(entries, catalogById), [entries, catalogById]);
  const text = useMemo(() => buildEquipmentRollupText(storeName, rows), [storeName, rows]);
  const [copied, setCopied] = useState(false);
  const [recipients, setRecipients] = useState(null); // { gm, owner } | null
  const [recErr, setRecErr] = useState('');
  const [selected, setSelected] = useState({}); // email -> checked
  const [extraEmails, setExtraEmails] = useState([]);
  const [otherEmail, setOtherEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null); // { ok, sent } | { error }

  useEffect(() => {
    let cancelled = false;
    fetchEquipmentRecipients(token, loc).then(r => {
      if (cancelled) return;
      if (r?.error) { setRecErr(r.error); return; }
      setRecipients(r);
      if (r?.gm?.email) setSelected(s => ({ ...s, [r.gm.email]: true }));
    });
    return () => { cancelled = true; };
  }, [token, loc]);

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const canClipboard = typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function';

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard permission denied -- the text is already visible on screen to select manually */ }
  };
  const share = async () => {
    try { await navigator.share({ title: `Equipment Survey — ${storeName}`, text }); }
    catch { /* user backed out of the share sheet -- not an error */ }
  };
  const addOtherEmail = () => {
    const v = otherEmail.trim();
    if (!v || !EMAIL_RE.test(v)) return;
    setExtraEmails(x => [...new Set([...x, v])]);
    setSelected(s => ({ ...s, [v]: true }));
    setOtherEmail('');
  };
  const sendEmail = async () => {
    const to = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (!to.length) { setSendResult({ error: 'Pick at least one recipient first.' }); return; }
    setSending(true); setSendResult(null);
    const r = await sendEquipmentSurveyEmail(token, { loc, submittedBy, recipients: to });
    setSending(false);
    setSendResult(r?.error ? { error: r.error } : { ok: true, sent: r?.sent ?? to.length });
  };

  const checkRow = (emailAddr, labelText) => emailAddr && div({ key: emailAddr, style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '13px' } },
    h('input', { type: 'checkbox', checked: !!selected[emailAddr], onChange: e => setSelected(s => ({ ...s, [emailAddr]: e.target.checked })) }),
    span({}, labelText));

  return card(
    div({ style: { fontWeight: 700, fontSize: '16px', marginBottom: '4px' } }, 'Review & Share'),
    div({ style: { fontSize: '12px', color: colors.dim, marginBottom: '14px' } }, `${rows.length} item${rows.length === 1 ? '' : 's'} logged for ${storeName}`),

    div({ style: { background: colors.surf2, border: `1px solid ${colors.bdr2}`, borderRadius: '8px', padding: '10px 12px', fontSize: '12.5px', whiteSpace: 'pre-wrap', maxHeight: '320px', overflowY: 'auto', marginBottom: '14px', fontFamily: 'ui-monospace,Menlo,Consolas,monospace' } }, text),

    div({ style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' } },
      canClipboard && h('button', { style: btn('secondary'), onClick: copy }, copied ? 'Copied ✓' : '📋 Copy to Clipboard'),
      canShare && h('button', { style: btn('secondary'), onClick: share }, '📤 Share…'),
    ),

    div({ style: { fontWeight: 700, fontSize: '14px', marginBottom: '10px', borderTop: `1px solid ${colors.bdr}`, paddingTop: '14px' } }, 'Also email this to:'),
    recErr ? div({ style: { color: colors.bad, fontSize: '12px', marginBottom: '10px' } }, recErr)
      : !recipients ? div({ style: { color: colors.dim, fontSize: '12px', marginBottom: '10px' } }, 'Loading recipients…')
      : div({},
          recipients.gm?.email
            ? checkRow(recipients.gm.email, `${recipients.gm.name} — Store GM (${recipients.gm.email})`)
            : div({ style: { fontSize: '12px', color: colors.dim, marginBottom: '8px' } }, 'No GM on file yet for this store.'),
          recipients.owner?.email && checkRow(recipients.owner.email, `${recipients.owner.name} (${recipients.owner.email})`),
          ...extraEmails.map(em => checkRow(em, em)),
        ),

    div({ style: { display: 'flex', gap: '8px', marginTop: '8px', marginBottom: '14px' } },
      h('input', { style: { ...inputStyle, marginBottom: 0, flex: 1 }, placeholder: 'Add another email…', value: otherEmail, onChange: e => setOtherEmail(e.target.value), onKeyDown: e => { if (e.key === 'Enter') { e.preventDefault(); addOtherEmail(); } } }),
      h('button', { style: btn('secondary'), onClick: addOtherEmail }, 'Add'),
    ),

    sendResult?.error && div({ style: { color: colors.bad, fontSize: '13px', marginBottom: '10px' } }, sendResult.error),
    sendResult?.ok && div({ style: { color: colors.good, fontSize: '13px', marginBottom: '10px' } }, `Sent to ${sendResult.sent} recipient${sendResult.sent === 1 ? '' : 's'}.`),

    div({ style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
      h('button', { style: btn('primary'), disabled: sending || !recipients, onClick: sendEmail }, sending ? 'Sending…' : '✉️ Send Email'),
      h('button', { style: btn('secondary'), onClick: onBack }, '← Back'),
    ),
  );
}

// ── Store detail: current equipment list + add/edit ─────────────────────────────────────────
function StoreDetail({ token, loc, submittedBy, onBack }) {
  const [catalog, setCatalog] = useState([]);
  const [consumables, setConsumables] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('list'); // 'list' | 'add' | editing instanceId
  const [editingEntry, setEditingEntry] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true); setErr('');
    const [catRes, entRes] = await Promise.all([fetchEquipmentCatalog(token), fetchEquipmentEntries(token, loc)]);
    if (catRes?.error) setErr(catRes.error);
    else { setCatalog(catRes.catalog || []); setConsumables(catRes.consumables || []); }
    if (!entRes?.error) setEntries(entRes.entries || []);
    setLoading(false);
  }, [token, loc]);

  useEffect(() => { reload(); }, [reload]);

  const catalogById = useMemo(() => { const m = {}; for (const c of catalog) m[c.id] = c; return m; }, [catalog]);

  if (mode === 'review') {
    return h(ReviewShare, { token, loc, submittedBy, entries, catalogById, onBack: () => setMode('list') });
  }

  if (mode === 'add' || editingEntry) {
    return page(
      h('button', { onClick: () => { setMode('list'); setEditingEntry(null); }, style: { background: 'none', border: 'none', color: colors.dim, fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '14px' } }, '← Back'),
      h(EquipmentForm, {
        token, loc, catalog, consumables, submittedBy,
        editing: editingEntry ? { instanceId: editingEntry.instance_id, catalogItemId: editingEntry.catalog_item_id, placementZone: editingEntry.placement_zone, positionDetail: editingEntry.position_detail, serialNumber: editingEntry.serial_number, certDate: editingEntry.cert_date, photoUrl: editingEntry.photo_url } : null,
        onCancel: () => { setMode('list'); setEditingEntry(null); },
        onSaved: () => { setMode('list'); setEditingEntry(null); reload(); },
      }),
    );
  }

  return page(
    h('button', { onClick: onBack, style: { background: 'none', border: 'none', color: colors.dim, fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '10px' } }, '← Change store'),
    div({ style: { fontWeight: 800, fontSize: '19px', marginBottom: '2px' } }, STORE_NAMES[loc] || loc),
    div({ style: { fontSize: '12px', color: colors.dim, marginBottom: '16px' } }, `Reporting as ${submittedBy}`),

    loading ? div({ style: { color: colors.dim, padding: '30px 0', textAlign: 'center' } }, 'Loading…') :
    err ? div({ style: { color: colors.bad, fontSize: '13px' } }, err) :
    div({},
      div({ style: { display: 'flex', gap: '10px', marginBottom: '16px' } },
        h('button', { style: { ...btn('primary'), flex: 1 }, onClick: () => setMode('add') }, '+ Add Equipment'),
        entries.length > 0 && h('button', { style: { ...btn('secondary'), flex: 1 }, onClick: () => setMode('review') }, '📋 Review & Share'),
      ),
      entries.length === 0
        ? div({ style: { color: colors.dim, fontSize: '13px', textAlign: 'center', padding: '20px 0' } }, 'No equipment logged for this store yet.')
        : div({ style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
            ...entries.map(e => div({ key: e.instance_id, style: { background: colors.surf, border: `1px solid ${colors.bdr}`, borderRadius: '9px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' } },
              div({},
                div({ style: { fontWeight: 600, fontSize: '14px' } }, describeEquipmentEntry(e, catalogById)),
                (e.placement_zone || e.position_detail?.side || e.position_detail?.relative || e.serial_number) && div({ style: { fontSize: '11.5px', color: colors.dim, marginTop: '2px' } },
                  [
                    e.placement_zone && PLACEMENTS.find(p => p.value === e.placement_zone)?.label,
                    e.position_detail?.side && sideLabel(e.position_detail.side),
                    e.position_detail?.relative && relativeLabel(e.position_detail.relative),
                    e.serial_number && `S/N ${e.serial_number}`,
                  ].filter(Boolean).join(' · '))),
              h('button', { onClick: () => setEditingEntry(e), style: { background: 'none', border: `1px solid ${colors.bdr2}`, color: colors.text, borderRadius: '6px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' } }, 'Edit'),
            )))),
  );
}

export function EquipmentSurveyView({ token }) {
  const [submittedBy, setSubmittedBy] = useState(() => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } });
  const [loc, setLoc] = useState(null);

  if (!submittedBy) return h(NameGate, { onDone: (n) => { setSubmittedBy(n); try { localStorage.setItem(NAME_KEY, n); } catch { /* ignore */ } } });
  if (!loc) return h(StorePicker, { onPick: setLoc });
  return h(StoreDetail, { token, loc, submittedBy, onBack: () => setLoc(null) });
}
