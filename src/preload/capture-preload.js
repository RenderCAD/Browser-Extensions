const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('captureAPI', {
    captureScreen: (rect) => ipcRenderer.invoke('capture-screen', rect),
    sendToRenderCAD: (imageData, rect) => ipcRenderer.invoke('send-to-rendercad', imageData, rect),
    closeCaptureWindow: () => ipcRenderer.invoke('close-capture-window'),
    showNotification: (options) => ipcRenderer.invoke('show-notification', options),
    setWindowAlwaysOnTop: (flag) => ipcRenderer.invoke('set-window-always-on-top', flag),
    setWindowIgnoreMouseEvents: (ignore, options) => ipcRenderer.invoke('set-window-ignore-mouse-events', ignore, options),
    closeApp: () => ipcRenderer.invoke('close-app'),
    getAllDisplays: () => ipcRenderer.invoke('get-all-displays'),
    getDisplayAtPoint: (x, y) => ipcRenderer.invoke('get-display-at-point', x, y),
    moveWindowToDisplay: (displayId) => ipcRenderer.invoke('move-window-to-display', displayId),
    getDisplayForRect: (rect) => ipcRenderer.invoke('get-display-for-rect', rect),
    createZipFromImages: (imageDataUrls) => ipcRenderer.invoke('create-zip-from-images', imageDataUrls)
});

// Also expose electronAPI for consistency with main renderer
contextBridge.exposeInMainWorld('electronAPI', {
    getStoredToken: () => ipcRenderer.invoke('get-stored-token'),
    storeToken: (token) => ipcRenderer.invoke('store-token', token),
    clearToken: () => ipcRenderer.invoke('clear-token'),
    getUserInfo: () => ipcRenderer.invoke('get-user-info'),
    storeUserInfo: (userInfo) => ipcRenderer.invoke('store-user-info', userInfo),
    validateToken: (token, storeInfo) => ipcRenderer.invoke('validate-token', token, storeInfo),
    requestDeviceCode: () => ipcRenderer.invoke('request-device-code'),
    pollDeviceCode: (code) => ipcRenderer.invoke('poll-device-code', code),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    getAssetPath: (relativePath) => ipcRenderer.invoke('get-asset-path', relativePath)
});

