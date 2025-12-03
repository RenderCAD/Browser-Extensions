# Quick Start Guide

Get RenderCAD Desktop App up and running in minutes.

## 1. Install Dependencies

```bash
cd DesktopApp
npm install
```

This will install:
- Electron (v28.0.0)
- electron-builder (v24.9.1)
- electron-store (v8.1.0)

## 2. Add Icons (Required)

Before running or building, you need to add icon files:

### Minimum Required Icons

1. **Tray Icons** (for running the app):
   - Copy `tray-icon.png` to `assets/icons/tray-icon.png`
   - Copy `tray-iconTemplate.png` to `assets/icons/tray-iconTemplate.png`
   - You can use placeholder images (16x16 or 32x32 pixels) for testing

2. **Application Logo** (for UI):
   - Copy `logo.png` to `assets/icons/logo.png`
   - Optional: Copy `logo.svg` to `assets/icons/logo.svg`

### Icons for Building

3. **Windows Icon** (for building Windows installers):
   - Create `build/icon.ico` with multiple sizes (16, 32, 48, 256)
   - Use ImageMagick or an icon editor

4. **macOS Icon** (for building macOS installers):
   - Create `build/icon.icns` with multiple sizes
   - Use `iconutil` on macOS or an icon editor

**Note:** You can run the app without build icons, but you need tray icons and logo.

## 3. Run the App

```bash
npm start
```

The app will:
- Start in the system tray (Windows) or menu bar (macOS)
- Click the tray icon to open the main window
- Use "Capture & Render" to start screen capture

## 4. First Run

1. **Login:**
   - Click "Sign In" in the main window
   - Complete authentication in your browser
   - The app will automatically detect when you're logged in

2. **Capture & Render:**
   - Click "Capture & Render" button
   - Select an area on your screen
   - Click the checkmark (✓) to confirm
   - Wait for the render to complete

## 5. Build Installers

### Windows

```bash
npm run build:win
```

Creates:
- `dist/RenderCAD Setup x.x.x.exe` (NSIS installer)
- `dist/RenderCAD x.x.x.msi` (MSI installer)

### macOS

```bash
npm run build:mac
```

Creates:
- `dist/RenderCAD-x.x.x.dmg` (Disk image)
- `dist/RenderCAD-x.x.x.pkg` (Package installer)

## Troubleshooting

### "Icon not found" errors

**Solution:** Add the required icon files (see step 2 above)

### App doesn't start

**Solution:** 
- Check Node.js version: `node --version` (should be v16+)
- Reinstall dependencies: `rm -rf node_modules && npm install`

### Capture window doesn't appear

**Solution:**
- Check that you're logged in
- Try clicking "Capture & Render" again
- Check console for errors (if running with `npm run dev`)

### Build fails

**Solution:**
- Ensure you have the build icons (`build/icon.ico` or `build/icon.icns`)
- Check that you're on the correct platform (Windows for Windows builds, macOS for macOS builds)
- See BUILD.md for detailed troubleshooting

## Development Tips

- Use `npm run dev` for development mode with console output
- Check `src/main/main.js` console for debug messages
- The app stores data in Electron's user data directory (automatically managed)

## Next Steps

- Read `README.md` for full documentation
- Read `BUILD.md` for detailed build instructions
- Read `PROJECT_STRUCTURE.md` for file organization

## Need Help?

- Check the main README.md
- Review BUILD.md for build issues
- Visit https://rendercad.ai/settings for support

