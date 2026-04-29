import { describe, it, expect } from 'vitest';
import { formatCurrency } from '../src/renderer/format.js';

describe('formatCurrency', () => {
  it('renders USD with $ prefix', () => {
    expect(formatCurrency(7175, 'USD')).toBe('$72');
  });

  it('renders EUR with € prefix', () => {
    expect(formatCurrency(500, 'EUR')).toBe('€5');
  });

  it('renders GBP with £ prefix', () => {
    expect(formatCurrency(500, 'GBP')).toBe('£5');
  });

  it('falls back to "<amount> <code>" for unknown currencies', () => {
    expect(formatCurrency(500, 'JPY')).toBe('5 JPY');
  });

  it('defaults to "<amount> USD" when currency is null', () => {
    expect(formatCurrency(500, null)).toBe('5 USD');
  });

  it('defaults to "<amount> USD" when currency is undefined', () => {
    expect(formatCurrency(500, undefined)).toBe('5 USD');
  });

  it('rounds via .toFixed(0) — 499 cents → "5"', () => {
    // .toFixed(0) rounds half-to-even on most engines: 4.99 → "5"
    expect(formatCurrency(499, 'USD')).toBe('$5');
  });

  it('rounds via .toFixed(0) — 449 cents → "4"', () => {
    expect(formatCurrency(449, 'USD')).toBe('$4');
  });

  it('handles zero', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0');
  });

  it('handles whole-dollar amounts', () => {
    expect(formatCurrency(10000, 'USD')).toBe('$100');
  });
});
