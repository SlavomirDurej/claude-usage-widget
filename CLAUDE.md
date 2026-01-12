# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Run Commands

```bash
# Install dependencies
npm install

# Run in development mode (with DevTools)
npm run dev

# Run in production mode
npm start

# Build Windows installer (outputs to dist/)
npm run build:win
```

## Architecture

This is an Electron desktop widget that displays Claude.ai usage statistics. It's a Windows-focused app using vanilla JavaScript (no frameworks).

### Main Process (`main.js`)
- Creates frameless, always-on-top widget window
- Manages system tray with context menu
- Handles OAuth/session authentication with Claude.ai
- Makes API requests to `https://claude.ai/api/organizations/{org_id}/usage`
- Uses `electron-store` for encrypted credential storage
- Implements silent login (hidden window) with fallback to visible login window

### Preload Script (`preload.js`)
- Exposes `window.electronAPI` bridge for renderer using context isolation
- Provides IPC methods: credentials, window controls, login events, usage data fetching

### Renderer (`src/renderer/`)
- `app.js` - Main application logic, UI state management, countdown timers
- `index.html` - Widget layout with progress bars and circular timers
- `styles.css` - Dark theme styling

### IPC Communication Pattern
- Main → Renderer events: `login-success`, `refresh-usage`, `session-expired`, `silent-login-started`, `silent-login-failed`
- Renderer → Main handlers: `get-credentials`, `save-credentials`, `delete-credentials`, `fetch-usage-data`, window controls

### Key Constants
- `UPDATE_INTERVAL`: 5 minutes (auto-refresh)
- `SILENT_LOGIN_TIMEOUT`: 15 seconds
- Widget size: 480x140 pixels

## API Integration

The app fetches from Claude.ai's internal API:
- `/api/organizations` - Get user's organization ID
- `/api/organizations/{org_id}/usage` - Get usage data with `five_hour` and `seven_day` utilization

Session authentication uses the `sessionKey` cookie from Claude.ai.
