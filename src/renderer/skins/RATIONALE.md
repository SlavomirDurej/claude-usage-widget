# Why this exists

The custom-skins system (presets, the token contract, and the
import/validator/IPC/gallery-popup path) was built speculatively, not in
response to a filed issue or user request. That's worth stating plainly
rather than implying otherwise.

Two of the ten presets have a non-decorative justification on their own —
`high-contrast` (legibility) and `midnight-oled` (true-black power/eye-strain
on an always-on tray element). The rest, and the whole
import/validate/save-a-custom-skin path, are a bet that a small, frequently
glanced-at status widget is worth letting people make their own, the same way
Winamp/Rainmeter/terminal-color-scheme/VS-Code-theme ecosystems work — not a
response to demonstrated demand.

## What would justify keeping it

- People actually use "Import…" / "Browse all skins…" — not zero clicks ever.
- Someone asks for more presets, a different import format, or files a bug
  against a custom skin — evidence the surface is alive, not just present.

## What would justify cutting it

- After a reasonable window (a few months of real usage post-release) nobody
  has used Import and nothing above has happened — that's a sign this was
  built ahead of demand that never showed up, and the ongoing IPC/validator
  security-review burden isn't worth carrying for an idle feature.

## If it needs to come out

The import/validator/IPC/popup-gallery half is meant to be removable on its
own, independent of the preset/token-contract plumbing everything else
depends on:

- `main.js`'s `import-custom-skin`/`get-custom-skins`/`delete-custom-skin`
  handlers, `preload.js`'s matching bridge methods, `CREATING_A_SKIN.md`, and
  the skin-picker UI (featured row, browse-all popup, import form,
  copy-prompt button) in `app.js`/`index.html`/`styles.css` are the removable
  part.
- The 16-token `--skin-*` contract, `src/skin-validator.js` (also used
  build-time by `scripts/validate-skins.js` to check the presets — it doesn't
  go away just because import does), `skin-manager.js`, and the built-in
  presets in `presets/*.json` are not — those stay regardless.
- `findSkin()` already falls back to the `None` skin for an unrecognized id,
  so if this is ever ripped out, anyone with a saved custom skin just stops
  seeing it applied instead of hitting an error — no migration needed.

Keep any future commit that removes the import path scoped to exactly that
list, so it stays a clean, single revertable change.
