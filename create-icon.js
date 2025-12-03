const fs = require('fs');
const path = require('path');

// Create a simple 256x256 PNG using canvas or just copy and let electron-builder handle it
// For now, let's just check if we can use the existing icon
const iconPath = path.join(__dirname, 'build', 'icon.png');

if (fs.existsSync(iconPath)) {
    console.log('Icon exists at:', iconPath);
    // electron-builder will convert PNG to ICO automatically
    process.exit(0);
} else {
    console.error('Icon not found');
    process.exit(1);
}

