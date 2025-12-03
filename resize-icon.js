const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const inputPath = path.join(__dirname, 'build', 'icon.png');
const outputPath = path.join(__dirname, 'build', 'icon-256.png');

if (!fs.existsSync(inputPath)) {
    console.error('Input icon not found:', inputPath);
    process.exit(1);
}

sharp(inputPath)
    .resize(256, 256, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .toFile(outputPath)
    .then(() => {
        console.log('Created 256x256 icon at:', outputPath);
        // Copy over the original
        fs.copyFileSync(outputPath, inputPath);
        console.log('Updated icon.png');
        process.exit(0);
    })
    .catch(err => {
        console.error('Error resizing icon:', err);
        process.exit(1);
    });

