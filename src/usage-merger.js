/**
 * usage-merger.js
 *
 * Merges responses from claude.ai's three usage-related endpoints into a
 * single `data` object the renderer consumes:
 *   - /api/organizations/:id/usage              (required)
 *   - /api/organizations/:id/overage_spend_limit (optional)
 *   - /api/organizations/:id/prepaid/credits    (optional)
 *
 * Extracted from the inline block in main.js to make the merge logic
 * unit-testable. Behavior is intentionally identical to the original
 * inline code (this is a regression net, not a redesign).
 */

function mergeUsageData(usage, overage, prepaid) {
  const data = usage;

  if (overage) {
    const limit = overage.monthly_credit_limit ?? overage.spend_limit_amount_cents;
    const used = overage.used_credits ?? overage.balance_cents;
    const enabled = overage.is_enabled !== undefined ? overage.is_enabled : (limit != null);

    if (enabled && typeof limit === 'number' && limit > 0 && typeof used === 'number') {
      data.extra_usage = {
        utilization: (used / limit) * 100,
        resets_at: null,
        used_cents: used,
        limit_cents: limit,
        is_enabled: true,
        currency: overage.currency || 'USD',
      };
    } else if (!enabled) {
      if (!data.extra_usage) data.extra_usage = {};
      data.extra_usage.is_enabled = false;
      data.extra_usage.currency = overage.currency || 'USD';
    }
  }

  if (prepaid && typeof prepaid.amount === 'number') {
    if (!data.extra_usage) data.extra_usage = {};
    data.extra_usage.balance_cents = prepaid.amount;
    if (!data.extra_usage.currency && prepaid.currency) {
      data.extra_usage.currency = prepaid.currency;
    }
  }

  return data;
}

module.exports = { mergeUsageData };
