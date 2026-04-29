/**
 * body-classifier.js
 *
 * Classifies the text body returned by claude.ai (extracted from a hidden
 * BrowserWindow) into one of: parsed JSON, a known block/challenge page,
 * unexpected HTML, or invalid JSON.
 *
 * Extracted from fetch-via-window.js so the classification logic is unit-
 * testable independently of the BrowserWindow. Signature order matters:
 * the first match wins (a body containing both "Just a moment" and valid
 * JSON resolves to cloudflare-blocked, locking in current behavior).
 */

const BLOCKED_SIGNATURES = [
  { pattern: 'Just a moment', errorTag: 'CloudflareBlocked', kind: 'cloudflare-blocked' },
  { pattern: 'Enable JavaScript and cookies to continue', errorTag: 'CloudflareChallenge', kind: 'cloudflare-challenge' },
  { pattern: '<html', errorTag: 'UnexpectedHTML', kind: 'unexpected-html' },
];

function classifyBody(text) {
  const snippet = text.substring(0, 200);

  for (const sig of BLOCKED_SIGNATURES) {
    if (text.includes(sig.pattern)) {
      return { kind: sig.kind, errorTag: sig.errorTag, snippet };
    }
  }

  try {
    return { kind: 'json', payload: JSON.parse(text) };
  } catch {
    return { kind: 'invalid-json', snippet };
  }
}

module.exports = { classifyBody, BLOCKED_SIGNATURES };
