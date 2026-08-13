'use strict';

// Anthropic's reported five_hour/seven_day utilization percentage can lag
// behind reality near the plan limit — a session can already be actively
// billing to usage credits while the API still reports something like 98%
// instead of 100%. Since credit spend costs real money, waiting for the
// percentage to eventually catch up risks the user not realizing they're
// spending until they've already run up a noticeable charge.
//
// There is no single API field that means "currently spending credits right
// now" — extra_usage/spend fields are monthly-cumulative totals, not a
// per-request flag (confirmed by comparing multiple live API responses and
// the official claude.ai frontend's own network requests, which hit the same
// endpoint this app already polls). The most reliable signal available is a
// simple comparison across two consecutive polls: if the cumulative
// credit-cents total has increased since the last check, money was spent
// somewhere in between, and if the relevant meter is already close to its
// ceiling, that's very likely this account's own current session.
//
// Gated at >=95% specifically to avoid a false trigger on a teammate's usage
// on a shared org account: extra_usage/spend are org-scoped, not per-user, so
// a rising total by itself doesn't prove *this* session's meter should jump —
// only a rising total AND an already-near-ceiling percentage together do.
const NEAR_CEILING_THRESHOLD = 95;

/**
 * Compare current credit spend against the last known value, and force the
 * relevant meter(s) to 100%/maxed if spend increased while already near the
 * ceiling. Mutates `data` in place (matching normalizeUsageLimits' pattern).
 *
 * @param {Object} data - Usage payload (mutated in place).
 * @param {number|null|undefined} previousUsedCents - used_cents from the
 *   last poll, or null/undefined on the first ever call for this org.
 * @returns {{data: Object, usedCents: number|null}} the same data object,
 *   plus the used_cents value to persist and pass in as previousUsedCents
 *   on the next call.
 */
function detectActiveCreditSpend(data, previousUsedCents) {
  if (!data || !data.extra_usage || data.extra_usage.is_enabled !== true) {
    // Extra usage disabled or unavailable — nothing to compare against, and
    // a disabled account can't overspend past its plan limit regardless.
    return { data, usedCents: typeof previousUsedCents === 'number' ? previousUsedCents : null };
  }

  const usedCents = data.extra_usage.used_cents;
  if (typeof usedCents !== 'number') {
    return { data, usedCents: typeof previousUsedCents === 'number' ? previousUsedCents : null };
  }

  const spendIncreasedSinceLastPoll =
    typeof previousUsedCents === 'number' && usedCents > previousUsedCents;

  if (spendIncreasedSinceLastPoll) {
    if (data.five_hour && typeof data.five_hour.utilization === 'number' &&
        data.five_hour.utilization >= NEAR_CEILING_THRESHOLD) {
      data.five_hour.utilization = 100;
      data.five_hour.credit_spend_forced = true;
    }
    if (data.seven_day && typeof data.seven_day.utilization === 'number' &&
        data.seven_day.utilization >= NEAR_CEILING_THRESHOLD) {
      data.seven_day.utilization = 100;
      data.seven_day.credit_spend_forced = true;
    }
  }

  return { data, usedCents };
}

module.exports = { detectActiveCreditSpend, NEAR_CEILING_THRESHOLD };
