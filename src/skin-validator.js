// Skin validator — shared by main.js (custom-skin import) and
// scripts/validate-skins.js (build-time preset check). Plain CommonJS,
// no dependencies, safe to require from either Node context.
//
// A skin is JSON: { id, name, author?, description?, tokens: {...}, advanced? }
// `tokens` may only contain keys from KNOWN_TOKENS (the standardized --skin-*
// contract — see src/renderer/skins/CREATING_A_SKIN.md) and values that pass
// an allow-list format check. `advanced` (a bundled CSS filename for extra
// pseudo-element effects) is only permitted for built-in presets, never for
// user-imported custom skins.

const KNOWN_TOKENS = [
  '--skin-bg',
  '--skin-bg-elevated',
  '--skin-border',
  '--skin-border-hover',
  '--skin-hairline',
  '--skin-radius',
  '--skin-text',
  '--skin-text-dim',
  '--skin-text-faint',
  '--skin-accent',
  '--skin-accent-bg',
  '--skin-accent-border',
  '--skin-accent-text',
  '--skin-fill',
  '--skin-fill-hover',
  '--skin-track',
];

// A skin doesn't need to set every token (unset ones inherit the "None"
// skin's defaults), but it must set enough to actually look like a skin.
const REQUIRED_TOKENS = ['--skin-bg', '--skin-text', '--skin-accent'];

const RADIUS_TOKENS = new Set(['--skin-radius']);

// Only characters that can legitimately appear in a CSS color/gradient
// function chain — blocks `url(`, `;`, `{`, `}`, `<`, backslashes, etc. by
// construction, independent of the substring deny-list below.
const COLOR_CHARSET = /^[a-zA-Z0-9#(),.%\-+ ]+$/;
const LENGTH_VALUE = /^\d+(\.\d+)?(px|%)?$/;
const DENY_SUBSTRINGS = ['url(', 'expression(', '@import', 'javascript:', '<', '\\'];

const ID_FORMAT = /^[a-z0-9][a-z0-9-]{1,40}$/;
const TOP_LEVEL_FIELDS_BUILTIN = new Set(['id', 'name', 'author', 'description', 'tokens', 'advanced']);
const TOP_LEVEL_FIELDS_CUSTOM = new Set(['id', 'name', 'author', 'description', 'tokens']);

function isPlainString(v, maxLen) {
  return typeof v === 'string' && v.length > 0 && v.length <= maxLen && !/[\x00-\x1f]/.test(v);
}

function validateTokenValue(name, value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 300) {
    return `${name}: value must be a non-empty string (max 300 chars)`;
  }
  for (const bad of DENY_SUBSTRINGS) {
    if (value.toLowerCase().includes(bad)) {
      return `${name}: value contains disallowed content ("${bad}")`;
    }
  }
  if (RADIUS_TOKENS.has(name)) {
    if (!LENGTH_VALUE.test(value.trim())) {
      return `${name}: expected a length like "10px" or "22", got "${value}"`;
    }
    return null;
  }
  if (!COLOR_CHARSET.test(value)) {
    return `${name}: value contains characters not allowed in a color/gradient (got "${value}")`;
  }
  return null;
}

/**
 * @param {object} skin - parsed skin JSON
 * @param {{context: 'builtin'|'custom'}} opts
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateSkin(skin, opts = {}) {
  const context = opts.context === 'builtin' ? 'builtin' : 'custom';
  const errors = [];

  if (!skin || typeof skin !== 'object' || Array.isArray(skin)) {
    return { valid: false, errors: ['skin must be a JSON object'] };
  }

  const allowedFields = context === 'builtin' ? TOP_LEVEL_FIELDS_BUILTIN : TOP_LEVEL_FIELDS_CUSTOM;
  for (const key of Object.keys(skin)) {
    if (!allowedFields.has(key)) {
      errors.push(`unknown top-level field "${key}"${key === 'advanced' ? ' (advanced is built-in-only)' : ''}`);
    }
  }

  if (!isPlainString(skin.id, 42) || !ID_FORMAT.test(skin.id)) {
    errors.push('id must be a lowercase-alphanumeric-with-hyphens slug, 2-42 chars');
  }
  if (!isPlainString(skin.name, 40)) {
    errors.push('name must be a non-empty string, max 40 chars');
  }
  if (skin.author !== undefined && !isPlainString(skin.author, 40)) {
    errors.push('author must be a string, max 40 chars');
  }
  if (skin.description !== undefined && !isPlainString(skin.description, 200)) {
    errors.push('description must be a string, max 200 chars');
  }

  if (!skin.tokens || typeof skin.tokens !== 'object' || Array.isArray(skin.tokens)) {
    errors.push('tokens must be an object');
  } else {
    for (const [name, value] of Object.entries(skin.tokens)) {
      if (!KNOWN_TOKENS.includes(name)) {
        errors.push(`unknown token "${name}" — must be one of the standardized --skin-* tokens`);
        continue;
      }
      const err = validateTokenValue(name, value);
      if (err) errors.push(err);
    }
    for (const required of REQUIRED_TOKENS) {
      if (!(required in skin.tokens)) {
        errors.push(`missing required token "${required}"`);
      }
    }
  }

  if (context === 'builtin' && skin.advanced !== undefined) {
    if (!isPlainString(skin.advanced, 80) || !/^[a-zA-Z0-9_-]+\.css$/.test(skin.advanced)) {
      errors.push('advanced must be a plain "<name>.css" filename');
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateSkin, KNOWN_TOKENS, REQUIRED_TOKENS };
