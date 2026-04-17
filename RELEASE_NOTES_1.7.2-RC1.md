# Claude Usage Widget v1.7.2-rc.1 (Release Candidate)

**⚠️ BETA RELEASE - FOR TESTING ONLY**

This is a **release candidate** for Teams organization support. We need your help testing this feature before the official v1.7.2 release.

---

## 🎯 What's New

### Teams Organization Support

Users with multiple Claude organizations (Personal + Teams accounts) can now select which organization to track:

**Features:**
- **Organization Selector** - New dropdown in Settings to switch between organizations
- **Smart Default** - Automatically defaults to Teams org if you have one
- **Instant Switching** - Usage data refreshes immediately when you change organizations
- **Conditional UI** - Selector only appears if you have multiple chat-enabled orgs

**How it works:**
1. Log in to your Claude account (Personal or Teams)
2. If you have multiple organizations, open Settings (⚙️)
3. Find the new "Organization" dropdown in the right column
4. Select which organization you want to track
5. Usage data updates immediately

**Who this helps:**
- Claude for Teams users who also have personal accounts
- Users who want to track different workspaces separately
- Anyone with access to multiple Claude organizations

---

## 🧪 Testing Instructions

**We need you to test this feature!**

If you have a Claude for Teams account (or multiple Claude organizations):

1. Download and install this release candidate
2. Log in with your credentials
3. Open Settings and verify:
   - Do you see an "Organization" dropdown?
   - Does it show all your organizations correctly?
   - Are they labeled as "(Team)" or "(Personal)"?
4. Try switching between organizations:
   - Does the usage data update correctly?
   - Does the widget remember your selection after restart?

**Please report any issues** in Discussion #25 or create a new issue.

---

## 📝 Technical Details

**Changes in this release:**
- Modified session validation to return all chat-capable organizations
- Added organization selector UI in settings panel (Row 6, right column)
- Implemented conditional visibility (only shows with multiple orgs)
- Smart defaults: Teams org preferred, falls back to first chat org
- Increased settings window height from 288px to 318px
- Immediate save and data refresh on organization change

**Files modified:**
- `main.js` - Organization fetching and filtering
- `src/renderer/app.js` - UI logic and event handling
- `src/renderer/index.html` - Settings panel structure

---

## ⚠️ Known Limitations

- This is a **pre-release** version for testing
- Only Windows build available for this RC (macOS/Linux coming in final release)
- If you have questions, please ask in Discussion #25

---

## 🔄 Upgrade Path

**Important:** Users on this release candidate (v1.7.2-rc.1) will be prompted to upgrade when the final v1.7.2 is released. This ensures you get the stable version automatically.

---

## 🐛 Found a Bug?

Please report issues in **Discussion #25** with:
- Your account type (Teams, Personal, or both)
- How many organizations you have
- What happened vs. what you expected
- Any error messages or screenshots

---

## 📦 Installation

**Windows:**
1. Download `Claude-Usage-Widget-1.7.2-rc.1-win-Setup.exe` or `Claude-Usage-Widget-1.7.2-rc.1-win-portable.exe`
2. Run the installer (or portable exe)
3. Launch and test!

---

**Thank you for helping us test this feature!** Your feedback is critical for ensuring a smooth final release.

---

*This release addresses [Discussion #25](https://github.com/SlavomirDurej/claude-usage-widget/discussions/25)*