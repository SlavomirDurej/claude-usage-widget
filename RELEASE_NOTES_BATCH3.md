# Security Hardening Batch 3 - Release Notes

**IMPORTANT: Breaking Change - Config Migration Required**

This release changes how session credentials are stored. Users upgrading from previous versions will need to re-enter their Claude session key after the update.

## What Changed

1. **Keychain Storage (#1)** — Session keys now stored in OS keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service) instead of electron-store with hardcoded encryption key
2. **Main-Process URL Validation (#2)** — URL allowlist enforced in main process, not just preload (defense-in-depth)
3. **DOM Methods Replace innerHTML (#5)** — All dynamic content rendering now uses createElement/textContent instead of innerHTML
4. **Usage History Rotation (#3)** — Added 10k sample cap to prevent unbounded disk growth

## User Impact

**First Launch After Update:**
- Old encrypted config file will be deleted automatically
- User must re-enter session key
- All settings (refresh interval, compact mode, etc.) will be reset to defaults

**Why This Matters:**
- Old encryption used hardcoded key baked into app — any local process could recover session token
- New approach uses OS-level credential storage (Windows Credential Manager, macOS Keychain) — much harder to extract

## Testing Checklist

- [ ] Fresh install works
- [ ] Credential save/load works
- [ ] External links open correctly (GitHub, PayPal, claude.ai only)
- [ ] UI renders properly (no broken layouts)
- [ ] 24-48hr soak test at 15s interval (verify no memory growth, history caps at 10k)