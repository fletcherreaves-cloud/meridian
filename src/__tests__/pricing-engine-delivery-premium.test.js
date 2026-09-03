// @ts-nocheck
// views/pricing-engine.js's deliveryPremiumPct() had zero test coverage despite being live --
// used twice in MenuPricesTab (the delivery-price-premium column and its ranking sort), part of
// the Pricing Engine panel routed via panel-registry.js.
import { describe, it, expect } from 'vitest';
import { deliveryPremiumPct } from '../views/pricing-engine.js';

describe('deliveryPremiumPct', () => {
  it('computes the delivery price premium as a fraction of the base price', () => {
    expect(deliveryPremiumPct({ price: 5, priceDelivery: 6 })).toBeCloseTo(0.2, 6);
  });

  it('returns a negative fraction when delivery is priced below the base price', () => {
    expect(deliveryPremiumPct({ price: 5, priceDelivery: 4 })).toBeCloseTo(-0.2, 6);
  });

  it('returns 0 when delivery and base price are identical', () => {
    expect(deliveryPremiumPct({ price: 5, priceDelivery: 5 })).toBe(0);
  });

  it('returns null when priceDelivery is missing (null/undefined)', () => {
    expect(deliveryPremiumPct({ price: 5, priceDelivery: null })).toBeNull();
    expect(deliveryPremiumPct({ price: 5 })).toBeNull();
  });

  it('returns null when price is falsy (0/null/undefined) -- avoids a divide-by-zero', () => {
    expect(deliveryPremiumPct({ price: 0, priceDelivery: 6 })).toBeNull();
    expect(deliveryPremiumPct({ price: null, priceDelivery: 6 })).toBeNull();
  });

  it('treats priceDelivery: 0 as a real (free/promo) value, not missing', () => {
    expect(deliveryPremiumPct({ price: 5, priceDelivery: 0 })).toBeCloseTo(-1, 6);
  });
});
