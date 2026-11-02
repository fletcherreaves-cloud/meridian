// @vitest-environment happy-dom
// @ts-nocheck
// Owner req (2026-11-02): "I want to tie in settings for equipment to the surveys... references
// based on models selected that can be verified." Real render test (per this repo's "would this
// verification still pass if reverted" rule) driving the actual EquipmentSurveyView through
// NameGate -> StorePicker -> Add Equipment -> picking a catalog model, not an isolated helper call.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const LOC = '3708'; // Ardmore-Broadway, real STORE_NAMES entry
const TOKEN = '8278e578-7a95-4916-8ffa-ad2a64aebbb9';

const CATALOG = [
  { id: 'cat-blodgett', type: 'combi_oven', manufacturer: 'Blodgett', model: 'BLCT-6E-H-MCD', model_aliases: [], needs_serial: false, needs_cert_date: false },
  { id: 'cat-utx', type: 'toaster', manufacturer: 'Antunes', model: 'UTX-200 / CTX-200', model_aliases: ['UTX-200', 'CTX-200'], needs_serial: false, needs_cert_date: false },
];
const SETTINGS = [
  { catalog_item_id: 'cat-blodgett', product: 'Bacon, Applewood Smoked', setting_group: 'Combi Oven', settings: { temp: '375°F', cookTime: '4 min', steam: '10%', fanSpeed: '80%' }, needs_review: false, review_note: null },
  { catalog_item_id: 'cat-blodgett', product: 'Folded Eggs (Simplified Breakfast)', setting_group: 'Combi Oven', settings: { cookTime: '3 min 30 sec', temp: '360°F', steam: '90%' }, needs_review: false, review_note: null },
  { catalog_item_id: 'cat-utx', product: 'Big Mac / Quarter / Regular Buns (Universal Toaster)', setting_group: 'Toaster — Bun Toasting', settings: { platenA: '540°F', bunToastTime: '22 sec' }, needs_review: true, review_note: 'Catalog row bundles Universal and Club variants -- unconfirmed which this store has.' },
];

let lastSubmittedEntry = null;

vi.mock('../lib/supabase.js', () => ({
  fetchEquipmentCatalog: async () => ({ ok: true, catalog: CATALOG, consumables: [], settings: SETTINGS }),
  fetchEquipmentEntries: async () => ({ ok: true, entries: [] }),
  submitEquipmentEntry: async (token, entry) => { lastSubmittedEntry = entry; return { ok: true, id: 'new-id', instanceId: 'new-instance' }; },
  addEquipmentCatalogItem: async () => ({ ok: true, id: 'crew-added' }),
  extractEquipmentPlate: async () => ({ ok: true }),
  fetchEquipmentRecipients: async () => ({ ok: true, gm: null, owner: null }),
  sendEquipmentSurveyEmail: async () => ({ ok: true, sent: 0 }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { EquipmentSurveyView } = await import('../views/equipment-survey-view.js');

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function getToAddEquipmentForm(container) {
  // NameGate
  const nameInput = container.querySelector('input');
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { nativeSetter.call(nameInput, 'Jordan Example'); nameInput.dispatchEvent(new Event('input', { bubbles: true })); });
  const continueBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Continue'));
  await act(async () => { continueBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  // StorePicker
  const storeBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Ardmore-Broadway'));
  expect(storeBtn, 'Ardmore-Broadway store button not found').toBeTruthy();
  await act(async () => { storeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); await Promise.resolve(); });
  // StoreDetail -> Add Equipment
  const addBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Add Equipment'));
  await act(async () => { addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

function selectByLabel(container, labelText, optionText) {
  const selects = [...container.querySelectorAll('select')];
  const sel = selects.find(s => s.previousSibling && s.previousSibling.textContent === labelText);
  return sel;
}

function setSelectValue(select, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('EquipmentForm — PQRG reference settings panel', () => {
  // NameGate caches the submitted name in localStorage (mf_equip_submitted_by) so it's skipped on
  // return visits -- same behavior in production, but it means a later test in this file would
  // silently start on StorePicker instead of NameGate unless cleared here.
  afterEach(() => { document.body.innerHTML = ''; lastSubmittedEntry = null; try { localStorage.clear(); } catch { /* ignore */ } });

  it('picking a catalog model with matched PQRG settings shows the reference panel grouped by product', async () => {
    const { container, root } = mountRoot();
    await act(async () => { root.render(React.createElement(EquipmentSurveyView, { token: TOKEN })); });
    await getToAddEquipmentForm(container);

    const typeSelect = selectByLabel(container, 'Type');
    await act(async () => { setSelectValue(typeSelect, 'combi_oven'); });
    const mfrSelect = selectByLabel(container, 'Manufacturer');
    await act(async () => { setSelectValue(mfrSelect, 'Blodgett'); });
    const modelSelect = selectByLabel(container, 'Model');
    await act(async () => { setSelectValue(modelSelect, 'cat-blodgett'); });

    expect(container.textContent).toContain('PQRG Reference Settings');
    expect(container.textContent).toContain('Bacon, Applewood Smoked');
    expect(container.textContent).toContain('Folded Eggs (Simplified Breakfast)');
    expect(container.textContent).toContain('cookTime: 4 min');
    await act(async () => { root.unmount(); });
  });

  it('a needs_review settings row shows the warning note', async () => {
    const { container, root } = mountRoot();
    await act(async () => { root.render(React.createElement(EquipmentSurveyView, { token: TOKEN })); });
    await getToAddEquipmentForm(container);

    await act(async () => { setSelectValue(selectByLabel(container, 'Type'), 'toaster'); });
    await act(async () => { setSelectValue(selectByLabel(container, 'Manufacturer'), 'Antunes'); });
    await act(async () => { setSelectValue(selectByLabel(container, 'Model'), 'cat-utx'); });

    expect(container.textContent).toContain('unconfirmed model match');
    expect(container.textContent).toContain('Catalog row bundles Universal and Club variants');
    await act(async () => { root.unmount(); });
  });

  it('checking "I checked this..." and saving includes settingsReviewed + notes in the submitted entry', async () => {
    const { container, root } = mountRoot();
    await act(async () => { root.render(React.createElement(EquipmentSurveyView, { token: TOKEN })); });
    await getToAddEquipmentForm(container);

    await act(async () => { setSelectValue(selectByLabel(container, 'Type'), 'combi_oven'); });
    await act(async () => { setSelectValue(selectByLabel(container, 'Manufacturer'), 'Blodgett'); });
    await act(async () => { setSelectValue(selectByLabel(container, 'Model'), 'cat-blodgett'); });

    const reviewCheckbox = [...container.querySelectorAll('input[type="checkbox"]')].find(cb =>
      cb.nextSibling && cb.nextSibling.textContent.includes('I checked this'));
    expect(reviewCheckbox, 'review checkbox not found').toBeTruthy();
    await act(async () => { reviewCheckbox.click(); });

    const notesInput = [...container.querySelectorAll('input[type="text"], input:not([type])')]
      .find(i => i.placeholder && i.placeholder.includes('different from the reference'));
    expect(notesInput, 'review notes input not found').toBeTruthy();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => { nativeSetter.call(notesInput, 'Gap set to .300, reference says .265'); notesInput.dispatchEvent(new Event('input', { bubbles: true })); });

    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Add Equipment');
    await act(async () => { saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); await Promise.resolve(); });

    expect(lastSubmittedEntry).toBeTruthy();
    expect(lastSubmittedEntry.settingsReviewed).toBe(true);
    expect(lastSubmittedEntry.settingsReviewNotes).toBe('Gap set to .300, reference says .265');
    await act(async () => { root.unmount(); });
  });
});
