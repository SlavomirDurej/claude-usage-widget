# macOS Code Signing Setup

To build **signed and notarized** macOS releases, you need an Apple Developer account and proper code signing credentials.

## Why This Matters

- **Unsigned apps** trigger Gatekeeper warnings ("App is damaged and can't be opened")
- **Signed but not notarized** apps require users to bypass security settings
- **Signed AND notarized** apps install smoothly with no warnings

## Prerequisites

1. **Apple Developer Account** (Individual or Organization)
   - Cost: $99/year
   - Sign up at: https://developer.apple.com/programs/

2. **Developer ID Application Certificate**
   - Created in Xcode or developer.apple.com
   - Exported as a `.p12` file with a password

3. **App-Specific Password** for notarization
   - Generated at: https://appleid.apple.com

## Required Environment Variables

Create a `.env` file in the project root with these values:

```bash
# Your Apple Developer Team ID (10-character alphanumeric)
# Find at: developer.apple.com/account → Membership
APPLE_TEAM_ID=X84UXCNLPX

# Your Apple ID email (Developer account email)
APPLE_ID=your-apple-id@example.com

# App-specific password for notarization
# Generate at: appleid.apple.com → Sign-In and Security → App-Specific Passwords
# Format: xxxx-xxxx-xxxx-xxxx
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx

# Path to your Developer ID Application certificate (.p12 file)
# Can be absolute or relative to project root
CSC_LINK=./developer_id.p12

# Password for the .p12 certificate
# This is the password YOU set when exporting the certificate from Keychain
CSC_KEY_PASSWORD=your-certificate-password
```

## How to Get These Values

### 1. APPLE_TEAM_ID
1. Go to https://developer.apple.com/account
2. Click "Membership" in the sidebar
3. Your Team ID is displayed (10 characters, e.g., `93GD47PF38`)

### 2. APPLE_ID
Your Apple Developer account email address.

### 3. APPLE_APP_SPECIFIC_PASSWORD
1. Go to https://appleid.apple.com
2. Sign in with your Apple ID
3. Navigate to "Sign-In and Security" → "App-Specific Passwords"
4. Click "Generate an app-specific password"
5. Name it (e.g., "Claude Widget Notarization")
6. Copy the generated password (format: `xxxx-xxxx-xxxx-xxxx`)

**Important:** Save this password immediately — Apple only shows it once!

### 4. CSC_LINK (Developer ID Certificate)

**If you already have a certificate:**
1. Open **Keychain Access** on macOS
2. Find your "Developer ID Application" certificate
3. Right-click → Export
4. Save as `.p12` file
5. Set a password when prompted
6. Move the `.p12` file to your project root (or note its path)

**If you need to create a certificate:**
1. Open **Xcode**
2. Go to Xcode → Settings → Accounts
3. Select your Apple ID → Manage Certificates
4. Click `+` → "Developer ID Application"
5. Once created, export as described above

**Alternative (via developer.apple.com):**
1. Go to https://developer.apple.com/account/resources/certificates
2. Create new "Developer ID Application" certificate
3. Download and install it
4. Export from Keychain Access as described above

### 5. CSC_KEY_PASSWORD
This is the password **you created** when exporting the `.p12` certificate. If you forgot it, you'll need to export the certificate again.

## Building Signed macOS Releases

Once your `.env` file is configured:

```bash
npm run build:mac
```

The build process will:
1. Sign the app with your Developer ID certificate
2. Create a `.dmg` installer
3. Submit the app to Apple for notarization
4. Wait for Apple's approval (usually 3-25 minutes)
5. Staple the notarization ticket to the DMG

**Output:** `dist/Claude-Usage-Widget-{version}-macOS-{arch}.dmg`

## Troubleshooting

### "No identity found" error
- Your certificate isn't installed in Keychain
- Or the CSC_LINK path is wrong
- Verify the `.p12` file exists and CSC_KEY_PASSWORD is correct

### Notarization fails
- Check APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD are correct
- Ensure you're using an **app-specific password**, not your regular Apple ID password
- Wait and retry — Apple's notarization service occasionally has queue delays

### "Invalid credentials" during notarization
- Your app-specific password may have expired or been revoked
- Generate a new one at appleid.apple.com

## Security Notes

- **Never commit `.env` to Git** — it contains secrets
- The `.env` file is already in `.gitignore`
- This `MACOS_CODE_SIGNING.md` file is safe to commit (it's just a template)

## For Windows/Linux Contributors

You can skip this entire setup! The GitHub Actions workflow handles macOS builds automatically when maintainers push release tags.

---

**Questions?** See [CONTRIBUTING.md](CONTRIBUTING.md) or open a discussion.
