# Release Candidate Description Template

Template for the GitHub Release description text when publishing an RC
(after the build completes successfully and `.blockmap` files are confirmed
present — see RELEASE_PROCESS.md step 5). Not used for formal/stable
releases, which drop the RC warning banner and the Discussion-feedback ask.

Draft in this file (or scratch), then paste the final text into the GitHub
Release description box once the build is confirmed green. Do not write
release notes before the build completes — RC builds have failed and needed
deleting/re-tagging enough times that notes-before-green wastes the effort
of rewriting them if the build has to be scrapped.

---

## Structure

1. Title: `vX.Y.Z-rc.N — Release Candidate`
2. RC warning banner (verbatim, adjust nothing but leave the meaning intact)
3. One `###`-headed section per user-facing change, each with:
   - An emoji matching the change's category (see the emoji guide below)
   - A short bolded name
   - 1-3 sentences: what changed and why it matters to the person reading,
     not implementation detail — link the Discussion/Issue/PR number and
     credit the reporter/contributor inline if there is one (see
     CLAUDE.md's "Contributor Credit" section for who gets credited how)
   - Order: new features first, then fixes, roughly matching the order
     items were merged this cycle — not alphabetical, not by size
4. Link to `STAGED_CHANGES.md` for full technical writeups
5. Downloads line (platforms this build produced artifacts for)

## Emoji Guide (for consistency across releases, not a hard rule)

- 🌍 Localization / formatting / display options
- 🪟 Windows-specific
- 🐧 Linux-specific
- 🍎 macOS-specific
- 🔧 CLI flags / power-user tooling
- 🔐 Security / auth / login
- 💳 Billing / usage / credit-related
- 🔑 Session / credential handling
- ⏱️ Timing / scheduling / retry behavior
- 📊 Charts / history / data display
- 🎨 UI / visual / theming

---

## Copy-Paste Template

```markdown
## vX.Y.Z-rc.N — Release Candidate

> ⚠️ **This is a Release Candidate, not a stable release.** It's for testing the changes below before they ship broadly. Stable users won't be notified about this — the update checker ignores pre-release tags entirely, so you're only seeing this because you're intentionally testing an RC.
>
> **Found something odd?** Please open a [Discussion](../../discussions) rather than an Issue. RCs move fast and get iterated on — Discussions keep testing feedback in one place, separate from confirmed bugs on stable releases.

### [emoji] [Feature/Fix Name]
[1-3 sentences on what changed and why it matters. Link Discussion/Issue/PR number in parens at the end, credit inline: *(Issue #NNN, thanks @username)*]

[Repeat one section per change, features before fixes]

---

Full technical writeups for every change: [STAGED_CHANGES.md](../../blob/develop/STAGED_CHANGES.md)

---

**Downloads below** — Windows (installer + portable), macOS (Apple Silicon + Intel, signed & notarized), Linux (x86_64 + ARM AppImage).
```

---

## Notes

- **Credit placement matters** (see CLAUDE.md): code/design contributors get "thanks @username" tied to the specific feature they built. Bug/issue reporters who contributed no code still get named — "thanks @username for the detailed report" or similar — but only in the context of the fix their report led to, never implying they wrote code they didn't.
- **Keep it user-facing.** This is not `STAGED_CHANGES.md` — no implementation details, no "confirmed via busctl," no internal debugging narrative. That level of detail belongs in `STAGED_CHANGES.md`, linked at the bottom for anyone who wants it.
- **The RC warning banner text is deliberate — don't paraphrase it away.** It exists specifically so an RC tester who stumbles onto the release page understands two things immediately: this isn't the stable version, and there's a clear, correct place to report problems (Discussions, not Issues) rather than each report landing somewhere different.
- Formal/stable release notes (written at the "Formal Release" stage in RELEASE_PROCESS.md) reuse this same section-by-section structure minus the RC banner and Discussion-feedback ask — by then, issues found during RC testing should already be resolved, and Issues (not Discussions) become the right place to report anything new.
