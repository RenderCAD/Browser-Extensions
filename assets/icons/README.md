# Icons Directory

Place your application icons here:

## Required Icons

### Tray Icons
- `tray-icon.png` - System tray icon for Windows (16x16 or 32x32 recommended)
- `tray-iconTemplate.png` - System tray icon template for macOS (16x16 or 32x32, monochrome)

### Application Icons
- `logo.png` - Main logo (128x128 or larger)
- `logo.svg` - Vector logo (optional, for better scaling)

## Build Icons

For the build process, place these in the `build/` directory:

### Windows
- `icon.ico` - Windows application icon (256x256 recommended, multi-size)

### macOS
- `icon.icns` - macOS application icon (512x512 or larger, multi-size)

## Creating Icons

### Windows ICO
Use a tool like:
- ImageMagick: `convert logo.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico`
- Online converters or icon editors

### macOS ICNS
Use a tool like:
- `iconutil` (macOS built-in): Create `.iconset` folder and convert
- Online converters or icon editors

## Notes

- Icons should be high-quality and recognizable at small sizes
- Tray icons should work well on both light and dark backgrounds
- macOS tray icons should be monochrome templates for proper system integration

