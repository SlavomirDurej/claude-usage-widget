# Icon Assets Required

## What You Need

### 1. App Icon (icon.ico)
**Location:** `assets/icon.ico`
**Requirements:**
- Format: .ico file
- Sizes: 16x16, 32x32, 48x48, 256x256 (multi-resolution)
- Design: Claude-themed logo or "C" symbol
- Style: Should match the purple/blue gradient theme

**Quick Creation:**
- Use an online tool like https://favicon.io or https://convertio.co
- Upload a PNG (256x256) of your design
- Convert to .ico with multiple sizes

### 2. Tray Icon (tray-icon.png)
**Location:** `assets/tray-icon.png`
**Requirements:**
- Format: PNG with transparency
- Size: 16x16 or 32x32 pixels
- Design: Simple, recognizable at small size
- Style: Monochrome or minimal color (for visibility on light/dark taskbars)

**Tips:**
- Keep it simple - just a "C" or claude symbol
- Use white/light color for dark taskbars
- Test on both dark and light Windows themes

## Design Suggestions

### Color Palette (from widget)
- Primary Purple: #8b5cf6
- Light Purple: #a78bfa
- Blue: #3b82f6
- Background: #1e1e2e

### Icon Ideas
1. **Letter "C"** in gradient circle
2. **Chat bubble** with "C" inside
3. **Brain/AI symbol** in purple
4. **Minimalist robot** head
5. **Abstract neural network** pattern

## Temporary Solution

Until you create custom icons, you can use:
- Placeholder icon.ico from any Electron template
- Or remove icon references from `main.js` temporarily

```javascript
// In main.js, comment out:
// tray = new Tray(path.join(__dirname, 'assets/tray-icon.png'));
```

## Online Tools

- **Icon Generator:** https://www.icongenerator.com
- **ICO Converter:** https://convertio.co/png-ico/
- **Free Icons:** https://icons8.com or https://www.flaticon.com

## Example Commands (if you have ImageMagick)

```bash
# Create .ico from PNG
convert icon-256.png -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico

# Create tray icon
convert logo.png -resize 16x16 tray-icon.png
```

---

**Note:** The app will still work without icons, but they improve the user experience significantly!
