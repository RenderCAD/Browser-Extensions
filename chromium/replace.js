const fs = require('fs');
const path = require('path');

function replaceInDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file === 'icons') continue;
            replaceInDir(fullPath);
        } else if (fullPath.match(/\.(js|html|json|md)$/) && file !== 'replace.js') {
            let content = fs.readFileSync(fullPath, 'utf8');
            let newContent = content.replace(/RenderCAD/g, 'RENDERCAD');
            if (content !== newContent) {
                fs.writeFileSync(fullPath, newContent, 'utf8');
                console.log('Updated ' + fullPath);
            }
        }
    }
}
replaceInDir(__dirname);
