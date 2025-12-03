const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Token management
    getStoredToken: () => ipcRenderer.invoke('get-stored-token'),
    storeToken: (token) => ipcRenderer.invoke('store-token', token),
    clearToken: () => ipcRenderer.invoke('clear-token'),
    
    // User info
    getUserInfo: () => ipcRenderer.invoke('get-user-info'),
    storeUserInfo: (userInfo) => ipcRenderer.invoke('store-user-info', userInfo),
    
    // Authentication
    validateToken: (token, storeInfo) => ipcRenderer.invoke('validate-token', token, storeInfo),
    requestDeviceCode: () => ipcRenderer.invoke('request-device-code'),
    pollDeviceCode: (code) => ipcRenderer.invoke('poll-device-code', code),
    
    // External links
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    
    // Notifications
    showNotification: (options) => ipcRenderer.invoke('show-notification', options),
    
    // Window controls
    closeWindow: () => ipcRenderer.send('close-window'),
    
    // Capture
    startCapture: () => ipcRenderer.send('start-capture'),
    captureScreen: (rect) => ipcRenderer.invoke('capture-screen', rect),
    sendToRenderCAD: (imageData, rect) => ipcRenderer.invoke('send-to-rendercad', imageData, rect),
    closeCaptureWindow: () => ipcRenderer.invoke('close-capture-window')
});

