# Staged Changes

Changes accumulating here have already been merged into `develop`.
We keep track of these changes/fixes/features and when we have enough for a new release we decide on the next version number.

This file is tracked in the repo and visible to everyone.

---

## Branches Staged

| Branch | Description |
|--------|-------------|
| `feature/date-format-dmy` | Add Day-Month date format options for the Weekly Resets column (Discussion #116) — 3 new dropdown entries (`13 Mar`, `Fri 13 Mar`, `Fri 13 Mar + time`) grouped under a "Day Month" optgroup below the existing "Month Day" group |

---

## Changes

- **Day-Month date format options (Discussion #116):** @austempest reported the Weekly Resets column only offered US-style Month-Day formats (`Mar 13`), which doesn't match how most of the world writes dates. Added three parallel Day-Month options — `13 Mar`, `Fri 13 Mar`, `Fri 13 Mar + time` — as a second `optgroup` in the same dropdown, directly below the existing Month-Day group. `formatResetsAt()` gained matching `date-dmy` / `date-day-dmy` / `date-day-time-dmy` branches; no other logic changed since settings load/save already reads the dropdown value generically. Tested locally on Windows.

*Add new entries above this line as additional branches are staged.*
