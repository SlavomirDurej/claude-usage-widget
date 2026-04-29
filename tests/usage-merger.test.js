import { describe, it, expect } from 'vitest';
import { mergeUsageData } from '../src/usage-merger.js';

const baseUsage = () => ({
  five_hour: { utilization: 16, resets_at: '2026-04-29T03:50:00Z' },
  seven_day: { utilization: 25, resets_at: '2026-04-30T09:00:00Z' },
  seven_day_sonnet: { utilization: 0, resets_at: '2026-04-30T09:00:00Z' },
});

describe('mergeUsageData', () => {
  it('passes through unchanged when no overage and no prepaid', () => {
    const usage = baseUsage();
    const result = mergeUsageData(usage, null, null);
    expect(result).toEqual(baseUsage());
    expect(result.extra_usage).toBeUndefined();
  });

  it('sets extra_usage.utilization when overage is enabled', () => {
    const overage = {
      is_enabled: true,
      monthly_credit_limit: 10000, // $100
      used_credits: 7175,           // $71.75
      currency: 'USD',
    };
    const result = mergeUsageData(baseUsage(), overage, null);
    expect(result.extra_usage).toEqual({
      utilization: 71.75,
      resets_at: null,
      used_cents: 7175,
      limit_cents: 10000,
      is_enabled: true,
      currency: 'USD',
    });
  });

  it('marks extra_usage.is_enabled=false when overage is disabled', () => {
    const overage = { is_enabled: false, currency: 'EUR' };
    const result = mergeUsageData(baseUsage(), overage, null);
    expect(result.extra_usage).toEqual({
      is_enabled: false,
      currency: 'EUR',
    });
    expect(result.extra_usage.utilization).toBeUndefined();
  });

  it('falls back to spend_limit_amount_cents when monthly_credit_limit is absent', () => {
    const overage = {
      is_enabled: true,
      spend_limit_amount_cents: 5000,
      balance_cents: 1250,
      currency: 'USD',
    };
    const result = mergeUsageData(baseUsage(), overage, null);
    expect(result.extra_usage.limit_cents).toBe(5000);
    expect(result.extra_usage.used_cents).toBe(1250);
    expect(result.extra_usage.utilization).toBeCloseTo(25, 5);
  });

  it('infers is_enabled=true from presence of a limit when flag is undefined', () => {
    const overage = {
      monthly_credit_limit: 10000,
      used_credits: 100,
      currency: 'USD',
    };
    const result = mergeUsageData(baseUsage(), overage, null);
    expect(result.extra_usage.is_enabled).toBe(true);
    expect(result.extra_usage.utilization).toBe(1);
  });

  it('overlays prepaid balance onto extra_usage', () => {
    const prepaid = { amount: 2500, currency: 'USD' };
    const result = mergeUsageData(baseUsage(), null, prepaid);
    expect(result.extra_usage).toEqual({
      balance_cents: 2500,
      currency: 'USD',
    });
  });

  it('prefers overage currency over prepaid currency', () => {
    const overage = {
      is_enabled: true,
      monthly_credit_limit: 10000,
      used_credits: 5000,
      currency: 'GBP',
    };
    const prepaid = { amount: 1000, currency: 'USD' };
    const result = mergeUsageData(baseUsage(), overage, prepaid);
    expect(result.extra_usage.currency).toBe('GBP');
    expect(result.extra_usage.balance_cents).toBe(1000);
  });

  it('uses prepaid currency when overage has none', () => {
    const prepaid = { amount: 500, currency: 'EUR' };
    const result = mergeUsageData(baseUsage(), null, prepaid);
    expect(result.extra_usage.currency).toBe('EUR');
  });

  it('defaults overage currency to USD when missing', () => {
    const overage = {
      is_enabled: true,
      monthly_credit_limit: 10000,
      used_credits: 5000,
    };
    const result = mergeUsageData(baseUsage(), overage, null);
    expect(result.extra_usage.currency).toBe('USD');
  });

  it('skips overage merge when limit is zero or negative', () => {
    const overage = {
      is_enabled: true,
      monthly_credit_limit: 0,
      used_credits: 0,
      currency: 'USD',
    };
    const result = mergeUsageData(baseUsage(), overage, null);
    expect(result.extra_usage).toBeUndefined();
  });
});
