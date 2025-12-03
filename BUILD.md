# Build Instructions

Detailed build instructions for RenderCAD Desktop App.

## Quick Start

```bash
# Install dependencies
npm install

# Run in development
npm start

# Build for your platform
npm run build
```

## Detailed Build Steps

### 1. Install Dependencies

```bash
npm install
```

This installs:
- Electron (desktop app framework)
- electron-builder (installer creation)
- electron-store (local storage)

### 2. Prepare Icons

Before building, ensure you have the required icons:

**Windows:**
- `build/icon.ico` - Application icon (multi-size ICO file)

**macOS:**
- `build/icon.icns` - Application icon (multi-size ICNS file)

**Both:**
- `assets/icons/tray-icon.png` - Tray icon
- `assets/icons/tray-iconTemplate.png` - macOS tray icon template

### 3. Build for Windows

```bash
npm run build:win
```

**Output:**
- `dist/RenderCAD Setup x.x.x.exe` - NSIS installer
- `dist/RenderCAD x.x.x.msi` - MSI installer

**NSIS Installer Features:**
- Customizable installation directory
- Desktop shortcut
- Start menu shortcut
- Uninstaller

**MSI Installer Features:**
- Standard Windows installer
- Enterprise deployment ready
- Group Policy compatible

### 4. Build for macOS

```bash
npm run build:mac
```

**Output:**
- `dist/RenderCAD-x.x.x.dmg` - Disk image installer
- `dist/RenderCAD-x.x.x.pkg` - Package installer

**DMG Installer Features:**
- Drag-and-drop installation
- Applications folder link
- Standard macOS format

**PKG Installer Features:**
- Standard macOS package
- Installs to /Applications
- Automated deployment ready

### 5. Build for Both Platforms

```bash
npm run build:all
```

**Note:** You can only build Windows installers on Windows and macOS installers on macOS. Use CI/CD for cross-platform builds.

## Build Configuration

### Customizing Build Settings

Edit `package.json` under the `"build"` section:

```json
{
  "build": {
    "appId": "com.rendercad.desktop",
    "productName": "RenderCAD",
    "win": {
      "target": ["nsis", "msi"],
      "icon": "build/icon.ico"
    },
    "mac": {
      "target": ["dmg", "pkg"],
      "icon": "build/icon.icns"
    }
  }
}
```

### Code Signing (macOS)

For distribution outside the App Store, configure code signing:

1. Get an Apple Developer certificate
2. Update `package.json`:
```json
{
  "build": {
    "mac": {
      "identity": "Developer ID Application: Your Name (TEAM_ID)"
    }
  }
}
```

### Code Signing (Windows)

For Windows code signing:

1. Get a code signing certificate
2. Update `package.json`:
```json
{
  "build": {
    "win": {
      "certificateFile": "path/to/certificate.pfx",
      "certificatePassword": "password"
    }
  }
}
```

## Testing Builds

### Test Windows Installer

1. Run the NSIS installer: `dist/RenderCAD Setup x.x.x.exe`
2. Install to a test directory
3. Verify:
   - Application launches
   - Tray icon appears
   - Capture functionality works
   - Uninstaller works

### Test macOS Installer

1. Mount the DMG: `open dist/RenderCAD-x.x.x.dmg`
2. Drag to Applications
3. Verify:
   - Application launches
   - Menu bar icon appears
   - Capture functionality works
   - Gatekeeper accepts (if code signed)

## Troubleshooting

### Build Fails with Icon Error

**Solution:** Ensure icon files exist and are valid:
- Windows: Use a proper `.ico` file with multiple sizes
- macOS: Use a proper `.icns` file

### macOS Build Fails

**Solution:** 
- Ensure you're on macOS
- Check icon file exists: `build/icon.icns`
- Verify entitlements file: `build/entitlements.mac.plist`

### Windows Build Fails

**Solution:**
- Ensure you're on Windows
- Check icon file exists: `build/icon.ico`
- Verify NSIS is available (comes with electron-builder)

### Installer Too Large

**Solution:**
- Check `node_modules` size
- Use `electron-builder` compression
- Consider excluding unnecessary dependencies

## Continuous Integration

### GitHub Actions Example

```yaml
name: Build
on: [push]
jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [windows-latest, macos-latest]
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: npm install
      - run: npm run build
      - uses: actions/upload-artifact@v2
        with:
          name: dist-${{ matrix.os }}
          path: dist/
```

## Distribution

### Windows Distribution

1. Test installers on clean Windows VMs
2. Upload to:
   - Your website
   - GitHub Releases
   - Microsoft Store (requires additional setup)

### macOS Distribution

1. Code sign the application
2. Notarize with Apple (required for Gatekeeper)
3. Upload to:
   - Your website
   - GitHub Releases
   - Mac App Store (requires additional setup)

## Version Management

Update version in `package.json`:

```json
{
  "version": "1.2.0"
}
```

The build process automatically uses this version in:
- Installer filenames
- Application metadata
- About dialog

## Advanced Configuration

See [electron-builder documentation](https://www.electron.build/) for advanced options:
- Custom installers
- Auto-updater configuration
- Notarization settings
- Publishing configuration

