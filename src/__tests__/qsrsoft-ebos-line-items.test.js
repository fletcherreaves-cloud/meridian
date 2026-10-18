// @ts-nocheck
// Owner request 2026-10-18: "do we have data available for raw item pricing through
// invoices/purchases" -- qsr_ebos_daily already fetches every purchase-ledger line item but
// discards the wrin/description/invoice-level detail after summing it into 5 daily category
// totals. toLineItemRows() (scripts/lib/qsrsoft-ebos-line-items.mjs) is the fix: same filter
// aggregateByDate() uses, but one row per line instead of per day, feeding the new
// qsr_ebos_line_items table (supabase/schema-qsr-ebos-line-items.sql).
import { describe, it, expect } from 'vitest';
import { toLineItemRows, isPurchaseRecord } from '../../scripts/lib/qsrsoft-ebos-line-items.mjs';

describe('isPurchaseRecord', () => {
  it('accepts Purchase, Credit, Adjustment', () => {
    expect(isPurchaseRecord('Purchase')).toBe(true);
    expect(isPurchaseRecord('Credit')).toBe(true);
    expect(isPurchaseRecord('Adjustment')).toBe(true);
  });
  it('rejects Transfer In/Out and unknown types', () => {
    expect(isPurchaseRecord('Transfer In')).toBe(false);
    expect(isPurchaseRecord('Transfer Out')).toBe(false);
    expect(isPurchaseRecord(undefined)).toBe(false);
  });
});

describe('toLineItemRows', () => {
  it('maps a real Purchase line to a loc-padded row with all known fields', () => {
    const items = [{
      record_type: 'Purchase', posted_date: '2026-10-15', wrin: '14762-002',
      description: 'LID 30OZ DUAL POLY/CLEAR CUP', invoice_identifier: 'INV-998877',
      line_item_id: 'li-123', id: 'id-999',
      food_sub: 0, paper_sub: 48.428, ops_sub: 0, happy_meal_sub: 0, other_sub: 0,
      total_amount: 48.428,
    }];
    const rows = toLineItemRows(items, 3708);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      loc: '0003708', posted_date: '2026-10-15', record_type: 'Purchase',
      wrin: '14762-002', description: 'LID 30OZ DUAL POLY/CLEAR CUP',
      invoice_identifier: 'INV-998877', ebos_item_id: 'li-123',
      paper_sub: 48.428, total_amount: 48.428,
    });
    expect(rows[0].raw).toBe(items[0]); // full original item preserved for the jsonb fallback column
  });

  it('falls back to id when line_item_id is absent', () => {
    const items = [{ record_type: 'Purchase', posted_date: '2026-10-15', id: 'id-only' }];
    expect(toLineItemRows(items, 3708)[0].ebos_item_id).toBe('id-only');
  });

  it('excludes Transfer records (not a new invoiced price, same rule as the daily aggregate)', () => {
    const items = [
      { record_type: 'Transfer In',  posted_date: '2026-10-15', paper_sub: 10 },
      { record_type: 'Transfer Out', posted_date: '2026-10-15', paper_sub: 10 },
      { record_type: 'Purchase',     posted_date: '2026-10-15', paper_sub: 10 },
    ];
    const rows = toLineItemRows(items, 3708);
    expect(rows).toHaveLength(1);
    expect(rows[0].record_type).toBe('Purchase');
  });

  it('excludes records with no posted_date (nothing to key a price trend on)', () => {
    const items = [
      { record_type: 'Purchase', posted_date: null, paper_sub: 10 },
      { record_type: 'Purchase', paper_sub: 10 },
    ];
    expect(toLineItemRows(items, 3708)).toHaveLength(0);
  });

  it('defaults missing/null sub-amounts to 0 rather than leaving them undefined', () => {
    const items = [{ record_type: 'Purchase', posted_date: '2026-10-15' }];
    const row = toLineItemRows(items, 3708)[0];
    expect(row.food_sub).toBe(0);
    expect(row.paper_sub).toBe(0);
    expect(row.ops_sub).toBe(0);
    expect(row.happy_meal_sub).toBe(0);
    expect(row.other_sub).toBe(0);
    expect(row.total_amount).toBe(0);
    expect(row.wrin).toBeNull();
    expect(row.description).toBeNull();
    expect(row.invoice_identifier).toBeNull();
    expect(row.ebos_item_id).toBeNull();
  });

  it('pads the NSN to a 7-digit loc, matching qsr_ebos_daily\'s own convention', () => {
    const items = [{ record_type: 'Purchase', posted_date: '2026-10-15' }];
    expect(toLineItemRows(items, 5183)[0].loc).toBe('0005183');
    expect(toLineItemRows(items, 43701)[0].loc).toBe('0043701');
  });

  it('keeps multiple lines for the same store/date as separate rows, not summed', () => {
    const items = [
      { record_type: 'Purchase', posted_date: '2026-10-15', wrin: 'A', paper_sub: 10 },
      { record_type: 'Purchase', posted_date: '2026-10-15', wrin: 'B', paper_sub: 20 },
    ];
    const rows = toLineItemRows(items, 3708);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.wrin)).toEqual(['A', 'B']);
  });

  it('handles an empty/missing items array without throwing', () => {
    expect(toLineItemRows([], 3708)).toEqual([]);
    expect(toLineItemRows(undefined, 3708)).toEqual([]);
  });
});
