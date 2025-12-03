// Guard against multiple injections
console.log('[RenderCAD] Script loading...');
if (typeof window.renderCADContentScriptLoaded === 'undefined') {
    window.renderCADContentScriptLoaded = true;
    console.log('[RenderCAD] Script guard passed, initializing...');

// Electron: Create render modal on startup (don't start capture)
function initializeModal() {
    console.log('[RenderCAD] Initializing modal...');
    try {
        // Create the render modal immediately so it's visible
        if (!loadingModalInstance) {
            console.log('[RenderCAD] Creating loading modal...');
            loadingModalInstance = createLoadingModal();
            console.log('[RenderCAD] Modal created:', loadingModalInstance);
        }
        // Make sure modal is visible
        if (loadingModalInstance) {
            loadingModalInstance.style.display = 'flex';
            loadingModalInstance.style.visibility = 'visible';
            loadingModalInstance.style.opacity = '1';
            loadingModalInstance.style.right = '20px';
            console.log('[RenderCAD] Modal should be visible now');
        } else {
            console.error('[RenderCAD] Failed to create modal instance');
        }
        
        // Set up click-through: ignore mouse events except where modal/overlay is
        setupClickThrough();
    } catch (error) {
        console.error('[RenderCAD] Error initializing modal:', error);
    }
}

// Check if DOM is already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeModal);
} else {
    // DOM is already loaded, initialize immediately
    initializeModal();
}

// Function to set up click-through behavior
function setupClickThrough() {
    // Initially, enable click-through when only modal is visible
    updateClickThrough();
}

// Function to check if a point is over the modal
function isPointOverModal(x, y) {
    if (!loadingModalInstance || loadingModalInstance.style.display === 'none') {
        return false;
    }
    const rect = loadingModalInstance.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

// Function to check if a point is over the overlay
function isPointOverOverlay(x, y) {
    if (!overlay) {
        return false;
    }
    const rect = overlay.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

// Function to check if a point is over any dropdown menu
function isPointOverDropdown(x, y) {
    // Check unpinned dropdown
    const unpinnedDropdown = document.querySelector('.rendercad-unpinned-options-dropdown');
    if (unpinnedDropdown && unpinnedDropdown.style.display === 'block') {
        const rect = unpinnedDropdown.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            return true;
        }
    }
    
    // Check pinned dropdown (it's appended to document.body, not the modal)
    const pinnedDropdown = document.querySelector('.rendercad-options-dropdown');
    if (pinnedDropdown && pinnedDropdown.style.display === 'block') {
        const rect = pinnedDropdown.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            return true;
        }
    }
    
    return false;
}

// Function to check if a point is over the fullscreen image overlay
function isPointOverFullscreen(x, y) {
    const fullscreenOverlay = document.getElementById('rendercad-result-overlay');
    if (fullscreenOverlay && fullscreenOverlay.style.display !== 'none' && fullscreenOverlay.style.opacity !== '0') {
        const rect = fullscreenOverlay.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            return true;
        }
    }
    return false;
}

// Function to check if a point is over any prompt/modal (sign-in, etc.)
function isPointOverPrompt(x, y) {
    // Check for sign-in prompt
    const signinPrompt = document.querySelector('.rendercad-signin-prompt');
    if (signinPrompt && signinPrompt.style.display !== 'none') {
        const rect = signinPrompt.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            return true;
        }
    }
    
    // Check for any other high z-index modals/prompts
    const allModals = document.querySelectorAll('[style*="z-index"]');
    for (const modal of allModals) {
        const zIndex = parseInt(window.getComputedStyle(modal).zIndex);
        if (zIndex >= 10000 && modal.style.display !== 'none') {
            const rect = modal.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                return true;
            }
        }
    }
    
    return false;
}

// Function to update click-through based on current state
function updateClickThrough() {
    if (!window.captureAPI || !window.captureAPI.setWindowIgnoreMouseEvents) {
        return;
    }
    
    // If overlay is active (capturing), we need all clicks to work
    if (isCapturing && overlay) {
        // Overlay is active - don't ignore mouse events, overlay needs clicks
        window.captureAPI.setWindowIgnoreMouseEvents(false);
        return;
    }
    
    // Check if any prompt/modal is visible (sign-in, etc.) - disable click-through completely
    const signinPrompt = document.querySelector('.rendercad-signin-prompt');
    const isPromptVisible = signinPrompt && signinPrompt.style.display !== 'none';
    
    // If modal is visible, we want clicks on modal to work but pass through elsewhere
    // We'll use a mousemove listener to dynamically enable/disable ignore mouse events
    if (loadingModalInstance && loadingModalInstance.style.display !== 'none') {
        // Check if dropdown is open or fullscreen overlay is visible - if so, disable click-through completely
        // Both dropdowns are appended to document.body, not the modal
        const unpinnedDropdown = document.querySelector('.rendercad-unpinned-options-dropdown');
        const pinnedDropdown = document.querySelector('.rendercad-options-dropdown');
        const fullscreenOverlay = document.getElementById('rendercad-result-overlay');
        const isDropdownOpen = (unpinnedDropdown && unpinnedDropdown.style.display === 'block') ||
                               (pinnedDropdown && pinnedDropdown.style.display === 'block');
        const isFullscreenOpen = fullscreenOverlay && fullscreenOverlay.style.display !== 'none' && 
                                fullscreenOverlay.style.opacity !== '0';
        
        if (isDropdownOpen || isFullscreenOpen || isPromptVisible) {
            // Dropdown, fullscreen, or prompt is open - disable click-through completely
            window.captureAPI.setWindowIgnoreMouseEvents(false);
        } else {
            // Set up mouse tracking to enable clicks on modal
            setupModalMouseTracking();
        }
    } else {
        // Check if fullscreen overlay or prompt is still visible even if modal is hidden
        const fullscreenOverlay = document.getElementById('rendercad-result-overlay');
        const isFullscreenOpen = fullscreenOverlay && fullscreenOverlay.style.display !== 'none' && 
                                fullscreenOverlay.style.opacity !== '0';
        if (isFullscreenOpen || isPromptVisible) {
            // Fullscreen or prompt is open - disable click-through completely
            window.captureAPI.setWindowIgnoreMouseEvents(false);
        } else {
            // Nothing visible - pass through all clicks
            window.captureAPI.setWindowIgnoreMouseEvents(true, { forward: true });
            removeModalMouseTracking();
        }
    }
}

let modalMouseTrackingHandler = null;

function setupModalMouseTracking() {
    // Remove existing handler if any
    removeModalMouseTracking();
    
    // Track mouse movement to enable clicks when over modal
    // Use both mousemove and mousedown for faster response
    modalMouseTrackingHandler = (e) => {
        const isOverModal = isPointOverModal(e.clientX, e.clientY);
        const isOverOverlay = isPointOverOverlay(e.clientX, e.clientY);
        const isOverDropdown = isPointOverDropdown(e.clientX, e.clientY);
        const isOverFullscreen = isPointOverFullscreen(e.clientX, e.clientY);
        const isOverPrompt = isPointOverPrompt(e.clientX, e.clientY);
        
        if (isOverModal || isOverOverlay || isOverDropdown || isOverFullscreen || isOverPrompt) {
            // Mouse is over modal, overlay, dropdown, fullscreen, or prompt - enable clicks
            window.captureAPI.setWindowIgnoreMouseEvents(false);
        } else {
            // Mouse is outside modal/overlay/dropdown/fullscreen/prompt - pass through clicks
            window.captureAPI.setWindowIgnoreMouseEvents(true, { forward: true });
        }
    };
    
    // Use both mousemove and mousedown for faster response (mousedown fires before click)
    document.addEventListener('mousemove', modalMouseTrackingHandler, { passive: true });
    document.addEventListener('mousedown', modalMouseTrackingHandler, { passive: true });
    // Also check on initial setup
    if (loadingModalInstance) {
        const rect = loadingModalInstance.getBoundingClientRect();
        // Assume mouse might be over modal initially
        window.captureAPI.setWindowIgnoreMouseEvents(false);
    }
}

function removeModalMouseTracking() {
    if (modalMouseTrackingHandler) {
        document.removeEventListener('mousemove', modalMouseTrackingHandler);
        document.removeEventListener('mousedown', modalMouseTrackingHandler);
        modalMouseTrackingHandler = null;
    }
}

let isCapturing = false;
let overlay = null;
let startX, startY, endX, endY;
let selectionBox = null;
let selectionDarkCore = null;
let selectionGlowTop = null;
let selectionGlowRight = null;
let selectionGlowBottom = null;
let selectionGlowLeft = null;
let cornerTopLeft = null;
let cornerTopRight = null;
let cornerBottomLeft = null;
let cornerBottomRight = null;
let moveIcon = null;
let darkenedTop = null;
let darkenedRight = null;
let darkenedBottom = null;
let darkenedLeft = null;
let aspectRatio = null; // null = free, or a number like 1 for 1:1, 1.777 for 16:9, etc.
let isRepositioning = false; // true when dragging to reposition a locked aspect ratio box
let isResizing = false; // true when resizing from a corner
let resizeCorner = null; // which corner is being resized: 'tl', 'tr', 'bl', 'br'
let repositionStartX, repositionStartY;
let boxLeft, boxTop, boxWidth, boxHeight;
let confirmButton = null;
let boxHoverArea = null;
let resizeObserver = null;
let windowResizeTimeout = null;
let resizeObserverTimeout = null;
let handleWindowResize = null;
let isUpdatingPosition = false; // Prevent concurrent position updates
let lastUpdateTime = 0; // Track last update to prevent thrashing

// Electron: Capture starts automatically when window loads
// Message handling is done via window.captureAPI instead of chrome.runtime

// Authentication check function
async function checkAuthentication() {
    try {
        if (!window.electronAPI || !window.electronAPI.getStoredToken) {
            return false;
        }
        const token = await window.electronAPI.getStoredToken();
        if (!token) {
            return false;
        }
        if (!window.electronAPI.validateToken) {
            return false;
        }
        const isValid = await window.electronAPI.validateToken(token, false);
        return isValid;
    } catch (error) {
        console.error('[RenderCAD] Authentication check error:', error);
        return false;
    }
}

// Function to show sign-in prompt
function showSignInPrompt() {
    const prompt = document.createElement('div');
    prompt.className = 'rendercad-signin-prompt';
    prompt.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.9);
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 8px;
        padding: 30px;
        color: white;
        font-family: 'Segoe UI', Arial, sans-serif;
        z-index: 2147483647;
        text-align: center;
        min-width: 300px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
        pointer-events: auto;
    `;
    
    prompt.innerHTML = `
        <h3 style="margin: 0 0 15px 0; font-size: 18px;">Sign In Required</h3>
        <p style="margin: 0 0 20px 0; font-size: 14px; opacity: 0.9;">Please sign in to use RenderCAD</p>
    `;
    
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; gap: 10px; justify-content: center; margin-top: 20px;';
    
    const signInBtn = document.createElement('button');
    signInBtn.textContent = 'Sign In';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    
    // Base button styles (matching other buttons)
    const buttonBaseStyle = {
        background: 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))',
        border: '1px solid rgba(255, 255, 255, 0.5)',
        color: 'white',
        padding: '8px 16px',
        borderRadius: '4px',
        cursor: 'pointer',
        fontFamily: "'Segoe UI', Arial, sans-serif",
        fontSize: '14px',
        fontWeight: '600',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        boxShadow: 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)',
        marginRight: '10px'
    };
    
    // Apply base styles to both buttons
    Object.assign(signInBtn.style, buttonBaseStyle);
    const cancelBtnStyle = { ...buttonBaseStyle };
    delete cancelBtnStyle.marginRight;
    Object.assign(cancelBtn.style, cancelBtnStyle);
    
    // Add hover effects (matching createIconButton)
    signInBtn.addEventListener('mouseenter', () => {
        signInBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
        signInBtn.style.borderColor = 'rgba(255, 255, 255, 0.7)';
        signInBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
    });
    
    signInBtn.addEventListener('mouseleave', () => {
        signInBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
        signInBtn.style.borderColor = 'rgba(255, 255, 255, 0.5)';
        signInBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)';
    });
    
    signInBtn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        signInBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.15), rgba(255,255,255,0.4), rgba(255,255,255,0.15))';
        signInBtn.style.boxShadow = 'inset 0 2px 2px rgba(0, 0, 0, 0.1), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4)';
        signInBtn.style.transform = 'scale(0.95)';
    });
    
    signInBtn.addEventListener('mouseup', () => {
        signInBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
        signInBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
        signInBtn.style.transform = 'scale(1)';
    });
    
    cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
        cancelBtn.style.borderColor = 'rgba(255, 255, 255, 0.7)';
        cancelBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
    });
    
    cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
        cancelBtn.style.borderColor = 'rgba(255, 255, 255, 0.5)';
        cancelBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)';
    });
    
    cancelBtn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        cancelBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.15), rgba(255,255,255,0.4), rgba(255,255,255,0.15))';
        cancelBtn.style.boxShadow = 'inset 0 2px 2px rgba(0, 0, 0, 0.1), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4)';
        cancelBtn.style.transform = 'scale(0.95)';
    });
    
    cancelBtn.addEventListener('mouseup', () => {
        cancelBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
        cancelBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
        cancelBtn.style.transform = 'scale(1)';
    });
    
    signInBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        prompt.remove();
        if (window.electronAPI) {
            try {
                const deviceCodeData = await window.electronAPI.requestDeviceCode();
                await window.electronAPI.openExternal(deviceCodeData.verification_url);
                
                // Poll for token
                const expiresAt = Date.now() + (deviceCodeData.expires_in * 1000);
                const pollInterval = deviceCodeData.poll_interval * 1000;
                
                const poll = async () => {
                    if (Date.now() > expiresAt) {
                        window.captureAPI.showNotification({ title: 'Authentication Expired', body: 'Please try again' });
                        return;
                    }
                    
                    try {
                        const result = await window.electronAPI.pollDeviceCode(deviceCodeData.code);
                        if (result.status === 'authorized') {
                            await window.electronAPI.storeToken(result.api_token);
                            window.captureAPI.showNotification({ title: 'Signed In', body: 'Successfully signed in to RenderCAD' });
                            if (loadingModalInstance) {
                                setTimeout(() => {
                                    if (typeof updateHamburgerMenu === 'function') {
                                        updateHamburgerMenu();
                                    }
                                    if (typeof updateTokenIndicator === 'function') {
                                        updateTokenIndicator();
                                    }
                                }, 1000);
                            }
                        } else if (result.status === 'pending') {
                            setTimeout(poll, pollInterval);
                        } else {
                            window.captureAPI.showNotification({ title: 'Authentication Failed', body: result.message || 'Please try again' });
                        }
                    } catch (error) {
                        setTimeout(poll, pollInterval);
                    }
                };
                poll();
            } catch (error) {
                console.error('[RenderCAD] Authentication error:', error);
                window.captureAPI.showNotification({ title: 'Authentication Error', body: error.message || 'Please try again' });
            }
        }
    });
    
    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        prompt.remove();
    });
    
    buttonContainer.appendChild(signInBtn);
    buttonContainer.appendChild(cancelBtn);
    prompt.appendChild(buttonContainer);
    document.body.appendChild(prompt);
}

function startScreenCapture() {
    if (isCapturing) return;
    
    // Check authentication before starting capture
    (async () => {
        const isAuthenticated = await checkAuthentication();
        if (!isAuthenticated) {
            showSignInPrompt();
            return;
        }
        
        // Backdrop layer removed - no longer needed
        
        // Update click-through when starting capture (overlay needs to receive clicks)
        updateClickThrough();

        // Only restore previous capture position if there are existing renders in the stack
        let savedPosition = null;
        if (renderedImages && renderedImages.length > 0) {
            try {
                const saved = localStorage.getItem('renderCAD_lastCapturePosition');
                if (saved) {
                    savedPosition = JSON.parse(saved);
                }
            } catch (e) {
                console.warn('Could not restore capture position:', e);
            }
        }

        // Reset all state variables
        isCapturing = true;
        isRepositioning = false;
        aspectRatio = savedPosition ? savedPosition.aspectRatio : null;
        boxLeft = savedPosition ? savedPosition.x : 0;
        boxTop = savedPosition ? savedPosition.y : 0;
        boxWidth = savedPosition ? savedPosition.width : 0;
        boxHeight = savedPosition ? savedPosition.height : 0;
        
        // Add CSS animation for prismatic glow and button styles
        const style = document.createElement('style');
        style.setAttribute('data-rendercad', 'true');
    style.textContent = `
        @keyframes prismaticGlowShift {
            0% {
                background-position: 0% 0%;
            }
            100% {
                background-position: 200% 0%;
            }
        }

        @keyframes prismaticGlowShiftReverse {
            0% {
                background-position: 200% 0%;
            }
            100% {
                background-position: 0% 0%;
            }
        }

        @keyframes prismaticGlowShiftVertical {
            0% {
                background-position: 0% 0%;
            }
            100% {
                background-position: 0% 200%;
            }
        }

        @keyframes prismaticGlowShiftVerticalReverse {
            0% {
                background-position: 0% 200%;
            }
            100% {
                background-position: 0% 0%;
            }
        }

        .rendercad-aspect-btn {
            background: linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05));
            border: 1px solid rgba(255,255,255,0.5);
            color: white;
            padding: 6px 12px;
            margin: 0 4px;
            border-radius: 4px;
            cursor: pointer;
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 12px;
            font-weight: 600;
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05),
                inset 0 -1px 1px rgba(255, 255, 255, 0.5),
                0 2px 4px rgba(0, 0, 0, 0.2);
            transition: all 0.2s ease;
        }

        .rendercad-aspect-btn:hover {
            background: linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1));
            box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05),
                inset 0 -1px 1px rgba(255, 255, 255, 0.5),
                0 2px 6px rgba(0, 0, 0, 0.3);
        }

        .rendercad-aspect-btn:active {
            background: linear-gradient(-75deg, rgba(255,255,255,0.15), rgba(255,255,255,0.4), rgba(255,255,255,0.15));
            box-shadow: inset 0 2px 2px rgba(0, 0, 0, 0.1),
                inset 0 -1px 1px rgba(255, 255, 255, 0.5),
                0 1px 3px rgba(0, 0, 0, 0.4);
            transform: scale(0.98);
        }

        .rendercad-aspect-btn.active {
            background: linear-gradient(-75deg, rgba(0,255,255,0.2), rgba(250,255,112,0.2), rgba(255,192,203,0.2));
            border: 1px solid rgba(0,255,255,0.8);
            box-shadow: 0 0 8px rgba(0,255,255,0.5),
                inset 0 1px 1px rgba(0, 0, 0, 0.05);
        }

        .rendercad-confirm-btn {
            position: fixed;
            top: 0;
            left: 0;
            background: linear-gradient(-75deg, rgba(0,255,100,0.2), rgba(100,255,100,0.3), rgba(0,255,100,0.2));
            border: 2px solid rgba(0,255,100,0.9);
            color: white;
            padding: 10px 20px;
            border-radius: 50%;
            cursor: pointer;
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 20px;
            font-weight: 600;
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            box-shadow: 0 0 12px rgba(0,255,100,0.6),
                inset 0 1px 1px rgba(0, 0, 0, 0.05),
                inset 0 -1px 1px rgba(255, 255, 255, 0.5);
            transition: all 0.2s ease;
            z-index: 1000010;
            width: 50px;
            height: 50px;
            display: flex;
            align-items: center;
            justify-content: center;
            will-change: transform;
        }

        .rendercad-confirm-btn:hover {
            background: linear-gradient(-75deg, rgba(0,255,100,0.3), rgba(100,255,100,0.4), rgba(0,255,100,0.3));
            box-shadow: 0 0 16px rgba(0,255,100,0.8),
                inset 0 1px 1px rgba(0, 0, 0, 0.05),
                inset 0 -1px 1px rgba(255, 255, 255, 0.5);
            transform: scale(1.05);
        }

        .rendercad-confirm-btn:active {
            background: linear-gradient(-75deg, rgba(0,255,100,0.4), rgba(100,255,100,0.5), rgba(0,255,100,0.4));
            box-shadow: 0 0 12px rgba(0,255,100,0.6),
                inset 0 2px 2px rgba(0, 0, 0, 0.1),
                inset 0 -1px 1px rgba(255, 255, 255, 0.5);
            transform: scale(0.95);
        }

        .rendercad-move-cursor {
            cursor: move !important;
        }

        .rendercad-corner {
            position: fixed;
            top: 0;
            left: 0;
            width: 80px;
            height: 80px;
            display: none;
            pointer-events: auto;
            z-index: 1000001;
            cursor: grab;
            will-change: transform;
        }

        .rendercad-corner::before,
        .rendercad-corner::after {
            content: '';
            position: absolute;
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(200, 255, 255, 0.9));
            box-shadow: 0 0 8px rgba(0, 255, 255, 0.8),
                0 2px 4px rgba(0, 0, 0, 0.4),
                inset 0 0 3px rgba(255, 255, 255, 0.6);
            transition: all 0.2s ease;
        }

        .rendercad-corner:hover::before,
        .rendercad-corner:hover::after {
            background: linear-gradient(135deg, rgba(0, 255, 255, 0.95), rgba(100, 255, 255, 0.9));
            box-shadow: 0 0 12px rgba(0, 255, 255, 1),
                0 2px 6px rgba(0, 0, 0, 0.5),
                inset 0 0 4px rgba(255, 255, 255, 0.8);
        }

        .rendercad-corner:hover {
            cursor: pointer;
        }

        /* Top-left corner cap - seamless L-shape with fully rounded ends */
        .rendercad-corner-tl::before {
            top: 26px;
            left: 26px;
            width: 4px;
            height: 18px;
            border-radius: 2px;
        }
        .rendercad-corner-tl::after {
            top: 26px;
            left: 26px;
            width: 18px;
            height: 4px;
            border-radius: 2px;
        }

        /* Top-right corner cap - seamless L-shape with fully rounded ends */
        .rendercad-corner-tr::before {
            top: 26px;
            right: 26px;
            width: 4px;
            height: 18px;
            border-radius: 2px;
        }
        .rendercad-corner-tr::after {
            top: 26px;
            right: 26px;
            width: 18px;
            height: 4px;
            border-radius: 2px;
        }

        /* Bottom-left corner cap - seamless L-shape with fully rounded ends */
        .rendercad-corner-bl::before {
            bottom: 26px;
            left: 26px;
            width: 4px;
            height: 18px;
            border-radius: 2px;
        }
        .rendercad-corner-bl::after {
            bottom: 26px;
            left: 26px;
            width: 18px;
            height: 4px;
            border-radius: 2px;
        }

        /* Bottom-right corner cap - seamless L-shape with fully rounded ends */
        .rendercad-corner-br::before {
            bottom: 26px;
            right: 26px;
            width: 4px;
            height: 18px;
            border-radius: 2px;
        }
        .rendercad-corner-br::after {
            bottom: 26px;
            right: 26px;
            width: 18px;
            height: 4px;
            border-radius: 2px;
        }

        .rendercad-box-hover-area {
            position: absolute;
            display: none;
            pointer-events: auto;
            z-index: 999999;
            cursor: grab;
        }

        .rendercad-box-hover-area:active {
            cursor: grabbing;
        }

        .rendercad-move-icon {
            position: absolute;
            width: 48px;
            height: 48px;
            display: none;
            pointer-events: none;
            z-index: 1000000;
            background: radial-gradient(circle, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 60%, transparent 100%);
            border-radius: 50%;
            border: 2px solid rgba(255, 255, 255, 0.8);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            box-shadow: 0 0 12px rgba(0, 0, 0, 0.5),
                inset 0 0 8px rgba(255, 255, 255, 0.2);
        }

        .rendercad-move-icon::before,
        .rendercad-move-icon::after {
            content: '';
            position: absolute;
            background: rgba(255, 255, 255, 0.95);
            box-shadow: 0 0 6px rgba(0, 255, 255, 0.8),
                0 0 3px rgba(0, 0, 0, 0.5);
        }

        /* Horizontal arrow */
        .rendercad-move-icon::before {
            top: 50%;
            left: 10px;
            right: 10px;
            height: 3px;
            transform: translateY(-50%);
            border-radius: 2px;
        }

        /* Vertical arrow */
        .rendercad-move-icon::after {
            left: 50%;
            top: 10px;
            bottom: 10px;
            width: 3px;
            transform: translateX(-50%);
            border-radius: 2px;
        }
    `;
    document.head.appendChild(style);
    
    // Use existing overlay from capture.html or create new one
    overlay = document.getElementById('overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'overlay';
        document.body.appendChild(overlay);
    }
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: transparent;
        z-index: 999999;
        cursor: crosshair;
        user-select: none;
        pointer-events: auto;
    `;

    // Create single darkened overlay with clip-path to cut out the selection box
    const darkenedOverlay = document.createElement('div');
    darkenedOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(30, 30, 30, 0.85);
        display: none;
        pointer-events: none;
        backdrop-filter: grayscale(100%);
        -webkit-backdrop-filter: grayscale(100%);
        z-index: 1;
        opacity: 0;
        transition: opacity 0.15s ease-out;
    `;

    // Keep references for compatibility (but won't be used)
    darkenedTop = darkenedOverlay;
    darkenedRight = document.createElement('div');
    darkenedRight.style.display = 'none';
    darkenedBottom = document.createElement('div');
    darkenedBottom.style.display = 'none';
    darkenedLeft = document.createElement('div');
    darkenedLeft.style.display = 'none';

    // Create selection box with layered border effect (like the divider)
    // Base white border
    selectionBox = document.createElement('div');
    selectionBox.style.cssText = `
        position: absolute;
        background: transparent;
        display: none;
        pointer-events: none;
        border: 2px solid rgba(255, 255, 255, 0.9);
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3) inset;
    `;

    // Dark core border for contrast on light backgrounds
    selectionDarkCore = document.createElement('div');
    selectionDarkCore.style.cssText = `
        position: absolute;
        background: transparent;
        display: none;
        pointer-events: none;
        border: 1px solid rgba(0, 0, 0, 0.4);
    `;

    // Animated prismatic glow borders (4 separate lines like the divider)
    const glowStyle = `
        position: absolute;
        display: none;
        pointer-events: none;
        background: linear-gradient(90deg, cyan, #faff70, pink, cyan, #00ff88, pink, cyan, #faff70, pink);
        background-size: 200% 100%;
        animation: prismaticGlowShift 3s linear infinite;
        filter: blur(2px);
        opacity: 0.9;
        z-index: 2;
    `;

    selectionGlowTop = document.createElement('div');
    selectionGlowTop.style.cssText = glowStyle + 'height: 4px; background: linear-gradient(90deg, cyan, #faff70, pink, cyan, #00ff88, pink, cyan, #faff70, pink); background-size: 200% 100%; animation: prismaticGlowShift 3s linear infinite;';

    selectionGlowRight = document.createElement('div');
    selectionGlowRight.style.cssText = glowStyle + 'width: 4px; background: linear-gradient(180deg, cyan, #faff70, pink, cyan, #00ff88, pink, cyan, #faff70, pink); background-size: 100% 200%; animation: prismaticGlowShiftVertical 3s linear infinite;';

    selectionGlowBottom = document.createElement('div');
    selectionGlowBottom.style.cssText = glowStyle + 'height: 4px; background: linear-gradient(90deg, cyan, #faff70, pink, cyan, #00ff88, pink, cyan, #faff70, pink); background-size: 200% 100%; animation: prismaticGlowShiftReverse 3s linear infinite;';

    selectionGlowLeft = document.createElement('div');
    selectionGlowLeft.style.cssText = glowStyle + 'width: 4px; background: linear-gradient(180deg, cyan, #faff70, pink, cyan, #00ff88, pink, cyan, #faff70, pink); background-size: 100% 200%; animation: prismaticGlowShiftVerticalReverse 3s linear infinite;';

    // Create corner indicators (caps on outside of corners)
    cornerTopLeft = document.createElement('div');
    cornerTopLeft.className = 'rendercad-corner rendercad-corner-tl';

    cornerTopRight = document.createElement('div');
    cornerTopRight.className = 'rendercad-corner rendercad-corner-tr';

    cornerBottomLeft = document.createElement('div');
    cornerBottomLeft.className = 'rendercad-corner rendercad-corner-bl';

    cornerBottomRight = document.createElement('div');
    cornerBottomRight.className = 'rendercad-corner rendercad-corner-br';

    // Create move icon (cross arrows in center)
    moveIcon = document.createElement('div');
    moveIcon.className = 'rendercad-move-icon';

    // Create hover area for pan cursor
    boxHoverArea = document.createElement('div');
    boxHoverArea.className = 'rendercad-box-hover-area';

    overlay.appendChild(selectionBox);
    overlay.appendChild(selectionDarkCore);
    overlay.appendChild(darkenedTop);
    overlay.appendChild(darkenedRight);
    overlay.appendChild(darkenedBottom);
    overlay.appendChild(darkenedLeft);
    overlay.appendChild(selectionGlowTop);
    overlay.appendChild(selectionGlowRight);
    overlay.appendChild(selectionGlowBottom);
    overlay.appendChild(selectionGlowLeft);
    overlay.appendChild(boxHoverArea);
    overlay.appendChild(cornerTopLeft);
    overlay.appendChild(cornerTopRight);
    overlay.appendChild(cornerBottomLeft);
    overlay.appendChild(cornerBottomRight);
    overlay.appendChild(moveIcon);

    // Add event listeners for corner resize
    function addCornerListeners(corner, cornerName) {
        corner.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            isResizing = true;
            resizeCorner = cornerName;
            repositionStartX = e.clientX;
            repositionStartY = e.clientY;
            // Disable button pointer events during resize to prevent interference
            if (confirmButton) {
                confirmButton.style.pointerEvents = 'none';
            }
        });
    }

    addCornerListeners(cornerTopLeft, 'tl');
    addCornerListeners(cornerTopRight, 'tr');
    addCornerListeners(cornerBottomLeft, 'bl');
    addCornerListeners(cornerBottomRight, 'br');
    
    // Create instructions
    const instructions = document.createElement('div');
    instructions.style.cssText = `
        position: absolute;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.85);
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 14px;
        z-index: 1000010;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
    `;
    instructions.innerHTML = `
        <div style="text-align: center;">
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 4px;">
                <img src="../assets/icons/logo.svg" alt="RenderCAD" style="width: 20px; height: 20px;" onerror="this.style.display='none'">
                <strong style="font-size: 16px;">RenderCAD Screen Capture</strong>
            </div>
            <div style="margin: 10px 0 8px 0;">Click and drag to select the CAD area to render</div>
            <div style="margin: 8px 0;">
                <strong style="font-size: 12px;">Aspect Ratio:</strong><br>
                <div style="margin-top: 8px;">
                    <button type="button" class="rendercad-aspect-btn ${aspectRatio === null ? 'active' : ''}" data-aspect="free">Free</button>
                    <button type="button" class="rendercad-aspect-btn ${aspectRatio === 1 ? 'active' : ''}" data-aspect="1">1:1</button>
                    <button type="button" class="rendercad-aspect-btn ${aspectRatio === 1.333 ? 'active' : ''}" data-aspect="1.333">4:3</button>
                    <button type="button" class="rendercad-aspect-btn ${aspectRatio === 1.777 ? 'active' : ''}" data-aspect="1.777">16:9</button>
                </div>
            </div>
            <small style="opacity: 0.8;">Press ESC to cancel</small>
        </div>
    `;

    // Prevent clicks on instructions from starting selection
    instructions.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });
    instructions.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    overlay.appendChild(instructions);

    // Add event listeners for aspect ratio buttons
    const aspectButtons = instructions.querySelectorAll('.rendercad-aspect-btn');
    aspectButtons.forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
        });
        btn.addEventListener('mouseup', (e) => {
            e.stopPropagation();
            e.preventDefault();
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            // Remove active class from all buttons
            aspectButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            btn.classList.add('active');
            // Set aspect ratio
            const aspect = btn.getAttribute('data-aspect');
            const newAspectRatio = aspect === 'free' ? null : parseFloat(aspect);

            // If switching aspect ratio and box already exists
            if (boxWidth > 0 && boxHeight > 0) {
                // Calculate center position of current box
                const centerX = boxLeft + (boxWidth / 2);
                const centerY = boxTop + (boxHeight / 2);

                if (newAspectRatio !== null) {
                    // Switching to locked aspect ratio - recalculate height and reposition from center
                    const newHeight = boxWidth / newAspectRatio;

                    // Reposition box to keep center point at same location
                    boxTop = Math.round(centerY - (newHeight / 2));
                    boxHeight = Math.round(newHeight);
                } else {
                    // Switching to free aspect ratio - round current values
                    boxLeft = Math.round(boxLeft);
                    boxTop = Math.round(boxTop);
                    boxWidth = Math.round(boxWidth);
                    boxHeight = Math.round(boxHeight);
                }

                // Update the selection box visual elements with current dimensions
                updateSelectionBox(boxLeft, boxTop, boxWidth, boxHeight);
            }

            aspectRatio = newAspectRatio;
        });
    });
    
    // Overlay already exists in capture.html, no need to append

    // Event listeners
    overlay.addEventListener('mousedown', startSelection);
    overlay.addEventListener('mousemove', updateSelection);
    overlay.addEventListener('mouseup', endSelection);
    document.addEventListener('keydown', handleKeyDown);

    // Create a reference to the confirm button for THIS capture instance
    // This prevents multiple captures from interfering with each other
    let localConfirmButtonRef = null;
    let localIsUpdating = false;
    let localLastUpdate = 0;

    // Unified debounced update function - prevents thrashing from multiple resize sources
    function debouncedUpdate() {
        // Prevent concurrent updates for THIS capture
        if (localIsUpdating) {
            return;
        }

        // Throttle updates to max 60fps (16.67ms) to prevent excessive redraws
        const now = performance.now();
        const timeSinceLastUpdate = now - localLastUpdate;

        if (timeSinceLastUpdate < 16) {
            // Too soon, skip this update
            return;
        }

        // Only update if we have an active selection AND the confirm button still exists in DOM
        if (boxWidth > 0 && boxHeight > 0 &&
            localConfirmButtonRef && document.body.contains(localConfirmButtonRef)) {

            localIsUpdating = true;
            localLastUpdate = now;

            requestAnimationFrame(() => {
                try {
                    // Update button position only for THIS button
                    updateLocalButtonPosition();
                } finally {
                    localIsUpdating = false;
                }
            });
        }
    }

    // Helper function to update ONLY this capture's button position
    function updateLocalButtonPosition() {
        if (!localConfirmButtonRef || !document.body.contains(localConfirmButtonRef)) {
            return; // Button was removed, stop updating
        }

        const buttonSize = 50;
        const margin = 20;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Default: bottom right of box, offset upward a bit
        let buttonX = boxLeft + boxWidth + margin;
        let buttonY = boxTop + boxHeight - buttonSize - margin;

        // If button would go off right edge, place it on the left
        if (buttonX + buttonSize > viewportWidth) {
            buttonX = boxLeft - buttonSize - margin;
        }

        // If still off left edge, place it inside on right
        if (buttonX < 0) {
            buttonX = boxLeft + boxWidth - buttonSize - margin;
        }

        // If button would go off bottom edge, adjust vertically
        if (buttonY + buttonSize > viewportHeight) {
            buttonY = viewportHeight - buttonSize - margin;
        }

        // If button would go off top edge, adjust vertically
        if (buttonY < margin) {
            buttonY = margin;
        }

        localConfirmButtonRef.style.transform = `translate(${buttonX}px, ${buttonY}px)`;
    }

    // Add robust window resize handler with longer debounce for stability
    handleWindowResize = function() {
        // Debounce to avoid excessive updates during resize
        if (windowResizeTimeout) {
            clearTimeout(windowResizeTimeout);
        }
        windowResizeTimeout = setTimeout(() => {
            debouncedUpdate();
        }, 100); // Increased to 100ms for better stability during rapid pin/unpin
    };
    window.addEventListener('resize', handleWindowResize, { passive: true });

    // ResizeObserver for DOM changes - more aggressive debouncing since it fires often
    try {
        resizeObserver = new ResizeObserver((entries) => {
            // Clear previous timeout
            if (resizeObserverTimeout) {
                clearTimeout(resizeObserverTimeout);
            }

            // Debounce ResizeObserver updates - it fires very frequently
            resizeObserverTimeout = setTimeout(() => {
                debouncedUpdate();
            }, 150); // Higher debounce since ResizeObserver fires very often
        });
        resizeObserver.observe(document.body);
    } catch (e) {
        console.warn('ResizeObserver not available:', e);
    }

    // visualViewport for toolbar pin/unpin - moderate debouncing
    let visualViewportTimeout = null;
    if (window.visualViewport) {
        const visualViewportHandler = () => {
            // Clear previous timeout
            if (visualViewportTimeout) {
                clearTimeout(visualViewportTimeout);
            }

            // Debounce visualViewport updates
            visualViewportTimeout = setTimeout(() => {
                debouncedUpdate();
            }, 100);
        };
        window.visualViewport.addEventListener('resize', visualViewportHandler, { passive: true });
        window.visualViewport.addEventListener('scroll', visualViewportHandler, { passive: true });

        // Store handler and timeout for cleanup
        window.renderCADVisualViewportHandler = visualViewportHandler;
        window.renderCADVisualViewportTimeout = visualViewportTimeout;
    }

    // If we have a saved position, restore the selection box and confirm button
    if (savedPosition && savedPosition.width > 0 && savedPosition.height > 0) {
        // Show all selection box layers
        selectionBox.style.display = 'block';
        selectionDarkCore.style.display = 'block';
        selectionGlowTop.style.display = 'block';
        selectionGlowRight.style.display = 'block';
        selectionGlowBottom.style.display = 'block';
        selectionGlowLeft.style.display = 'block';
        darkenedTop.style.display = 'block';

        // Update the selection box to the saved position
        updateSelectionBox(boxLeft, boxTop, boxWidth, boxHeight);

        // Trigger opacity transition after display is set
        requestAnimationFrame(() => {
            darkenedTop.style.opacity = '1';
        });

        // Create and show the confirm button
        showConfirmButton();
    }
    })();
}

function startSelection(e) {
    // Check if we're starting to reposition an existing box (only if clicking inside box area)
    if (boxWidth > 0) {
        const clickX = e.clientX;
        const clickY = e.clientY;

        // Check if click is inside the box
        if (clickX >= boxLeft && clickX <= boxLeft + boxWidth &&
            clickY >= boxTop && clickY <= boxTop + boxHeight) {
            isRepositioning = true;
            repositionStartX = e.clientX;
            repositionStartY = e.clientY;
            return;
        } else {
            // Clicking outside existing box - reset to start new selection
            boxWidth = 0;
            boxHeight = 0;
            boxLeft = 0;
            boxTop = 0;
            // Hide confirm button if it exists
            if (confirmButton) {
                confirmButton.remove();
                confirmButton = null;
            }
            // Reset opacity for smooth fade-in on new selection
            if (darkenedTop) {
                darkenedTop.style.opacity = '0';
            }
        }
    }

    startX = e.clientX;
    startY = e.clientY;

    // Show all selection box layers
    selectionBox.style.display = 'block';
    selectionBox.style.left = startX + 'px';
    selectionBox.style.top = startY + 'px';
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';

    selectionDarkCore.style.display = 'block';
    selectionDarkCore.style.left = startX + 'px';
    selectionDarkCore.style.top = startY + 'px';
    selectionDarkCore.style.width = '0px';
    selectionDarkCore.style.height = '0px';

    selectionGlowTop.style.display = 'block';
    selectionGlowRight.style.display = 'block';
    selectionGlowBottom.style.display = 'block';
    selectionGlowLeft.style.display = 'block';

    // Show darkened areas with smooth fade-in
    darkenedTop.style.display = 'block';
    darkenedRight.style.display = 'block';
    darkenedBottom.style.display = 'block';
    darkenedLeft.style.display = 'block';

    // Trigger opacity transition after display is set
    requestAnimationFrame(() => {
        darkenedTop.style.opacity = '1';
    });
}

function updateSelection(e) {
    if (!selectionBox || selectionBox.style.display === 'none') return;

    // Handle resize mode
    if (isResizing) {
        const deltaX = e.clientX - repositionStartX;
        const deltaY = e.clientY - repositionStartY;

        repositionStartX = e.clientX;
        repositionStartY = e.clientY;

        // Store original dimensions for aspect ratio calculation
        const oldWidth = boxWidth;
        const oldHeight = boxHeight;

        // Resize based on which corner is being dragged
        if (resizeCorner === 'tl') {
            // Top-left: resize from bottom-right anchor
            boxWidth -= deltaX;
            boxHeight = aspectRatio !== null ? boxWidth / aspectRatio : boxHeight - deltaY;
            // Reposition to keep bottom-right anchored
            boxLeft += oldWidth - boxWidth;
            boxTop += oldHeight - boxHeight;
        } else if (resizeCorner === 'tr') {
            // Top-right: resize from bottom-left anchor
            boxWidth += deltaX;
            boxHeight = aspectRatio !== null ? boxWidth / aspectRatio : boxHeight - deltaY;
            // Reposition to keep bottom-left anchored
            boxTop += oldHeight - boxHeight;
        } else if (resizeCorner === 'bl') {
            // Bottom-left: resize from top-right anchor
            boxWidth -= deltaX;
            boxHeight = aspectRatio !== null ? boxWidth / aspectRatio : boxHeight + deltaY;
            // Reposition to keep top-right anchored
            boxLeft += oldWidth - boxWidth;
        } else if (resizeCorner === 'br') {
            // Bottom-right: resize from top-left anchor
            boxWidth += deltaX;
            boxHeight = aspectRatio !== null ? boxWidth / aspectRatio : boxHeight + deltaY;
        }

        // Ensure minimum size and round all values
        if (boxWidth < 50) boxWidth = 50;
        if (boxHeight < 50) boxHeight = 50;

        boxLeft = Math.round(boxLeft);
        boxTop = Math.round(boxTop);
        boxWidth = Math.round(boxWidth);
        boxHeight = Math.round(boxHeight);

        updateSelectionBox(boxLeft, boxTop, boxWidth, boxHeight);
        return;
    }

    // Handle repositioning mode
    if (isRepositioning) {
        const deltaX = e.clientX - repositionStartX;
        const deltaY = e.clientY - repositionStartY;

        boxLeft = Math.round(boxLeft + deltaX);
        boxTop = Math.round(boxTop + deltaY);

        repositionStartX = e.clientX;
        repositionStartY = e.clientY;

        updateSelectionBox(boxLeft, boxTop, boxWidth, boxHeight);
        return;
    }

    // If box is already established (has a fixed size), don't update selection
    if (boxWidth > 0) {
        return;
    }

    endX = e.clientX;
    endY = e.clientY;

    let left = Math.min(startX, endX);
    let top = Math.min(startY, endY);
    let width = Math.abs(endX - startX);
    let height = Math.abs(endY - startY);

    // Apply aspect ratio constraint if set
    if (aspectRatio !== null && height > 0) {
        // Keep the width as dragged, adjust height to match aspect ratio
        height = width / aspectRatio;

        // Recalculate top based on drag direction
        top = endY < startY ? startY - height : startY;
    }

    updateSelectionBox(left, top, width, height);
}

function updateSelectionBox(left, top, width, height) {
    // Update all selection box layers
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';

    selectionDarkCore.style.left = left + 'px';
    selectionDarkCore.style.top = top + 'px';
    selectionDarkCore.style.width = width + 'px';
    selectionDarkCore.style.height = height + 'px';

    // Update four glow edges (offset by half the glow width to center on border)
    // Update all properties together to prevent partial renders
    const glowTopPos = top - 2;
    const glowBottomPos = top + height - 2;
    const glowRightPos = left + width - 2;
    const glowLeftPos = left - 2;

    // Update top glow
    selectionGlowTop.style.left = left + 'px';
    selectionGlowTop.style.top = glowTopPos + 'px';
    selectionGlowTop.style.width = width + 'px';
    selectionGlowTop.style.height = '4px';

    // Update right glow
    selectionGlowRight.style.left = glowRightPos + 'px';
    selectionGlowRight.style.top = top + 'px';
    selectionGlowRight.style.width = '4px';
    selectionGlowRight.style.height = height + 'px';

    // Update bottom glow
    selectionGlowBottom.style.left = left + 'px';
    selectionGlowBottom.style.top = glowBottomPos + 'px';
    selectionGlowBottom.style.width = width + 'px';
    selectionGlowBottom.style.height = '4px';

    // Update left glow
    selectionGlowLeft.style.left = glowLeftPos + 'px';
    selectionGlowLeft.style.top = top + 'px';
    selectionGlowLeft.style.width = '4px';
    selectionGlowLeft.style.height = height + 'px';

    // Update hover area and corner indicators (show when box exists)
    if (boxWidth > 0) {
        // Show and position hover area for pan cursor
        boxHoverArea.style.display = 'block';
        boxHoverArea.style.left = left + 'px';
        boxHoverArea.style.top = top + 'px';
        boxHoverArea.style.width = width + 'px';
        boxHoverArea.style.height = height + 'px';

        const cornerSize = 80;
        const cornerVisualOffset = 26; // Offset for the visual L-shape within the hit box

        // Position corners with larger hit boxes, visual L-shapes positioned at box corners
        cornerTopLeft.style.display = 'block';
        cornerTopLeft.style.transform = `translate(${left - cornerVisualOffset - 18}px, ${top - cornerVisualOffset - 18}px)`;

        cornerTopRight.style.display = 'block';
        cornerTopRight.style.transform = `translate(${left + width - cornerSize + cornerVisualOffset + 18}px, ${top - cornerVisualOffset - 18}px)`;

        cornerBottomLeft.style.display = 'block';
        cornerBottomLeft.style.transform = `translate(${left - cornerVisualOffset - 18}px, ${top + height - cornerSize + cornerVisualOffset + 18}px)`;

        cornerBottomRight.style.display = 'block';
        cornerBottomRight.style.transform = `translate(${left + width - cornerSize + cornerVisualOffset + 18}px, ${top + height - cornerSize + cornerVisualOffset + 18}px)`;

        // Show move icon in center of box
        moveIcon.style.display = 'block';
        moveIcon.style.left = (left + width / 2 - 24) + 'px';
        moveIcon.style.top = (top + height / 2 - 24) + 'px';
    } else {
        boxHoverArea.style.display = 'none';
        cornerTopLeft.style.display = 'none';
        cornerTopRight.style.display = 'none';
        cornerBottomLeft.style.display = 'none';
        cornerBottomRight.style.display = 'none';
        moveIcon.style.display = 'none';
    }

    // Update confirm button position if it exists (use transform for better performance)
    // Default position: middle right of the box
    if (confirmButton) {
        const buttonSize = 50;
        const margin = 20;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Default: bottom right of box, offset upward a bit
        let buttonX = left + width + margin;
        let buttonY = top + height - buttonSize - margin;

        // If button would go off right edge, place it on the left
        if (buttonX + buttonSize > viewportWidth) {
            buttonX = left - buttonSize - margin;
        }

        // If still off left edge, place it inside on right
        if (buttonX < 0) {
            buttonX = left + width - buttonSize - margin;
        }

        // If button would go off bottom edge, adjust vertically
        if (buttonY + buttonSize > viewportHeight) {
            buttonY = viewportHeight - buttonSize - margin;
        }

        // If button would go off top edge, adjust vertically
        if (buttonY < margin) {
            buttonY = margin;
        }

        confirmButton.style.transform = `translate(${buttonX}px, ${buttonY}px)`;
    }

    // Update darkened overlay using clip-path to cut out the selection box
    // This creates a perfect cutout with no gaps or overlaps
    const right = left + width;
    const bottom = top + height;

    // Create a clip-path that covers everything except the selection box
    // Uses polygon to create a frame around the box
    darkenedTop.style.clipPath = `polygon(
        0% 0%,
        100% 0%,
        100% 100%,
        ${right}px 100%,
        ${right}px ${top}px,
        ${left}px ${top}px,
        ${left}px ${bottom}px,
        ${right}px ${bottom}px,
        ${right}px 100%,
        0% 100%
    )`;
}

function endSelection(e) {
    if (!selectionBox || selectionBox.style.display === 'none') return;

    // If resizing, just stop
    if (isResizing) {
        isResizing = false;
        resizeCorner = null;
        // Re-enable button pointer events after resize
        if (confirmButton) {
            confirmButton.style.pointerEvents = 'auto';
        }
        return;
    }

    // If repositioning, just stop dragging
    if (isRepositioning) {
        isRepositioning = false;
        return;
    }

    let left = Math.min(startX, endX);
    let top = Math.min(startY, endY);
    let width = Math.abs(endX - startX);
    let height = Math.abs(endY - startY);

    // Apply aspect ratio constraint if set
    if (aspectRatio !== null && height > 0) {
        height = width / aspectRatio;
        // Recalculate top based on drag direction to keep box aligned with drag
        top = endY < startY ? startY - height : startY;
    }

    // If width and height are valid, enter reposition/resize mode
    if (width > 10 && height > 10) {
        boxLeft = Math.round(left);
        boxTop = Math.round(top);
        boxWidth = Math.round(width);
        boxHeight = Math.round(height);

        // Keep cursor as crosshair - move icon will show in center
        overlay.style.cursor = 'crosshair';

        // Show confirm button
        showConfirmButton();

        // Update selection to final size (with corners and move icon)
        updateSelectionBox(boxLeft, boxTop, boxWidth, boxHeight);
    }
}

function showConfirmButton() {
    if (confirmButton) return; // Already exists

    confirmButton = document.createElement('button');
    confirmButton.className = 'rendercad-confirm-btn';
    confirmButton.innerHTML = '✓';
    confirmButton.type = 'button';

    // CRITICAL: Store reference in the closure-scoped variable for resize listeners
    localConfirmButtonRef = confirmButton;

    confirmButton.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });

    confirmButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();

        // Store the capture rect before cleanup
        // Note: Coordinates are already in viewport pixels, background.js will handle zoom conversion
        const captureRect = {
            x: boxLeft,
            y: boxTop,
            width: boxWidth,
            height: boxHeight
        };

        // Save the capture position and aspect ratio to localStorage for next session
        try {
            localStorage.setItem('renderCAD_lastCapturePosition', JSON.stringify({
                x: boxLeft,
                y: boxTop,
                width: boxWidth,
                height: boxHeight,
                aspectRatio: aspectRatio
            }));
        } catch (e) {
            console.warn('Could not save capture position:', e);
        }

        // Clean up capture UI first (this hides all the selection elements)
        cleanup();

        // Wait longer for the UI to be fully removed and window to update
        // This ensures the overlay and selection boxes are gone before capture
        await new Promise(resolve => setTimeout(resolve, 300));

        // Then start the capture and show loading
        // The modal will be created and shown in captureArea -> showLoadingOverlay
        captureArea(captureRect);
    });

    document.body.appendChild(confirmButton);

    // Position it using smart positioning (will be set by updateSelectionBox)
    updateSelectionBox(boxLeft, boxTop, boxWidth, boxHeight);
}

function handleKeyDown(e) {
    if (e.key === 'Escape') {
        cleanup();
    }
}

function cleanup() {
    isCapturing = false;
    isRepositioning = false;
    isResizing = false;
    aspectRatio = null;
    isUpdatingPosition = false;
    lastUpdateTime = 0;

    // Clean up resize listeners and timeouts
    if (handleWindowResize) {
        window.removeEventListener('resize', handleWindowResize);
        handleWindowResize = null;
    }
    if (windowResizeTimeout) {
        clearTimeout(windowResizeTimeout);
        windowResizeTimeout = null;
    }
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    if (resizeObserverTimeout) {
        clearTimeout(resizeObserverTimeout);
        resizeObserverTimeout = null;
    }
    if (window.visualViewport && window.renderCADVisualViewportHandler) {
        window.visualViewport.removeEventListener('resize', window.renderCADVisualViewportHandler);
        window.visualViewport.removeEventListener('scroll', window.renderCADVisualViewportHandler);

        // Clear any pending timeout
        if (window.renderCADVisualViewportTimeout) {
            clearTimeout(window.renderCADVisualViewportTimeout);
            delete window.renderCADVisualViewportTimeout;
        }

        delete window.renderCADVisualViewportHandler;
    }

    if (overlay) {
        overlay.remove();
        overlay = null;
    }

    if (confirmButton) {
        confirmButton.remove();
        confirmButton = null;
    }

    // Clean up style element
    const existingStyle = document.querySelector('style[data-rendercad]');
    if (existingStyle) {
        existingStyle.remove();
    }
    document.removeEventListener('keydown', handleKeyDown);
    
    // Electron: Add a subtle background to the body so the modal is visible
    // The window is transparent, so we need some background for the modal to be visible
    document.body.style.backgroundColor = 'rgba(0, 0, 0, 0.01)';
    
    // Electron: Re-enable click-through after cleanup
    // The overlay is gone, so we can ignore mouse events again (modal will still work)
    updateClickThrough();
    
    // Clean up mouse tracking
    removeModalMouseTracking();
    
    // Show backdrop layer again after cleanup (if modal is still visible)
    if (loadingModalInstance && loadingModalInstance.style.display !== 'none') {
        const backdropLayer = document.getElementById('rendercad-modal-backdrop');
        if (backdropLayer) {
            backdropLayer.style.display = 'block';
        }
    }
}

async function captureArea(rect) {
    try {
        // Show loading overlay and get job ID
        const jobId = showLoadingOverlay();
        
        // Ensure modal is visible
        if (loadingModalInstance) {
            loadingModalInstance.style.display = 'flex';
            loadingModalInstance.style.visibility = 'visible';
        }

        // Electron: Capture screen and send to RenderCAD
        // Get viewport dimensions to help with zoom calculation
        captureAreaElectron(rect, jobId);
    } catch (error) {
        console.error('Error during capture:', error);
        if (jobId) {
            hideLoadingOverlay(jobId);
        }
        showRenderError(error.message);
    }
}

// Electron-specific capture function
async function captureAreaElectron(rect, jobId) {
    try {
        console.log('[RenderCAD] Starting capture with rect:', rect);
        
        // Ensure loading modal is created and visible
        if (!loadingModalInstance) {
            loadingModalInstance = createLoadingModal();
        }
        
        // Force modal to be visible
        if (loadingModalInstance) {
            loadingModalInstance.style.display = 'flex';
            loadingModalInstance.style.visibility = 'visible';
            loadingModalInstance.style.opacity = '1';
            loadingModalInstance.style.right = '20px';
            loadingModalInstance.style.pointerEvents = 'auto';
        }
        
        showLoadingBar();
        
        // Convert viewport coordinates to screen coordinates
        // rect is in viewport coordinates (relative to window), we need screen coordinates
        const screenRect = {
            x: window.screenX + rect.x,
            y: window.screenY + rect.y,
            width: rect.width,
            height: rect.height
        };
        
        console.log('[RenderCAD] Converted to screen coordinates:', screenRect);
        
        // Capture screen using Electron API
        console.log('[RenderCAD] Calling captureAPI.captureScreen...');
        const result = await window.captureAPI.captureScreen(screenRect);
        console.log('[RenderCAD] Capture result:', result.success ? 'Success' : result.error);
        
        if (!result.success) {
            throw new Error(result.error || 'Capture failed');
        }
        
        // Crop the image to the selected area
        console.log('[RenderCAD] Cropping image...');
        const croppedImage = await cropImage(result.image, result.rect, result.scaleFactor || 1);
        console.log('[RenderCAD] Image cropped, sending to RenderCAD...');
        
        // Send to RenderCAD API
        const renderedImage = await window.captureAPI.sendToRenderCAD(croppedImage, rect);
        console.log('[RenderCAD] Render complete, displaying image...');
        
        // Display the rendered image
        displayRenderedImage(croppedImage, renderedImage, rect, jobId);
        console.log('[RenderCAD] Image displayed');
    } catch (error) {
        console.error('[RenderCAD] Capture error:', error);
        hideLoadingOverlay(jobId);
        
        // Check if it's a token limit error
        if (error.message && error.message.startsWith('TOKEN_LIMIT_EXCEEDED:')) {
            const parts = error.message.split(':');
            const used = parts[1] || '0';
            const limit = parts[2] || '0';
            const message = parts.slice(3).join(':') || 'Monthly render limit reached';
            showTokenLimitModal(message, used, limit);
        } else {
            showRenderError(error.message || 'An error occurred during rendering', jobId);
        }
    }
}

// Helper function to crop image
function cropImage(imageDataUrl, rect, scaleFactor) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = rect.width;
            canvas.height = rect.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = imageDataUrl;
    });
}

let renderJobId = 0; // Unique ID for each render job
let loadingModalInstance = null; // Single modal instance for all renders
let glowAnimationFrame = null; // Store animation frame ID
let renderedImages = []; // Store all rendered images for download all
let originalImages = []; // Store original images for toggle functionality
let isExpanded = false; // Track whether preview images are expanded or collapsed

// Move applyModalState outside createLoadingModal so it's accessible globally
function applyModalState(modal, isPinned, isExpanded) {
    if (!modal) return;
    
    // STEP 1: Clean slate - remove interfering styles and elements
    // DON'T remove rendercad-pinned-style if staying pinned (it has our CSS rules)
    ['rendercad-modal-lock', 'rendercad-unpin-override'].forEach(id => {
        const elem = document.getElementById(id);
        if (elem) elem.remove();
    });

    // Only remove pinned-style if unpinning
    if (!isPinned) {
        const pinnedStyle = document.getElementById('rendercad-pinned-style');
        if (pinnedStyle) pinnedStyle.remove();
    }

    ['width', 'min-width', 'max-width', 'height', 'min-height', 'max-height', 'padding'].forEach(prop => {
        modal.style.removeProperty(prop);
    });

    modal.removeAttribute('data-lock-style');

    // STEP 2: Apply pinned/unpinned state
    if (isPinned) {
        modal.setAttribute('data-pinned', 'true');
        modal.style.setProperty('width', '60px', 'important');
        modal.style.setProperty('min-width', '60px', 'important');
        modal.style.setProperty('max-width', '60px', 'important');
        modal.style.setProperty('padding', '0', 'important');

        // Height depends on whether images are expanded
        if (isExpanded) {
            modal.style.setProperty('height', 'auto', 'important');
            modal.style.setProperty('min-height', '60px', 'important');
            modal.style.setProperty('max-height', 'none', 'important');
        } else {
            modal.style.setProperty('height', '60px', 'important');
            modal.style.setProperty('min-height', '60px', 'important');
            modal.style.setProperty('max-height', '60px', 'important');
        }
    } else {
        modal.removeAttribute('data-pinned');
        modal.style.setProperty('width', '400px', 'important');
        modal.style.setProperty('min-width', '400px', 'important');
        modal.style.setProperty('max-width', '400px', 'important');
        modal.style.setProperty('height', 'auto', 'important');
        modal.style.setProperty('min-height', 'auto', 'important');
        modal.style.setProperty('max-height', 'none', 'important');
        
        // Restore divider visibility when unpinning
        const divider = modal.querySelector('.rendercad-divider');
        if (divider) {
            divider.style.display = 'block';
        }
    }

    void modal.offsetHeight; // Force reflow

    // STEP 3: Update preview container
    const previewContainer = modal.querySelector('.rendercad-preview-container');
    if (previewContainer) {
        if (isPinned) {
            // Pinned mode
            if (isExpanded) {
                previewContainer.style.display = 'flex';
                previewContainer.style.maxHeight = '60vh';
                previewContainer.style.opacity = '1';
            } else {
                previewContainer.style.maxHeight = '0';
                previewContainer.style.opacity = '0';
                setTimeout(() => previewContainer.style.display = 'none', 300);
            }
        } else {
            // Unpinned mode
            if (isExpanded) {
                previewContainer.style.display = 'flex';
                previewContainer.style.maxHeight = '60vh';
                previewContainer.style.opacity = '1';
            } else {
                // Start hidden if collapsed
                previewContainer.style.maxHeight = '0';
                previewContainer.style.opacity = '0';
                setTimeout(() => previewContainer.style.display = 'none', 300);
            }
        }
    }
    
    // STEP 4: Update toggle bar visibility
    // Only show toggle bar if there are images present (not while rendering if no images yet)
    const toggleBar = modal.querySelector('.rendercad-toggle-bar');
    if (toggleBar) {
        const hasImages = renderedImages && renderedImages.length > 0;
        // Only show if images exist - don't show while rendering if no images yet
        if (hasImages) {
            toggleBar.style.display = 'flex';
            toggleBar.style.visibility = 'visible';
        } else {
            toggleBar.style.display = 'none';
            toggleBar.style.visibility = 'hidden';
        }
    }
    
    // STEP 5: Show/hide circular loader based on active renders
    const activeRenders = parseInt(modal.getAttribute('data-active-renders') || '0');
    const circularLoader = modal.querySelector('.rendercad-circular-loader');
    if (circularLoader) {
        if (activeRenders > 0) {
            // Show loader if there are active renders
            // Position based on pinned state
            if (isPinned) {
                circularLoader.style.top = '4px';
                circularLoader.style.left = '50%';
                circularLoader.style.transform = 'translateX(-50%)';
                circularLoader.style.animation = 'rendercad-spin 1s linear infinite';
            } else {
                circularLoader.style.top = '50%';
                circularLoader.style.left = '50%';
                circularLoader.style.transform = 'translate(-50%, -50%)';
                circularLoader.style.animation = 'rendercad-spin-centered 1s linear infinite';
            }
            circularLoader.style.display = 'block';
        } else {
            // Hide loader only if no active renders
            circularLoader.style.display = 'none';
            circularLoader.style.animation = 'none';
        }
    }
    
    // Also ensure loading bar is shown if there are active renders
    if (activeRenders > 0 && typeof showLoadingBar === 'function') {
        showLoadingBar();
    }
}
let tokenUpdateInterval = null; // Token update interval for cleanup

function showLoadingOverlay() {
    const jobId = ++renderJobId;

    // Create modal on first render, reuse for subsequent renders
    if (!loadingModalInstance) {
        loadingModalInstance = createLoadingModal();
        // Force modal to be visible immediately
        if (loadingModalInstance) {
            loadingModalInstance.style.display = 'flex';
            loadingModalInstance.style.visibility = 'visible';
            loadingModalInstance.style.opacity = '1';
            loadingModalInstance.style.right = '20px';
            loadingModalInstance.style.pointerEvents = 'auto';
        }
    }

    // Mark that we have an active render
    const activeRenders = parseInt(loadingModalInstance.getAttribute('data-active-renders') || 0) + 1;
    loadingModalInstance.setAttribute('data-active-renders', activeRenders);

    // Ensure modal is visible
    if (loadingModalInstance) {
        loadingModalInstance.style.display = 'flex';
        loadingModalInstance.style.visibility = 'visible';
        loadingModalInstance.style.opacity = '1';
        loadingModalInstance.style.right = '20px';
    }

    // Show loading bar if starting a new render
    if (activeRenders > 0) {
        showLoadingBar();
    }

    // Update queue counter
    updateQueueCounter();

    return jobId;
}

function createLoadingModal() {
    console.log('[RenderCAD] createLoadingModal called');
    try {
        // Inject Font Awesome if not already loaded
        if (!document.querySelector('link[href*="font-awesome"]')) {
            const faLink = document.createElement('link');
            faLink.rel = 'stylesheet';
            faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
            document.head.appendChild(faLink);
        }

        const loadingModal = document.createElement('div');
    loadingModal.className = 'rendercad-loading-modal';
    loadingModal.setAttribute('data-active-renders', '0');
    
    // Don't create backdrop layer - it dims the entire screen
    // Remove any existing backdrop layer
    let backdropLayer = document.getElementById('rendercad-modal-backdrop');
    if (backdropLayer) {
        backdropLayer.remove();
    }
    
    // Start modal visible immediately at correct position
    // Use a darker background with blur for better visibility
    loadingModal.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #141414;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 8px;
        padding: 0;
        color: white;
        font-family: 'Segoe UI', Arial, sans-serif;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5),
                    0 0 8px rgba(0, 255, 255, 0.15);
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        gap: 0;
        width: 400px;
        user-select: none;
        opacity: 1;
        visibility: visible;
        pointer-events: auto !important;
    `;
    
    // Update click-through when modal is created
    setTimeout(() => {
        updateClickThrough();
    }, 100);

    // Header: Logo and title (draggable)
    const header = document.createElement('div');
    header.className = 'rendercad-modal-header';
    header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 12px;
        pointer-events: auto;
        cursor: move;
        position: relative;
        width: 100%;
        min-height: 50px;
        padding: 18px 8px 12px 8px;
        margin: 0 0 12px 0;
    `;

    const headerContent = document.createElement('div');
    headerContent.style.cssText = `
        display: flex;
        align-items: center;
        gap: 2px;
        justify-content: center;
        pointer-events: none;
        cursor: default;
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: auto;
    `;

    // Logo wrapper with TM symbol
    const logoWrapper = document.createElement('span');
    logoWrapper.style.cssText = `
        position: relative;
        display: inline-block;
        margin-right: 0.25rem;
        width: 40.128px;
        height: 33.44px;
    `;

    const logo = document.createElement('img');
    // Use Electron API to get asset path, or fallback to relative path
    if (window.electronAPI && window.electronAPI.getAssetPath) {
        window.electronAPI.getAssetPath('icons/logo.svg').then(logoPath => {
            console.log('[RenderCAD] Logo path received');
            logo.src = logoPath; // Data URL format
        }).catch((err) => {
            console.error('[RenderCAD] Failed to get logo path:', err);
            // Fallback to relative path
            logo.src = '../assets/icons/logo.svg';
        });
    } else {
        logo.src = '../assets/icons/logo.svg';
    }
    logo.alt = 'RenderCAD';
    logo.style.cssText = `
        width: 40.128px;
        height: 33.44px;
        image-rendering: -webkit-optimize-contrast;
        image-rendering: crisp-edges;
        pointer-events: none;
        user-select: none;
        -webkit-user-drag: none;
        vertical-align: middle;
        display: block;
        position: relative;
    `;
    logo.onerror = function() {
        console.error('Failed to load logo.svg, trying PNG fallback');
        if (window.electronAPI && window.electronAPI.getAssetPath) {
            window.electronAPI.getAssetPath('icons/logo.png').then(logoPath => {
                this.src = logoPath; // Already in file:// format
            }).catch(() => {
                this.style.display = 'none';
            });
        } else {
            this.src = '../assets/icons/logo.png';
            this.onerror = function() { this.style.display = 'none'; };
        }
    };
    logo.setAttribute('draggable', 'false');

    // TM symbol for logo - same size as text TM (text is 28.8px, TM is 0.65em = 18.72px)
    // Account for device pixel ratio to prevent scaling on high-DPI screens
    const devicePixelRatio = window.devicePixelRatio || 1;
    const logoTm = document.createElement('sup');
    logoTm.className = 'tm';
    logoTm.textContent = '™';
    logoTm.style.cssText = `
        position: absolute;
        top: 32.4px;
        right: -2px;
        font-size: ${19.5624 / devicePixelRatio}px;
        line-height: 0;
        font-family: 'Proxima Nova Thin', 'Inter', sans-serif;
        font-weight: 300;
        opacity: 0.9;
        color: #f50057;
        text-shadow: 0 0 4px rgba(0, 0, 0, 0.4);
    `;

    logoWrapper.appendChild(logo);
    logoWrapper.appendChild(logoTm);

    // Title with TM symbol
    // Account for device pixel ratio to prevent scaling on high-DPI screens
    const titleWrapper = document.createElement('span');
    titleWrapper.style.cssText = `
        font-family: 'Proxima Nova Thin', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-weight: 300;
        font-size: ${30.096 / devicePixelRatio}px;
        letter-spacing: -0.01em;
        line-height: 1;
        position: relative;
    `;
    
    const title = document.createTextNode('RenderCAD');
    const titleTm = document.createElement('sup');
    titleTm.className = 'tm';
    titleTm.textContent = '™';
    titleTm.style.cssText = `
        font-family: 'Proxima Nova Thin', 'Inter', sans-serif;
        font-size: 0.65em;
        font-weight: 300;
        vertical-align: baseline;
        position: relative;
        top: -0.3em;
        margin-left: 0.1em;
        line-height: 0;
        opacity: 0.9;
    `;

    titleWrapper.appendChild(title);
    titleWrapper.appendChild(titleTm);

    headerContent.appendChild(logoWrapper);
    headerContent.appendChild(titleWrapper);

    // Helper function to create icon buttons
    function createIconButton(iconClass, onClick, title) {
        const btn = document.createElement('button');
        btn.innerHTML = `<i class="${iconClass}"></i>`;
        btn.title = title;
        btn.style.cssText = `
        position: absolute;
        top: 6px;
            background: linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05));
        border: 1px solid rgba(255, 255, 255, 0.5);
        color: white;
            width: 24px;
            height: 24px;
            border-radius: 4px;
        cursor: pointer;
            font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        padding: 0;
        margin: 0;
        pointer-events: auto;
        z-index: 1000002;
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05),
                        inset 0 -1px 1px rgba(255, 255, 255, 0.5),
                        0 2px 4px rgba(0, 0, 0, 0.2);
        `;

        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
            btn.style.borderColor = 'rgba(255, 255, 255, 0.7)';
            btn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
            btn.style.borderColor = 'rgba(255, 255, 255, 0.5)';
            btn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)';
        });

        btn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            btn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.15), rgba(255,255,255,0.4), rgba(255,255,255,0.15))';
            btn.style.boxShadow = 'inset 0 2px 2px rgba(0, 0, 0, 0.1), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4)';
            btn.style.transform = 'scale(0.95)';
        });

        btn.addEventListener('mouseup', () => {
            btn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
            btn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
            btn.style.transform = 'scale(1)';
        });

        btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
            onClick();
        });

        return btn;
    }

    // Render Studio button (leftmost)
    const renderStudioButton = createIconButton('fas fa-palette', () => {
        window.electronAPI.openExternal('https://rendercad.ai/render');
    }, 'Render Studio');
    renderStudioButton.style.right = '112px';
    renderStudioButton.style.top = '2px';

    // History button (left of settings)
    const historyButton = createIconButton('fas fa-history', () => {
        window.electronAPI.openExternal('https://rendercad.ai/history');
    }, 'History');
    historyButton.style.right = '86px';
    historyButton.style.top = '2px';

    // Settings button (left of pin)
    const settingsButton = createIconButton('fas fa-user-cog', () => {
        window.electronAPI.openExternal('https://rendercad.ai/settings');
    }, 'Settings');
    settingsButton.style.right = '60px';
    settingsButton.style.top = '2px';

    // Token usage indicator (positioned below exit button)
    const tokenIndicator = document.createElement('div');
    tokenIndicator.className = 'rendercad-token-indicator';
    tokenIndicator.style.cssText = `
        position: absolute;
        right: 8px;
        top: 38px;
        font-size: 13px;
        font-family: 'Segoe UI', Arial, sans-serif;
        color: rgba(255, 255, 255, 0.7);
        white-space: nowrap;
        pointer-events: none;
        user-select: none;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    tokenIndicator.textContent = '--/--';

    // Function to update token indicator
    async function updateTokenIndicator() {
        try {
            const userInfo = await window.electronAPI.getUserInfo();
            if (userInfo) {
                const used = userInfo.monthly_renders_used || 0;
                const limit = userInfo.monthly_render_limit || 0;
                
                if (limit > 0) {
                    tokenIndicator.textContent = `${used}/${limit}`;
                    tokenIndicator.style.opacity = '1';
                    
                    // Color coding: yellow when >= 70%, red when >= 90% or reached
                    const percentage = (used / limit) * 100;
                    if (percentage >= 90 || used >= limit) {
                        tokenIndicator.style.color = '#ff4444';
                    } else if (percentage >= 70) {
                        tokenIndicator.style.color = '#ffaa00';
                    } else {
                        tokenIndicator.style.color = 'rgba(255, 255, 255, 0.7)';
                    }
                } else {
                    tokenIndicator.style.opacity = '0';
                }
            } else {
                tokenIndicator.style.opacity = '0';
            }
        } catch (error) {
            console.error('Error updating token indicator:', error);
            tokenIndicator.style.opacity = '0';
        }
    }

    // Update token indicator on modal creation
    updateTokenIndicator();
    // Update periodically (every 30 seconds)
    if (typeof tokenUpdateInterval !== 'undefined' && tokenUpdateInterval) {
        clearInterval(tokenUpdateInterval);
    }
    tokenUpdateInterval = setInterval(updateTokenIndicator, 30000);

    // Pin toggle button (left of close button)
    // CLEAN STATE-BASED PIN/UNPIN SYSTEM
    // Note: applyModalState is now defined globally above

    // Get initial pinned state from modal attribute (if it exists)
    let isPinned = loadingModal.hasAttribute('data-pinned');
    const pinButton = createIconButton('fas fa-thumbtack', () => {
        // Always check the actual attribute state, not the local variable
        isPinned = loadingModal.hasAttribute('data-pinned');
        isPinned = !isPinned;

        // Get current right edge position to maintain it
        const modalRect = loadingModal.getBoundingClientRect();
        const rightEdge = modalRect.left + modalRect.width;

        if (isPinned) {
            // PINNING: Switch to narrow 60px mode
            pinButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
            pinButton.style.right = '8px';

            // When pinning, always start collapsed (user can expand with corner toggle if needed)
            isExpanded = false;

            // Don't call applyModalState here - the pinning code below handles everything explicitly

            // Update toggle icon
            const toggleIcon = loadingModal.querySelector('.rendercad-toggle-icon');
            if (toggleIcon) {
                toggleIcon.textContent = isExpanded ? '▲' : '▼';
            }

            // Hide regular toggle bar when pinned
            const pinnedToggleBar1 = loadingModal.querySelector('.rendercad-toggle-bar');
            if (pinnedToggleBar1) {
                pinnedToggleBar1.style.display = 'none';
            }
            // Hide camera button, show logo button
            cameraButton.style.display = 'none';
            // Create logo button (centered, round) for pinned mode
            let logoButton = loadingModal.querySelector('.rendercad-logo-button');
            if (!logoButton) {
                logoButton = document.createElement('button');
                logoButton.className = 'rendercad-logo-button';
                const logoImg = document.createElement('img');
                // Use Electron API to get asset path, or fallback to relative path
                if (window.electronAPI && window.electronAPI.getAssetPath) {
                    window.electronAPI.getAssetPath('icons/logo.svg').then(logoPath => {
                        console.log('[RenderCAD] Pinned logo path:', logoPath);
                        logoImg.src = logoPath; // Already in file:// format
                    }).catch((err) => {
                        console.error('[RenderCAD] Failed to get pinned logo path:', err);
                        // Fallback to relative path
                        logoImg.src = '../assets/icons/logo.svg';
                    });
                } else {
                    logoImg.src = '../assets/icons/logo.svg';
                }
                logoImg.alt = 'RenderCAD';
                logoImg.style.cssText = `
                    width: 26px;
                    height: 26px;
                    image-rendering: -webkit-optimize-contrast;
                    image-rendering: crisp-edges;
                    pointer-events: none;
                    user-select: none;
                    -webkit-user-drag: none;
                    display: block;
                `;
                logoImg.onerror = function() {
                    console.error('Failed to load logo.svg, trying PNG fallback');
                    if (window.electronAPI && window.electronAPI.getAssetPath) {
                        window.electronAPI.getAssetPath('icons/logo.png').then(logoPath => {
                            this.src = logoPath; // Already in file:// format
                        }).catch(() => {
                            this.style.display = 'none';
                        });
                    } else {
                        this.src = '../assets/icons/logo.png';
                        this.onerror = function() { this.style.display = 'none'; };
                    }
                };
                logoButton.appendChild(logoImg);
                // Logo button positioning: Modal is 60x60 total with 2px border
                // Content area is 56x56, button is 40x40, so (56-40)/2 = 8px margin to center
                logoButton.style.cssText = `
                    position: absolute;
                    top: 8px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05));
                    border: 1px solid rgba(255, 255, 255, 0.5);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: none;
                    padding: 0;
                    margin: 0;
                    pointer-events: auto;
                    z-index: 1000003;
                    backdrop-filter: blur(4px);
                    -webkit-backdrop-filter: blur(4px);
                    box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05),
                                inset 0 -1px 1px rgba(255, 255, 255, 0.5),
                                0 2px 4px rgba(0, 0, 0, 0.2);
                    outline: none;
                    -webkit-tap-highlight-color: transparent;
                `;
                logoButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
                    // Remove focus to prevent outline
                    logoButton.blur();
                    startScreenCapture();
                });
                logoButton.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    logoButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.15), rgba(255,255,255,0.4), rgba(255,255,255,0.15))';
                    logoButton.style.borderColor = 'rgba(255, 255, 255, 0.8)';
                });
                logoButton.addEventListener('mouseup', (e) => {
                    e.stopPropagation();
                    logoButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
                    logoButton.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                    logoButton.blur();
                });
                logoButton.addEventListener('mouseleave', () => {
                    logoButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
                    logoButton.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                    logoButton.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)';
                    logoButton.blur();
                });
                logoButton.addEventListener('mouseenter', () => {
                    logoButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
                    logoButton.style.borderColor = 'rgba(255, 255, 255, 0.7)';
                    logoButton.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
                });
                loadingModal.appendChild(logoButton);
            }
            logoButton.style.display = 'flex';
            // Logo button is already positioned absolutely with 50% top/left and transform, so it stays centered
            // Hide RenderCAD text and header content
            headerContent.style.display = 'none';
            renderStudioButton.style.display = 'none';
            historyButton.style.display = 'none';
            settingsButton.style.display = 'none';
            tokenIndicator.style.display = 'none';
            closeButton.style.display = 'none';
            // Hide unpinned hamburger button when pinned
            hamburgerButton.style.display = 'none';
            // Hide regular pin button and toggle bar, show corner buttons
            pinButton.style.display = 'none';
            const pinnedToggleBar2 = loadingModal.querySelector('.rendercad-toggle-bar');
            if (pinnedToggleBar2) {
                pinnedToggleBar2.style.display = 'none';
                pinnedToggleBar2.style.visibility = 'hidden';
            }
            
            // Create options corner button (top-right) with dropdown
            let cornerOptionsButton = loadingModal.querySelector('.rendercad-corner-options-button');
            if (!cornerOptionsButton) {
                cornerOptionsButton = document.createElement('button');
                cornerOptionsButton.className = 'rendercad-corner-options-button';
                cornerOptionsButton.style.cssText = `
                    position: absolute;
                    top: 0;
                    right: 0;
                    width: 16px;
                    height: 16px;
                    background: linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.25), rgba(255,255,255,0.1));
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-top-right-radius: 4px;
                    border-bottom-left-radius: 4px;
                    cursor: pointer;
                    padding: 0;
                    margin: 0;
                    z-index: 1000005;
                    transition: all 0.2s ease;
                    clip-path: polygon(0 0, 100% 0, 100% 100%);
                `;
                cornerOptionsButton.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    // Toggle dropdown - query from document.body since that's where we append it
                    let dropdown = document.querySelector('.rendercad-options-dropdown');
                    if (dropdown && dropdown.style.display !== 'none') {
                        dropdown.style.display = 'none';
                        updateClickThrough();
                    } else {
                        if (!dropdown) {
                            dropdown = document.createElement('div');
                            dropdown.className = 'rendercad-options-dropdown';
                            dropdown.style.cssText = `
                                position: fixed;
                                background: rgba(0, 0, 0, 0.9);
                                border: 1px solid rgba(255, 255, 255, 0.3);
                                border-radius: 4px;
                                padding: 4px 0;
                                min-width: 150px;
                                z-index: 2147483647;
                                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
                                pointer-events: auto;
                            `;
                            
                            document.body.appendChild(dropdown);
                        }
                        
                        // Clear existing items
                        dropdown.innerHTML = '';
                        
                        // Check authentication status
                        let isAuthenticated = false;
                        try {
                            isAuthenticated = await checkAuthentication();
                        } catch (error) {
                            console.error('[RenderCAD] Error checking authentication in pinned menu:', error);
                            isAuthenticated = false;
                        }
                        
                        // Add menu items (same as unpinned menu)
                        // Check if always on top is currently enabled
                        let isAlwaysOnTop = false;
                        try {
                            isAlwaysOnTop = loadingModalInstance && loadingModalInstance.getAttribute('data-always-on-top') === 'true';
                        } catch (e) {
                            isAlwaysOnTop = false;
                        }
                        
                        const menuItems = [
                            { text: 'Render Studio', icon: 'fa-palette', action: () => {
                                dropdown.style.display = 'none';
                                window.electronAPI.openExternal('https://rendercad.ai/render');
                            }},
                            { text: 'History', icon: 'fa-history', action: () => {
                                dropdown.style.display = 'none';
                                window.electronAPI.openExternal('https://rendercad.ai/history');
                            }},
                            { text: 'Settings', icon: 'fa-user-cog', action: () => {
                                dropdown.style.display = 'none';
                                window.electronAPI.openExternal('https://rendercad.ai/settings');
                            }},
                            { text: 'Unpin', icon: 'fa-thumbtack', action: () => { 
                                dropdown.style.display = 'none';
                                // Trigger unpin by clicking the pin button
                                // Always check the actual attribute state
                                if (loadingModal.hasAttribute('data-pinned')) {
                                    pinButton.click();
                                }
                            }},
                            { text: isAlwaysOnTop ? 'Always on Top ✓' : 'Always on Top', icon: 'fa-window-maximize', action: () => {
                                dropdown.style.display = 'none';
                                const newState = !isAlwaysOnTop;
                                if (window.captureAPI && window.captureAPI.setWindowAlwaysOnTop) {
                                    window.captureAPI.setWindowAlwaysOnTop(newState);
                                    if (loadingModalInstance) {
                                        loadingModalInstance.setAttribute('data-always-on-top', newState ? 'true' : 'false');
                                    }
                                }
                            }},
                        ];
                        
                        // Add sign in/sign out based on auth state
                        if (isAuthenticated) {
                            menuItems.push({ text: 'Sign Out', icon: 'fa-sign-out-alt', action: () => {
                                dropdown.style.display = 'none';
                                window.electronAPI.clearToken().then(() => {
                                    setTimeout(() => {
                                        if (loadingModalInstance) {
                                            updateTokenIndicator();
                                        }
                                    }, 500);
                                });
                            }});
                        } else {
                            menuItems.push({ text: 'Sign In', icon: 'fa-sign-in-alt', action: () => {
                                dropdown.style.display = 'none';
                                showSignInPrompt();
                            }});
                        }
                        
                        menuItems.push({ text: 'Close', icon: 'fa-times', action: () => {
                            dropdown.style.display = 'none';
                            if (loadingModalInstance) {
                                if (glowAnimationFrame) {
                                    cancelAnimationFrame(glowAnimationFrame);
                                }
                                if (typeof tokenUpdateInterval !== 'undefined' && tokenUpdateInterval) {
                                    clearInterval(tokenUpdateInterval);
                                }
                                loadingModalInstance.remove();
                                loadingModalInstance = null;
                                renderedImages = [];
                                originalImages = [];
                                const backdropLayer = document.getElementById('rendercad-modal-backdrop');
                                if (backdropLayer) {
                                    backdropLayer.remove();
                                }
                            }
                            if (window.captureAPI && window.captureAPI.closeApp) {
                                window.captureAPI.closeApp();
                            }
                        }});
                            
                        // Create menu items
                        menuItems.forEach(item => {
                            const menuItem = document.createElement('div');
                            menuItem.style.cssText = `
                                padding: 8px 16px;
                                cursor: pointer;
                                color: rgba(255, 255, 255, 0.9);
                                font-size: 13px;
                                font-family: 'Segoe UI', Arial, sans-serif;
                                display: flex;
                                align-items: center;
                                gap: 8px;
                                transition: background 0.2s ease;
                            `;
                            menuItem.innerHTML = `<i class="fas ${item.icon}" style="font-size: 12px;"></i> ${item.text}`;
                            menuItem.addEventListener('mouseenter', () => {
                                menuItem.style.background = 'rgba(255, 255, 255, 0.1)';
                            });
                            menuItem.addEventListener('mouseleave', () => {
                                menuItem.style.background = 'transparent';
                            });
                            menuItem.addEventListener('click', (e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                if (item.action) {
                                    item.action();
                                }
                            });
                            dropdown.appendChild(menuItem);
                        });
                        
                        // Position and show dropdown
                        const buttonRect = cornerOptionsButton.getBoundingClientRect();
                        dropdown.style.top = (buttonRect.bottom + 2) + 'px';
                        dropdown.style.left = buttonRect.left + 'px';
                        dropdown.style.display = 'block';
                        
                        // Disable click-through when dropdown is open
                        updateClickThrough();
                        
                        // Close dropdown when clicking outside
                        const closeDropdown = (e) => {
                            if (!dropdown.contains(e.target) && !cornerOptionsButton.contains(e.target)) {
                                dropdown.style.display = 'none';
                                document.removeEventListener('click', closeDropdown);
                                // Re-enable click-through tracking when dropdown closes
                                updateClickThrough();
                            }
                        };
                        setTimeout(() => {
                            document.addEventListener('click', closeDropdown);
                        }, 0);
                    }
                });
                cornerOptionsButton.addEventListener('mouseenter', () => {
                    cornerOptionsButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.15), rgba(255,255,255,0.35), rgba(255,255,255,0.15))';
                    cornerOptionsButton.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                });
                cornerOptionsButton.addEventListener('mouseleave', () => {
                    cornerOptionsButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.25), rgba(255,255,255,0.1))';
                    cornerOptionsButton.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                });
                loadingModal.appendChild(cornerOptionsButton);
            }
            cornerOptionsButton.style.display = 'block';
            
            // Create corner toggle button (bottom-left)
            let cornerToggleButton = loadingModal.querySelector('.rendercad-corner-toggle-button');
            if (!cornerToggleButton) {
                cornerToggleButton = document.createElement('button');
                cornerToggleButton.className = 'rendercad-corner-toggle-button';
                cornerToggleButton.style.cssText = `
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 16px;
                    height: 16px;
                    background: linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.25), rgba(255,255,255,0.1));
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-bottom-left-radius: 4px;
                    border-top-right-radius: 4px;
                    cursor: pointer;
                    padding: 0;
                    margin: 0;
                    z-index: 1000005;
                    transition: all 0.2s ease;
                    clip-path: polygon(0 100%, 100% 100%, 0 0);
                `;
                cornerToggleButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (toggleBar) {
                        toggleBar.click();
                    }
                });
                cornerToggleButton.addEventListener('mouseenter', () => {
                    cornerToggleButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.15), rgba(255,255,255,0.35), rgba(255,255,255,0.15))';
                    cornerToggleButton.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                });
                cornerToggleButton.addEventListener('mouseleave', () => {
                    cornerToggleButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.25), rgba(255,255,255,0.1))';
                    cornerToggleButton.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                });
                loadingModal.appendChild(cornerToggleButton);
            }
            cornerToggleButton.style.display = 'block';
            
            // Hide image action buttons on hover and reduce padding
            // Remove existing pinned style if it exists
            const existingPinnedStyle = document.getElementById('rendercad-pinned-style');
            if (existingPinnedStyle) {
                existingPinnedStyle.remove();
            }
            const style = document.createElement('style');
            style.id = 'rendercad-pinned-style';
            style.textContent = `
                .rendercad-loading-modal[data-pinned="true"] {
                    overflow: visible !important;
                    width: 60px !important;
                    min-width: 60px !important;
                    max-width: 60px !important;
                    padding: 0 !important;
                }
                .rendercad-loading-modal[data-pinned="true"] .rendercad-modal-header {
                    padding: 0 !important;
                    margin: 0 !important;
                    min-height: 60px !important;
                    height: 60px !important;
                }
                .rendercad-loading-modal[data-pinned="true"] .rendercad-image-actions {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                }
                .rendercad-loading-modal[data-pinned="true"] .rendercad-image-gradient-overlay {
                    display: none !important;
                    opacity: 0 !important;
                }
                .rendercad-loading-modal[data-pinned="true"] .rendercad-preview-container {
                    padding: 0 2px !important;
                    gap: 4px !important;
                }
                .rendercad-loading-modal[data-pinned="true"] .rendercad-preview-container > div {
                    margin: 0 !important;
                }
                .rendercad-loading-modal[data-pinned="true"] .rendercad-preview-container > div:hover .rendercad-image-actions {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                }
                .rendercad-loading-modal[data-pinned="true"] .rendercad-preview-container > div:hover .rendercad-image-gradient-overlay {
                    display: none !important;
                    opacity: 0 !important;
                }
                .rendercad-loading-modal[data-pinned="true"] .rendercad-preview-container img {
                    width: 100% !important;
                    height: auto !important;
                    display: block !important;
                }
                .rendercad-loading-modal[data-pinned="true"] .rendercad-download-all-btn {
                    width: 50px !important;
                    height: 30px !important;
                    padding: 0 !important;
                    font-size: 14px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    margin: 0 auto 6px auto !important;
                    position: relative !important;
                    left: auto !important;
                    right: auto !important;
                }
                .rendercad-loading-modal[data-pinned="true"] .rendercad-content-wrapper {
                    padding: 0 2px 15px 2px !important;
                }
                .rendercad-loading-modal[data-pinned="true"] .rendercad-toggle-bar {
                    display: none !important;
                    visibility: hidden !important;
                    width: 0 !important;
                    height: 0 !important;
                }
                .rendercad-loading-modal[data-pinned="true"] .rendercad-divider {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                    height: 0 !important;
                    margin-top: 0 !important;
                }
            `;
            document.head.appendChild(style);

            // ROBUST PINNING: Force size constraints immediately, then set attribute
            // Step 1: Set inline styles with !important to force 60x60
            loadingModal.style.setProperty('width', '60px', 'important');
            loadingModal.style.setProperty('min-width', '60px', 'important');
            loadingModal.style.setProperty('max-width', '60px', 'important');
            loadingModal.style.setProperty('height', '60px', 'important');
            loadingModal.style.setProperty('min-height', '60px', 'important');
            loadingModal.style.setProperty('max-height', '60px', 'important');
            loadingModal.style.setProperty('padding', '0', 'important');

            // Force reflow
            void loadingModal.offsetHeight;

            // Step 2: Set data-pinned attribute to trigger CSS
            loadingModal.setAttribute('data-pinned', 'true');

            // Step 3: Hide/show elements
            const divider = loadingModal.querySelector('.rendercad-divider');
            if (divider) {
                divider.style.display = 'none';
            }
            // Update preview container visibility based on isExpanded
            const previewContainer = loadingModal.querySelector('.rendercad-preview-container');
            if (previewContainer) {
                if (isExpanded) {
                    previewContainer.style.display = 'flex';
                    previewContainer.style.maxHeight = '60vh';
                    previewContainer.style.opacity = '1';
                } else {
                    previewContainer.style.maxHeight = '0';
                    previewContainer.style.opacity = '0';
                    setTimeout(() => previewContainer.style.display = 'none', 300);
                }
            }
            
            // Update toggle bar visibility
            const toggleBar = loadingModal.querySelector('.rendercad-toggle-bar');
            if (toggleBar) {
                const hasImages = renderedImages && renderedImages.length > 0;
                if (hasImages) {
                    toggleBar.style.display = 'flex';
                    toggleBar.style.visibility = 'visible';
                } else {
                    toggleBar.style.display = 'none';
                    toggleBar.style.visibility = 'hidden';
                }
            }
            
            // Update circular loader visibility
            const activeRenders = parseInt(loadingModal.getAttribute('data-active-renders') || 0);
            const circularLoader = loadingModal.querySelector('.rendercad-circular-loader');
            if (circularLoader) {
                if (activeRenders > 0) {
                    // Position at top when pinned
                    circularLoader.style.top = '4px';
                    circularLoader.style.left = '50%';
                    circularLoader.style.transform = 'translateX(-50%)';
                    circularLoader.style.display = 'block';
                    circularLoader.style.animation = 'spin 1s linear infinite';
                } else {
                    circularLoader.style.display = 'none';
                    circularLoader.style.animation = 'none';
                }
            }
            
            if (activeRenders > 0) {
                // Show circular loader if rendering
                showLoadingBar();
            }

            // Update download button to show icon only
            updateDownloadAllButton();
        } else {
            // UNPINNING: Switch to wide 400px mode
            pinButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
            pinButton.style.right = '34px';

            // Position modal (keep right edge in same place)
            const newLeft = Math.max(20, Math.min(rightEdge - 400, window.innerWidth - 420));
            loadingModal.style.left = newLeft + 'px';
            loadingModal.style.right = 'auto';

            // Show camera button, hide logo button
            cameraButton.style.display = 'flex';
            const logoButton = loadingModal.querySelector('.rendercad-logo-button');
            if (logoButton) logoButton.style.display = 'none';
            
            // Show RenderCAD text and header content
            headerContent.style.display = 'flex';
            renderStudioButton.style.display = 'none';
            historyButton.style.display = 'none';
            settingsButton.style.display = 'none';
            tokenIndicator.style.display = '';
            closeButton.style.display = 'none';
            // Show unpinned hamburger button when unpinned
            hamburgerButton.style.display = 'flex';
            // Hide pin button in unpinned mode (it's in hamburger menu)
            pinButton.style.display = 'none';
            
            // Hide corner buttons (only used in pinned mode)
            const cornerOptionsButton = loadingModal.querySelector('.rendercad-corner-options-button');
            if (cornerOptionsButton) cornerOptionsButton.style.display = 'none';
            const cornerToggleButton = loadingModal.querySelector('.rendercad-corner-toggle-button');
            if (cornerToggleButton) cornerToggleButton.style.display = 'none';
            
            // Show toggle bar
            const toggleBar = loadingModal.querySelector('.rendercad-toggle-bar');
            if (toggleBar) {
                toggleBar.style.display = 'flex';
                toggleBar.style.visibility = 'visible';
            }
            
            // Show divider
            const divider = loadingModal.querySelector('.rendercad-divider');
            if (divider) {
                divider.style.display = 'block';
            }
            
            // Hide pinned dropdown if open
            const dropdown = document.querySelector('.rendercad-options-dropdown');
            if (dropdown) dropdown.style.display = 'none';
            
            // Remove pinned style element
            const pinnedStyle = document.getElementById('rendercad-pinned-style');
            if (pinnedStyle) {
                pinnedStyle.remove();
            }

            // Apply the unpinned state (isExpanded state is preserved)
            applyModalState(loadingModal, false, isExpanded);
            
            // Update queue counter position immediately when unpinning
            if (updateQueueCounterPositionFn && typeof updateQueueCounterPositionFn === 'function') {
                updateQueueCounterPositionFn();
            }
            // Also call updateQueueCounter to ensure it's positioned correctly
            updateQueueCounter();
            
            // Show loading bar if there are active renders
            const activeRenders = parseInt(loadingModal.getAttribute('data-active-renders') || '0');
            if (activeRenders > 0) {
                showLoadingBar();
            }

            // Update download button to show full text
            updateDownloadAllButton();
        }
    }, 'Pin/Unpin');
    pinButton.style.right = '34px';
    pinButton.style.top = '2px';
    pinButton.style.display = 'none'; // Hidden in unpinned mode (shown in hamburger menu)

    // Hamburger menu button (replaces all top right buttons in unpinned mode)
    const hamburgerButton = document.createElement('button');
    hamburgerButton.className = 'rendercad-hamburger-button';
    hamburgerButton.innerHTML = '<i class="fas fa-bars"></i>';
    hamburgerButton.title = 'Menu';
    hamburgerButton.style.cssText = `
        position: absolute;
        top: 6px;
        right: 8px;
        background: linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05));
        border: 1px solid rgba(255, 255, 255, 0.5);
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        padding: 0;
        margin: 0;
        pointer-events: auto;
        z-index: 1000002;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05),
                    inset 0 -1px 1px rgba(255, 255, 255, 0.5),
                    0 2px 4px rgba(0, 0, 0, 0.2);
    `;

    hamburgerButton.addEventListener('mouseenter', () => {
        hamburgerButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
        hamburgerButton.style.borderColor = 'rgba(255, 255, 255, 0.7)';
        hamburgerButton.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
    });

    hamburgerButton.addEventListener('mouseleave', () => {
        hamburgerButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
        hamburgerButton.style.borderColor = 'rgba(255, 255, 255, 0.5)';
        hamburgerButton.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)';
    });

    hamburgerButton.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        hamburgerButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.15), rgba(255,255,255,0.4), rgba(255,255,255,0.15))';
        hamburgerButton.style.boxShadow = 'inset 0 2px 2px rgba(0, 0, 0, 0.1), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4)';
        hamburgerButton.style.transform = 'scale(0.95)';
    });

    hamburgerButton.addEventListener('mouseup', () => {
        hamburgerButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
        hamburgerButton.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
        hamburgerButton.style.transform = 'scale(1)';
    });

    // Function to update hamburger menu with current auth state
    async function updateHamburgerMenu() {
        let isAuthenticated = false;
        try {
            isAuthenticated = await checkAuthentication();
        } catch (error) {
            console.error('[RenderCAD] Error checking authentication in hamburger menu:', error);
            isAuthenticated = false;
        }
        let dropdown = document.querySelector('.rendercad-unpinned-options-dropdown');
        
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.className = 'rendercad-unpinned-options-dropdown';
            dropdown.style.cssText = `
                position: fixed;
                background: rgba(0, 0, 0, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 4px;
                padding: 4px 0;
                min-width: 150px;
                z-index: 2147483647;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
                display: none;
                pointer-events: auto;
            `;
            document.body.appendChild(dropdown);
        }
        
        // Clear existing items
        dropdown.innerHTML = '';
        
        // Check if always on top is currently enabled
        let isAlwaysOnTop = false;
        try {
            // We'll track this in a data attribute on the modal
            isAlwaysOnTop = loadingModalInstance && loadingModalInstance.getAttribute('data-always-on-top') === 'true';
        } catch (e) {
            isAlwaysOnTop = false;
        }
        
        const menuItems = [
            { text: 'Render Studio', icon: 'fa-palette', action: () => {
                dropdown.style.display = 'none';
                window.electronAPI.openExternal('https://rendercad.ai/render');
            }},
            { text: 'History', icon: 'fa-history', action: () => {
                dropdown.style.display = 'none';
                window.electronAPI.openExternal('https://rendercad.ai/history');
            }},
            { text: 'Settings', icon: 'fa-user-cog', action: () => {
                dropdown.style.display = 'none';
                window.electronAPI.openExternal('https://rendercad.ai/settings');
            }},
            { text: 'Pin', icon: 'fa-thumbtack', action: () => {
                dropdown.style.display = 'none';
                if (!isPinned) {
                    pinButton.click();
                }
            }},
            { text: isAlwaysOnTop ? 'Always on Top ✓' : 'Always on Top', icon: 'fa-window-maximize', action: () => {
                dropdown.style.display = 'none';
                const newState = !isAlwaysOnTop;
                if (window.captureAPI && window.captureAPI.setWindowAlwaysOnTop) {
                    window.captureAPI.setWindowAlwaysOnTop(newState);
                    if (loadingModalInstance) {
                        loadingModalInstance.setAttribute('data-always-on-top', newState ? 'true' : 'false');
                    }
                    // Update menu to reflect new state
                    setTimeout(() => updateHamburgerMenu(), 100);
                }
            }},
        ];
        
        // Add sign in/sign out based on auth state
        if (isAuthenticated) {
            menuItems.push({ text: 'Sign Out', icon: 'fa-sign-out-alt', action: () => {
                dropdown.style.display = 'none';
                window.electronAPI.clearToken().then(() => {
                    setTimeout(() => {
                        updateHamburgerMenu();
                        if (loadingModalInstance) {
                            updateTokenIndicator();
                        }
                    }, 500);
                });
            }});
        } else {
            menuItems.push({ text: 'Sign In', icon: 'fa-sign-in-alt', action: () => {
                dropdown.style.display = 'none';
                showSignInPrompt();
            }});
        }
        
        menuItems.push({ text: 'Close', icon: 'fa-times', action: () => {
            dropdown.style.display = 'none';
            if (loadingModalInstance) {
                if (glowAnimationFrame) {
                    cancelAnimationFrame(glowAnimationFrame);
                }
                if (typeof tokenUpdateInterval !== 'undefined' && tokenUpdateInterval) {
                    clearInterval(tokenUpdateInterval);
                }
                loadingModalInstance.remove();
                loadingModalInstance = null;
                renderedImages = [];
                originalImages = [];
                const backdropLayer = document.getElementById('rendercad-modal-backdrop');
                if (backdropLayer) {
                    backdropLayer.remove();
                }
            }
            if (window.captureAPI && window.captureAPI.closeApp) {
                window.captureAPI.closeApp();
            }
        }});
        
        // Create menu items
        menuItems.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.style.cssText = `
                padding: 8px 16px;
                color: white;
                cursor: pointer;
                font-family: 'Segoe UI', Arial, sans-serif;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: background 0.2s ease;
            `;
            menuItem.innerHTML = `<i class="fas ${item.icon}"></i> ${item.text}`;
            menuItem.addEventListener('mouseenter', () => {
                menuItem.style.background = 'rgba(255, 255, 255, 0.1)';
            });
            menuItem.addEventListener('mouseleave', () => {
                menuItem.style.background = 'transparent';
            });
            menuItem.addEventListener('click', (e) => {
                e.stopPropagation();
                item.action();
            });
            dropdown.appendChild(menuItem);
        });
        
        return dropdown;
    }

    // Use mousedown for faster response, but also handle click for accessibility
    hamburgerButton.addEventListener('mousedown', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        const dropdown = await updateHamburgerMenu();
        
        if (!dropdown) {
            console.error('[RenderCAD] Failed to create dropdown');
            return;
        }
        
        // Toggle dropdown visibility
        const isVisible = dropdown.style.display === 'block' || dropdown.style.display === '';
        
        if (isVisible) {
            dropdown.style.display = 'none';
            // Re-enable click-through tracking when dropdown closes
            updateClickThrough();
        } else {
            const buttonRect = hamburgerButton.getBoundingClientRect();
            dropdown.style.top = (buttonRect.bottom + 2) + 'px';
            dropdown.style.right = (window.innerWidth - buttonRect.right) + 'px';
            dropdown.style.display = 'block';
            
            // Disable click-through when dropdown is open
            updateClickThrough();
            
            // Close dropdown when clicking outside - use mousedown for faster response
            const closeDropdown = (e) => {
                if (!dropdown.contains(e.target) && !hamburgerButton.contains(e.target)) {
                    dropdown.style.display = 'none';
                    document.removeEventListener('mousedown', closeDropdown);
                    document.removeEventListener('click', closeDropdown);
                    // Re-enable click-through tracking when dropdown closes
                    updateClickThrough();
                }
            };
            // Use both mousedown and click for better compatibility
            requestAnimationFrame(() => {
                document.addEventListener('mousedown', closeDropdown);
                document.addEventListener('click', closeDropdown);
            });
        }
    });

    // Close button (using times icon to match style)
    const closeButton = createIconButton('fas fa-times', () => {
        if (loadingModal) {
            if (glowAnimationFrame) {
                cancelAnimationFrame(glowAnimationFrame);
            }
            if (typeof tokenUpdateInterval !== 'undefined' && tokenUpdateInterval) {
                clearInterval(tokenUpdateInterval);
            }
            loadingModal.remove();
            loadingModalInstance = null;
            renderedImages = []; // Clear stored images
            originalImages = []; // Clear stored original images
            // Remove backdrop layer
            const backdropLayer = document.getElementById('rendercad-modal-backdrop');
            if (backdropLayer) {
                backdropLayer.remove();
            }
        }
        // Close the app
        if (window.captureAPI && window.captureAPI.closeApp) {
            window.captureAPI.closeApp();
        }
    }, 'Close');
    closeButton.style.right = '8px';
    closeButton.style.top = '2px';

    header.appendChild(headerContent);
    header.appendChild(tokenIndicator);
    header.appendChild(renderStudioButton);
    header.appendChild(historyButton);
    header.appendChild(settingsButton);
    header.appendChild(pinButton);
    header.appendChild(closeButton);
    header.appendChild(hamburgerButton);
    
    // Initial state management for buttons (unpinned mode)
    // In unpinned mode, only hamburger button is visible (pin is in hamburger menu)
    pinButton.style.display = 'none';
    closeButton.style.display = 'none';
    renderStudioButton.style.display = 'none';
    historyButton.style.display = 'none';
    settingsButton.style.display = 'none';
    hamburgerButton.style.display = 'flex';

    // Content wrapper with padding
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'rendercad-content-wrapper';
    contentWrapper.style.cssText = `
        padding: 0 15px 15px 15px;
        flex: 1;
        display: flex;
        flex-direction: column;
    `;

    // Prismatic divider line (exact copy from index.html with horizontal layout)
    const divider = document.createElement('div');
    divider.className = 'rendercad-divider';
    divider.style.cssText = `
        position: relative;
        width: 100%;
        height: 0;
        overflow: visible;
        margin-top: 8px;
        margin-bottom: 0;
        transform: scaleX(0);
        opacity: 0;
        transform-origin: left center;
    `;

    const dividerBase = document.createElement('div');
    dividerBase.style.cssText = `
        position: absolute;
        top: 0;
        height: 100%;
        left: 0;
        width: 100%;
        background: rgba(255, 255, 255, 0.9);
        z-index: 1;
        mask-image: linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%);
        -webkit-mask-image: linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%);
    `;

    const darkCore = document.createElement('div');
    darkCore.style.cssText = `
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        height: 1px;
        left: 0;
        width: 100%;
        background: rgba(0, 0, 0, 0.4);
        z-index: 2;
        pointer-events: none;
        mask-image: linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%);
        -webkit-mask-image: linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%);
    `;

    const glow = document.createElement('div');
    glow.className = 'rendercad-divider-glow';
    glow.style.cssText = `
        position: absolute;
        top: 0;
        height: 100%;
        left: 0;
        width: 100%;
        border-radius: 1px;
        background: linear-gradient(90deg, transparent 0%, transparent 1.5%, cyan 8%, #faff70 20%, pink 32%, #faff70 44%, cyan 50%, #faff70 56%, pink 68%, #faff70 80%, cyan 92%, transparent 98.5%, transparent 100%);
        background-size: 400% 100%;
        background-position: 0% 0%;
        filter: blur(2px);
        opacity: 1;
        z-index: 3;
        pointer-events: none;
    `;

    divider.appendChild(dividerBase);
    divider.appendChild(darkCore);
    divider.appendChild(glow);

    // Animate the glow using requestAnimationFrame (like index.html)
    let glowOffset = 0;
    function animateGlow() {
        glowOffset += 0.25;
        glow.style.backgroundPosition = `${glowOffset}% 0%`;
        glowAnimationFrame = requestAnimationFrame(animateGlow);
    }
    animateGlow();

    // Add custom scrollbar styles
    const scrollbarStyle = document.createElement('style');
    scrollbarStyle.textContent = `
        .rendercad-preview-container::-webkit-scrollbar {
            width: 8px;
        }
        .rendercad-preview-container::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 4px;
        }
        .rendercad-preview-container::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.3);
            border-radius: 4px;
        }
        .rendercad-preview-container::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.5);
        }
    `;
    document.head.appendChild(scrollbarStyle);

    // Preview container (grid of previews)
    const previewContainer = document.createElement('div');
    previewContainer.className = 'rendercad-preview-container';
    previewContainer.style.cssText = `
        margin-top: 12px;
        display: none;
        flex-direction: column;
        gap: 10px;
        max-height: 60vh;
        overflow-y: auto;
        overflow-x: hidden;
        pointer-events: auto;
        transition: max-height 0.3s ease, opacity 0.3s ease;
    `;

    // Camera button at top left (for new screen capture) - centered with modal header, icon touches left edge
    const cameraButton = document.createElement('button');
    cameraButton.className = 'rendercad-camera-button';
    cameraButton.innerHTML = '<i class="fas fa-camera"></i>';
    cameraButton.title = 'Take New Screenshot';
    cameraButton.style.cssText = `
        position: absolute;
        top: 12px;
        left: 0;
        width: 32px;
        height: 32px;
        background: linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05));
        border: 1px solid rgba(255, 255, 255, 0.5);
        border-radius: 0 6px 6px 0;
        color: white;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        padding: 0;
        margin: 0;
        pointer-events: auto;
        z-index: 1000003;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05),
                    inset 0 -1px 1px rgba(255, 255, 255, 0.5),
                    0 2px 4px rgba(0, 0, 0, 0.2);
    `;

    cameraButton.addEventListener('mouseenter', () => {
        cameraButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
        cameraButton.style.borderColor = 'rgba(255, 255, 255, 0.7)';
        cameraButton.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
    });

    cameraButton.addEventListener('mouseleave', () => {
        cameraButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
        cameraButton.style.borderColor = 'rgba(255, 255, 255, 0.5)';
        cameraButton.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)';
    });

    cameraButton.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        cameraButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.15), rgba(255,255,255,0.4), rgba(255,255,255,0.15))';
        cameraButton.style.boxShadow = 'inset 0 2px 2px rgba(0, 0, 0, 0.1), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4)';
        cameraButton.style.transform = 'scale(0.95)';
    });

    cameraButton.addEventListener('mouseup', () => {
        cameraButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
        cameraButton.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
        cameraButton.style.transform = 'scale(1)';
    });

    cameraButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        // Start new screen capture - call directly since we're in content script
        startScreenCapture();
    });

    // Expand/collapse toggle bar
    const toggleBar = document.createElement('div');
    toggleBar.className = 'rendercad-toggle-bar';
    toggleBar.style.cssText = `
        display: none;
        width: 25%;
        height: 24px;
        background: linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05));
        border: 1px solid rgba(255, 255, 255, 0.5);
        border-radius: 6px 6px 0 0;
        cursor: pointer;
        align-items: center;
        justify-content: center;
        margin-top: 0;
        transition: all 0.3s ease;
        pointer-events: auto;
        position: absolute;
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05),
                    inset 0 -1px 1px rgba(255, 255, 255, 0.5),
                    0 2px 4px rgba(0, 0, 0, 0.2);
    `;

    // Toggle icon (wide V)
    const toggleIcon = document.createElement('div');
    toggleIcon.className = 'rendercad-toggle-icon';
    toggleIcon.style.cssText = `
        color: rgba(255, 255, 255, 0.8);
        font-size: 8px;
        font-weight: bold;
        transition: transform 0.3s ease;
        user-select: none;
        pointer-events: none;
        line-height: 1;
    `;
    toggleIcon.textContent = '▲'; // Up arrow (expanded state)

    toggleBar.appendChild(toggleIcon);

    // Toggle functionality - start collapsed
    // Note: isExpanded is now a global variable declared at top of file
    toggleIcon.textContent = '▼'; // Start with down arrow (collapsed)
    toggleBar.addEventListener('click', () => {
        const isPinned = loadingModal.hasAttribute('data-pinned');
        isExpanded = !isExpanded;

        // Apply the new expand/collapse state
        applyModalState(loadingModal, isPinned, isExpanded);

        // Update toggle icon
        toggleIcon.textContent = isExpanded ? '▲' : '▼';
        toggleIcon.style.transform = 'rotate(0deg)';
        
        // Ensure toggle bar stays visible in unpinned mode
        if (!isPinned) {
            toggleBar.style.display = 'flex';
            toggleBar.style.visibility = 'visible';
        }
        
        // Update loading circle position if pinned and expanded
        if (isPinned) {
            const activeRenders = parseInt(loadingModal.getAttribute('data-active-renders') || 0);
            const circularLoader = loadingModal.querySelector('.rendercad-circular-loader');
            if (circularLoader && activeRenders > 0) {
                // Keep at top center when pinned (regardless of expanded state)
                circularLoader.style.top = '4px';
                circularLoader.style.left = '50%';
                circularLoader.style.transform = 'translateX(-50%)';
            }
        }
    });

    // Hover effects for toggle bar
    toggleBar.addEventListener('mouseenter', () => {
        toggleBar.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
        toggleBar.style.borderColor = 'rgba(255, 255, 255, 0.7)';
        toggleBar.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
    });

    toggleBar.addEventListener('mouseleave', () => {
        toggleBar.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
        toggleBar.style.borderColor = 'rgba(255, 255, 255, 0.5)';
        toggleBar.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)';
    });

    toggleBar.addEventListener('mousedown', () => {
        toggleBar.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.15), rgba(255,255,255,0.4), rgba(255,255,255,0.15))';
        toggleBar.style.borderColor = 'rgba(255, 255, 255, 0.8)';
        toggleBar.style.boxShadow = 'inset 0 2px 2px rgba(0, 0, 0, 0.1), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4)';
        toggleBar.style.transform = 'translateX(-50%) scale(0.98)';
    });

    toggleBar.addEventListener('mouseup', () => {
        toggleBar.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
        toggleBar.style.borderColor = 'rgba(255, 255, 255, 0.7)';
        toggleBar.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
        toggleBar.style.transform = 'translateX(-50%) scale(1)';
    });

    // Queue counter indicator (shown when rendering > 1 image)
    const queueCounter = document.createElement('div');
    queueCounter.className = 'rendercad-queue-counter';
    queueCounter.style.cssText = `
        position: fixed;
        top: 0px;
        left: 0px;
        background: rgba(0, 0, 0, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.5);
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: none;
        align-items: center;
        justify-content: center;
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 12px;
        font-weight: 600;
        pointer-events: none;
        z-index: 2147483647;
    `;
    queueCounter.textContent = '0';
    
    // Function to update queue counter position relative to modal
    function updateQueueCounterPosition() {
        if (!loadingModal || !queueCounter) return;
        const modalRect = loadingModal.getBoundingClientRect();
        queueCounter.style.left = (modalRect.left - 12) + 'px';
        queueCounter.style.top = (modalRect.top - 5) + 'px';
        
        // Update unpinned dropdown (hamburger button)
        const unpinnedDropdown = document.querySelector('.rendercad-unpinned-options-dropdown');
        if (unpinnedDropdown && unpinnedDropdown.style.display === 'block') {
            const hamburgerButton = loadingModal.querySelector('.rendercad-hamburger-button');
            if (hamburgerButton) {
                const buttonRect = hamburgerButton.getBoundingClientRect();
                unpinnedDropdown.style.top = (buttonRect.bottom + 2) + 'px';
                unpinnedDropdown.style.right = (window.innerWidth - buttonRect.right) + 'px';
            }
        }
        
        // Update pinned dropdown (options button) - dropdown is in document.body
        const pinnedDropdown = document.querySelector('.rendercad-options-dropdown');
        if (pinnedDropdown && pinnedDropdown.style.display === 'block') {
            const optionsButton = loadingModal.querySelector('.rendercad-corner-options-button');
            if (optionsButton) {
                const buttonRect = optionsButton.getBoundingClientRect();
                pinnedDropdown.style.top = (buttonRect.bottom + 2) + 'px';
                pinnedDropdown.style.left = buttonRect.left + 'px';
            }
        }
    }
    
    // Update position initially and on window resize
    updateQueueCounterPosition();
    window.addEventListener('resize', updateQueueCounterPosition);

    loadingModal.appendChild(header);
    loadingModal.appendChild(cameraButton);
    
    contentWrapper.appendChild(divider);
    contentWrapper.appendChild(previewContainer);
    loadingModal.appendChild(contentWrapper);
    
    loadingModal.appendChild(toggleBar);
    loadingModal.appendChild(queueCounter);

    document.body.appendChild(loadingModal);
    console.log('[RenderCAD] Modal appended to body');

    // Add drag functionality - make modal draggable from header and background
    // Pass header as handle for drag start, but allow dragging from entire modal
    makeDraggable(loadingModal, header, updateQueueCounterPosition);

    // Force modal to be visible immediately (don't wait for animation)
    // This ensures it's visible right away in Electron
    requestAnimationFrame(() => {
        loadingModal.style.right = '20px';
        loadingModal.style.opacity = '1';
        loadingModal.style.visibility = 'visible';
        loadingModal.style.display = 'flex';
        console.log('[RenderCAD] Modal visibility set in requestAnimationFrame');
    });

    console.log('[RenderCAD] createLoadingModal completed, returning modal');
    return loadingModal;
    } catch (error) {
        console.error('[RenderCAD] Error in createLoadingModal:', error);
        throw error;
    }
}

function makeDraggable(modal, handle, updateQueueCounterPositionFn) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startModalLeft = 0;
    let startModalTop = 0;
    let currentDisplayId = null;
    let allDisplays = null;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let lastCheckTime = 0;
    // Track recent movement history for direction-based monitor switching
    let movementHistory = [];
    const MOVEMENT_HISTORY_DURATION = 250; // 0.25 seconds in milliseconds

    // Attach drag start to handle (header) and modal - allow dragging from anywhere
    // This works for both pinned and unpinned modals
    handle.addEventListener('mousedown', dragStart);
    modal.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
    
    // Set cursor style on modal (will be overridden by interactive elements)
    modal.style.cursor = 'move';
    
    // Ensure header is draggable even when pinned (headerContent is hidden but header remains)
    // When pinned, the header still exists and should be draggable
    handle.style.pointerEvents = 'auto';
    handle.style.cursor = 'move';
    
    // Initialize displays - works for both pinned and unpinned modals
    async function initializeDisplays() {
        if (!window.captureAPI || !window.captureAPI.getAllDisplays) return;
        try {
            allDisplays = await window.captureAPI.getAllDisplays();
            // Get current display based on window position
            // Use screenX/screenY which should be available in Electron renderer
            const centerX = window.screenX + (window.innerWidth / 2);
            const centerY = window.screenY + (window.innerHeight / 2);
            const currentDisplay = await window.captureAPI.getDisplayAtPoint(centerX, centerY);
            if (currentDisplay) {
                currentDisplayId = currentDisplay.id;
            }
        } catch (error) {
            console.error('[RenderCAD] Error initializing displays:', error);
        }
    }
    
    // Initialize on first load and when window moves
    if (window.captureAPI && window.captureAPI.getAllDisplays) {
        initializeDisplays();
        // Re-initialize when window moves (e.g., after monitor switch)
        window.addEventListener('resize', () => {
            setTimeout(initializeDisplays, 100);
        });
    }

    function dragStart(e) {
        // Don't start drag if clicking on interactive elements - simple check like original
        // Only check for buttons first, then add other checks
        if (e.target.closest('button')) {
            return;
        }
        
        // Additional checks for other interactive elements
        if (e.target.closest('.rendercad-image-actions') ||
            e.target.closest('.rendercad-toggle-bar') ||
            e.target.closest('.rendercad-options-dropdown') ||
            e.target.closest('.rendercad-corner-options-button') ||
            e.target.closest('.rendercad-corner-toggle-button') ||
            e.target.closest('.rendercad-logo-button') ||
            (e.target.tagName === 'IMG' && e.target.closest('.rendercad-preview-container'))) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        isDragging = true;

        // Initialize displays if not already done when drag starts
        // This ensures monitor switching works for both pinned and unpinned modals
        if (!allDisplays && window.captureAPI && window.captureAPI.getAllDisplays) {
            initializeDisplays();
        }

        // Check if modal is pinned FIRST - use hardcoded values to prevent size thrashing
        const isPinned = modal.getAttribute('data-pinned') === 'true';
        const previewContainer = modal.querySelector('.rendercad-preview-container');
        const hasVisibleImages = previewContainer && previewContainer.style.display !== 'none';

        // Use FIXED hardcoded sizes to prevent resize issues during pin/unpin
        let lockWidth, lockHeight, lockMaxHeight;
        if (isPinned && !hasVisibleImages) {
            // Pinned and collapsed - always 60x60 square
            lockWidth = '60px';
            lockHeight = '60px';
            lockMaxHeight = '60px';
        } else if (isPinned && hasVisibleImages) {
            // Pinned but with images - fixed 60px width, allow height to grow
            lockWidth = '60px';
            const rect = modal.getBoundingClientRect();
            lockHeight = `${rect.height}px`;
            lockMaxHeight = `${rect.height}px`;
        } else {
            // Unpinned - standard 400px width
            const rect = modal.getBoundingClientRect();
            lockWidth = '400px'; // Hardcoded instead of rect.width to prevent drift
            lockHeight = `${rect.height}px`;
            lockMaxHeight = `${rect.height}px`;
        }

        // Get current modal position from the DOM (for positioning only)
        const positionRect = modal.getBoundingClientRect();

        // Store starting click position
        startX = e.clientX;
        startY = e.clientY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        lastCheckTime = Date.now();
        
        // Reset movement history when starting a new drag
        movementHistory = [];

        // Store the actual current position from getBoundingClientRect
        startModalLeft = positionRect.left;
        startModalTop = positionRect.top;

        // Convert right positioning to left positioning if necessary
        if (modal.style.right !== 'auto' && modal.style.right !== '') {
            modal.style.left = positionRect.left + 'px';
            modal.style.right = 'auto';
        }

        // Create a style element to force modal size constraints
        const lockStyle = document.createElement('style');
        lockStyle.id = 'rendercad-modal-lock';
        lockStyle.textContent = `
            .rendercad-loading-modal {
                width: ${lockWidth} !important;
                height: ${lockHeight} !important;
                min-width: ${lockWidth} !important;
                max-width: ${lockWidth} !important;
                min-height: ${isPinned ? '60px' : lockHeight} !important;
                max-height: ${lockMaxHeight} !important;
                flex-shrink: 0 !important;
                flex-grow: 0 !important;
                resize: none !important;
                overflow: hidden !important;
                box-sizing: border-box !important;
            }
            .rendercad-preview-container {
                max-height: 60vh !important;
                overflow: hidden !important;
            }
        `;
        document.head.appendChild(lockStyle);

        // Store reference for cleanup
        modal.setAttribute('data-lock-style', 'true');

        modal.style.cursor = 'grabbing';
        handle.style.cursor = 'grabbing';
    }
    
    // Reset cursor when mouse leaves modal (if not dragging)
    modal.addEventListener('mouseleave', () => {
        if (!isDragging) {
            modal.style.cursor = 'move';
            handle.style.cursor = 'move';
        }
    });

    async function drag(e) {
        if (!isDragging) return;

        e.preventDefault();

        // Calculate movement delta
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        // Calculate new position based on starting position + delta
        let newLeft = startModalLeft + deltaX;
        let newTop = startModalTop + deltaY;
        
        // Update queue counter position if function provided
        if (updateQueueCounterPositionFn && typeof updateQueueCounterPositionFn === 'function') {
            updateQueueCounterPositionFn();
        }

        // Get window dimensions (use current rect for height calculation)
        const modalRect = modal.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        // Get mouse position in screen coordinates
        const mouseScreenX = window.screenX + e.clientX;
        const mouseScreenY = window.screenY + e.clientY;

        // Calculate current movement direction
        const currentDeltaX = e.clientX - lastMouseX;
        const currentDeltaY = e.clientY - lastMouseY;
        const currentTime = Date.now();
        
        // Track movement history for direction-based switching
        // Always add current movement, then filter to only keep last 0.25 seconds
        movementHistory.push({
            deltaX: currentDeltaX,
            deltaY: currentDeltaY,
            time: currentTime
        });
        
        // Remove old entries (older than 0.25 seconds) - do this every frame
        const cutoffTime = currentTime - MOVEMENT_HISTORY_DURATION;
        movementHistory = movementHistory.filter(entry => entry.time > cutoffTime);
        
        // Calculate average direction over last 0.25 seconds ONLY
        // Use only the filtered entries (within the time window)
        let avgDeltaX = 0;
        let avgDeltaY = 0;
        if (movementHistory.length > 0) {
            const totalDeltaX = movementHistory.reduce((sum, entry) => sum + entry.deltaX, 0);
            const totalDeltaY = movementHistory.reduce((sum, entry) => sum + entry.deltaY, 0);
            avgDeltaX = totalDeltaX / movementHistory.length;
            avgDeltaY = totalDeltaY / movementHistory.length;
        }
        
        // Update last position and time
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        lastCheckTime = currentTime;
        
        // Capture average deltas and movement history for use in async function
        const capturedAvgDeltaX = avgDeltaX;
        const capturedAvgDeltaY = avgDeltaY;
        const capturedMovementHistoryLength = movementHistory.length;

        // Check for monitor switching - check continuously during drag
        // Works for both pinned and unpinned modals
        // Run this check asynchronously without blocking drag updates
        (async () => {
            if (window.captureAPI && window.captureAPI.getDisplayAtPoint && window.captureAPI.moveWindowToDisplay) {
                // Initialize displays if not already done
                if (!allDisplays && window.captureAPI.getAllDisplays) {
                    try {
                        allDisplays = await window.captureAPI.getAllDisplays();
                        if (!currentDisplayId) {
                            const centerX = window.screenX + (window.innerWidth / 2);
                            const centerY = window.screenY + (window.innerHeight / 2);
                            const currentDisplay = await window.captureAPI.getDisplayAtPoint(centerX, centerY);
                            if (currentDisplay) {
                                currentDisplayId = currentDisplay.id;
                            }
                        }
                    } catch (error) {
                        console.error('[RenderCAD] Error initializing displays during drag:', error);
                    }
                }
                
                // Check for monitor switching on every drag frame
                if (allDisplays) {
                    try {
                        // Get the display at the mouse position (check every frame during drag)
                        const mouseDisplay = await window.captureAPI.getDisplayAtPoint(mouseScreenX, mouseScreenY);
                        
                        // If mouse is on a different display, switch the window immediately
                        // Also switch if currentDisplayId is null (first time detecting display)
                        if (mouseDisplay && (currentDisplayId === null || mouseDisplay.id !== currentDisplayId)) {
                            // Update current display IMMEDIATELY (before any async operations)
                            // This is critical for continuous dragging - ensures next check sees updated value
                            currentDisplayId = mouseDisplay.id;
                            
                            // Get current modal position from DOM (not calculated newLeft/newTop)
                            const currentModalRect = modal.getBoundingClientRect();
                            const currentModalLeft = currentModalRect.left;
                            const currentModalTop = currentModalRect.top;
                            
                            // Store the modal's offset from the mouse before switching
                            const modalOffsetX = e.clientX - currentModalLeft;
                            const modalOffsetY = e.clientY - currentModalTop;
                            
                            const result = await window.captureAPI.moveWindowToDisplay(mouseDisplay.id);
                            if (result && result.success) {
                                // currentDisplayId already updated above
                                
                                // Reload displays to get updated bounds
                                allDisplays = await window.captureAPI.getAllDisplays();
                                
                                // Wait briefly for window to move
                                await new Promise(resolve => requestAnimationFrame(resolve));
                                await new Promise(resolve => setTimeout(resolve, 5));
                                
                                // Recalculate modal position based on mouse position in new window
                                const newWindowScreenX = mouseDisplay.bounds.x;
                                const newWindowScreenY = mouseDisplay.bounds.y;
                                
                                // Calculate what the clientX/clientY would be in the new window
                                const newClientX = mouseScreenX - newWindowScreenX;
                                const newClientY = mouseScreenY - newWindowScreenY;
                                
                                // Recalculate modal position to maintain relative position to mouse
                                const updatedLeft = newClientX - modalOffsetX;
                                const updatedTop = newClientY - modalOffsetY;
                                
                                // Ensure modal stays within new window bounds
                                const newWindowWidth = mouseDisplay.workArea.width || mouseDisplay.bounds.width;
                                const newWindowHeight = mouseDisplay.workArea.height || mouseDisplay.bounds.height;
                                const constrainedLeft = Math.max(0, Math.min(updatedLeft, newWindowWidth - modalRect.width));
                                const constrainedTop = Math.max(0, Math.min(updatedTop, newWindowHeight - modalRect.height));
                                
                                // Update start positions for smooth continuation
                                startX = newClientX;
                                startY = newClientY;
                                startModalLeft = constrainedLeft;
                                startModalTop = constrainedTop;
                                
                                // Update last position to new window coordinates
                                lastMouseX = newClientX;
                                lastMouseY = newClientY;
                                lastCheckTime = Date.now();
                                
                                // Apply the new position immediately
                                modal.style.left = constrainedLeft + 'px';
                                modal.style.top = constrainedTop + 'px';
                            }
                        }
                    } catch (error) {
                        console.error('[RenderCAD] Error switching monitor:', error);
                    }
                }
            }
        })();

        // Boundaries - allow modal to go to edge (no padding)
        const minLeft = 0;
        const maxLeft = windowWidth - modalRect.width;
        const minTop = 0;
        const maxTop = windowHeight - modalRect.height;

        // Constrain to boundaries
        newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
        newTop = Math.max(minTop, Math.min(newTop, maxTop));

        // Snap to edges (closer threshold)
        const snapThreshold = 20;
        const snapMargin = 0; // No margin when snapped

        // Snap to right edge
        if (windowWidth - (newLeft + modalRect.width) < snapThreshold) {
            newLeft = windowWidth - modalRect.width - snapMargin;
        }
        // Snap to left edge
        else if (newLeft < snapThreshold) {
            newLeft = snapMargin;
        }

        // Snap to top edge
        if (newTop < snapThreshold) {
            newTop = snapMargin;
        }
        // Snap to bottom edge
        else if (windowHeight - (newTop + modalRect.height) < snapThreshold) {
            newTop = windowHeight - modalRect.height - snapMargin;
        }

        // Apply position - ensure modal uses fixed positioning
        modal.style.position = 'fixed';
        modal.style.left = newLeft + 'px';
        modal.style.top = newTop + 'px';
        modal.style.right = 'auto';
        modal.style.bottom = 'auto';
    }

    function dragEnd(e) {
        if (!isDragging) return;

        isDragging = false;
        
        // Remove the lock style element
        const lockStyle = document.getElementById('rendercad-modal-lock');
        if (lockStyle) {
            lockStyle.remove();
        }
        
        // Remove the lock attribute
        modal.removeAttribute('data-lock-style');
        
        // Restore proper width/height based on pinned state after drag
        const isPinned = modal.getAttribute('data-pinned') === 'true';
        const rectBefore = modal.getBoundingClientRect();
        if (isPinned) {
            // Ensure pinned width is maintained
            modal.style.setProperty('width', '60px', 'important');
            modal.style.setProperty('min-width', '60px', 'important');
            modal.style.setProperty('max-width', '60px', 'important');
        } else {
            // Ensure normal width is maintained
            modal.style.setProperty('width', '400px', 'important');
            modal.style.removeProperty('min-width');
            modal.style.removeProperty('max-width');
        }
        const rectAfter = modal.getBoundingClientRect();
        
        modal.style.cursor = 'move';
    }
}

function hideLoadingOverlay(jobId) {
    if (!loadingModalInstance) return;

    // Decrement active renders count
    const activeRenders = parseInt(loadingModalInstance.getAttribute('data-active-renders') || 0);
    if (activeRenders > 0) {
        loadingModalInstance.setAttribute('data-active-renders', activeRenders - 1);

        // If no more active renders, hide loading indicators
        if (activeRenders - 1 === 0) {
            const isPinned = loadingModalInstance.hasAttribute('data-pinned');
            
            if (isPinned) {
                // Hide circular loader in pinned mode
                const circularLoader = loadingModalInstance.querySelector('.rendercad-circular-loader');
                if (circularLoader) {
                    circularLoader.style.display = 'none';
                    circularLoader.style.opacity = '0';
                    circularLoader.style.visibility = 'hidden';
                    // Mark glow as not animating so it restarts next time
                    const glowEl = circularLoader.querySelector('.rendercad-circular-glow');
                    if (glowEl) glowEl.removeAttribute('data-animating');
                }
                // Also ensure divider stays hidden
                const divider = loadingModalInstance.querySelector('.rendercad-divider');
                if (divider) {
                    divider.style.display = 'none';
                    divider.style.setProperty('display', 'none', 'important');
                }
            } else {
                // Hide regular divider loading bar
            const divider = loadingModalInstance.querySelector('.rendercad-divider');
            if (divider) {
                divider.style.transition = 'all 0.5s ease';
                divider.style.transform = 'scaleX(0)';
                divider.style.opacity = '0';
                divider.style.height = '0';
                divider.style.marginBottom = '0';
                }
            }
        }

        // Update queue counter
        updateQueueCounter();
    }
}

function showLoadingBar() {
    if (!loadingModalInstance) return;

    const isPinned = loadingModalInstance.hasAttribute('data-pinned');
    
    if (isPinned) {
        // In pinned mode, show circular loading indicator around logo button
        let circularLoader = loadingModalInstance.querySelector('.rendercad-circular-loader');
        if (!circularLoader) {
            // Create circular loader - logo button should exist when pinned
            circularLoader = document.createElement('div');
            circularLoader.className = 'rendercad-circular-loader';
            // FIXED POSITION: Fixed to top and centered horizontally like logo button
            // Loader is 48px diameter, surrounds the 40px logo button at top: 8px
            // Logo button is at top: 8px, so loader at top: 4px (4px above to center around button)
            circularLoader.style.cssText = `
                position: absolute;
                top: 4px;
                left: 50%;
                transform: translateX(-50%);
                transform-origin: 50% 50%;
                width: 48px;
                height: 48px;
                border: 1px solid transparent;
                border-radius: 50%;
                pointer-events: none;
                z-index: 1000002;
                display: block;
                overflow: visible;
            `;
            
            // Create the glow element exactly like the divider - let blur create the fade
            // Key insight: mask creates the ring shape, blur creates the glow fade
            const glowElement = document.createElement('div');
            glowElement.className = 'rendercad-circular-glow';
            glowElement.style.cssText = `
                position: absolute;
                top: -16px;
                left: -16px;
                width: calc(100% + 32px);
                height: calc(100% + 32px);
                border-radius: 50%;
                background: conic-gradient(from 0deg,
                    cyan 0deg,
                    #faff70 43.2deg,
                    pink 86.4deg,
                    #faff70 129.6deg,
                    cyan 172.8deg,
                    #faff70 216deg,
                    pink 259.2deg,
                    #faff70 302.4deg,
                    cyan 345.6deg,
                    cyan 360deg);
                mask-image: radial-gradient(circle,
                    transparent 0px,
                    transparent 20px,
                    rgba(0,0,0,0.2) 20.5px,
                    rgba(0,0,0,0.6) 21px,
                    black 21.5px,
                    black 22.5px,
                    rgba(0,0,0,0.6) 23px,
                    rgba(0,0,0,0.3) 24px,
                    rgba(0,0,0,0.15) 25px,
                    rgba(0,0,0,0.05) 27px,
                    transparent 30px);
                -webkit-mask-image: radial-gradient(circle,
                    transparent 0px,
                    transparent 20px,
                    rgba(0,0,0,0.2) 20.5px,
                    rgba(0,0,0,0.6) 21px,
                    black 21.5px,
                    black 22.5px,
                    rgba(0,0,0,0.6) 23px,
                    rgba(0,0,0,0.3) 24px,
                    rgba(0,0,0,0.15) 25px,
                    rgba(0,0,0,0.05) 27px,
                    transparent 30px);
                filter: blur(4px);
                opacity: 1;
                pointer-events: none;
                z-index: 1;
            `;

            circularLoader.appendChild(glowElement);
            
            // Add spin animation if not already added
            if (!document.querySelector('#rendercad-spin-animation')) {
                const spinStyle = document.createElement('style');
                spinStyle.id = 'rendercad-spin-animation';
                spinStyle.textContent = `
                    @keyframes rendercad-spin {
                        0% {
                            transform: translateX(-50%) rotate(0deg);
                        }
                        100% {
                            transform: translateX(-50%) rotate(360deg);
                        }
                    }
                    @keyframes rendercad-spin-centered {
                        0% {
                            transform: translate(-50%, -50%) rotate(0deg);
                        }
                        100% {
                            transform: translate(-50%, -50%) rotate(360deg);
                        }
                    }
                    @keyframes rendercad-glow-rotate {
                        0% {
                            transform: rotate(0deg);
                        }
                        100% {
                            transform: rotate(360deg);
                        }
                    }
                `;
                document.head.appendChild(spinStyle);
            }
            
            // Store glow animation function reference for cleanup
            let glowAnimationFrame = null;
            let glowOffset = 0;
            function animateCircularGlow() {
                if (!circularLoader || !circularLoader.parentElement || !loadingModalInstance.hasAttribute('data-pinned')) {
                    if (glowAnimationFrame) {
                        cancelAnimationFrame(glowAnimationFrame);
                        glowAnimationFrame = null;
                    }
                    return;
                }
                glowOffset += 0.25;
                // Rotate the conic gradient by shifting the starting angle (like original divider)
                // The original divider animates background-position, we animate the gradient rotation
                // Match the visual flow speed - original uses 400% background size, animates 0.25% per frame
                // For smooth gradient flow, rotate the gradient angle continuously
                const glowEl = circularLoader.querySelector('.rendercad-circular-glow');
                if (glowEl) {
                    // Calculate rotation angle - slowed down by 20% (0.9 * 0.8 = 0.72)
                    const angle = (glowOffset * 0.72) % 360; // Slower rotation speed

                    glowEl.style.background = `conic-gradient(from ${angle}deg,
                        cyan 0deg,
                        #faff70 43.2deg,
                        pink 86.4deg,
                        #faff70 129.6deg,
                        cyan 172.8deg,
                        #faff70 216deg,
                        pink 259.2deg,
                        #faff70 302.4deg,
                        cyan 345.6deg,
                        cyan 360deg)`;
                }
                glowAnimationFrame = requestAnimationFrame(animateCircularGlow);
            }
            animateCircularGlow();
            
            // Apply rotation animation to the loader container (spins the whole thing)
            // Use correct animation based on pinned state
            const isPinnedNew = loadingModalInstance.hasAttribute('data-pinned');
            if (isPinnedNew) {
                circularLoader.style.animation = 'rendercad-spin 1s linear infinite';
            } else {
                circularLoader.style.animation = 'rendercad-spin-centered 1s linear infinite';
            }
            
            loadingModalInstance.appendChild(circularLoader);
        } else {
            // Always update position and show (in case it was hidden)
            // Position depends on pinned state
            const isPinned = loadingModalInstance.hasAttribute('data-pinned');
            if (isPinned) {
                // When pinned, position at top center (around logo button)
                circularLoader.style.top = '4px';
                circularLoader.style.left = '50%';
                circularLoader.style.transform = 'translateX(-50%)';
                circularLoader.style.transformOrigin = '50% 50%';
            } else {
                // When unpinned, center vertically and horizontally
                circularLoader.style.top = '50%';
                circularLoader.style.left = '50%';
                circularLoader.style.transform = 'translate(-50%, -50%)';
                circularLoader.style.transformOrigin = '50% 50%';
            }
            circularLoader.style.display = 'block';
            circularLoader.style.opacity = '1';
            circularLoader.style.visibility = 'visible';
            // Ensure animation is running - use correct animation based on position
            const isPinnedLoader = loadingModalInstance.hasAttribute('data-pinned');
            if (isPinnedLoader) {
                circularLoader.style.animation = 'rendercad-spin 1s linear infinite';
            } else {
                circularLoader.style.animation = 'rendercad-spin-centered 1s linear infinite';
            }

            // Restart the glow animation if it's not already running
            const glowEl = circularLoader.querySelector('.rendercad-circular-glow');
            if (glowEl && !glowEl.hasAttribute('data-animating')) {
                glowEl.setAttribute('data-animating', 'true');
                let glowAnimationFrame = null;
                let glowOffset = 0;
                function animateCircularGlow() {
                    if (!circularLoader || !circularLoader.parentElement || !loadingModalInstance.hasAttribute('data-pinned')) {
                        if (glowAnimationFrame) {
                            cancelAnimationFrame(glowAnimationFrame);
                            glowAnimationFrame = null;
                        }
                        if (glowEl) glowEl.removeAttribute('data-animating');
                        return;
                    }
                    glowOffset += 0.25;
                    const angle = (glowOffset * 0.72) % 360;
                    glowEl.style.background = `conic-gradient(from ${angle}deg,
                        cyan 0deg,
                        #faff70 43.2deg,
                        pink 86.4deg,
                        #faff70 129.6deg,
                        cyan 172.8deg,
                        #faff70 216deg,
                        pink 259.2deg,
                        #faff70 302.4deg,
                        cyan 345.6deg,
                        cyan 360deg)`;
                    glowAnimationFrame = requestAnimationFrame(animateCircularGlow);
                }
                animateCircularGlow();
            }
        }
        
        // Hide the regular divider loading bar in pinned mode - force it with multiple methods
        const divider = loadingModalInstance.querySelector('.rendercad-divider');
        if (divider) {
            divider.style.display = 'none';
            divider.style.visibility = 'hidden';
            divider.style.opacity = '0';
            divider.style.height = '0';
            divider.style.transform = 'scaleX(0)';
            divider.style.setProperty('display', 'none', 'important');
        }
    } else {
        // Normal mode: show regular loading bar
    const divider = loadingModalInstance.querySelector('.rendercad-divider');
    if (divider) {
        divider.style.transition = 'all 0.5s ease';
        divider.style.transform = 'scaleX(1)';
        divider.style.opacity = '1';
        divider.style.height = '2px';
        divider.style.marginBottom = '0';
            divider.style.display = 'block';
        }
        
        // Hide circular loader if it exists
        const circularLoader = loadingModalInstance.querySelector('.rendercad-circular-loader');
        if (circularLoader) {
            circularLoader.style.display = 'none';
        }
    }
}

function updateQueueCounter() {
    if (!loadingModalInstance) return;

    const queueCounter = loadingModalInstance.querySelector('.rendercad-queue-counter');
    if (!queueCounter) return;

    const activeRenders = parseInt(loadingModalInstance.getAttribute('data-active-renders') || 0);

    if (activeRenders > 1) {
        queueCounter.style.display = 'flex';
        queueCounter.textContent = activeRenders.toString();
        // Update position
        const modalRect = loadingModalInstance.getBoundingClientRect();
        queueCounter.style.left = (modalRect.left - 12) + 'px';
        queueCounter.style.top = (modalRect.top - 5) + 'px';
    } else {
        queueCounter.style.display = 'none';
    }
}

function displayRenderedImage(originalImage, renderedImage, rect, jobId) {
    if (!loadingModalInstance) return;

    // Get the preview container
    const previewContainer = loadingModalInstance.querySelector('.rendercad-preview-container');
    if (!previewContainer) return;

    // Show preview container and toggle bar if it's the first render
    // Only show toggle bar if images exist (not while rendering)
    const isPinned = loadingModalInstance.hasAttribute('data-pinned');
    const isFirstImage = renderedImages.length === 0;
    
    if (isFirstImage) {
        // Set isExpanded = true and expand the preview
        isExpanded = true;
        
        // Apply modal state to ensure toggle bar is shown and modal is properly expanded
        applyModalState(loadingModalInstance, isPinned, isExpanded);
    }

    // Decrement active renders
    hideLoadingOverlay(jobId);

    // Store the rendered image and original image
    renderedImages.push(renderedImage);
    originalImages.push(originalImage || null);

    // Check if we need to add/update the download all button
    updateDownloadAllButton();

    // Create preview thumbnail
    const preview = document.createElement('div');
    preview.setAttribute('data-image-url', renderedImage);
    preview.style.cssText = `
        position: relative;
        width: 100%;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 0;
        overflow: hidden;
        cursor: pointer;
        transition: all 0.3s ease;
        pointer-events: auto;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    `;

    // Add darkening gradient overlay (matching render studio)
    const gradientOverlay = document.createElement('div');
    gradientOverlay.className = 'rendercad-image-gradient-overlay';
    gradientOverlay.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 50px;
        background: linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.7) 50%, rgba(0, 0, 0, 0.4) 80%, transparent 100%);
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
        z-index: 5;
    `;

    const previewImg = document.createElement('img');
    previewImg.src = renderedImage;
    previewImg.style.cssText = `
        width: 100%;
        height: auto;
        display: block;
    `;

    // Create action buttons container (matching render studio style)
    const actionBar = document.createElement('div');
    actionBar.className = 'rendercad-image-actions';
    actionBar.style.cssText = `
        display: flex;
        gap: 0.5rem;
        justify-content: center;
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 0.5rem;
        background: transparent;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.3s ease, visibility 0.3s ease;
        z-index: 10;
        border-radius: 0 0 0 0;
    `;

    // Helper to create action button matching render studio style
    function createActionButton(iconClass, onClick, title) {
        const btn = document.createElement('button');
        btn.innerHTML = `<i class="${iconClass}"></i>`;
        btn.title = title;
        btn.style.cssText = `
            background: linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05));
            border: 1px solid rgba(255,255,255,0.5);
        color: white;
            cursor: pointer;
            transition: all 0.2s ease;
            font-family: 'Segoe UI', Arial, sans-serif;
            font-weight: 600;
            display: flex;
        align-items: center;
        justify-content: center;
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05),
                        inset 0 -1px 1px rgba(255, 255, 255, 0.5),
                        0 2px 4px rgba(0, 0, 0, 0.2);
            flex: 1;
            width: auto;
            min-width: 32px;
            height: 32px;
            border-radius: 4px;
            font-size: 14px;
            padding: 0.5rem;
        `;

        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
            btn.style.borderColor = 'rgba(255,255,255,0.5)';
            btn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
            btn.style.borderColor = 'rgba(255,255,255,0.5)';
            btn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)';
        });

        btn.addEventListener('click', (e) => {
        e.stopPropagation();
            onClick();
        });

        return btn;
    }

    // Download button
    const downloadBtn = createActionButton('fas fa-download', () => {
        const link = document.createElement('a');
        link.download = `rendercad-render-${Date.now()}.png`;
        link.href = renderedImage;
        link.click();
    }, 'Download');

    // Toggle button (if we have original image stored)
    let toggleBtn = null;
    if (originalImage) {
        let showingOriginal = false;
        toggleBtn = createActionButton('fas fa-exchange-alt', () => {
            showingOriginal = !showingOriginal;
            previewImg.src = showingOriginal ? originalImage : renderedImage;
        }, 'Toggle original/render');
        actionBar.appendChild(toggleBtn);
    }

    // Re-render button
    const redoBtn = createActionButton('fas fa-redo', () => {
        // Find the image index in renderedImages
        const imageIndex = renderedImages.indexOf(renderedImage);
        if (imageIndex !== -1 && originalImages[imageIndex]) {
            // Get the corresponding original image
            const originalImageData = originalImages[imageIndex];
            const newJobId = showLoadingOverlay();
            // Send re-render request with original image data
            window.captureAPI.sendToRenderCAD(originalImageData, rect).then(renderedResult => {
                // Update the rendered image
                renderedImages[imageIndex] = renderedResult;
                // Update the preview image
                const previewImg = preview.querySelector('img');
                if (previewImg) {
                    previewImg.src = renderedResult;
                }
                hideLoadingOverlay(newJobId);
            }).catch(error => {
                console.error('[RenderCAD] Re-render failed:', error);
                hideLoadingOverlay(newJobId);
                window.captureAPI.showNotification({ title: 'Re-render Failed', body: error.message || 'Failed to re-render image' });
            });
        } else {
            // Fallback to capture if original not found
            const newJobId = showLoadingOverlay();
            captureAreaElectron(rect, newJobId);
        }
    }, 'Re-render');

    // Remove button (trash icon) - always show, using same styling as other buttons
    const removeBtn = createActionButton('fas fa-trash', () => {
        // Remove from arrays
        const imageIndex = renderedImages.indexOf(renderedImage);
        if (imageIndex !== -1) {
            renderedImages.splice(imageIndex, 1);
            originalImages.splice(imageIndex, 1);
        }
        
        // Close fullscreen view if it's showing this image
        const existingResult = document.getElementById('rendercad-result-overlay');
        if (existingResult) {
            const currentImg = existingResult.querySelector('img');
            if (currentImg && currentImg.src === renderedImage) {
                existingResult.remove();
            } else if (currentFullscreenIndex >= imageIndex && currentFullscreenIndex > 0) {
                // Adjust index if we removed an image before the current one
                currentFullscreenIndex--;
            }
        }
        
        // Remove from DOM
        preview.remove();
        
        // Update download all button
        updateDownloadAllButton();
        
        // If no images left, hide preview container and toggle bar
        if (renderedImages.length === 0) {
            const previewContainer = loadingModalInstance.querySelector('.rendercad-preview-container');
            const toggleBar = loadingModalInstance.querySelector('.rendercad-toggle-bar');
            if (previewContainer) {
                previewContainer.style.display = 'none';
            }
            if (toggleBar) {
                toggleBar.style.display = 'none';
            }
        }
    }, 'Remove');

    actionBar.appendChild(downloadBtn);
    actionBar.appendChild(redoBtn);
    actionBar.appendChild(removeBtn);

    // Hover effects to show action bar and gradient overlay
    preview.addEventListener('mouseenter', () => {
        preview.style.borderColor = 'rgba(255, 255, 255, 0.5)';
        preview.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.5)';
        actionBar.style.opacity = '1';
        actionBar.style.visibility = 'visible';
        gradientOverlay.style.opacity = '1';
    });

    preview.addEventListener('mouseleave', () => {
        preview.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        preview.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
        actionBar.style.opacity = '0';
        actionBar.style.visibility = 'hidden';
        gradientOverlay.style.opacity = '0';
    });

    // Click to expand (but not if clicking buttons)
    preview.addEventListener('click', (e) => {
        // Only open fullscreen if clicking on the image itself, not on buttons or action bar
        if (!e.target.closest('button') && !e.target.closest('.rendercad-image-actions')) {
            e.stopPropagation();
            const currentIndex = renderedImages.indexOf(renderedImage);
            if (currentIndex >= 0) {
                showFullscreenImage(currentIndex);
            }
        }
    });
    
    // Also make the image itself clickable
    previewImg.style.cursor = 'pointer';
    previewImg.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentIndex = renderedImages.indexOf(renderedImage);
        if (currentIndex >= 0) {
            showFullscreenImage(currentIndex);
        }
    });

    // Handle image load errors
    previewImg.addEventListener('error', () => {
        previewImg.style.opacity = '0.3';
    });

    previewImg.addEventListener('load', () => {
        previewImg.style.opacity = '1';
    });

    preview.appendChild(previewImg);
    preview.appendChild(gradientOverlay);
    preview.appendChild(actionBar);
    previewContainer.appendChild(preview);
    previewContainer.style.display = 'block';
}

function updateDownloadAllButton() {
    if (!loadingModalInstance) return;

    const previewContainer = loadingModalInstance.querySelector('.rendercad-preview-container');
    if (!previewContainer) return;

    // Count how many images we have
    const imageCount = renderedImages.length;

    // Only show button if we have 2 or more images
    if (imageCount < 2) {
        const existingButton = loadingModalInstance.querySelector('.rendercad-download-all-btn');
        if (existingButton) {
            existingButton.remove();
        }
        return;
    }

    // Check if button already exists
    let downloadAllBtn = loadingModalInstance.querySelector('.rendercad-download-all-btn');

    if (!downloadAllBtn) {
        // Create the button
        downloadAllBtn = document.createElement('button');
        downloadAllBtn.className = 'rendercad-download-all-btn';
        downloadAllBtn.innerHTML = '⬇ Download All';
        downloadAllBtn.style.cssText = `
            background: linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05));
            border: 1px solid rgba(255,255,255,0.5);
            color: white;
            padding: 6px 12px;
            margin: 0;
            border-radius: 4px;
            cursor: pointer;
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 12px;
            font-weight: 600;
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05),
                        inset 0 -1px 1px rgba(255, 255, 255, 0.5),
                        0 2px 4px rgba(0, 0, 0, 0.2);
            transition: all 0.2s ease;
            margin-bottom: 10px;
            width: 100%;
        `;

        downloadAllBtn.addEventListener('mouseenter', () => {
            downloadAllBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
            downloadAllBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
        });

        downloadAllBtn.addEventListener('mouseleave', () => {
            downloadAllBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
            downloadAllBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)';
        });

        downloadAllBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            try {
                // Create zip file from all images
                if (window.captureAPI && window.captureAPI.createZipFromImages) {
                    const result = await window.captureAPI.createZipFromImages(renderedImages);
                    if (result && result.success) {
                        // Download the zip file
                        const link = document.createElement('a');
                        link.download = result.fileName || `rendercad-renders-${Date.now()}.zip`;
                        link.href = result.zipDataUrl;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    } else {
                        console.error('[RenderCAD] Failed to create zip:', result?.error);
                        // Fallback to individual downloads
                        for (let i = 0; i < renderedImages.length; i++) {
                            const link = document.createElement('a');
                            link.download = `rendercad-render-${Date.now()}-${i + 1}.png`;
                            link.href = renderedImages[i];
                            link.click();
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                    }
                } else {
                    // Fallback to individual downloads if API not available
                    for (let i = 0; i < renderedImages.length; i++) {
                        const link = document.createElement('a');
                        link.download = `rendercad-render-${Date.now()}-${i + 1}.png`;
                        link.href = renderedImages[i];
                        link.click();
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
            } catch (error) {
                console.error('[RenderCAD] Error downloading all images:', error);
            }
        });

        // Insert at the beginning of preview container
        previewContainer.insertBefore(downloadAllBtn, previewContainer.firstChild);
    }

    // Update button text with count - show only icon in pinned mode
    const isPinned = loadingModalInstance.hasAttribute('data-pinned');
    if (isPinned) {
        downloadAllBtn.innerHTML = '<i class="fas fa-download"></i>';
        downloadAllBtn.title = `Download All (${imageCount})`;
    } else {
        downloadAllBtn.innerHTML = `⬇ Download All (${imageCount})`;
        downloadAllBtn.title = '';
    }
}

let currentFullscreenIndex = 0;

function showFullscreenImage(imageIndex) {
    currentFullscreenIndex = imageIndex;

    // Remove any existing result overlay first
    const existingResult = document.getElementById('rendercad-result-overlay');
    if (existingResult) {
        existingResult.remove();
    }

    const renderedImage = renderedImages[currentFullscreenIndex];
    if (!renderedImage) return;

    // Create overlay for displaying the result (matching render studio)
    const resultOverlay = document.createElement('div');
    resultOverlay.id = 'rendercad-result-overlay';
    resultOverlay.className = 'fullscreen-image-overlay';
    resultOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.95);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: default;
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: auto;
    `;

    // Create image container (matching render studio)
    const imgContainer = document.createElement('div');
    imgContainer.className = 'fullscreen-img-container';
    imgContainer.style.cssText = `
        max-width: 90vw;
        max-height: 85vh;
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        cursor: default;
    `;

    const imgWrapper = document.createElement('div');
    imgWrapper.style.cssText = `
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        max-height: 85vh;
    `;

    const img = document.createElement('img');
    img.src = renderedImage;
    img.style.cssText = `
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        display: block;
        cursor: default;
    `;

    imgWrapper.appendChild(img);

    // Navigation buttons (only if multiple images) - matching render studio
    let prevBtn, nextBtn;
    if (renderedImages.length > 1) {
        prevBtn = document.createElement('button');
        prevBtn.className = 'fullscreen-nav-btn fullscreen-prev';
        prevBtn.innerHTML = '‹';
        prevBtn.style.cssText = `
            position: fixed;
            left: 20px;
            top: 50%;
            transform: translateY(-50%);
            background: linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05));
            border: 1px solid rgba(255,255,255,0.5);
            color: white;
            width: 50px;
            height: 50px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 24px;
            font-weight: 600;
            font-family: 'Segoe UI', Arial, sans-serif;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05),
                        inset 0 -1px 1px rgba(255, 255, 255, 0.5),
                        0 2px 4px rgba(0, 0, 0, 0.2);
            transition: all 0.2s ease;
            z-index: 10001;
            padding: 0;
            margin: 0;
        `;

        prevBtn.addEventListener('mouseenter', () => {
            prevBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
            prevBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
        });

        prevBtn.addEventListener('mouseleave', () => {
            prevBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
            prevBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)';
        });

        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newIndex = currentFullscreenIndex > 0 ? currentFullscreenIndex - 1 : renderedImages.length - 1;
            showFullscreenImage(newIndex);
        });

        nextBtn = document.createElement('button');
        nextBtn.className = 'fullscreen-nav-btn fullscreen-next';
        nextBtn.innerHTML = '›';
        nextBtn.style.cssText = `
            position: fixed;
            right: 20px;
            top: 50%;
            transform: translateY(-50%);
            background: linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05));
            border: 1px solid rgba(255,255,255,0.5);
            color: white;
            width: 50px;
            height: 50px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 24px;
            font-weight: 600;
            font-family: 'Segoe UI', Arial, sans-serif;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05),
                        inset 0 -1px 1px rgba(255, 255, 255, 0.5),
                        0 2px 4px rgba(0, 0, 0, 0.2);
            transition: all 0.2s ease;
            z-index: 10001;
            padding: 0;
            margin: 0;
        `;

        nextBtn.addEventListener('mouseenter', () => {
            nextBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
            nextBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
        });

        nextBtn.addEventListener('mouseleave', () => {
            nextBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
            nextBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)';
        });

        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newIndex = currentFullscreenIndex < renderedImages.length - 1 ? currentFullscreenIndex + 1 : 0;
            showFullscreenImage(newIndex);
        });

        imgWrapper.appendChild(prevBtn);
        imgWrapper.appendChild(nextBtn);
    }

    // Button container below image (matching render studio)
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        gap: 12px;
        justify-content: center;
        margin-top: 20px;
        z-index: 10001;
        flex-shrink: 0;
    `;

    // Toggle original/render button (only if rendered and original exists) - matching render studio
    let toggleBtn;
    let showingOriginal = false;
    const originalImage = originalImages[currentFullscreenIndex];
    if (originalImage) {
        toggleBtn = document.createElement('button');
        toggleBtn.className = 'fullscreen-action-btn studio-btn-nav';
        toggleBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> Toggle Original';
        toggleBtn.style.cssText = `
        background: linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05));
        border: 1px solid rgba(255,255,255,0.5);
        color: white;
            padding: 12px 24px;
        border-radius: 4px;
        cursor: pointer;
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 14px;
        font-weight: 600;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05),
                        inset 0 -1px 1px rgba(255, 255, 255, 0.5),
                        0 2px 4px rgba(0, 0, 0, 0.2);
        transition: all 0.2s ease;
    `;

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showingOriginal = !showingOriginal;
            if (showingOriginal) {
                img.src = originalImage;
                toggleBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> Toggle Render';
            } else {
                img.src = renderedImage;
                toggleBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> Toggle Original';
            }
        });

        buttonContainer.appendChild(toggleBtn);
    }

    // Download button - matching render studio
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'fullscreen-action-btn studio-btn-nav';
    downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download';
    downloadBtn.style.cssText = `
            background: linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05));
            border: 1px solid rgba(255,255,255,0.5);
            color: white;
            padding: 12px 24px;
            border-radius: 4px;
            cursor: pointer;
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 14px;
            font-weight: 600;
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05),
                        inset 0 -1px 1px rgba(255, 255, 255, 0.5),
                        0 2px 4px rgba(0, 0, 0, 0.2);
            transition: all 0.2s ease;
        `;

    downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
                const link = document.createElement('a');
        link.download = `rendercad-render-${Date.now()}.png`;
        link.href = renderedImage;
                link.click();
        });

    // Close button - matching render studio
    const closeBtn = document.createElement('button');
    closeBtn.className = 'fullscreen-action-btn studio-btn-nav';
    closeBtn.innerHTML = '✕ Close';
    closeBtn.style.cssText = `
        background: linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05));
        border: 1px solid rgba(255,255,255,0.5);
        color: white;
        padding: 12px 24px;
        border-radius: 4px;
        cursor: pointer;
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 14px;
        font-weight: 600;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05),
                    inset 0 -1px 1px rgba(255, 255, 255, 0.5),
                    0 2px 4px rgba(0, 0, 0, 0.2);
        transition: all 0.2s ease;
    `;

    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeOverlay();
    });

    function closeOverlay() {
        resultOverlay.style.opacity = '0';
        setTimeout(() => {
            resultOverlay.remove();
            document.removeEventListener('keydown', escHandler);
        }, 300);
    }

    function navigateFullscreen(direction) {
        currentFullscreenIndex += direction;
        if (currentFullscreenIndex < 0) {
            currentFullscreenIndex = renderedImages.length - 1;
        } else if (currentFullscreenIndex >= renderedImages.length) {
            currentFullscreenIndex = 0;
        }
        
        const newRenderedImage = renderedImages[currentFullscreenIndex];
        if (newRenderedImage) {
            img.src = newRenderedImage;
            showingOriginal = false;
            
            // Update toggle button if it exists
            const newOriginalImage = originalImages[currentFullscreenIndex];
            if (toggleBtn && newOriginalImage) {
                toggleBtn.style.display = '';
                toggleBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> Toggle Original';
            } else if (toggleBtn) {
                toggleBtn.style.display = 'none';
            }
        }
    }

    // Add ESC key handler
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeOverlay();
        } else if (e.key === 'ArrowLeft' && prevBtn) {
            navigateFullscreen(-1);
        } else if (e.key === 'ArrowRight' && nextBtn) {
            navigateFullscreen(1);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Don't close on image click, only on overlay background
    resultOverlay.addEventListener('click', (e) => {
        if (e.target === resultOverlay) {
            closeOverlay();
        }
    });

    buttonContainer.appendChild(downloadBtn);
    buttonContainer.appendChild(closeBtn);
    imgContainer.appendChild(imgWrapper);
    imgContainer.appendChild(buttonContainer);
    resultOverlay.appendChild(imgContainer);

    document.body.appendChild(resultOverlay);

    // Fade in
    setTimeout(() => {
        resultOverlay.style.opacity = '1';
    }, 10);
}

function showRenderError(errorMessage, jobId) {
    // Hide loading overlay if present
    if (jobId) {
        hideLoadingOverlay(jobId);
    }

    // Check if this is a token limit error
    if (errorMessage && errorMessage.startsWith('TOKEN_LIMIT_EXCEEDED:')) {
        const parts = errorMessage.split(':');
        const used = parts[1] || '0';
        const limit = parts[2] || '0';
        const message = parts.slice(3).join(':') || 'Monthly render limit reached';
        showTokenLimitModal(message, used, limit);
        return;
    }

    // Remove any existing error overlay first
    const existingError = document.getElementById('rendercad-error-overlay');
    if (existingError) {
        existingError.remove();
    }

    // Create error overlay - don't darken the whole screen, just show a modal
    const errorOverlay = document.createElement('div');
    errorOverlay.id = 'rendercad-error-overlay';
    errorOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: transparent;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
    `;

    const errorContainer = document.createElement('div');
    errorContainer.style.cssText = `
        background: rgba(20, 20, 20, 0.95);
        border: 2px solid rgba(255, 50, 50, 0.8);
        border-radius: 8px;
        padding: 30px;
        max-width: 500px;
        text-align: center;
        color: white;
        font-family: 'Segoe UI', Arial, sans-serif;
        box-shadow: 0 0 20px rgba(255, 50, 50, 0.3);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        pointer-events: auto;
    `;

    const errorIcon = document.createElement('div');
    errorIcon.style.cssText = `
        font-size: 48px;
        margin-bottom: 15px;
    `;
    errorIcon.textContent = '⚠';

    const errorTitle = document.createElement('div');
    errorTitle.style.cssText = `
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 10px;
    `;
    errorTitle.textContent = 'Render Failed';

    const errorText = document.createElement('div');
    errorText.style.cssText = `
        font-size: 14px;
        opacity: 0.9;
        margin-bottom: 20px;
    `;
    errorText.textContent = errorMessage;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.innerHTML = 'Close';
    closeBtn.style.cssText = `
        background: linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05));
        border: 1px solid rgba(255,255,255,0.5);
        color: white;
        padding: 10px 20px;
        border-radius: 4px;
        cursor: pointer;
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 14px;
        font-weight: 600;
        transition: all 0.2s ease;
    `;

    closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
    });

    closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
    });

    closeBtn.addEventListener('click', () => {
        errorOverlay.remove();
    });

    // Add ESC key handler
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            errorOverlay.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    errorContainer.appendChild(errorIcon);
    errorContainer.appendChild(errorTitle);
    errorContainer.appendChild(errorText);
    errorContainer.appendChild(closeBtn);
    errorOverlay.appendChild(errorContainer);

    document.body.appendChild(errorOverlay);
}

function showTokenLimitModal(message, used, limit) {
    // Remove any existing modals
    const existingModal = document.getElementById('rendercad-token-limit-modal');
    if (existingModal) {
        existingModal.remove();
    }

    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'rendercad-token-limit-modal';
    modalOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.85);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: rgba(20, 20, 20, 0.95);
        border: 2px solid rgba(255, 193, 7, 0.8);
        border-radius: 8px;
        padding: 30px;
        max-width: 500px;
        text-align: center;
        color: white;
        font-family: 'Segoe UI', Arial, sans-serif;
        box-shadow: 0 0 20px rgba(255, 193, 7, 0.3);
    `;

    const modalTitle = document.createElement('div');
    modalTitle.style.cssText = `
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 15px;
        color: #ffc107;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
    `;
    modalTitle.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Monthly Render Limit Reached';

    const modalMessage = document.createElement('div');
    modalMessage.style.cssText = `
        font-size: 14px;
        opacity: 0.9;
        margin-bottom: 15px;
    `;
    modalMessage.textContent = message || 'You have reached your monthly render limit.';

    const usageAlert = document.createElement('div');
    usageAlert.style.cssText = `
        background: rgba(255, 193, 7, 0.1);
        border: 1px solid rgba(255, 193, 7, 0.3);
        border-radius: 4px;
        padding: 12px;
        margin-bottom: 20px;
        font-size: 14px;
    `;
    usageAlert.innerHTML = `<strong>Usage:</strong> ${used} / ${limit} renders this month`;

    const upgradeText = document.createElement('div');
    upgradeText.style.cssText = `
        font-size: 14px;
        margin-bottom: 20px;
        opacity: 0.9;
    `;
    upgradeText.textContent = 'Upgrade your plan to continue rendering!';

    const upgradeButton = document.createElement('button');
    upgradeButton.type = 'button';
    upgradeButton.innerHTML = '<i class="fas fa-arrow-up"></i> Upgrade Plan';
    upgradeButton.style.cssText = `
        background: linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05));
        border: 1px solid rgba(255,255,255,0.5);
        color: white;
        padding: 12px 24px;
        border-radius: 4px;
        cursor: pointer;
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 14px;
        font-weight: 600;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05),
                    inset 0 -1px 1px rgba(255, 255, 255, 0.5),
                    0 2px 4px rgba(0, 0, 0, 0.2);
        transition: all 0.2s ease;
        width: 100%;
    `;

    upgradeButton.addEventListener('mouseenter', () => {
        upgradeButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
        upgradeButton.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
    });

    upgradeButton.addEventListener('mouseleave', () => {
        upgradeButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
        upgradeButton.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)';
    });

    upgradeButton.addEventListener('click', () => {
        window.electronAPI.openExternal('https://rendercad.ai/settings');
    });

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.innerHTML = '✕ Close';
    closeButton.style.cssText = `
        background: linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05));
        border: 1px solid rgba(255,255,255,0.5);
        color: white;
        padding: 10px 20px;
        border-radius: 4px;
        cursor: pointer;
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 14px;
        font-weight: 600;
        transition: all 0.2s ease;
        margin-top: 10px;
        width: 100%;
    `;

    closeButton.addEventListener('mouseenter', () => {
        closeButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
    });

    closeButton.addEventListener('mouseleave', () => {
        closeButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
    });

    closeButton.addEventListener('click', () => {
        modalOverlay.remove();
    });

    // Add ESC key handler
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            modalOverlay.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    modalContent.appendChild(modalTitle);
    modalContent.appendChild(modalMessage);
    modalContent.appendChild(usageAlert);
    modalContent.appendChild(upgradeText);
    modalContent.appendChild(upgradeButton);
    modalContent.appendChild(closeButton);
    modalOverlay.appendChild(modalContent);

    document.body.appendChild(modalOverlay);
}

// Close guard against multiple injections
}