// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { responseKey } from '../views/checklist-fill.js';

describe('checklist-fill responseKey()', () => {
  it('combines section index and item title', () => {
    expect(responseKey(0, "Today's Date:")).toBe("0::Today's Date:");
    expect(responseKey(3, 'Landscaping weed free')).toBe('3::Landscaping weed free');
  });

  it('trims the title so trailing/leading whitespace does not fork the key', () => {
    expect(responseKey(1, '  DT menu board clean/good repair  ')).toBe('1::DT menu board clean/good repair');
  });

  it('is stable across repeated calls with the same inputs (used as a React key + Supabase jsonb key)', () => {
    expect(responseKey(2, 'Complete')).toBe(responseKey(2, 'Complete'));
  });

  it('distinguishes the same item title in different sections', () => {
    expect(responseKey(0, 'Complete')).not.toBe(responseKey(1, 'Complete'));
  });
});
