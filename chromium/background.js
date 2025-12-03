// RenderCAD Background Script (Manifest V3)
const RENDERCAD_BASE_URL = "https://rendercad.ai";
const DEBUG = false; // Set to true to enable debug logging

// Clean, structured debug logger
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

debug('INIT', 'Background script loaded');

// Token validation cache (avoid DDoS)
let tokenValidationCache = {
    isValid: false,
    timestamp: 0,
    token: null
};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Token management functions
async function getStoredToken() {
    const result = await chrome.storage.local.get(['rendercad_token']);
    return result.rendercad_token || null;
}

async function storeToken(token) {
    await chrome.storage.local.set({ rendercad_token: token });
    await updateIconState(true);
}

async function clearToken() {
    console.log('[RenderCAD] Clearing token and user info');
    await chrome.storage.local.remove(['rendercad_token', 'rendercad_user_info']);
    // Clear validation cache
    tokenValidationCache = { isValid: false, timestamp: 0, token: null };
    console.log('[RenderCAD] Token cleared, updating icon to logged out state');
    await updateIconState(false);
}

async function getUserInfo() {
    const result = await chrome.storage.local.get(['rendercad_user_info']);
    return result.rendercad_user_info || null;
}

async function storeUserInfo(userInfo) {
    await chrome.storage.local.set({ rendercad_user_info: userInfo });
}

async function validateToken(token, storeInfo = true) {
    // Check cache first (avoid DDoS)
    const now = Date.now();
    if (tokenValidationCache.token === token &&
        tokenValidationCache.timestamp > 0 &&
        (now - tokenValidationCache.timestamp) < CACHE_DURATION) {
        debug('AUTH', 'Using cached validation result', {
            age: Math.round((now - tokenValidationCache.timestamp) / 1000) + 's',
            isValid: tokenValidationCache.isValid
        });
        return tokenValidationCache.isValid;
    }

    try {
        debug('AUTH', 'Validating token with backend', { tokenPrefix: token.substring(0, 8) + '...' });
        const response = await fetch(`${RENDERCAD_BASE_URL}/backend/auth.php?action=check`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            debug('AUTH', `Token validation failed with status ${response.status}`);
            tokenValidationCache = { isValid: false, timestamp: now, token };
            return false;
        }

        const data = await response.json();

        if (data.authenticated === true) {
            debug('AUTH', 'Token validated successfully', { email: data.user?.email });
            // Store user info if available and requested
            if (storeInfo && data.user) {
                await storeUserInfo({
                    email: data.user.email || data.user.id || 'User',
                    user_id: data.user.id,
                    plan: data.user.subscription_plan || 'free',
                    monthly_renders_used: data.user.monthly_renders_used || 0,
                    monthly_render_limit: data.user.monthly_render_limit || 0
                });
            }
            // Cache successful validation
            tokenValidationCache = { isValid: true, timestamp: now, token };
            return true;
        }

        debug('AUTH', 'Token validation returned false', { authenticated: data.authenticated });
        tokenValidationCache = { isValid: false, timestamp: now, token };
        return false;
    } catch (error) {
        debug('AUTH', 'Token validation error', { error: error.message });
        tokenValidationCache = { isValid: false, timestamp: now, token };
        return false;
    }
}

// Device code authentication flow
async function requestDeviceCode() {
    try {
        const formData = new FormData();
        formData.append('app_name', 'RenderCAD Browser Extension');
        formData.append('app_type', 'browser_extension');
        formData.append('app_version', '1.2.0');

        const response = await fetch(`${RENDERCAD_BASE_URL}/backend/auth.php?action=request_device_code`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Failed to request device code: ${response.status}`);
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to get device code');
        }

        return data;
    } catch (error) {
        console.error('Device code request failed:', error);
        throw error;
    }
}

async function pollForToken(code, pollInterval, expiresAt) {
    return new Promise((resolve, reject) => {
        const poll = async () => {
            if (Date.now() > expiresAt) {
                reject(new Error('Device code expired'));
                return;
            }

            try {
                const response = await fetch(`${RENDERCAD_BASE_URL}/backend/auth.php?action=poll_device_code&code=${code}`);

                if (!response.ok) {
                    setTimeout(poll, pollInterval);
                    return;
                }

                const data = await response.json();

                if (data.status === 'pending') {
                    setTimeout(poll, pollInterval);
                } else if (data.status === 'authorized') {
                    resolve(data.api_token);
                } else {
                    reject(new Error(data.message || 'Authentication failed'));
                }
            } catch (error) {
                setTimeout(poll, pollInterval);
            }
        };
        poll();
    });
}

async function authenticateUser() {
    try {
        debug('Starting device code authentication...');

        // Request device code
        const deviceCodeData = await requestDeviceCode();
        debug('Device code received:', deviceCodeData.code);

        // Open browser for user authentication
        await chrome.tabs.create({ url: deviceCodeData.verification_url });

        // Poll for token
        const expiresAt = Date.now() + (deviceCodeData.expires_in * 1000);
        const pollInterval = deviceCodeData.poll_interval * 1000;

        const token = await pollForToken(deviceCodeData.code, pollInterval, expiresAt);

        // Store the token
        await storeToken(token);
        debug('Authentication successful, token stored');

        return token;
    } catch (error) {
        console.error('Authentication failed:', error);
        throw error;
    }
}

// Icon state management (no badges)
async function updateIconState(isLoggedIn) {
    console.log('[RenderCAD] Updating icon state - isLoggedIn:', isLoggedIn);

    // Always keep badge empty (no overlays)
    await chrome.action.setBadgeText({ text: '' });

    // Set icon to grayscale when logged out, normal when logged in
    if (isLoggedIn) {
        console.log('[RenderCAD] Setting color icon');
        await chrome.action.setIcon({
            path: {
                "16": "icons/logo-16.png",
                "48": "icons/logo-48.png",
                "128": "icons/logo-128.png"
            }
        });
    } else {
        console.log('[RenderCAD] Setting greyscale icon');
        await chrome.action.setIcon({
            path: {
                "16": "icons/logo-grey-16.png",
                "48": "icons/logo-grey-48.png",
                "128": "icons/logo-grey-128.png"
            }
        });
    }
    console.log('[RenderCAD] Icon update complete');
}

// Check initial login state and update icon
async function checkInitialLoginState() {
    console.log('[RenderCAD] Checking initial login state');
    const token = await getStoredToken();
    console.log('[RenderCAD] Token found:', token ? 'YES' : 'NO');
    if (token) {
        console.log('[RenderCAD] Validating token...');
        const isValid = await validateToken(token);
        console.log('[RenderCAD] Token valid:', isValid);
        await updateIconState(isValid);
        if (!isValid) {
            await clearToken();
        }
    } else {
        console.log('[RenderCAD] No token, setting logged out state');
        await updateIconState(false);
    }
}

// Handle extension button click - open modal instead of popup
chrome.action.onClicked.addListener(async (tab) => {
    try {
        debug('ACTION', 'Extension button clicked, opening modal', { tabId: tab.id, url: tab.url });
        
        // Check if this is a page where we can inject scripts
        if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('moz-extension://'))) {
            console.warn('[RenderCAD] Cannot inject script on this page:', tab.url);
            return;
        }
        
        // Try to send message first (content script might already be loaded)
        chrome.tabs.sendMessage(tab.id, { action: 'openModal' }, (response) => {
            if (chrome.runtime.lastError) {
                debug('ACTION', 'Message send failed, injecting script', { error: chrome.runtime.lastError.message });
                // If message failed, inject script and try again
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                }).then(() => {
                    debug('ACTION', 'Script injected, waiting for initialization');
                    // Wait a bit for script to initialize, then send message
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tab.id, { action: 'openModal' }, (response) => {
                            if (chrome.runtime.lastError) {
                                console.error('[RenderCAD] Failed to open modal after injection:', chrome.runtime.lastError.message);
                            } else {
                                debug('ACTION', 'Modal opened successfully after injection');
                            }
                        });
                    }, 200);
                }).catch(err => {
                    console.error('[RenderCAD] Failed to inject script:', err);
                });
            } else {
                debug('ACTION', 'Modal opened successfully');
            }
        });
    } catch (error) {
        console.error('[RenderCAD] Failed to open modal:', error);
    }
});

chrome.runtime.onInstalled.addListener(() => {
    debug('RenderCAD extension installed');

    // Create context menu for logout
    chrome.contextMenus.create({
        id: 'logout',
        title: 'Logout from RenderCAD',
        contexts: ['action']
    });

    // Check initial login state
    checkInitialLoginState();
});

// Initialize on startup as well
chrome.runtime.onStartup.addListener(() => {
    checkInitialLoginState();
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'logout') {
        console.log('[RenderCAD] Logout menu item clicked');
        await clearToken();
        console.log('[RenderCAD] User logged out');

        // Show notification
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/logo.png',
            title: 'Logged Out',
            message: 'You have been logged out from RenderCAD'
        });
    }
});

// Get valid API token (authenticate if needed)
async function getValidApiToken() {
    debug('AUTH', 'Checking for valid API token');
    // Check for existing token
    let token = await getStoredToken();

    if (token) {
        debug('AUTH', 'Found stored token, validating...');
        // Validate existing token
        const isValid = await validateToken(token);
        if (isValid) {
            debug('AUTH', 'Stored token is valid');
            return token;
        } else {
            debug('AUTH', 'Stored token is invalid, clearing and re-authenticating');
            // Clear invalid token
            await clearToken();
        }
    } else {
        debug('AUTH', 'No stored token found');
    }

    // No valid token, authenticate user
    debug('AUTH', 'Starting authentication flow');
    return await authenticateUser();
}

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    debug('MESSAGE', `Received: ${message.action}`, message.tabId ? { tabId: message.tabId } : {});

    // Handle popup messages
    if (message.action === 'getUserInfo') {
        (async () => {
            const token = await getStoredToken();
            if (token) {
                const isValid = await validateToken(token);
                if (isValid) {
                    const userInfo = await getUserInfo();
                    sendResponse({ loggedIn: true, userInfo: userInfo || {} });
                } else {
                    await clearToken();
                    sendResponse({ loggedIn: false });
                }
            } else {
                sendResponse({ loggedIn: false });
            }
        })();
        return true; // Keep channel open for async response
    }

    if (message.action === 'logout') {
        (async () => {
            await clearToken();
            sendResponse({ success: true });
        })();
        return true;
    }

    if (message.action === 'login') {
        (async () => {
            try {
                await authenticateUser();
                sendResponse({ success: true });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    if (message.action === 'startCapture') {
        (async () => {
            try {
                debug('CAPTURE', 'Starting capture flow');
                // Ensure we have a valid token before proceeding
                await getValidApiToken();
                debug('CAPTURE', 'Token validated, injecting content script');

                // Trigger content script to capture screenshot
                await chrome.scripting.executeScript({
                    target: { tabId: message.tabId },
                    files: ['content.js']
                });

                // Send message to start screen capture
                debug('CAPTURE', 'Sending startScreenCapture message to tab');
                chrome.tabs.sendMessage(message.tabId, { action: 'startScreenCapture' });
                sendResponse({ success: true });
            } catch (error) {
                debug('CAPTURE', 'Capture flow failed', { error: error.message });
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    if (message.action === 'openModal') {
        (async () => {
            try {
                debug('MODAL', 'Opening render modal');
                // Inject content script if needed
                await chrome.scripting.executeScript({
                    target: { tabId: message.tabId },
                    files: ['content.js']
                });

                // Send message to open/show modal
                debug('MODAL', 'Sending openModal message to tab');
                chrome.tabs.sendMessage(message.tabId, { action: 'openModal' });
                sendResponse({ success: true });
            } catch (error) {
                debug('MODAL', 'Open modal failed', { error: error.message });
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    if (message.action === "captureScreen") {
        // Process asynchronously - don't use sendResponse callback
        // We'll send the result via chrome.tabs.sendMessage instead
        (async () => {
            try {
                debug("Processing captured area:", message.rect, "Job ID:", message.jobId);

                // Take screenshot of entire visible tab
                const fullScreenshotDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
                debug("Full screenshot taken, cropping to selection...");
                debug("Selection rect:", message.rect);

                // Get tab info to understand the coordinate system
                const tab = await chrome.tabs.get(sender.tab.id);
                debug("Tab info:", { width: tab.width, height: tab.height });
                
                // Get viewport dimensions from message (if provided) to calculate zoom
                const viewportWidth = message.viewportWidth || tab.width;
                const viewportHeight = message.viewportHeight || tab.height;

                // Crop the screenshot to the selected area
                const croppedDataUrl = await cropImage(fullScreenshotDataUrl, message.rect, tab, viewportWidth, viewportHeight);
                debug("Image cropped, sending to RenderCAD API...");

                // Send to RenderCAD API for processing
                const renderedImageUrl = await sendToRenderCAD(croppedDataUrl, message.rect);

                // Send the rendered image back to the content script for inline display
                console.log('[RenderCAD] Sending render result to content script, image size:', renderedImageUrl.length);
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: 'displayRenderedImage',
                    originalImage: croppedDataUrl,
                    renderedImage: renderedImageUrl,
                    rect: message.rect,
                    jobId: message.jobId
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('[RenderCAD] Failed to send message to content script:', chrome.runtime.lastError.message);
                    } else {
                        console.log('[RenderCAD] Content script acknowledged receipt');
                    }
                });
            } catch (err) {
                console.error("Error processing with RenderCAD API:", err);
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: 'renderError',
                    error: err.message,
                    jobId: message.jobId
                });
            }
        })();

        // Return false to indicate we won't use sendResponse
        return false;
    }

    if (message.action === "rerenderImage") {
        // Process asynchronously - don't use sendResponse callback
        // We'll send the result via chrome.tabs.sendMessage instead
        (async () => {
            try {
                debug("Re-rendering image from original data, Job ID:", message.jobId);

                // Use the provided image data directly (no screenshot needed)
                const imageDataUrl = message.imageData;
                debug("Image data received, sending to RenderCAD API...");

                // Send to RenderCAD API for processing
                const renderedImageUrl = await sendToRenderCAD(imageDataUrl, message.rect);

                // Send the rendered image back to the content script for inline display
                console.log('[RenderCAD] Sending re-render result to content script, image size:', renderedImageUrl.length);
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: 'displayRenderedImage',
                    originalImage: imageDataUrl,
                    renderedImage: renderedImageUrl,
                    rect: message.rect,
                    jobId: message.jobId
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('[RenderCAD] Failed to send message to content script:', chrome.runtime.lastError.message);
                    } else {
                        console.log('[RenderCAD] Content script acknowledged receipt');
                    }
                });
            } catch (err) {
                console.error("Error re-rendering with RenderCAD API:", err);
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: 'renderError',
                    error: err.message,
                    jobId: message.jobId
                });
            }
        })();

        // Return false to indicate we won't use sendResponse
        return false;
    }
});

// Function to crop image to selection area using Canvas
async function cropImage(imageDataUrl, rect, tab, viewportWidth, viewportHeight) {
    try {
        // Convert data URL to blob
        const response = await fetch(imageDataUrl);
        const blob = await response.blob();

        // Create an ImageBitmap from the blob (works in service workers)
        const imageBitmap = await createImageBitmap(blob);
        
        debug("Image bitmap dimensions:", imageBitmap.width, "x", imageBitmap.height);
        debug("Tab dimensions:", tab.width, "x", tab.height);
        debug("Viewport dimensions:", viewportWidth, "x", viewportHeight);
        debug("Selection rect:", rect);

        // Calculate scaling factor accounting for browser zoom
        // The screenshot is taken at device pixel ratio, but coordinates are in viewport pixels
        // If viewport is different from tab dimensions, that indicates zoom
        const zoomFactor = tab.width && viewportWidth ? (tab.width / viewportWidth) : 1;
        
        // Calculate scaling factor between viewport dimensions and screenshot dimensions
        // Screenshot dimensions are at device pixel ratio, viewport is at zoom level
        const scaleX = imageBitmap.width / viewportWidth;
        const scaleY = imageBitmap.height / viewportHeight;
        
        debug("Scale factors:", scaleX, scaleY);
        debug("Zoom factor:", zoomFactor);

        // The rect coordinates are in viewport pixels (which may be zoomed)
        // We need to convert them to actual screenshot pixels
        // Screenshot is always at device pixel ratio, so multiply by devicePixelRatio
        const cropRect = {
            x: Math.round(rect.x * scaleX),
            y: Math.round(rect.y * scaleY),
            width: Math.round(rect.width * scaleX),
            height: Math.round(rect.height * scaleY)
        };
        
        debug("Scaled crop rect:", cropRect);

        // Ensure the rectangle is within bounds
        cropRect.x = Math.max(0, Math.min(cropRect.x, imageBitmap.width - cropRect.width));
        cropRect.y = Math.max(0, Math.min(cropRect.y, imageBitmap.height - cropRect.height));
        cropRect.width = Math.min(cropRect.width, imageBitmap.width - cropRect.x);
        cropRect.height = Math.min(cropRect.height, imageBitmap.height - cropRect.y);

        // Create canvas with the size of the selection
        const canvas = new OffscreenCanvas(cropRect.width, cropRect.height);
        const ctx = canvas.getContext('2d');

        // Draw the cropped portion of the image
        // sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight
        ctx.drawImage(
            imageBitmap,
            cropRect.x, cropRect.y, cropRect.width, cropRect.height,  // Source rectangle (what to crop)
            0, 0, cropRect.width, cropRect.height                     // Destination rectangle (where to draw)
        );

        // Convert canvas to blob and then to data URL
        const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
        const dataUrl = await blobToDataURL(croppedBlob);

        return dataUrl;
    } catch (err) {
        throw new Error(`Failed to crop image: ${err.message}`);
    }
}

// Helper function to make authenticated API calls with auto re-auth
async function makeAuthenticatedRequest(url, options, retryCount = 0) {
    const token = await getStoredToken();

    if (!token && retryCount === 0) {
        // No token, need to authenticate
        throw new Error('AUTH_REQUIRED');
    }

    const response = await fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        }
    });

    // Handle auth errors with silent re-auth
    if ((response.status === 401 || response.status === 403) && retryCount === 0) {
        debug('Token invalid, attempting silent re-auth...');

        // Clear the bad token
        await clearToken();

        // Try to re-authenticate
        try {
            await authenticateUser();
            // Retry the request with new token
            return await makeAuthenticatedRequest(url, options, retryCount + 1);
        } catch (error) {
            // Re-auth failed, throw specific error
            throw new Error('AUTH_REQUIRED');
        }
    }

    return response;
}

// Function to send image to RenderCAD API
async function sendToRenderCAD(imageData, rect) {
    debug('RENDER', 'Submitting render request', {
        imageSize: `${(imageData.length / 1024).toFixed(0)}KB`,
        dimensions: `${rect.width}x${rect.height}`
    });

    try {
        // Submit render job with auto re-auth
        const renderResponse = await makeAuthenticatedRequest(
            `${RENDERCAD_BASE_URL}/backend/render.php?action=render`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    image: imageData,
                    quality: "standard"
                })
            }
        );

        if (!renderResponse.ok) {
            let errorText = '';
            let errorData = {};
            try {
                errorText = await renderResponse.text();
                // Try to parse as JSON
                try {
                    errorData = JSON.parse(errorText);
                } catch (e) {
                    // Not JSON, use as plain text
                    errorData = { error: errorText, message: errorText };
                }
            } catch (e) {
                errorText = 'Unknown error';
                errorData = {};
            }
            
            debug('RENDER', 'API returned error', {
                status: renderResponse.status,
                error: errorText.substring(0, 200),
                errorData: errorData
            });

            // Special handling for 429 Too Many Requests (token limit exceeded)
            if (renderResponse.status === 429) {
                // Check if it's a token limit error - check for exact error message or keywords
                const errorMsg = errorData.error || errorData.message || errorText || '';
                const errorLower = errorMsg.toLowerCase();
                if (errorData.error === 'Monthly render limit exceeded' || 
                    errorLower.includes('monthly render limit') || 
                    errorLower.includes('limit exceeded') ||
                    errorLower.includes('token') || 
                    errorLower.includes('monthly')) {
                    throw new Error(`TOKEN_LIMIT_EXCEEDED:${errorData.used || 0}:${errorData.limit || 0}:${errorData.message || errorMsg}`);
                }
                throw new Error(`Too Many Requests - Please wait a moment before submitting another render. The API has rate limits to prevent overload.`);
            }

            throw new Error(`RenderCAD render request failed: ${renderResponse.status} - ${renderResponse.statusText}`);
        }

        const renderData = await renderResponse.json();

        if (!renderData.success || !renderData.job_id) {
            const errorMsg = renderData.error || 'Failed to submit render job';
            debug('RENDER', 'Submission failed', { error: errorMsg });
            throw new Error(errorMsg);
        }

        const jobId = renderData.job_id;
        debug('RENDER', 'Job submitted successfully', { jobId });

        // Poll for completion
        return await pollRenderStatus(jobId);
    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            debug('RENDER', 'Authentication required, showing notification');
            // Show notification about session expiry
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/logo.png',
                title: 'Session Expired',
                message: 'Please log in again to continue using RenderCAD'
            });
        }
        throw error;
    }
}

// Function to poll render status until completion
async function pollRenderStatus(jobId) {
    const maxAttempts = 60; // 60 attempts
    const pollInterval = 2000; // 2 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        debug(`Polling render status (attempt ${attempt + 1}/${maxAttempts})...`);

        const statusResponse = await makeAuthenticatedRequest(
            `${RENDERCAD_BASE_URL}/backend/render.php?action=status&job_id=${jobId}`,
            {
                method: "GET"
            }
        );

        if (!statusResponse.ok) {
            // Check for 429 token limit error in status response
            if (statusResponse.status === 429) {
                let errorText = '';
                let errorData = {};
                try {
                    errorText = await statusResponse.text();
                    // Try to parse as JSON
                    try {
                        errorData = JSON.parse(errorText);
                    } catch (e) {
                        // Not JSON, use as plain text
                        errorData = { error: errorText, message: errorText };
                    }
                } catch (e) {
                    errorText = 'Monthly render limit reached';
                    errorData = {};
                }
                const errorMsg = errorData.error || errorData.message || errorText || 'Monthly render limit reached';
                throw new Error(`TOKEN_LIMIT_EXCEEDED:${errorData.used || 0}:${errorData.limit || 0}:${errorMsg}`);
            }
            throw new Error(`Status check failed: ${statusResponse.status}`);
        }

        const statusData = await statusResponse.json();
        debug('Status response:', statusData);

        if (!statusData.success) {
            // Check if error message indicates token limit
            const errorMsg = statusData.error || statusData.message || '';
            const errorLower = errorMsg.toLowerCase();
            if (statusData.error === 'Monthly render limit exceeded' ||
                errorLower.includes('monthly render limit') ||
                errorLower.includes('limit exceeded') ||
                errorLower.includes('token') || 
                errorLower.includes('monthly')) {
                throw new Error(`TOKEN_LIMIT_EXCEEDED:${statusData.used || 0}:${statusData.limit || 0}:${statusData.message || errorMsg}`);
            }
            throw new Error('Status check returned unsuccessful');
        }

        if (statusData.status === 'completed') {
            // API now returns full R2 CDN URLs (https://cdn.rendercad.ai/...)
            // Use directly if absolute, otherwise construct with base URL
            const imageUrl = statusData.output_url.startsWith('http')
                ? statusData.output_url
                : `${RENDERCAD_BASE_URL}${statusData.output_url}`;
            debug('Render completed, fetching from:', imageUrl);

            // Fetch the image and convert to data URL for inline display
            debug('Attempting to fetch image from URL:', imageUrl);

            // R2 CDN URLs are publicly accessible (no auth needed)
            const imageResponse = statusData.output_url.startsWith('http')
                ? await fetch(imageUrl, { method: 'GET', mode: 'cors' })
                : await makeAuthenticatedRequest(imageUrl, { method: 'GET', mode: 'cors' });

            debug('Image fetch response status:', imageResponse.status);
            debug('Image fetch response headers:', Object.fromEntries(imageResponse.headers.entries()));

            if (!imageResponse.ok) {
                const errorText = await imageResponse.text();
                console.error('Failed to fetch image:', errorText);
                throw new Error(`Failed to fetch rendered image: ${imageResponse.status} - ${errorText}`);
            }

            const blob = await imageResponse.blob();
            debug('Image blob size:', blob.size, 'type:', blob.type);

            if (blob.size === 0) {
                throw new Error('Received empty image from server');
            }

            // Validate that it's actually an image (allow empty type from R2 CDN)
            if (blob.type && !blob.type.startsWith('image/')) {
                console.error('Received non-image blob:', blob.type);
                throw new Error(`Received non-image data: ${blob.type}`);
            }

            const dataUrl = await blobToDataURL(blob);
            debug('Converted to data URL, length:', dataUrl.length);
            return dataUrl;
        } else if (statusData.status === 'failed') {
            throw new Error('Render job failed');
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Render timeout - job did not complete in time');
}

// Helper function to convert blob to data URL
function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

