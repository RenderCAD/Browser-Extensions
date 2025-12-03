# RenderCAD Desktop App - Project Structure

## Complete File Structure

```
DesktopApp/
├── src/
│   ├── main/
│   │   └── main.js                    # Main Electron process (tray, windows, IPC)
│   ├── preload/
│   │   ├── preload.js                 # Preload script for main window
│   │   └── capture-preload.js         # Preload script for capture window
│   └── renderer/
│       ├── index.html                 # Main window UI
│       ├── styles.css                 # Main window styles
│       ├── renderer.js                # Main window logic (auth, UI)
│       ├── capture.html               # Capture window UI
│       └── capture.js                 # Capture window logic (selection, capture)
├── assets/
│   └── icons/
│       ├── README.md                  # Icon requirements guide
│       ├── tray-icon.png              # Windows tray icon (required)
│       ├── tray-iconTemplate.png      # macOS tray icon (required)
│       ├── logo.png                   # Application logo (required)
│       └── logo.svg                   # Vector logo (optional)
├── build/
│   ├── entitlements.mac.plist         # macOS entitlements for code signing
│   ├── icon.ico                       # Windows application icon (required for build)
│   └── icon.icns                      # macOS application icon (required for build)
├── .gitignore                         # Git ignore rules
├── package.json                       # Project config, dependencies, build settings
├── LICENSE                            # MIT License
├── README.md                          # Main documentation
├── BUILD.md                           # Detailed build instructions
└── PROJECT_STRUCTURE.md               # This file

```

## Key Files Explained

### Main Process (`src/main/main.js`)
- Manages application lifecycle
- Creates and manages system tray/menu bar
- Handles window creation (main window, capture window)
- IPC handlers for authentication, storage, API calls
- Screen capture functionality
- Notification system

### Preload Scripts
- **preload.js**: Exposes safe Electron APIs to main window renderer
- **capture-preload.js**: Exposes capture APIs to capture window renderer

### Renderer Files

#### Main Window
- **index.html**: UI structure matching browser extension popup
- **styles.css**: Dark theme styling
- **renderer.js**: Authentication flow, user info display, button handlers

#### Capture Window
- **capture.html**: Fullscreen transparent overlay for screen selection
- **capture.js**: Selection box logic, capture handling, image cropping

### Build Configuration

#### package.json
- Electron and electron-builder configuration
- Build targets: NSIS, MSI (Windows), DMG, PKG (macOS)
- Installer settings

#### build/entitlements.mac.plist
- macOS code signing entitlements
- Required for distribution outside App Store

## Required Assets

### Before Building

You must provide these icon files:

1. **Windows Icons:**
   - `build/icon.ico` - Multi-size ICO file (16x16, 32x32, 48x48, 256x256)

2. **macOS Icons:**
   - `build/icon.icns` - Multi-size ICNS file (512x512 recommended)

3. **Tray Icons:**
   - `assets/icons/tray-icon.png` - Windows tray icon
   - `assets/icons/tray-iconTemplate.png` - macOS tray icon (monochrome)

4. **Application Logo:**
   - `assets/icons/logo.png` - Used in UI
   - `assets/icons/logo.svg` - Optional, for better scaling

## Build Output

After building, the `dist/` directory will contain:

### Windows
- `RenderCAD Setup x.x.x.exe` - NSIS installer
- `RenderCAD x.x.x.msi` - MSI installer

### macOS
- `RenderCAD-x.x.x.dmg` - Disk image installer
- `RenderCAD-x.x.x.pkg` - Package installer

## Development Workflow

1. **Setup:**
   ```bash
   npm install
   ```

2. **Development:**
   ```bash
   npm start
   ```

3. **Build:**
   ```bash
   npm run build:win    # Windows only
   npm run build:mac    # macOS only
   npm run build:all    # Both (requires both platforms)
   ```

## Features Implemented

✅ System tray/menu bar integration
✅ Main window with authentication UI
✅ Device code authentication flow
✅ Screen capture with selection overlay
✅ Image cropping and processing
✅ RenderCAD API integration
✅ Token management and storage
✅ User info display
✅ Notification system
✅ Cross-platform support (Windows & macOS)
✅ Installer generation (NSIS, MSI, DMG, PKG)

## Next Steps

1. Add application icons to `build/` and `assets/icons/`
2. Test the application: `npm start`
3. Build installers: `npm run build`
4. Test installers on clean systems
5. Distribute to users

## Notes

- The app uses `electron-store` for persistent storage (replaces Chrome storage API)
- All browser extension APIs have been ported to Electron equivalents
- The capture window uses a transparent overlay for screen selection
- Authentication flow matches the browser extension exactly
- API endpoints remain the same as the browser extension

