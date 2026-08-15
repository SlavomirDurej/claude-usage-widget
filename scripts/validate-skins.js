#!/usr/bin/env node
// Validates every built-in preset in src/renderer/skins/presets/*.json against
// the shared skin-validator, runs negative and adversarial (injection/bypass/
// prototype-pollution/ReDoS) tests against the validator itself (so a broken
// validator can't silently pass everything), then regenerates
// src/renderer/skins/presets/presets.generated.js — the file the renderer
// actually loads (the app's CSP blocks fetch/XHR, so presets must ship as a
// statically-<script>-included JS array, not fetched JSON at runtime).
//
// Run manually with `npm run validate-skins`; also runs automatically before
// `npm run dev` / `npm start` (see package.json) so the generated file can
// never go stale relative to the source JSON.

const fs = require('fs');
const path = require('path');
const { validateSkin, KNOWN_TOKENS } = require('../src/skin-validator');

const PRESETS_DIR = path.join(__dirname, '..', 'src', 'renderer', 'skins', 'presets');
const OUTPUT_FILE = path.join(PRESETS_DIR, 'presets.generated.js');
const PROMPT_DOC_FILE = path.join(__dirname, '..', 'src', 'renderer', 'skins', 'CREATING_A_SKIN.md');

let failures = 0;

function fail(msg) {
  console.error(`✗ ${msg}`);
  failures++;
}
function pass(msg) {
  console.log(`✓ ${msg}`);
}

// ── 1. Negative tests against the validator itself ─────────────────────────
function runNegativeTests() {
  const cases = [
    {
      name: 'rejects a skin missing a required token',
      skin: { id: 'x', name: 'X', tokens: { '--skin-text': '#fff' } },
      opts: { context: 'custom' },
    },
    {
      name: 'rejects a url() injection attempt in a token value',
      skin: {
        id: 'x', name: 'X',
        tokens: { '--skin-bg': 'url(https://evil.example/track.png)', '--skin-text': '#fff', '--skin-accent': '#fff' },
      },
      opts: { context: 'custom' },
    },
    {
      name: 'rejects an unknown top-level field',
      skin: {
        id: 'x', name: 'X', evil: true,
        tokens: { '--skin-bg': '#000', '--skin-text': '#fff', '--skin-accent': '#fff' },
      },
      opts: { context: 'custom' },
    },
    {
      name: 'rejects a custom skin that includes "advanced"',
      skin: {
        id: 'x', name: 'X', advanced: 'liquid.css',
        tokens: { '--skin-bg': '#000', '--skin-text': '#fff', '--skin-accent': '#fff' },
      },
      opts: { context: 'custom' },
    },
    {
      name: 'rejects an unknown token name',
      skin: {
        id: 'x', name: 'X',
        tokens: { '--skin-bg': '#000', '--skin-text': '#fff', '--skin-accent': '#fff', '--skin-totally-made-up': '#fff' },
      },
      opts: { context: 'custom' },
    },
    {
      name: 'accepts a minimal well-formed custom skin',
      skin: {
        id: 'ok-skin', name: 'OK Skin',
        tokens: { '--skin-bg': '#101018', '--skin-text': '#eee', '--skin-accent': '#8b5cf6' },
      },
      opts: { context: 'custom' },
      expectValid: true,
    },
  ];

  for (const c of cases) {
    const result = validateSkin(c.skin, c.opts);
    const shouldBeValid = !!c.expectValid;
    if (result.valid === shouldBeValid) {
      pass(`validator: ${c.name}`);
    } else {
      fail(`validator: ${c.name} — expected valid=${shouldBeValid}, got valid=${result.valid} (${result.errors.join('; ')})`);
    }
  }
}

// ── 1b. Adversarial tests — real injection/bypass payloads the validator
//       must reject. This is the checked-in record of the manual red-team
//       pass run against this feature before it shipped (case-variant/
//       escaped/comment-split url() bypasses, prototype pollution, malformed
//       shapes, id/advanced-field abuse, length/format boundaries, and a
//       ReDoS timing guard on the regexes) — committed so it runs on every
//       `npm run validate-skins` / dev / build, not just once in review. ────
function runAdversarialTests() {
  const validTokens = () => ({ '--skin-text': '#fff', '--skin-accent': '#f00' });

  const cases = [
    // url()/CSS-function injection bypass attempts
    {
      name: 'rejects case-variant url() ("URL(...)")',
      skin: { id: 'x', name: 'X', tokens: { '--skin-bg': 'URL(https://evil.example/x.png)', ...validTokens() } },
    },
    {
      name: 'rejects a data: URI payload',
      skin: { id: 'x', name: 'X', tokens: { '--skin-bg': 'url(data:text/html,<script>alert(1)</script>)', ...validTokens() } },
    },
    {
      name: 'rejects a javascript: URI payload',
      skin: { id: 'x', name: 'X', tokens: { '--skin-bg': 'javascript:alert(1)', ...validTokens() } },
    },
    {
      name: 'rejects expression() (legacy IE CSS injection)',
      skin: { id: 'x', name: 'X', tokens: { '--skin-bg': 'expression(alert(1))', ...validTokens() } },
    },
    {
      name: 'rejects an @import payload',
      skin: { id: 'x', name: 'X', tokens: { '--skin-bg': '@import url(evil.css)', ...validTokens() } },
    },
    {
      name: 'rejects an angle-bracket/markup payload',
      skin: { id: 'x', name: 'X', tokens: { '--skin-bg': '<img src=x onerror=alert(1)>', ...validTokens() } },
    },
    {
      name: 'rejects a backslash CSS-escape bypass attempt ("\\75rl(...)")',
      skin: { id: 'x', name: 'X', tokens: { '--skin-bg': '\\75rl(evil)', ...validTokens() } },
    },
    {
      name: 'rejects a semicolon/brace declaration-breakout attempt',
      skin: { id: 'x', name: 'X', tokens: { '--skin-bg': 'red; } body { background: url(evil)', ...validTokens() } },
    },
    {
      name: 'rejects a comment-split url() bypass ("ur/**/l(...)")',
      skin: { id: 'x', name: 'X', tokens: { '--skin-bg': 'ur/**/l(evil)', ...validTokens() } },
    },
    {
      name: 'rejects calc()/em on --skin-radius (only plain px/% lengths allowed)',
      skin: { id: 'x', name: 'X', tokens: { '--skin-radius': 'calc(100% - 4px)', ...validTokens() } },
    },

    // Structural / prototype-pollution attempts. Built via JSON.parse, not a
    // JS object literal — a literal `{ __proto__: {...} }` sets the actual
    // prototype instead of creating an own enumerable "__proto__" property,
    // which would make these tests pass for the wrong reason.
    {
      name: 'rejects a "__proto__" top-level field',
      skin: JSON.parse('{"id":"x","name":"X","__proto__":{"polluted":true},"tokens":{"--skin-text":"#fff","--skin-accent":"#f00"}}'),
    },
    {
      name: 'rejects a "__proto__" nested inside tokens',
      skin: JSON.parse('{"id":"x","name":"X","tokens":{"__proto__":{"polluted":true},"--skin-text":"#fff","--skin-accent":"#f00"}}'),
    },
    { name: 'rejects a null skin', skin: null },
    { name: 'rejects an array as the skin body', skin: ['not', 'an', 'object'] },
    { name: 'rejects a bare string as the skin body', skin: 'just a string' },

    // id / advanced-field abuse
    {
      name: 'rejects a path-traversal id',
      skin: { id: '../../etc', name: 'X', tokens: validTokens() },
    },
    {
      name: 'rejects a markup-shaped id',
      skin: { id: 'x"><script>', name: 'X', tokens: validTokens() },
    },
    {
      name: 'rejects "advanced" smuggled into a custom-context skin via path traversal',
      skin: { id: 'x', name: 'X', advanced: '../../evil.css', tokens: validTokens() },
    },
    {
      name: 'rejects a control character in name',
      skin: { id: 'x', name: 'X\x00evil', tokens: validTokens() },
    },

    // Length/format boundaries
    {
      name: 'rejects a token value one char over the 300-char cap',
      skin: { id: 'x', name: 'X', tokens: { '--skin-bg': '#'.padEnd(301, '0'), ...validTokens() } },
    },
    {
      name: 'accepts a token value exactly at the 300-char cap',
      skin: { id: 'ok-skin', name: 'X', tokens: { '--skin-bg': 'a'.repeat(300).replace(/^./, '#'), ...validTokens() } },
      expectValid: true,
    },
  ];

  for (const c of cases) {
    const result = validateSkin(c.skin, { context: 'custom' });
    const shouldBeValid = !!c.expectValid;
    if (result.valid === shouldBeValid) {
      pass(`adversarial: ${c.name}`);
    } else {
      fail(`adversarial: ${c.name} — expected valid=${shouldBeValid}, got valid=${result.valid} (${(result.errors || []).join('; ')})`);
    }
  }

  // ReDoS guard: the validator's regexes must stay linear-time even against
  // adversarial near-miss input, not just reject it eventually.
  const nasty = 'a'.repeat(200000) + '!';
  const start = Date.now();
  validateSkin({ id: 'x', name: 'X', tokens: { '--skin-bg': nasty, ...validTokens() } }, { context: 'custom' });
  const elapsed = Date.now() - start;
  if (elapsed < 200) {
    pass(`adversarial: validator stays fast on a 200k-char adversarial value (${elapsed}ms)`);
  } else {
    fail(`adversarial: validator took ${elapsed}ms on a 200k-char adversarial value — possible ReDoS regression`);
  }
}

// ── 2. Validate every built-in preset JSON ──────────────────────────────────
function loadAndValidatePresets() {
  const files = fs.readdirSync(PRESETS_DIR).filter(f => f.endsWith('.json')).sort();
  if (files.length === 0) {
    fail(`no preset JSON files found in ${PRESETS_DIR}`);
    return [];
  }

  const presets = [];
  const seenIds = new Set();

  for (const file of files) {
    const full = path.join(PRESETS_DIR, file);
    let skin;
    try {
      skin = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      fail(`${file}: invalid JSON (${e.message})`);
      continue;
    }

    const result = validateSkin(skin, { context: 'builtin' });
    if (!result.valid) {
      fail(`${file}: ${result.errors.join('; ')}`);
      continue;
    }

    if (skin.advanced) {
      const cssPath = path.join(PRESETS_DIR, '..', skin.advanced);
      if (!fs.existsSync(cssPath)) {
        fail(`${file}: advanced references "${skin.advanced}", which does not exist at ${cssPath}`);
        continue;
      }
    }

    if (seenIds.has(skin.id)) {
      fail(`${file}: duplicate skin id "${skin.id}"`);
      continue;
    }
    seenIds.add(skin.id);

    pass(`preset ${file}: valid ("${skin.name}", ${Object.keys(skin.tokens).length} tokens${skin.advanced ? `, advanced=${skin.advanced}` : ''})`);
    presets.push(skin);
  }

  return presets;
}

// ── 3. Load the AI-generation prompt doc (single source of truth for the
//      "Copy AI prompt" button — copying the whole file, not a regex-carved
//      excerpt, so nothing drifts out of sync if the doc changes later).
//      Optional: the custom-import feature (and this doc) is designed to be
//      independently revertable from the core token/preset system — see
//      src/renderer/skins/RATIONALE.md — so a missing file here just means
//      that feature isn't present, not a broken build. ──────────────────────
function loadPromptDoc() {
  if (!fs.existsSync(PROMPT_DOC_FILE)) {
    pass('CREATING_A_SKIN.md not present — skipping the Copy AI prompt bundle (custom-import feature not installed)');
    return null;
  }
  const text = fs.readFileSync(PROMPT_DOC_FILE, 'utf8');
  pass(`loaded CREATING_A_SKIN.md (${text.length} chars) for the Copy AI prompt button`);
  return text;
}

// ── 4. Regenerate the CSP-safe, statically-included runtime file ───────────
function writeGeneratedFile(presets, promptDoc) {
  const banner = `// AUTO-GENERATED by scripts/validate-skins.js — do not edit by hand.
// Source of truth: src/renderer/skins/presets/*.json and
// src/renderer/skins/CREATING_A_SKIN.md.
// Regenerate with \`npm run validate-skins\` (also runs automatically before
// \`npm run dev\` / \`npm start\`). Shipped as a plain <script> include (not
// fetched) because this app's CSP sets connect-src 'none'.
`;
  const body =
    // Generated from skin-validator.js's KNOWN_TOKENS, not hand-copied, so
    // skin-manager.js's allow-list can never drift out of sync with the
    // validator's — see skin-manager.js's applySkin().
    `window.SKIN_KNOWN_TOKENS = ${JSON.stringify(KNOWN_TOKENS)};\n` +
    `window.SKIN_PRESETS = ${JSON.stringify(presets, null, 2)};\n` +
    `window.SKIN_AI_PROMPT_DOC = ${JSON.stringify(promptDoc)};\n`;
  fs.writeFileSync(OUTPUT_FILE, banner + body, 'utf8');
  console.log(`\nWrote ${presets.length} preset(s) + the AI prompt doc to ${path.relative(process.cwd(), OUTPUT_FILE)}`);
}

runNegativeTests();
runAdversarialTests();
const presets = loadAndValidatePresets();
const promptDoc = loadPromptDoc();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed. Not regenerating presets.generated.js.`);
  process.exit(1);
}

writeGeneratedFile(presets, promptDoc);
console.log('All skin checks passed.');
