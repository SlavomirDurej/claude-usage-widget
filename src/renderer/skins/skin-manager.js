// Skin manager — dynamic registry of built-in presets + user-imported custom
// skins, all driven by the standardized --skin-* token contract (see
// CREATING_A_SKIN.md). Applying a skin means: set `data-skin` on <body> (only
// "liquid" reacts to this today, via its own bundled CSS) and set every
// --skin-* custom property the skin's manifest defines as an inline style on
// <body> — never by injecting a raw CSS/style string, since custom skins may
// originate from pasted/AI-generated content. Built-in preset CSS files are
// pre-linked in index.html; presets.generated.js is a plain <script> include
// too (this app's CSP sets connect-src 'none', so nothing here ever fetches).

// Generated from src/skin-validator.js's KNOWN_TOKENS by
// scripts/validate-skins.js (see presets.generated.js) — never hand-edit
// this list here, it would just drift from the validator's allow-list.
const KNOWN_SKIN_TOKENS = Array.isArray(window.SKIN_KNOWN_TOKENS) ? window.SKIN_KNOWN_TOKENS : [];

const NONE_SKIN = { id: 'none', name: 'None', builtin: true, tokens: {} };

let customSkins = [];

function builtInPresets() {
  return Array.isArray(window.SKIN_PRESETS)
    ? window.SKIN_PRESETS.map(s => ({ ...s, builtin: true }))
    : [];
}

function getAllSkins() {
  return [NONE_SKIN, ...builtInPresets(), ...customSkins.map(s => ({ ...s, builtin: false }))];
}

function findSkin(id) {
  return getAllSkins().find(s => s.id === id) || NONE_SKIN;
}

function applySkin(id) {
  const skin = findSkin(id);

  if (skin.id === 'none') {
    document.body.removeAttribute('data-skin');
  } else {
    document.body.setAttribute('data-skin', skin.id);
  }

  // Clear every known token first so a skin that doesn't set a given token
  // falls back to the base/theme default instead of inheriting a stale
  // value left over from the previously active skin.
  for (const token of KNOWN_SKIN_TOKENS) {
    document.body.style.removeProperty(token);
  }
  for (const [name, value] of Object.entries(skin.tokens || {})) {
    if (KNOWN_SKIN_TOKENS.includes(name)) {
      document.body.style.setProperty(name, value);
    }
  }
}

function getActiveSkin() {
  return document.body.getAttribute('data-skin') || 'none';
}

// Called once at startup (and after a successful import/delete) with the
// current custom-skin list from the main process store.
function setCustomSkins(skins) {
  customSkins = Array.isArray(skins) ? skins : [];
}

window.SkinManager = {
  applySkin,
  getActiveSkin,
  getAllSkins,
  findSkin,
  setCustomSkins,
  KNOWN_SKIN_TOKENS,
};
