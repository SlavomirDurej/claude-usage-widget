// User-editable domain whitelist for the login-window navigation allowlist
// (Issue #120: WorkOS SSO, and any other enterprise SSO/IdP domain, gets blocked
// by the hardcoded allowedLoginDomains list in main.js with no way for a user to
// self-serve a fix). Global (not per-profile) — this is a machine-level trust
// decision by whoever runs the app, not account data, so every --profile instance
// shares one file rather than each needing the same domain added separately.
//
// Additive only: this module has no way to remove or override main.js's hardcoded
// allowedLoginDomains list, only to extend it. Entries here are ANDed in as extra
// trusted hosts, never subtracted from the base set.
//
// File format: a plain JSON array of strings at <baseUserDataPath>/domain-whitelist.json.
// Two entry shapes:
//   "api.workos.com"   - exact hostname match only
//   "*.workos.com"     - matches workos.com itself AND any subdomain of it,
//                        same semantics as the existing hardcoded-list matching
//                        (hostname === domain || hostname.endsWith('.' + domain))

const fs = require('fs');
const path = require('path');

const WHITELIST_FILENAME = 'domain-whitelist.json';

// A conservative hostname shape: optional leading "*." wildcard marker, then
// one or more dot-separated labels, each label alphanumeric with optional
// internal hyphens (no leading/trailing hyphen). Deliberately rejects bare
// single-label entries (e.g. "localhost") and any "*" outside the one
// permitted leading wildcard position.
const HOSTNAME_PATTERN = /^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function getWhitelistPath(baseUserDataPath) {
  return path.join(baseUserDataPath, WHITELIST_FILENAME);
}

/**
 * Load the user whitelist. Returns [] if the file doesn't exist. A corrupt or
 * unreadable file fails safe to [] (logged) rather than blocking startup or
 * silently granting unintended trust from a partially-written file.
 */
function loadWhitelist(baseUserDataPath) {
  const filePath = getWhitelistPath(baseUserDataPath);
  if (!fs.existsSync(filePath)) return [];

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.error('[Whitelist] domain-whitelist.json is not a JSON array, ignoring it.');
      return [];
    }
    return parsed.filter((entry) => typeof entry === 'string');
  } catch (err) {
    console.error('[Whitelist] Failed to read domain-whitelist.json, treating whitelist as empty:', err.message);
    return [];
  }
}

function saveWhitelist(baseUserDataPath, entries) {
  const filePath = getWhitelistPath(baseUserDataPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf-8');
}

/**
 * Validate and normalize a domain entry for adding. Returns { ok: true, value }
 * or { ok: false, reason } — never throws, so CLI callers can print the reason
 * directly without their own try/catch.
 */
function normalizeEntry(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'Domain must be text.' };

  const value = raw.trim().toLowerCase();
  if (!value) return { ok: false, reason: 'Domain cannot be empty.' };

  if ((value.match(/\*/g) || []).length > 1 || (value.includes('*') && !value.startsWith('*.'))) {
    return { ok: false, reason: 'Only one leading "*." wildcard is allowed (e.g. "*.workos.com"), not "*" anywhere else.' };
  }

  if (!HOSTNAME_PATTERN.test(value)) {
    return { ok: false, reason: `"${raw}" doesn't look like a valid hostname. Expected something like "api.workos.com" or "*.workos.com".` };
  }

  return { ok: true, value };
}

/**
 * Does `hostname` match a single whitelist-style entry (hardcoded or user)?
 * Wildcard entries ("*.domain.com") match the bare domain and any subdomain,
 * same semantics as main.js's existing hardcoded-list check. Non-wildcard
 * entries match only that exact hostname.
 */
function entryMatches(hostname, entry) {
  if (entry.startsWith('*.')) {
    const base = entry.slice(2);
    return hostname === base || hostname.endsWith('.' + base);
  }
  return hostname === entry;
}

/**
 * True if `hostname` is already covered by `hardcodedDomains` (the existing
 * allowedLoginDomains-style array, whose entries already imply subdomain
 * matching without needing an explicit "*." prefix — see main.js). Used to
 * warn on add rather than silently accepting a redundant entry.
 */
function isCoveredByHardcoded(hostname, hardcodedDomains) {
  return hardcodedDomains.some((domain) => hostname === domain || hostname.endsWith('.' + domain));
}

/**
 * Combined allow check: hardcoded list (existing semantics) OR user whitelist
 * (exact / "*." semantics per normalizeEntry). Returns which list matched, if
 * any, so the caller can log whether an allow came from user-added trust.
 */
function isHostnameAllowed(hostname, hardcodedDomains, userEntries) {
  if (isCoveredByHardcoded(hostname, hardcodedDomains)) {
    return { allowed: true, source: 'hardcoded' };
  }
  const matched = userEntries.find((entry) => entryMatches(hostname, entry));
  if (matched) {
    return { allowed: true, source: 'user', matchedEntry: matched };
  }
  return { allowed: false, source: null };
}

module.exports = {
  getWhitelistPath,
  loadWhitelist,
  saveWhitelist,
  normalizeEntry,
  entryMatches,
  isCoveredByHardcoded,
  isHostnameAllowed
};
