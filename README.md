# RenderCAD Desktop App

Cross-platform desktop application for RenderCAD - Transform CAD screenshots into photorealistic renders using AI.

## Features

- **System Tray/Menu Bar Integration**: Runs in the background with easy access via system tray (Windows) or menu bar (macOS)
- **Screen Capture**: Select and capture CAD screenshots from your screen
- **AI Rendering**: Send captured images to RenderCAD API for photorealistic rendering
- **Authentication**: Secure device code authentication flow
- **User Management**: View account info, token usage, and manage settings

## Project Structure

```
DesktopApp/
├── src/
│   ├── main/
│   │   └── main.js              # Main Electron process
│   ├── preload/
│   │   ├── preload.js          # Preload script for main window
│   │   └── capture-preload.js  # Preload script for capture window
│   └── renderer/
│       ├── index.html          # Main window UI
│       ├── styles.css          # Main window styles
│       ├── renderer.js         # Main window logic
│       ├── capture.html        # Capture window UI
│       └── capture.js          # Capture window logic
├── assets/
│   └── icons/                  # Application icons
├── build/                      # Build resources
│   └── entitlements.mac.plist  # macOS entitlements
├── package.json                # Project configuration
└── README.md                   # This file
```

## Prerequisites

- **Node.js** (v16 or higher)
- **npm** (v7 or higher)
- **Windows**: Windows 10 or later
- **macOS**: macOS 10.13 or later

## Installation

1. **Clone or navigate to the project directory:**
   ```bash
   cd DesktopApp
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

## Development

### Running the App

To run the app in development mode:

```bash
npm start
```

Or with dev mode enabled:

```bash
npm run dev
```

### Development Notes

- The app runs in the system tray/menu bar
- Click the tray icon to open the main window
- Use "Capture & Render" to start screen capture
- Press ESC to cancel capture

## Building

### Build for All Platforms

```bash
npm run build:all
```

### Build for Windows Only

```bash
npm run build:win
```

This creates:
- **NSIS installer** (`dist/RenderCAD Setup x.x.x.exe`)
- **MSI installer** (`dist/RenderCAD x.x.x.msi`)

### Build for macOS Only

```bash
npm run build:mac
```

This creates:
- **DMG installer** (`dist/RenderCAD-x.x.x.dmg`)
- **PKG installer** (`dist/RenderCAD-x.x.x.pkg`)

### Build Output

All build artifacts are placed in the `dist/` directory:
- Windows: `.exe` (NSIS) and `.msi` (MSI) installers
- macOS: `.dmg` (disk image) and `.pkg` (package) installers

## Installer Setup

### Windows Installers

#### NSIS Installer
- One-click installer with customizable installation directory
- Creates desktop and start menu shortcuts
- Uninstaller included

#### MSI Installer
- Standard Windows installer format
- Suitable for enterprise deployment
- Group Policy compatible

### macOS Installers

#### DMG Installer
- Drag-and-drop installation
- Includes Applications folder link
- Standard macOS disk image format

#### PKG Installer
- Standard macOS package installer
- Installs to `/Applications`
- Suitable for automated deployment

## Configuration

### Application Icons

Place your application icons in:
- `assets/icons/tray-icon.png` - Tray icon (Windows)
- `assets/icons/tray-iconTemplate.png` - Tray icon template (macOS)
- `build/icon.ico` - Windows application icon
- `build/icon.icns` - macOS application icon

### Build Configuration

Edit `package.json` to customize:
- Application name and version
- App ID and publisher information
- Installer settings
- Icon paths

## Troubleshooting

### Build Issues

1. **Missing icons**: Ensure all icon files exist in the specified paths
2. **Code signing (macOS)**: Configure code signing in `package.json` for distribution
3. **Windows build fails**: Ensure you're on Windows when building Windows installers

### Runtime Issues

1. **Tray icon not showing**: Check that icon files exist in `assets/icons/`
2. **Capture not working**: Ensure screen capture permissions are granted (macOS)
3. **Authentication fails**: Check network connection and API endpoint

## API Configuration

The app connects to the RenderCAD API at:
- Base URL: `https://rendercad.ai`
- Authentication: Device code flow
- API endpoints: `/backend/auth.php` and `/backend/render.php`

## Development Workflow

1. Make changes to source files in `src/`
2. Test with `npm start`
3. Build installers with `npm run build`
4. Test installers in clean environments
5. Distribute installers to users

## Platform-Specific Notes

### Windows
- Uses system tray (notification area)
- NSIS installer recommended for end users
- MSI installer for enterprise deployment

### macOS
- Uses menu bar
- DMG installer recommended for end users
- PKG installer for enterprise deployment
- May require code signing for distribution outside App Store

## License

MIT License - See LICENSE file for details

## Support

For issues and questions, visit: https://rendercad.ai/settings

