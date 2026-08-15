# Creating a custom skin

A skin is a small JSON file — a `skin.json` — that recolors the widget's chrome
by setting a fixed set of CSS custom properties (the "token contract" below).
You can hand-write one, tweak an existing preset, or **paste this whole file
into a Claude Code (or any Claude) session** along with a description of the
look you want and ask it to generate one for you. See the ready-to-use prompt
at the bottom.

## How it works

- A skin only ever sets **flat values for named tokens** — colors, gradients,
  and a couple of lengths. It cannot add CSS rules, load remote resources, or
  run any code. This is enforced by a strict validator, not just convention.
- Anything a skin doesn't set falls back to the app's default look, so you
  only need to specify the tokens you actually want to change.
- Skins **never** override what a color *means*. Session/weekly usage bars,
  the warning/danger states, and the "on/off" status badge keep their meaning
  (green/amber/red etc.) across every skin — a skin can only change the
  window's chrome (background, text, borders, accent, control fills).

## The shape of a skin.json

```json
{
  "id": "my-cool-skin",
  "name": "My Cool Skin",
  "author": "you (optional)",
  "description": "one line, optional",
  "tokens": {
    "--skin-bg": "linear-gradient(135deg, #1e1e2e 0%, #2a2a3e 100%)",
    "--skin-text": "#e0e0e0",
    "--skin-accent": "#8b5cf6"
  }
}
```

- `id`: lowercase letters, digits, and hyphens only, 2-42 characters (e.g.
  `"sunset-vibes"`).
- `name`: display name shown in the skin gallery, max 40 characters.
- `author` / `description`: optional, max 40 / 200 characters.
- `tokens`: an object using **only** the token names in the table below.
  Unknown token names are rejected. At minimum, set `--skin-bg`, `--skin-text`,
  and `--skin-accent` — everything else is optional polish.

Nothing outside this shape is allowed: no extra top-level fields, no nested
objects, no `advanced`/CSS field (that's reserved for the app's own built-in
presets).

## Token contract

| Token | Purpose | Example |
|---|---|---|
| `--skin-bg` | Main widget/settings background | `linear-gradient(135deg, #1e1e2e 0%, #2a2a3e 100%)` |
| `--skin-bg-elevated` | Title bar / settings header background | `rgba(0, 0, 0, 0.3)` |
| `--skin-border` | Widget/control border | `rgba(255, 255, 255, 0.1)` |
| `--skin-border-hover` | Border color on hover | `rgba(255, 255, 255, 0.25)` |
| `--skin-hairline` | Thin dividers (under the title bar, between sections) | `rgba(255, 255, 255, 0.05)` |
| `--skin-radius` | Corner radius of the widget/settings panel | `10px` |
| `--skin-text` | Primary text | `#e0e0e0` |
| `--skin-text-dim` | Secondary text (labels) | `#a0a0a0` |
| `--skin-text-faint` | Faint/hint text | `#8f8fa0` |
| `--skin-accent` | Brand accent color | `#8b5cf6` |
| `--skin-accent-bg` | Translucent accent background (active pills) | `rgba(139, 92, 246, 0.2)` |
| `--skin-accent-border` | Accent border | `rgba(139, 92, 246, 0.4)` |
| `--skin-accent-text` | Text drawn on an accent background | `#a78bfa` |
| `--skin-fill` | Control surface fill (buttons) | `rgba(255, 255, 255, 0.05)` |
| `--skin-fill-hover` | Control surface fill on hover | `rgba(255, 255, 255, 0.1)` |
| `--skin-track` | Progress-bar / timer-ring groove | `rgba(255, 255, 255, 0.1)` |

**Allowed value formats:** hex colors (`#rgb`, `#rrggbb`, `#rrggbbaa`),
`rgb()`/`rgba()`, or a `linear-gradient()`/`radial-gradient()` built only from
those. `--skin-radius` takes a plain length like `10px` or `22`. Nothing else
is accepted — no `url()`, no `@import`, no HTML.

## Pitfalls to avoid

- **Keep contrast.** `--skin-text` sits directly on `--skin-bg`; if your
  background is light, use a dark `--skin-text` (and vice versa), or the
  widget becomes unreadable.
- **Don't go fully opaque black/white for `--skin-fill`/`--skin-track`** —
  these sit *on top of* `--skin-bg`, so they need enough transparency (an
  alpha well under 1) to read as a subtle surface rather than a solid block.
- **Pick one `--skin-accent` family** and reuse it across
  `--skin-accent-bg`/`--skin-accent-border`/`--skin-accent-text` at different
  opacities — mixing unrelated hues across those four tokens looks
  inconsistent.

## Prompt to generate one

Paste everything below this line into a Claude session, replace the bracketed
description, and ask it to produce a `skin.json`:

---

> Using the token contract and rules in this file, generate a `skin.json` for
> a skin themed around: **[describe the look you want, e.g. "a warm coffee-
> shop theme, browns and cream, with a soft orange accent"]**.
>
> Output only the JSON object, following the shape and constraints above
> exactly (only the listed token names, only the allowed value formats, no
> extra fields). Make sure `--skin-text` stays readable against `--skin-bg`.

---

## Using it

In Settings → Skin → **Import…**, paste the JSON and click **Add skin**. It's
saved locally and appears in your skin gallery alongside the built-in
presets; you can remove it any time with the **×** on its swatch.
