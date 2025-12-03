const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, shell, dialog, Notification, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const FormData = require('form-data');
const fetch = require('node-fetch');

const store = new Store();

const RENDERCAD_BASE_URL = "https://rendercad.ai";
const DEBUG = false;

// Keep a global reference of the window object
let mainWindow = null;
let tray = null;
let captureWindow = null;
let isQuitting = false;

function debug(category, message, data = null) {
    if (DEBUG) {
        const timestamp = new Date().toISOString().substr(11, 8);
        const prefix = `[RenderCAD ${timestamp}] ${category}:`;
        if (data) {
            console.log(prefix, message, data);
        } else {
            console.log(prefix, message);
        }
    }
}

function createWindow() {
    // Get the display where the mouse cursor is located
    const cursorPoint = screen.getCursorScreenPoint();
    const mouseDisplay = screen.getDisplayNearestPoint(cursorPoint);
    const { width, height } = mouseDisplay.workAreaSize;

    mainWindow = new BrowserWindow({
        width: width,
        height: height,
        x: mouseDisplay.workArea.x,
        y: mouseDisplay.workArea.y,
        show: true, // Show window on startup
        frame: false,
        resizable: false,
        transparent: true,
        alwaysOnTop: false, // Don't keep on top
        skipTaskbar: false, // Show in taskbar
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../preload/capture-preload.js'),
            devTools: false // Disable DevTools in production
        }
    });

    // Load the capture.html which will show the render modal
    mainWindow.loadFile(path.join(__dirname, '../renderer/capture.html'));
    
    // Don't ignore mouse events - we'll handle click-through with CSS pointer-events
    mainWindow.setIgnoreMouseEvents(false);

    // Don't hide window on blur - keep it visible
    // mainWindow.on('blur', () => {
    //     if (!isQuitting) {
    //         mainWindow.hide();
    //     }
    // });

    // Show window in taskbar
    mainWindow.setSkipTaskbar(false);

    debug('WINDOW', 'Main window created');
}

function createTray() {
    // Create tray icon
    const iconPath = process.platform === 'win32' 
        ? path.join(__dirname, '../../assets/icons/tray-icon.png')
        : path.join(__dirname, '../../assets/icons/tray-iconTemplate.png');
    
    const icon = nativeImage.createFromPath(iconPath);
    
    if (process.platform === 'win32') {
        icon.setTemplateImage(false);
    }

    tray = new Tray(icon);

    // Create context menu
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show RenderCAD',
            click: () => {
                showWindow();
            }
        },
        {
            label: 'Capture & Render',
            click: () => {
                startCapture();
            }
        },
        { type: 'separator' },
        {
            label: 'Render Studio',
            click: () => {
                shell.openExternal('https://rendercad.ai/render');
            }
        },
        {
            label: 'View History',
            click: () => {
                shell.openExternal('https://rendercad.ai/history');
            }
        },
        {
            label: 'Settings',
            click: () => {
                shell.openExternal('https://rendercad.ai/settings');
            }
        },
        { type: 'separator' },
        {
            label: 'Logout',
            id: 'logout',
            click: () => {
                logout();
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('RenderCAD - AI CAD Renderer');
    tray.setContextMenu(contextMenu);

    // Show window on tray click
    tray.on('click', () => {
        showWindow();
    });

    // Update menu based on login state
    updateTrayMenu();

    debug('TRAY', 'Tray icon created');
}

function showWindow() {
    if (!mainWindow) {
        createWindow();
    }

    // Window is already fullscreen, just show it
    mainWindow.show();
    mainWindow.focus();
    // Don't ignore mouse events - we need them for the modal
    mainWindow.setIgnoreMouseEvents(false);
}

function startCapture() {
    if (captureWindow) {
        captureWindow.focus();
        return;
    }

    // Create a fullscreen transparent window for capture
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    captureWindow = new BrowserWindow({
        width: width,
        height: height,
        x: primaryDisplay.workArea.x,
        y: primaryDisplay.workArea.y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../preload/capture-preload.js')
        }
    });

    captureWindow.loadFile(path.join(__dirname, '../renderer/capture.html'));
    captureWindow.setIgnoreMouseEvents(false, { forward: true });
    captureWindow.setFullScreenable(false);
    
    // Don't close on blur - let the modal stay visible
    // The user can close it manually via the close button in the modal

    captureWindow.on('closed', () => {
        captureWindow = null;
    });

    debug('CAPTURE', 'Capture window created');
}

// IPC Handlers
ipcMain.handle('get-stored-token', async () => {
    return store.get('rendercad_token', null);
});

ipcMain.handle('store-token', async (event, token) => {
    store.set('rendercad_token', token);
    // await updateTrayMenu(); // No tray anymore
    return true;
});

ipcMain.handle('clear-token', async () => {
    store.delete('rendercad_token');
    store.delete('rendercad_user_info');
    // await updateTrayMenu(); // No tray anymore
    return true;
});

ipcMain.handle('get-user-info', async () => {
    return store.get('rendercad_user_info', null);
});

ipcMain.handle('get-asset-path', async (event, relativePath) => {
    const fs = require('fs');
    // In production, __dirname points to the app.asar or app directory
    // In development, it points to src/main
    let assetPath;
    if (app.isPackaged) {
        // Production: assets are in resources/app/assets or resources/app.asar/assets
        assetPath = path.join(process.resourcesPath, 'app', 'assets', relativePath);
        // If not found, try app.asar path
        if (!fs.existsSync(assetPath)) {
            assetPath = path.join(process.resourcesPath, 'app.asar', 'assets', relativePath);
        }
    } else {
        // Development: assets are in ../../assets from src/main
        assetPath = path.join(__dirname, '../../assets', relativePath);
    }
    
    debug('ASSET', 'Getting asset path', { relativePath, assetPath, exists: fs.existsSync(assetPath) });
    
    // Read file and return as data URL for security (file:// URLs are blocked in renderer)
    if (fs.existsSync(assetPath)) {
        const fileBuffer = fs.readFileSync(assetPath);
        const mimeType = relativePath.endsWith('.svg') ? 'image/svg+xml' : 
                        relativePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
        const base64 = fileBuffer.toString('base64');
        return `data:${mimeType};base64,${base64}`;
    }
    
    throw new Error(`Asset not found: ${relativePath} at ${assetPath}`);
});

ipcMain.handle('store-user-info', async (event, userInfo) => {
    store.set('rendercad_user_info', userInfo);
    return true;
});

ipcMain.handle('validate-token', async (event, token, storeInfo = true) => {
    try {
        debug('AUTH', 'Validating token');
        const response = await fetch(`${RENDERCAD_BASE_URL}/backend/auth.php?action=check`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            return false;
        }

        const data = await response.json();

        if (data.authenticated === true) {
            if (storeInfo && data.user) {
                await store.set('rendercad_user_info', {
                    email: data.user.email || data.user.id || 'User',
                    user_id: data.user.id,
                    plan: data.user.subscription_plan || 'free',
                    monthly_renders_used: data.user.monthly_renders_used || 0,
                    monthly_render_limit: data.user.monthly_render_limit || 0
                });
            }
            return true;
        }

        return false;
    } catch (error) {
        debug('AUTH', 'Token validation error', { error: error.message });
        return false;
    }
});

ipcMain.handle('request-device-code', async () => {
    try {
        // Use form-data package to match browser extension's FormData behavior
        const formData = new FormData();
        formData.append('app_name', 'RenderCAD Desktop App');
        formData.append('app_type', 'desktop');
        formData.append('app_version', '1.2.0');

        debug('AUTH', 'Requesting device code', { url: `${RENDERCAD_BASE_URL}/backend/auth.php?action=request_device_code` });

        // Use node-fetch which has proper form-data support
        const response = await fetch(`${RENDERCAD_BASE_URL}/backend/auth.php?action=request_device_code`, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders() // Sets Content-Type with boundary
        });

        if (!response.ok) {
            const errorText = await response.text();
            debug('AUTH', 'Device code request failed', { status: response.status, error: errorText });
            throw new Error(`Failed to request device code: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to get device code');
        }

        debug('AUTH', 'Device code received', { code: data.code, url: data.verification_url });
        return data;
    } catch (error) {
        console.error('Device code request failed:', error);
        debug('AUTH', 'Device code error details', { message: error.message, stack: error.stack });
        throw error;
    }
});

ipcMain.handle('poll-device-code', async (event, code) => {
    try {
        const response = await fetch(`${RENDERCAD_BASE_URL}/backend/auth.php?action=poll_device_code&code=${code}`);

        if (!response.ok) {
            return { status: 'pending' };
        }

        const data = await response.json();
        return data;
    } catch (error) {
        return { status: 'pending' };
    }
});

ipcMain.handle('open-external', async (event, url) => {
    await shell.openExternal(url);
});

ipcMain.handle('capture-screen', async (event, rect) => {
    try {
        // Hide the main window before capturing so it's not included in the screenshot
        let wasVisible = false;
        if (mainWindow && mainWindow.isVisible()) {
            wasVisible = true;
            mainWindow.hide();
            // Wait a brief moment for the window to fully hide
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        try {
            // Find which display contains the capture rect (use center point)
            const centerX = rect.x + rect.width / 2;
            const centerY = rect.y + rect.height / 2;
            const targetDisplay = screen.getDisplayNearestPoint({ x: centerX, y: centerY });
            const { scaleFactor, bounds } = targetDisplay;
            
            // Calculate actual screen size in device pixels
            const screenWidth = Math.round(bounds.width * scaleFactor);
            const screenHeight = Math.round(bounds.height * scaleFactor);
            
            // Use desktopCapturer to capture the actual screen, not the window
            // Request thumbnail at actual screen resolution
            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: screenWidth, height: screenHeight }
            });
            
            if (!sources || sources.length === 0) {
                throw new Error('No screen sources available');
            }
            
            // Find the source for the target display
            // Try to match by display_id first (more reliable)
            let targetSource = sources.find(source => source.display_id === targetDisplay.id);
            
            // Fallback: try to match by index if display_id doesn't work
            if (!targetSource) {
                const allDisplays = screen.getAllDisplays();
                const displayIndex = allDisplays.findIndex(d => d.id === targetDisplay.id);
                if (displayIndex >= 0 && displayIndex < sources.length) {
                    targetSource = sources[displayIndex];
                }
            }
            
            // Final fallback: use primary display source
            if (!targetSource) {
                targetSource = sources.find(source => source.id === 'screen:0:0') || sources[0];
            }
            
            if (!targetSource || !targetSource.thumbnail) {
                throw new Error('Failed to capture screen');
            }
        
        // Resize thumbnail to match actual screen size if needed
        let thumbnail = targetSource.thumbnail;
        const thumbSize = thumbnail.getSize();
        if (thumbSize.width !== screenWidth || thumbSize.height !== screenHeight) {
            thumbnail = thumbnail.resize({ width: screenWidth, height: screenHeight });
        }
        
        // Convert nativeImage to data URL
        const image = thumbnail.toDataURL('image/png');
        
            // The rect coordinates are relative to the target display's bounds
            // Convert from screen coordinates to display-relative coordinates
            const displayRelativeX = rect.x - bounds.x;
            const displayRelativeY = rect.y - bounds.y;
            
            // Return the full image and let the renderer handle cropping
            return { 
                success: true, 
                image, 
                rect: {
                    x: Math.round(displayRelativeX * scaleFactor),
                    y: Math.round(displayRelativeY * scaleFactor),
                    width: Math.round(rect.width * scaleFactor),
                    height: Math.round(rect.height * scaleFactor)
                },
                scaleFactor,
                displayBounds: bounds
            };
        } finally {
            // Restore window visibility if it was visible before
            if (wasVisible && mainWindow) {
                mainWindow.show();
            }
        }
    } catch (error) {
        debug('CAPTURE', 'Screenshot failed', { error: error.message });
        // Make sure window is shown even if there's an error
        if (mainWindow && !mainWindow.isVisible()) {
            mainWindow.show();
        }
        return { success: false, error: error.message };
    }
});

ipcMain.on('start-capture', () => {
    startCapture();
});

ipcMain.handle('send-to-rendercad', async (event, imageData, rect) => {
    try {
        const token = store.get('rendercad_token');
        if (!token) {
            throw new Error('AUTH_REQUIRED');
        }

        debug('RENDER', 'Submitting render request');

        // Submit render job using node-fetch
        const renderResponse = await fetch(
            `${RENDERCAD_BASE_URL}/backend/render.php?action=render`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    image: imageData,
                    quality: "standard"
                })
            }
        );

        if (!renderResponse.ok) {
            if (renderResponse.status === 429) {
                const errorText = await renderResponse.text();
                let errorData = {};
                try {
                    errorData = JSON.parse(errorText);
                } catch (e) {
                    errorData = { error: errorText };
                }
                throw new Error(`TOKEN_LIMIT_EXCEEDED:${errorData.used || 0}:${errorData.limit || 0}:${errorData.message || errorText}`);
            }
            throw new Error(`Render request failed: ${renderResponse.status}`);
        }

        const renderData = await renderResponse.json();

        if (!renderData.success || !renderData.job_id) {
            throw new Error(renderData.error || 'Failed to submit render job');
        }

        const jobId = renderData.job_id;
        debug('RENDER', 'Job submitted', { jobId });

        // Poll for completion
        return await pollRenderStatus(jobId);
    } catch (error) {
        debug('RENDER', 'Render failed', { error: error.message });
        throw error;
    }
});

async function pollRenderStatus(jobId) {
    const maxAttempts = 60;
    const pollInterval = 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const token = store.get('rendercad_token');
        
        const statusResponse = await fetch(
            `${RENDERCAD_BASE_URL}/backend/render.php?action=status&job_id=${jobId}`,
            {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            }
        );

        if (!statusResponse.ok) {
            if (statusResponse.status === 429) {
                const errorText = await statusResponse.text();
                let errorData = {};
                try {
                    errorData = JSON.parse(errorText);
                } catch (e) {
                    errorData = { error: errorText };
                }
                throw new Error(`TOKEN_LIMIT_EXCEEDED:${errorData.used || 0}:${errorData.limit || 0}:${errorData.message || errorText}`);
            }
            throw new Error(`Status check failed: ${statusResponse.status}`);
        }

        const statusData = await statusResponse.json();
        
        debug('RENDER', 'Status check', { attempt: attempt + 1, status: statusData.status, success: statusData.success });

        if (!statusData.success) {
            const errorMsg = statusData.error || statusData.message || 'Status check returned unsuccessful';
            debug('RENDER', 'Status check failed', { error: errorMsg, statusData });
            if (errorMsg.toLowerCase().includes('limit')) {
                throw new Error(`TOKEN_LIMIT_EXCEEDED:${statusData.used || 0}:${statusData.limit || 0}:${errorMsg}`);
            }
            throw new Error(errorMsg);
        }

        if (statusData.status === 'completed') {
            if (!statusData.output_url) {
                throw new Error('Render completed but no output URL provided');
            }
            // Handle both absolute URLs and relative paths
            let imageUrl = statusData.output_url;
            // Trim whitespace and check for absolute URLs
            imageUrl = imageUrl.trim();
            // Check if it's already an absolute URL (http://, https://, or //)
            if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('//')) {
                // Relative path, prepend base URL
                imageUrl = `${RENDERCAD_BASE_URL}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
            } else if (imageUrl.startsWith('//')) {
                // Protocol-relative URL, add https:
                imageUrl = `https:${imageUrl}`;
            }
            debug('RENDER', 'Render completed', { imageUrl });

            const imageResponse = await fetch(imageUrl, {
                method: 'GET',
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (!imageResponse.ok) {
                throw new Error(`Failed to fetch rendered image: ${imageResponse.status}`);
            }

            const blob = await imageResponse.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const dataUrl = `data:${blob.type};base64,${buffer.toString('base64')}`;

            return dataUrl;
        } else if (statusData.status === 'failed') {
            const errorMsg = statusData.error || statusData.message || 'Render job failed';
            debug('RENDER', 'Render job failed', { error: errorMsg, statusData });
            throw new Error(errorMsg);
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Render timeout - job did not complete in time');
}

ipcMain.handle('show-notification', async (event, options) => {
    if (Notification.isSupported()) {
        const notification = new Notification({
            title: options.title || 'RenderCAD',
            body: options.body || '',
            icon: path.join(__dirname, '../../assets/icons/logo.png')
        });
        notification.show();
    }
});

ipcMain.handle('close-capture-window', async () => {
    if (captureWindow) {
        captureWindow.close();
        captureWindow = null;
    }
});

ipcMain.handle('set-window-always-on-top', async (event, flag) => {
    if (mainWindow) {
        mainWindow.setAlwaysOnTop(flag);
    }
    return true;
});

ipcMain.handle('set-window-ignore-mouse-events', async (event, ignore, options) => {
    if (captureWindow) {
        captureWindow.setIgnoreMouseEvents(ignore, options);
    }
    // Also handle main window
    if (mainWindow) {
        mainWindow.setIgnoreMouseEvents(ignore, options);
    }
    return true;
});

ipcMain.handle('get-all-displays', async () => {
    const displays = screen.getAllDisplays();
    return displays.map(display => ({
        id: display.id,
        bounds: display.bounds,
        workArea: display.workArea,
        scaleFactor: display.scaleFactor,
        rotation: display.rotation,
        touchSupport: display.touchSupport
    }));
});

ipcMain.handle('get-display-at-point', async (event, x, y) => {
    const display = screen.getDisplayNearestPoint({ x, y });
    return {
        id: display.id,
        bounds: display.bounds,
        workArea: display.workArea,
        scaleFactor: display.scaleFactor,
        rotation: display.rotation,
        touchSupport: display.touchSupport
    };
});

ipcMain.handle('move-window-to-display', async (event, displayId) => {
    const displays = screen.getAllDisplays();
    const targetDisplay = displays.find(d => d.id === displayId);
    
    if (!targetDisplay) {
        return { success: false, error: 'Display not found' };
    }
    
    if (mainWindow) {
        const { width, height } = targetDisplay.workAreaSize;
        mainWindow.setBounds({
            x: targetDisplay.workArea.x,
            y: targetDisplay.workArea.y,
            width: width,
            height: height
        });
        return { success: true };
    }
    
    return { success: false, error: 'Main window not found' };
});

ipcMain.handle('get-display-for-rect', async (event, rect) => {
    // Find which display contains the center of the rect
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const display = screen.getDisplayNearestPoint({ x: centerX, y: centerY });
    
    return {
        id: display.id,
        bounds: display.bounds,
        workArea: display.workArea,
        scaleFactor: display.scaleFactor,
        rotation: display.rotation,
        touchSupport: display.touchSupport
    };
});

ipcMain.handle('create-zip-from-images', async (event, imageDataUrls) => {
    try {
        // Use adm-zip which is simpler and doesn't require streams
        const AdmZip = require('adm-zip');
        const zip = new AdmZip();
        
        // Add each image to the zip
        imageDataUrls.forEach((dataUrl, index) => {
            // Extract base64 data from data URL
            const base64Data = dataUrl.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            zip.addFile(`render-${index + 1}.png`, buffer);
        });
        
        // Generate zip as buffer
        const zipBuffer = zip.toBuffer();
        const zipBase64 = zipBuffer.toString('base64');
        const zipDataUrl = `data:application/zip;base64,${zipBase64}`;
        
        return { success: true, zipDataUrl, fileName: `rendercad-renders-${Date.now()}.zip` };
    } catch (error) {
        console.error('[RenderCAD] Error creating zip:', error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle('close-app', async () => {
    isQuitting = true;
    app.quit();
    return true;
});

ipcMain.on('close-window', () => {
    if (mainWindow) {
        mainWindow.hide();
    }
});

async function updateTrayMenu() {
    if (!tray) return;

    const token = store.get('rendercad_token');
    const isLoggedIn = token ? await validateToken(token, false) : false;

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show RenderCAD',
            click: () => showWindow()
        },
        {
            label: 'Capture & Render',
            click: () => startCapture()
        },
        { type: 'separator' },
        {
            label: 'Render Studio',
            click: () => shell.openExternal('https://rendercad.ai/render')
        },
        {
            label: 'View History',
            click: () => shell.openExternal('https://rendercad.ai/history')
        },
        {
            label: 'Settings',
            click: () => shell.openExternal('https://rendercad.ai/settings')
        },
        { type: 'separator' },
        {
            label: isLoggedIn ? 'Logout' : 'Login',
            id: 'logout',
            click: () => {
                if (isLoggedIn) {
                    logout();
                } else {
                    showWindow();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);
}

async function validateToken(token, storeInfo = true) {
    try {
        const response = await fetch(`${RENDERCAD_BASE_URL}/backend/auth.php?action=check`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            return false;
        }

        const data = await response.json();
        return data.authenticated === true;
    } catch (error) {
        return false;
    }
}

async function logout() {
    store.delete('rendercad_token');
    store.delete('rendercad_user_info');
    // await updateTrayMenu(); // No tray anymore
    
    if (Notification.isSupported()) {
        const notification = new Notification({
            title: 'Logged Out',
            body: 'You have been logged out from RenderCAD'
        });
        notification.show();
    }
}

// App event handlers
app.whenReady().then(() => {
    // Don't create system tray - just show the main window
    // createTray();
    createWindow();
    // Show the window on startup
    if (mainWindow) {
        mainWindow.show();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', (event) => {
    // On macOS, keep app running even when all windows are closed
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    isQuitting = true;
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        } else {
            createWindow();
            if (mainWindow) {
                mainWindow.show();
            }
        }
    });
}

