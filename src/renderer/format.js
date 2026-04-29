/**
 * format.js — pure formatting helpers used by the renderer.
 *
 * Loaded as a plain <script> in index.html before app.js, so functions
 * declared here are visible to app.js as globals. The CJS-export guard
 * at the bottom lets Vitest require this file in isolation.
 */

function formatCurrency(amountCents, currencyCode) {
  const amount = (amountCents / 100).toFixed(0);
  const symbols = { USD: '$', EUR: '€', GBP: '£' };
  const sym = symbols[currencyCode];
  return sym ? `${sym}${amount}` : `${amount} ${currencyCode || 'USD'}`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatCurrency };
}
