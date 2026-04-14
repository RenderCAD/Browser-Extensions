// Guard against multiple injections
if (typeof window.renderCADContentScriptLoaded === 'undefined') {
    window.renderCADContentScriptLoaded = true;
    
    // Clear saved capture position on fresh extension start
    // This ensures the capture region is reset when the extension is closed and reopened
    try {
        localStorage.removeItem('renderCAD_lastCapturePosition');
    } catch (e) {
        // Ignore errors if localStorage is not available
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
let selectedRenderMode = 'preserve';
const RENDER_MODE_STORAGE_KEY = 'rendercad_render_mode';
const VIEWPORT_GUTTER = 16;
const UNPINNED_MODAL_WIDTH = 320;
const PINNED_MODAL_WIDTH = 60;

function normalizeRenderMode(mode) {
    return mode === 'creative' ? 'creative' : 'preserve';
}

function clampValue(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function getResponsiveModalWidthCss() {
    return `min(${UNPINNED_MODAL_WIDTH}px, calc(100vw - ${VIEWPORT_GUTTER * 2}px))`;
}

function applyUnpinnedModalWidth(modal) {
    const responsiveWidth = getResponsiveModalWidthCss();
    modal.style.setProperty('width', responsiveWidth, 'important');
    modal.style.setProperty('min-width', responsiveWidth, 'important');
    modal.style.setProperty('max-width', responsiveWidth, 'important');
}

function clampModalToViewport(modal) {
    if (!modal || !document.body.contains(modal)) return;

    const rect = modal.getBoundingClientRect();
    const maxLeft = Math.max(VIEWPORT_GUTTER, window.innerWidth - rect.width - VIEWPORT_GUTTER);
    const maxTop = Math.max(VIEWPORT_GUTTER, window.innerHeight - rect.height - VIEWPORT_GUTTER);

    let left = rect.left;
    let top = rect.top;

    if (modal.style.right && modal.style.right !== 'auto') {
        left = Math.max(VIEWPORT_GUTTER, window.innerWidth - rect.width - VIEWPORT_GUTTER);
    }
    if (!modal.style.top) {
        top = VIEWPORT_GUTTER;
    }

    modal.style.position = 'fixed';
    modal.style.left = clampValue(left, VIEWPORT_GUTTER, maxLeft) + 'px';
    modal.style.top = clampValue(top, VIEWPORT_GUTTER, maxTop) + 'px';
    modal.style.right = 'auto';
    modal.style.bottom = 'auto';
}

function positionFloatingDropdown(dropdown, anchorRect) {
    if (!dropdown || !anchorRect) return;

    dropdown.style.maxWidth = `calc(100vw - ${VIEWPORT_GUTTER * 2}px)`;
    dropdown.style.maxHeight = `calc(100vh - ${VIEWPORT_GUTTER * 2}px)`;
    dropdown.style.overflowY = 'auto';
    dropdown.style.visibility = 'hidden';
    dropdown.style.display = 'block';

    const dropdownRect = dropdown.getBoundingClientRect();
    let left = anchorRect.right - dropdownRect.width;
    let top = anchorRect.bottom + 2;

    if (top + dropdownRect.height > window.innerHeight - VIEWPORT_GUTTER) {
        top = anchorRect.top - dropdownRect.height - 2;
    }

    left = clampValue(left, VIEWPORT_GUTTER, Math.max(VIEWPORT_GUTTER, window.innerWidth - dropdownRect.width - VIEWPORT_GUTTER));
    top = clampValue(top, VIEWPORT_GUTTER, Math.max(VIEWPORT_GUTTER, window.innerHeight - dropdownRect.height - VIEWPORT_GUTTER));

    dropdown.style.left = left + 'px';
    dropdown.style.top = top + 'px';
    dropdown.style.right = 'auto';
    dropdown.style.bottom = 'auto';
    dropdown.style.visibility = 'visible';
}

function hideFloatingMenus() {
    const pinnedDropdown = document.querySelector('.rendercad-options-dropdown');
    const unpinnedDropdown = document.querySelector('.rendercad-unpinned-options-dropdown');

    if (pinnedDropdown) {
        pinnedDropdown.style.display = 'none';
    }

    if (unpinnedDropdown) {
        unpinnedDropdown.style.display = 'none';
    }
}

function setHeaderButtonTransform(button, scale = 1) {
    button.style.transform = `scale(${scale})`;
}

function applyImportantStyles(element, styles) {
    Object.entries(styles).forEach(([property, value]) => {
        element.style.setProperty(property, value, 'important');
    });
}

function setCaptureOptionButtonState(button, state = 'default') {
    const palettes = {
        default: {
            background: 'linear-gradient(-75deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04), rgba(255,255,255,0.12))',
            'background-color': 'rgba(8, 12, 18, 0.98)',
            border: '1px solid rgba(255,255,255,0.88)',
            color: '#ffffff',
            'webkit-text-fill-color': '#ffffff',
            'box-shadow': '0 4px 12px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.16), inset 0 -1px 0 rgba(0, 0, 0, 0.36)'
        },
        hover: {
            background: 'linear-gradient(-75deg, rgba(255,255,255,0.16), rgba(255,255,255,0.08), rgba(255,255,255,0.16))',
            'background-color': 'rgba(14, 20, 30, 0.99)',
            border: '1px solid rgba(255,255,255,0.96)',
            color: '#ffffff',
            'webkit-text-fill-color': '#ffffff',
            'box-shadow': '0 6px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 rgba(0, 0, 0, 0.36)'
        },
        active: {
            background: 'linear-gradient(-75deg, rgba(80,190,255,0.34), rgba(15,98,148,0.12), rgba(80,190,255,0.34))',
            'background-color': 'rgba(6, 48, 70, 0.99)',
            border: '1px solid rgba(134,228,255,1)',
            color: '#f7fdff',
            'webkit-text-fill-color': '#f7fdff',
            'box-shadow': '0 6px 18px rgba(0, 0, 0, 0.58), 0 0 0 1px rgba(134,228,255,0.24), inset 0 1px 0 rgba(255, 255, 255, 0.18)'
        },
        pressed: {
            background: 'linear-gradient(-75deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08), rgba(255,255,255,0.18))',
            'background-color': 'rgba(18, 26, 38, 1)',
            border: '1px solid rgba(255,255,255,0.96)',
            color: '#ffffff',
            'webkit-text-fill-color': '#ffffff',
            'box-shadow': '0 3px 10px rgba(0, 0, 0, 0.58), inset 0 2px 3px rgba(0, 0, 0, 0.24), inset 0 -1px 0 rgba(255, 255, 255, 0.12)'
        }
    };

    const sharedStyles = {
        all: 'unset',
        appearance: 'none',
        '-webkit-appearance': 'none',
        display: 'inline-flex',
        'align-items': 'center',
        'justify-content': 'center',
        'box-sizing': 'border-box',
        'min-height': '32px',
        padding: '6px 12px',
        'border-radius': '4px',
        cursor: 'pointer',
        'font-family': 'Segoe UI, Arial, sans-serif',
        'font-size': '12px',
        'font-weight': '700',
        'line-height': '1',
        'text-align': 'center',
        'text-shadow': '0 1px 2px rgba(0, 0, 0, 0.82)',
        transition: 'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease',
        'user-select': 'none'
    };

    applyImportantStyles(button, {
        ...sharedStyles,
        ...(palettes[state] || palettes.default)
    });
}

function applyConfirmButtonInlineStyles(button) {
    applyImportantStyles(button, {
        appearance: 'none',
        '-webkit-appearance': 'none',
        position: 'fixed',
        top: '0',
        left: '0',
        background: 'linear-gradient(-75deg, rgba(0,255,100,0.2), rgba(100,255,100,0.3), rgba(0,255,100,0.2))',
        border: '2px solid rgba(0,255,100,0.9)',
        color: '#ffffff',
        '-webkit-text-fill-color': '#ffffff',
        padding: '10px 20px',
        'border-radius': '50%',
        cursor: 'pointer',
        'font-family': 'Segoe UI, Arial, sans-serif',
        'font-size': '20px',
        'font-weight': '600',
        'line-height': '1',
        'text-align': 'center',
        'text-shadow': '0 1px 2px rgba(0, 0, 0, 0.75)',
        'backdrop-filter': 'blur(4px)',
        '-webkit-backdrop-filter': 'blur(4px)',
        'box-shadow': '0 0 12px rgba(0,255,100,0.6), inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5)',
        transition: 'all 0.2s ease',
        'z-index': '1000010',
        width: '50px',
        height: '50px',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'box-sizing': 'border-box',
        'pointer-events': 'auto',
        'user-select': 'none',
        'will-change': 'transform'
    });
}

async function getStoredRenderModePreference() {
    try {
        if (!chrome.runtime?.id) {
            return selectedRenderMode;
        }

        const result = await chrome.storage.local.get([RENDER_MODE_STORAGE_KEY]);
        return normalizeRenderMode(result[RENDER_MODE_STORAGE_KEY]);
    } catch (error) {
        return selectedRenderMode;
    }
}

async function storeRenderModePreference(mode) {
    selectedRenderMode = normalizeRenderMode(mode);

    try {
        if (!chrome.runtime?.id) {
            return;
        }

        await chrome.storage.local.set({ [RENDER_MODE_STORAGE_KEY]: selectedRenderMode });
    } catch (error) {
        console.warn('Could not save render mode preference:', error);
    }
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('[RENDERCAD Content] Message received:', request.action);
    if (request.action === 'startScreenCapture') {
        startScreenCapture();
        sendResponse({success: true});
    } else if (request.action === 'openModal') {
        console.log('[RENDERCAD Content] Opening modal...');
        openRenderModal();
        sendResponse({success: true});
    } else if (request.action === 'displayRenderedImage') {
        console.log('[RENDERCAD Content] Received displayRenderedImage, image size:', request.renderedImage?.length);
        try {
            displayRenderedImage(request.originalImage, request.renderedImage, request.rect, request.jobId);
            console.log('[RENDERCAD Content] displayRenderedImage completed successfully');
            sendResponse({success: true});
        } catch (error) {
            console.error('[RENDERCAD Content] Error in displayRenderedImage:', error);
            sendResponse({success: false, error: error.message});
        }
    } else if (request.action === 'renderError') {
        showRenderError(request.error, request.jobId);
        sendResponse({success: true});
    }
});

async function startScreenCapture() {
    console.log('[RENDERCAD Content] startScreenCapture called, isCapturing:', isCapturing);
    
    if (isCapturing) {
        console.log('[RENDERCAD Content] Already capturing, ignoring');
        return;
    }
    
    // Check authentication before starting capture
    console.log('[RENDERCAD Content] Checking authentication...');
    const isAuthenticated = await checkAuthentication();
    console.log('[RENDERCAD Content] Authentication status:', isAuthenticated);
    
    if (!isAuthenticated) {
        console.log('[RENDERCAD Content] Not authenticated, showing sign in prompt');
        showSignInPrompt();
        return;
    }
    
    console.log('[RENDERCAD Content] Starting capture UI...');
    selectedRenderMode = await getStoredRenderModePreference();

    // Restore previous capture position if available (cleared on fresh extension start)
    let savedPosition = null;
    try {
        const saved = localStorage.getItem('renderCAD_lastCapturePosition');
        if (saved) {
            savedPosition = JSON.parse(saved);
        }
    } catch (e) {
        console.warn('Could not restore capture position:', e);
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
            background: linear-gradient(-75deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04), rgba(255,255,255,0.12));
            background-color: rgba(8, 12, 18, 0.96);
            border: 1px solid rgba(255,255,255,0.82);
            color: white;
            padding: 6px 12px;
            margin: 0;
            border-radius: 4px;
            cursor: pointer;
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 12px;
            font-weight: 600;
            line-height: 1;
            min-height: 32px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45),
                inset 0 1px 0 rgba(255, 255, 255, 0.18),
                inset 0 -1px 0 rgba(0, 0, 0, 0.35);
            transition: all 0.2s ease;
        }

        .rendercad-aspect-btn:hover {
            background: linear-gradient(-75deg, rgba(255,255,255,0.16), rgba(255,255,255,0.07), rgba(255,255,255,0.16));
            background-color: rgba(15, 22, 32, 0.98);
            border-color: rgba(255,255,255,0.92);
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.52),
                inset 0 1px 0 rgba(255, 255, 255, 0.22),
                inset 0 -1px 0 rgba(0, 0, 0, 0.35);
        }

        .rendercad-aspect-btn:active {
            background: linear-gradient(-75deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08), rgba(255,255,255,0.18));
            background-color: rgba(18, 27, 38, 0.99);
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5),
                inset 0 2px 2px rgba(0, 0, 0, 0.18),
                inset 0 -1px 0 rgba(255, 255, 255, 0.12);
            transform: scale(0.98);
        }

        .rendercad-aspect-btn.active {
            background: linear-gradient(-75deg, rgba(45, 175, 255, 0.35), rgba(17, 126, 188, 0.12), rgba(45, 175, 255, 0.35));
            background-color: rgba(6, 52, 74, 0.98);
            border: 1px solid rgba(102, 221, 255, 0.95);
            color: #f5fdff;
            box-shadow: 0 0 0 1px rgba(102, 221, 255, 0.2),
                0 6px 18px rgba(0, 0, 0, 0.5),
                inset 0 1px 0 rgba(255, 255, 255, 0.16);
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
    
    // Hide the render modal during capture
    if (loadingModalInstance) {
        loadingModalInstance.style.display = 'none';
    }
    
    // Create overlay
    overlay = document.createElement('div');
    overlay.id = 'rendercad-overlay';
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
        top: ${VIEWPORT_GUTTER}px;
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
        width: min(540px, calc(100vw - ${VIEWPORT_GUTTER * 2}px));
        max-height: calc(100vh - ${VIEWPORT_GUTTER * 2}px);
        overflow-y: auto;
        box-sizing: border-box;
    `;
    instructions.innerHTML = `
        <div style="text-align: center;">
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 4px;">
                <img src="${chrome.runtime.getURL('icons/logo.svg')}" alt="RENDERCAD" style="width: 20px; height: 20px;">
                <strong style="font-size: 16px;">RENDERCAD Screen Capture</strong>
            </div>
            <div style="margin: 10px 0 8px 0;">Click and drag to select the CAD area to render</div>
             <div style="margin: 8px 0;">
                 <strong style="font-size: 12px;">Aspect Ratio:</strong><br>
                 <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;">
                     <button type="button" class="rendercad-aspect-btn ${aspectRatio === null ? 'active' : ''}" data-aspect="free">Free</button>
                     <button type="button" class="rendercad-aspect-btn ${aspectRatio === 1 ? 'active' : ''}" data-aspect="1">1:1</button>
                     <button type="button" class="rendercad-aspect-btn ${aspectRatio === 1.333 ? 'active' : ''}" data-aspect="1.333">4:3</button>
                     <button type="button" class="rendercad-aspect-btn ${aspectRatio === 1.777 ? 'active' : ''}" data-aspect="1.777">16:9</button>
                 </div>
             </div>
             <div style="margin: 8px 0;">
                 <strong style="font-size: 12px;">Render Mode:</strong><br>
                 <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;">
                     <button type="button" class="rendercad-aspect-btn rendercad-mode-btn ${selectedRenderMode === 'preserve' ? 'active' : ''}" data-render-mode="preserve">Exact</button>
                     <button type="button" class="rendercad-aspect-btn rendercad-mode-btn ${selectedRenderMode === 'creative' ? 'active' : ''}" data-render-mode="creative">Enhance</button>
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
    const aspectButtons = instructions.querySelectorAll('.rendercad-aspect-btn[data-aspect]');
    aspectButtons.forEach(btn => {
        setCaptureOptionButtonState(btn, btn.classList.contains('active') ? 'active' : 'default');
        btn.addEventListener('mouseenter', () => {
            if (!btn.classList.contains('active')) {
                setCaptureOptionButtonState(btn, 'hover');
            }
        });
        btn.addEventListener('mouseleave', () => {
            setCaptureOptionButtonState(btn, btn.classList.contains('active') ? 'active' : 'default');
        });
        btn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (!btn.classList.contains('active')) {
                setCaptureOptionButtonState(btn, 'pressed');
            }
        });
        btn.addEventListener('mouseup', (e) => {
            e.stopPropagation();
            e.preventDefault();
            setCaptureOptionButtonState(btn, btn.classList.contains('active') ? 'active' : 'hover');
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            // Remove active class from all buttons
            aspectButtons.forEach(b => {
                b.classList.remove('active');
                setCaptureOptionButtonState(b, 'default');
            });
            // Add active class to clicked button
            btn.classList.add('active');
            setCaptureOptionButtonState(btn, 'active');
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

    const renderModeButtons = instructions.querySelectorAll('.rendercad-mode-btn');
    renderModeButtons.forEach(btn => {
        setCaptureOptionButtonState(btn, btn.classList.contains('active') ? 'active' : 'default');
        btn.addEventListener('mouseenter', () => {
            if (!btn.classList.contains('active')) {
                setCaptureOptionButtonState(btn, 'hover');
            }
        });
        btn.addEventListener('mouseleave', () => {
            setCaptureOptionButtonState(btn, btn.classList.contains('active') ? 'active' : 'default');
        });
        btn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (!btn.classList.contains('active')) {
                setCaptureOptionButtonState(btn, 'pressed');
            }
        });
        btn.addEventListener('mouseup', (e) => {
            e.stopPropagation();
            e.preventDefault();
            setCaptureOptionButtonState(btn, btn.classList.contains('active') ? 'active' : 'hover');
        });
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            renderModeButtons.forEach(b => {
                b.classList.remove('active');
                setCaptureOptionButtonState(b, 'default');
            });
            btn.classList.add('active');
            setCaptureOptionButtonState(btn, 'active');
            await storeRenderModePreference(btn.getAttribute('data-render-mode'));
        });
    });
    
    document.body.appendChild(overlay);

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
    applyConfirmButtonInlineStyles(confirmButton);

    // CRITICAL: Store reference in the closure-scoped variable for resize listeners
    localConfirmButtonRef = confirmButton;

    confirmButton.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });

    confirmButton.addEventListener('click', async (e) => {
        console.log('[RENDERCAD Content] Confirm button clicked!');
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
        console.log('[RENDERCAD Content] Cleaning up capture UI...');
        cleanup();

        // Wait a brief moment for the UI to be removed from the DOM
        await new Promise(resolve => setTimeout(resolve, 100));

        // Then start the capture and show loading
        console.log('[RENDERCAD Content] Starting captureArea...');
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
    
    // Restore the render modal visibility after capture cleanup
    if (loadingModalInstance) {
        loadingModalInstance.style.display = 'flex';
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
}

async function captureArea(rect) {
    console.log('[RENDERCAD Content] captureArea called with rect:', rect);
    let jobId = null;
    let modalWasVisible = false;
    let savedModalDisplay = null;
    
    try {
        // Hide ALL rendercad elements before capture to prevent them from being captured
        if (loadingModalInstance) {
            if (loadingModalInstance.style.visibility !== 'hidden' &&
                loadingModalInstance.style.display !== 'none') {
                modalWasVisible = true;
            }
            savedModalDisplay = loadingModalInstance.style.display;
            // Use both visibility and display for maximum hiding
            loadingModalInstance.style.visibility = 'hidden';
            loadingModalInstance.style.display = 'none';
            loadingModalInstance.style.opacity = '0';
        }

        // Wait for the browser to process the style changes
        await new Promise(resolve => setTimeout(resolve, 100));

        // Ensure modal exists and is visible
        if (!loadingModalInstance) {
            console.log('[RENDERCAD Content] Creating modal for first time');
            loadingModalInstance = createLoadingModal();
        }
        
        // Make sure modal is in the DOM and visible
        if (!document.body.contains(loadingModalInstance)) {
            document.body.appendChild(loadingModalInstance);
        }
        
        // Force modal visible
        loadingModalInstance.style.display = 'flex';
        loadingModalInstance.style.visibility = 'visible';
        loadingModalInstance.style.opacity = '1';
        if (!loadingModalInstance.hasAttribute('data-pinned')) {
            applyUnpinnedModalWidth(loadingModalInstance);
        }
        setTimeout(() => clampModalToViewport(loadingModalInstance), 60);
        
        // Show loading overlay and get job ID
        console.log('[RENDERCAD Content] Showing loading overlay...');
        jobId = showLoadingOverlay();
        console.log('[RENDERCAD Content] Loading overlay shown, jobId:', jobId);

        // Request screen capture from background script
        // Note: We don't use a callback here because the render is async and takes time
        // The background script will send back displayRenderedImage or renderError when done
        // Get viewport dimensions to help with zoom calculation

        // Check if extension context is still valid
        if (!chrome.runtime?.id) {
            console.error('Extension context invalidated - please refresh the page');
            return;
        }

        console.log('[RENDERCAD Content] Sending captureScreen message to background...');
        
        // Show notification that render has started
        chrome.runtime.sendMessage({
            action: 'notify',
            title: 'RENDERCAD - Render Started',
            message: 'Your CAD image is being rendered. This may take 20-60 seconds.'
        });
        
        chrome.runtime.sendMessage({
            action: 'captureScreen',
            rect: rect,
            jobId: jobId,
            renderMode: selectedRenderMode,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight
        });
        console.log('[RENDERCAD Content] captureScreen message sent');
    } catch (error) {
        console.error('[RENDERCAD Content] Error during capture:', error);
        // Ensure modal is restored even on error
        if (loadingModalInstance && modalWasVisible) {
            loadingModalInstance.style.visibility = 'visible';
            loadingModalInstance.style.display = savedModalDisplay || 'flex';
            loadingModalInstance.style.opacity = '1';
        }
        if (jobId) {
            hideLoadingOverlay(jobId);
        }
        showRenderError(error.message);
    }
}

let renderJobId = 0; // Unique ID for each render job
let loadingModalInstance = null; // Single modal instance for all renders
let glowAnimationFrame = null; // Store animation frame ID
let renderedImages = []; // Store all rendered images for download all
let originalImages = []; // Store original images for toggle functionality
let isExpanded = false; // Track whether preview images are expanded or collapsed

// Function to check if user is authenticated
async function checkAuthentication() {
    try {
        if (!chrome.runtime?.id) {
            return false;
        }
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getUserInfo' }, (response) => {
                if (chrome.runtime.lastError) {
                    resolve(false);
                    return;
                }
                resolve(response && response.loggedIn === true);
            });
        });
    } catch (error) {
        return false;
    }
}

// Function to show sign-in prompt
function showSignInPrompt() {
    const prompt = document.createElement('div');
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
        width: min(320px, calc(100vw - ${VIEWPORT_GUTTER * 2}px));
        max-width: calc(100vw - ${VIEWPORT_GUTTER * 2}px);
        box-sizing: border-box;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    `;
    
    prompt.innerHTML = `
        <h3 style="margin: 0 0 15px 0; font-size: 18px;">Sign In Required</h3>
        <p style="margin: 0 0 20px 0; font-size: 14px; opacity: 0.9;">Please sign in to use RENDERCAD</p>
        <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;">
            <button id="rendercad-signin-btn">Sign In</button>
            <button id="rendercad-cancel-btn">Cancel</button>
        </div>
    `;
    
    document.body.appendChild(prompt);
    
    const signInBtn = prompt.querySelector('#rendercad-signin-btn');
    const cancelBtn = prompt.querySelector('#rendercad-cancel-btn');
    
    // Apply consistent button styles (matching createIconButton style)
    const buttonBaseStyle = {
        background: 'linear-gradient(-75deg, rgba(255,255,255,0.08), rgba(255,255,255,0.2), rgba(255,255,255,0.08))',
        backgroundColor: 'rgba(10, 14, 22, 0.9)',
        border: '1px solid rgba(255, 255, 255, 0.65)',
        color: 'white',
        padding: '10px 20px',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '600',
        fontFamily: "'Segoe UI', Arial, sans-serif",
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '112px',
        minHeight: '40px',
        lineHeight: '1',
        boxSizing: 'border-box',
        transition: 'all 0.2s ease',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        boxShadow: 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)'
    };
    
    // Apply base styles to both buttons
    Object.assign(signInBtn.style, buttonBaseStyle);
    Object.assign(cancelBtn.style, buttonBaseStyle);
    
    // Add hover effects (matching createIconButton)
    signInBtn.addEventListener('mouseenter', () => {
        signInBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
        signInBtn.style.backgroundColor = 'rgba(18, 24, 34, 0.94)';
        signInBtn.style.borderColor = 'rgba(255, 255, 255, 0.7)';
        signInBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
    });
    
    signInBtn.addEventListener('mouseleave', () => {
        signInBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
        signInBtn.style.backgroundColor = 'rgba(10, 14, 22, 0.9)';
        signInBtn.style.borderColor = 'rgba(255, 255, 255, 0.5)';
        signInBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)';
    });
    
    signInBtn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        signInBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.15), rgba(255,255,255,0.4), rgba(255,255,255,0.15))';
        signInBtn.style.backgroundColor = 'rgba(22, 28, 40, 0.96)';
        signInBtn.style.boxShadow = 'inset 0 2px 2px rgba(0, 0, 0, 0.1), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4)';
        signInBtn.style.transform = 'scale(0.95)';
    });
    
    signInBtn.addEventListener('mouseup', () => {
        signInBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
        signInBtn.style.backgroundColor = 'rgba(18, 24, 34, 0.94)';
        signInBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
        signInBtn.style.transform = 'scale(1)';
    });
    
    cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
        cancelBtn.style.backgroundColor = 'rgba(18, 24, 34, 0.94)';
        cancelBtn.style.borderColor = 'rgba(255, 255, 255, 0.7)';
        cancelBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
    });
    
    cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
        cancelBtn.style.backgroundColor = 'rgba(10, 14, 22, 0.9)';
        cancelBtn.style.borderColor = 'rgba(255, 255, 255, 0.5)';
        cancelBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)';
    });
    
    cancelBtn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        cancelBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.15), rgba(255,255,255,0.4), rgba(255,255,255,0.15))';
        cancelBtn.style.backgroundColor = 'rgba(22, 28, 40, 0.96)';
        cancelBtn.style.boxShadow = 'inset 0 2px 2px rgba(0, 0, 0, 0.1), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4)';
        cancelBtn.style.transform = 'scale(0.95)';
    });
    
    cancelBtn.addEventListener('mouseup', () => {
        cancelBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
        cancelBtn.style.backgroundColor = 'rgba(18, 24, 34, 0.94)';
        cancelBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
        cancelBtn.style.transform = 'scale(1)';
    });
    
    signInBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        prompt.remove();
        if (chrome.runtime?.id) {
            chrome.runtime.sendMessage({ action: 'login' }, () => {
                // Reload page or refresh modal after login
                setTimeout(() => {
                    if (loadingModalInstance) {
                        updateHamburgerMenu();
                    }
                }, 2000);
            });
        }
    });
    
    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        prompt.remove();
    });
}

// Function to close the render modal
function closeRenderModal() {
    console.log('[RENDERCAD] closeRenderModal called');
    if (loadingModalInstance) {
        // Clean up any animations or intervals
        if (typeof glowAnimationFrame !== 'undefined' && glowAnimationFrame) {
            cancelAnimationFrame(glowAnimationFrame);
        }
        if (typeof tokenUpdateInterval !== 'undefined' && tokenUpdateInterval) {
            clearInterval(tokenUpdateInterval);
        }
        hideFloatingMenus();
        // Hide the modal
        loadingModalInstance.style.display = 'none';
        loadingModalInstance.style.visibility = 'hidden';
        console.log('[RENDERCAD] Modal closed');
    }
}

// Function to check if modal is currently open/visible
function isModalOpen() {
    if (!loadingModalInstance) {
        return false;
    }
    const display = loadingModalInstance.style.display;
    const visibility = loadingModalInstance.style.visibility;
    const inDOM = document.body.contains(loadingModalInstance);
    return inDOM && (display === 'flex' || display === '') && visibility !== 'hidden';
}

// Function to open/show the render modal (now toggles if already open)
function openRenderModal() {
    console.log('[RENDERCAD] openRenderModal called');
    
    // Check if modal is already open - if so, close it
    if (isModalOpen()) {
        console.log('[RENDERCAD] Modal is already open, closing it');
        closeRenderModal();
        return;
    }
    
    if (!loadingModalInstance) {
        console.log('[RENDERCAD] Creating new modal instance');
        loadingModalInstance = createLoadingModal();
    }
    
    // Ensure modal is visible
    if (loadingModalInstance) {
        console.log('[RENDERCAD] Showing modal');
        // Make sure modal is in the DOM
        if (!document.body.contains(loadingModalInstance)) {
            document.body.appendChild(loadingModalInstance);
        }
        
        // Ensure modal is visible and positioned correctly
        loadingModalInstance.style.display = 'flex';
        loadingModalInstance.style.opacity = '1';
        loadingModalInstance.style.zIndex = '1000000';
        loadingModalInstance.style.visibility = 'visible';
        if (!loadingModalInstance.hasAttribute('data-pinned')) {
            applyUnpinnedModalWidth(loadingModalInstance);
        }
        setTimeout(() => clampModalToViewport(loadingModalInstance), 60);
        
        // Force a reflow to ensure styles are applied
        void loadingModalInstance.offsetHeight;
    } else {
        console.error('[RENDERCAD] Failed to create modal instance');
    }
}

function showLoadingOverlay() {
    const jobId = ++renderJobId;

    // Create modal on first render, reuse for subsequent renders
    if (!loadingModalInstance) {
        loadingModalInstance = createLoadingModal();
    }

    // Mark that we have an active render
    const activeRenders = parseInt(loadingModalInstance.getAttribute('data-active-renders') || 0) + 1;
    loadingModalInstance.setAttribute('data-active-renders', activeRenders);

    // Show loading bar if starting a new render
    if (activeRenders > 0) {
        showLoadingBar();
    }

    // Update queue counter
    updateQueueCounter();

    return jobId;
}

function createLoadingModal() {
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
    loadingModal.style.cssText = `
        position: fixed;
        top: ${VIEWPORT_GUTTER}px;
        right: -370px;
        background: rgba(0, 0, 0, 0.75);
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 8px;
        padding: 0;
        color: white;
        font-family: 'Segoe UI', Arial, sans-serif;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3),
                    0 0 8px rgba(0, 255, 255, 0.15);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        z-index: 1000000;
        display: flex;
        flex-direction: column;
        gap: 0;
        width: ${getResponsiveModalWidthCss()};
        height: auto;
        min-height: 60px;
        max-height: calc(100vh - ${VIEWPORT_GUTTER * 2}px);
        user-select: none;
        opacity: 0;
        transition: right 0.5s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.5s ease;
    `;

    // Trigger animation after a brief delay
    setTimeout(() => {
        loadingModal.style.right = VIEWPORT_GUTTER + 'px';
        loadingModal.style.opacity = '1';
    }, 50);

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

    // Logo wrapper with TM symbol - 5% smaller than 10% larger (42.24 * 0.95 = 40.128)
    // Set font-size to match height so em units scale proportionally
    const logoWrapper = document.createElement('span');
    logoWrapper.style.cssText = `
        position: relative;
        display: inline-block;
        margin-right: 0.25rem;
        width: 40.128px;
        height: 33.44px;
        font-size: 33.44px;
    `;

    const logo = document.createElement('img');
    logo.src = chrome.runtime.getURL('icons/logo.svg');
    logo.alt = 'RENDERCAD';
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
        this.src = chrome.runtime.getURL('icons/logo.png');
    };
    logo.setAttribute('draggable', 'false');

    // TM symbol for logo - scales with logo using em units for font-size, percentage for position
    // Font-size: 19.5624px / 33.44px = 0.585em (scales with logo wrapper font-size)
    // Position: 32.4px / 33.44px = 96.8% from top (scales with logo wrapper height)
    // Right: -2px / 40.128px = -4.98% (scales with logo wrapper width)
    const logoTm = document.createElement('sup');
    logoTm.className = 'tm';
    logoTm.textContent = '™';
    logoTm.style.cssText = `
        position: absolute;
        top: 96.8%;
        right: -4.98%;
        font-size: 0.585em;
        line-height: 0;
        font-family: 'Proxima Nova Thin', 'Inter', sans-serif;
        font-weight: 300;
        opacity: 0.9;
        color: #f50057;
        text-shadow: 0 0 4px rgba(0, 0, 0, 0.4);
    `;

    logoWrapper.appendChild(logo);
    logoWrapper.appendChild(logoTm);

    // Title with TM symbol - 5% smaller than 10% larger (31.68 * 0.95 = 30.096px)
    const titleWrapper = document.createElement('span');
    titleWrapper.style.cssText = `
        font-family: 'Proxima Nova Thin', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-weight: 300;
        font-size: 30.096px;
        letter-spacing: -0.01em;
        line-height: 1;
        position: relative;
    `;
    
    const title = document.createTextNode('RENDERCAD');
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
    // 10% larger: 0.65em of 31.68px = 20.592px

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
            background: linear-gradient(-75deg, rgba(255,255,255,0.08), rgba(255,255,255,0.2), rgba(255,255,255,0.08));
            background-color: rgba(10, 14, 22, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.65);
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
            btn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.12), rgba(255,255,255,0.3), rgba(255,255,255,0.12))';
            btn.style.backgroundColor = 'rgba(18, 24, 34, 0.94)';
            btn.style.borderColor = 'rgba(255, 255, 255, 0.7)';
            btn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.08), rgba(255,255,255,0.2), rgba(255,255,255,0.08))';
            btn.style.backgroundColor = 'rgba(10, 14, 22, 0.9)';
            btn.style.borderColor = 'rgba(255, 255, 255, 0.5)';
            btn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)';
        });

        btn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            btn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.15), rgba(255,255,255,0.4), rgba(255,255,255,0.15))';
            btn.style.backgroundColor = 'rgba(22, 28, 40, 0.96)';
            btn.style.boxShadow = 'inset 0 2px 2px rgba(0, 0, 0, 0.1), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4)';
            setHeaderButtonTransform(btn, 0.95);
        });

        btn.addEventListener('mouseup', () => {
            btn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.12), rgba(255,255,255,0.3), rgba(255,255,255,0.12))';
            btn.style.backgroundColor = 'rgba(18, 24, 34, 0.94)';
            btn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
            setHeaderButtonTransform(btn, 1);
        });

        btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
            onClick();
        });

        return btn;
    }

    // Hamburger menu button (replaces all top right buttons in unpinned mode)
    const hamburgerButton = document.createElement('button');
    hamburgerButton.className = 'rendercad-hamburger-button';
    hamburgerButton.innerHTML = '<i class="fas fa-bars"></i>';
    hamburgerButton.title = 'Menu';
    hamburgerButton.style.cssText = `
        position: absolute;
        top: 6px;
        right: 8px;
        background: linear-gradient(-75deg, rgba(255,255,255,0.08), rgba(255,255,255,0.2), rgba(255,255,255,0.08));
        background-color: rgba(10, 14, 22, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.65);
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
        hamburgerButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.12), rgba(255,255,255,0.3), rgba(255,255,255,0.12))';
        hamburgerButton.style.backgroundColor = 'rgba(18, 24, 34, 0.94)';
        hamburgerButton.style.borderColor = 'rgba(255, 255, 255, 0.7)';
        hamburgerButton.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
    });

    hamburgerButton.addEventListener('mouseleave', () => {
        hamburgerButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.08), rgba(255,255,255,0.2), rgba(255,255,255,0.08))';
        hamburgerButton.style.backgroundColor = 'rgba(10, 14, 22, 0.9)';
        hamburgerButton.style.borderColor = 'rgba(255, 255, 255, 0.5)';
        hamburgerButton.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)';
    });

    hamburgerButton.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        hamburgerButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.15), rgba(255,255,255,0.4), rgba(255,255,255,0.15))';
        hamburgerButton.style.backgroundColor = 'rgba(22, 28, 40, 0.96)';
        hamburgerButton.style.boxShadow = 'inset 0 2px 2px rgba(0, 0, 0, 0.1), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4)';
        setHeaderButtonTransform(hamburgerButton, 0.95);
    });

    hamburgerButton.addEventListener('mouseup', () => {
        hamburgerButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.12), rgba(255,255,255,0.3), rgba(255,255,255,0.12))';
        hamburgerButton.style.backgroundColor = 'rgba(18, 24, 34, 0.94)';
        hamburgerButton.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
        setHeaderButtonTransform(hamburgerButton, 1);
    });

    // Function to update hamburger menu with current auth state
    async function updateHamburgerMenu() {
        const isAuthenticated = await checkAuthentication();
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
            `;
            document.body.appendChild(dropdown);
        }
        
        // Clear existing items
        dropdown.innerHTML = '';
        
        // Build menu items based on auth state
        const menuItems = [
            { text: 'Render Studio', icon: 'fa-palette', action: () => { if (chrome.runtime?.id) chrome.runtime.sendMessage({ action: 'openStudio' }); } },
            { text: 'History', icon: 'fa-history', url: 'https://rendercad.ai/history' },
            { text: 'Settings', icon: 'fa-user-cog', url: 'https://rendercad.ai/settings' },
            { text: 'Pin', icon: 'fa-thumbtack', action: () => {
                dropdown.style.display = 'none';
                ensurePreviewContainerScrollable();
                if (!isPinned) {
                    pinButton.click();
                }
            }},
        ];
        
        // Add sign in/sign out based on auth state
        if (isAuthenticated) {
            menuItems.push({ text: 'Sign Out', icon: 'fa-sign-out-alt', action: () => {
                dropdown.style.display = 'none';
                // Ensure scroll constraints after menu interaction
                ensurePreviewContainerScrollable();
                if (chrome.runtime?.id) {
                    chrome.runtime.sendMessage({ action: 'logout' }, () => {
                        updateHamburgerMenu();
                        if (loadingModalInstance) {
                            updateTokenIndicator();
                        }
                    });
                }
            }});
        } else {
            menuItems.push({ text: 'Sign In', icon: 'fa-sign-in-alt', action: () => {
                dropdown.style.display = 'none';
                ensurePreviewContainerScrollable();
                if (chrome.runtime?.id) {
                    chrome.runtime.sendMessage({ action: 'login' }, () => {
                        setTimeout(() => {
                            updateHamburgerMenu();
                            if (loadingModalInstance) {
                                updateTokenIndicator();
                            }
                        }, 2000);
                    });
                }
            }});
        }
        
        menuItems.push({ text: 'Close', icon: 'fa-times', action: () => {
            dropdown.style.display = 'none';
            ensurePreviewContainerScrollable();
            if (loadingModal) {
                if (glowAnimationFrame) {
                    cancelAnimationFrame(glowAnimationFrame);
                }
                // Check if tokenUpdateInterval exists before clearing
                if (typeof tokenUpdateInterval !== 'undefined' && tokenUpdateInterval) {
                    clearInterval(tokenUpdateInterval);
                }
                hideFloatingMenus();
                loadingModal.remove();
                loadingModalInstance = null;
                renderedImages = [];
                originalImages = [];
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
                dropdown.style.display = 'none';
                ensurePreviewContainerScrollable();
                if (item.url) {
                    window.open(item.url, '_blank');
                } else if (item.action) {
                    item.action();
                }
            });
            dropdown.appendChild(menuItem);
        });
        
        // Return the dropdown element
        return dropdown;
    }

    hamburgerButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        // Update menu and get dropdown reference
        const dropdown = await updateHamburgerMenu();
        
        if (!dropdown) {
            console.error('[RENDERCAD] Failed to create dropdown');
            return;
        }
        
        // Toggle dropdown visibility
        const isVisible = dropdown.style.display === 'block' || dropdown.style.display === '';
        
        if (isVisible) {
            dropdown.style.display = 'none';
            // Ensure preview container maintains scroll constraints after dropdown closes
            ensurePreviewContainerScrollable();
        } else {
            const buttonRect = hamburgerButton.getBoundingClientRect();
            positionFloatingDropdown(dropdown, buttonRect);
            
            // Close dropdown when clicking outside
            const closeDropdown = (e) => {
                if (!dropdown.contains(e.target) && !hamburgerButton.contains(e.target)) {
                    dropdown.style.display = 'none';
                    document.removeEventListener('click', closeDropdown);
                    // Ensure preview container maintains scroll constraints after dropdown closes
                    ensurePreviewContainerScrollable();
                }
            };
            setTimeout(() => {
                document.addEventListener('click', closeDropdown);
            }, 0);
        }
    });

    // Keep old button references for backward compatibility but hide them
    const renderStudioButton = createIconButton('fas fa-palette', () => {
        if (chrome.runtime?.id) chrome.runtime.sendMessage({ action: 'openStudio' });
    }, 'Render Studio');
    renderStudioButton.style.display = 'none';

    const historyButton = createIconButton('fas fa-history', () => {
        window.open('https://rendercad.ai/history', '_blank');
    }, 'History');
    historyButton.style.display = 'none';

    const settingsButton = createIconButton('fas fa-user-cog', () => {
        window.open('https://rendercad.ai/settings', '_blank');
    }, 'Settings');
    settingsButton.style.display = 'none';

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
            // Check if extension context is still valid
            if (!chrome.runtime?.id) {
                // Extension was reloaded, stop trying to communicate
                tokenIndicator.style.opacity = '0';
                return;
            }

            chrome.runtime.sendMessage({ action: 'getUserInfo' }, (response) => {
                // Check for extension context invalidation
                if (chrome.runtime.lastError) {
                    // Extension context invalidated, silently fail
                    tokenIndicator.style.opacity = '0';
                    return;
                }

                if (response && response.loggedIn && response.userInfo) {
                    const used = response.userInfo.monthly_renders_used || 0;
                    const limit = response.userInfo.monthly_render_limit || 0;

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
            });
        } catch (error) {
            // Silently handle extension context errors
            tokenIndicator.style.opacity = '0';
        }
    }

    // Update token indicator on modal creation (only once - no polling)
    updateTokenIndicator();

    // Pin toggle button (left of close button)
    // CLEAN STATE-BASED PIN/UNPIN SYSTEM
    // Make applyModalState accessible globally
    window.applyModalState = function(modal, isPinned, isExpanded) {
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
        void modal.offsetHeight; // Force reflow

        // STEP 2: Apply the correct state
        if (isPinned) {
            modal.setAttribute('data-pinned', 'true');
            modal.style.setProperty('width', `${PINNED_MODAL_WIDTH}px`, 'important');
            modal.style.setProperty('min-width', `${PINNED_MODAL_WIDTH}px`, 'important');
            modal.style.setProperty('max-width', `${PINNED_MODAL_WIDTH}px`, 'important');
            modal.style.setProperty('padding', '0', 'important');

            if (isExpanded) {
                modal.style.setProperty('height', 'auto', 'important');
                modal.style.setProperty('min-height', `${PINNED_MODAL_WIDTH}px`, 'important');
                modal.style.setProperty('max-height', 'none', 'important');
            } else {
                modal.style.setProperty('height', `${PINNED_MODAL_WIDTH}px`, 'important');
                modal.style.setProperty('min-height', `${PINNED_MODAL_WIDTH}px`, 'important');
                modal.style.setProperty('max-height', `${PINNED_MODAL_WIDTH}px`, 'important');
            }
        } else {
            modal.removeAttribute('data-pinned');
            applyUnpinnedModalWidth(modal);
            modal.style.setProperty('height', 'auto', 'important');
            modal.style.setProperty('min-height', '60px', 'important');
            // Set max-height to viewport height to allow preview container to scroll
            modal.style.setProperty('max-height', `calc(100vh - ${VIEWPORT_GUTTER * 2}px)`, 'important');
        }

        void modal.offsetHeight; // Force reflow

        // STEP 3: Update preview container
        const previewContainer = modal.querySelector('.rendercad-preview-container');
        if (previewContainer) {
            if (isExpanded) {
                previewContainer.style.display = 'flex';
                previewContainer.style.minHeight = '0';
                previewContainer.style.maxHeight = '60vh';
                previewContainer.style.opacity = '1';
                previewContainer.style.overflowY = 'auto';
                previewContainer.style.overflowX = 'hidden';
            } else {
                // When collapsing, set maxHeight first, then hide after transition
                previewContainer.style.maxHeight = '0';
                previewContainer.style.opacity = '0';
                previewContainer.style.overflow = 'hidden';
                // Use a flag to track if we should hide it
                const shouldHide = !isExpanded;
                setTimeout(() => {
                    if (shouldHide && previewContainer.style.maxHeight === '0') {
                        previewContainer.style.display = 'none';
                    }
                }, 300);
            }
        }
        
        // STEP 4: Update download all button visibility (hide when pinned and collapsed)
        const downloadAllBtn = modal.querySelector('.rendercad-download-all-btn');
        if (downloadAllBtn) {
            if (isPinned && !isExpanded) {
                // Hide download button when pinned and collapsed (use !important to override CSS)
                downloadAllBtn.style.setProperty('display', 'none', 'important');
            } else {
                // Show download button when expanded or unpinned
                downloadAllBtn.style.setProperty('display', 'flex', 'important');
            }
        }
        
        // Ensure preview container is properly initialized when unpinning
        if (!isPinned && previewContainer) {
            // If expanded, make sure it's visible
            if (isExpanded) {
                previewContainer.style.display = 'flex';
                previewContainer.style.minHeight = '0';
                previewContainer.style.maxHeight = '60vh';
                previewContainer.style.opacity = '1';
                previewContainer.style.overflowY = 'auto';
                previewContainer.style.overflowX = 'hidden';
            } else {
                // If collapsed, ensure it starts hidden
                previewContainer.style.display = 'none';
                previewContainer.style.maxHeight = '0';
                previewContainer.style.opacity = '0';
            }
        }
        
        // STEP 4: Update toggle bar visibility for unpinned mode
        if (!isPinned) {
            const toggleBar = modal.querySelector('.rendercad-toggle-bar');
            if (toggleBar) {
                // Show toggle bar if there are images or if expanded
                const hasImages = previewContainer && previewContainer.querySelectorAll('img').length > 0;
                if (hasImages || isExpanded) {
                    toggleBar.style.display = 'flex';
                    toggleBar.style.visibility = 'visible';
                } else {
                    toggleBar.style.display = 'none';
                }
            }
        }
    }

    let isPinned = false;
    const pinButton = createIconButton('fas fa-thumbtack', () => {
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

            // Apply the pinned state
            applyModalState(loadingModal, true, isExpanded);

            // Position modal (keep right edge in same place)
            const newLeft = clampValue(
                rightEdge - PINNED_MODAL_WIDTH,
                VIEWPORT_GUTTER,
                Math.max(VIEWPORT_GUTTER, window.innerWidth - PINNED_MODAL_WIDTH - VIEWPORT_GUTTER)
            );
            loadingModal.style.left = newLeft + 'px';
            loadingModal.style.right = 'auto';

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
                logoImg.src = chrome.runtime.getURL('icons/logo.svg');
                logoImg.alt = 'RENDERCAD';
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
                    this.src = chrome.runtime.getURL('icons/logo.png');
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
                logoButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
                    // Remove focus to prevent outline
                    logoButton.blur();
                    // Check authentication before starting capture
                    const isAuthenticated = await checkAuthentication();
                    if (!isAuthenticated) {
                        showSignInPrompt();
                        return;
                    }
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
                // Append to modal directly (matching desktop app)
                loadingModal.appendChild(logoButton);
            }
            logoButton.style.display = 'flex';
            // Logo button is already positioned absolutely with fixed top: 8px and centered horizontally
            // Hide RENDERCAD text and header content
            headerContent.style.display = 'none';
            hamburgerButton.style.display = 'none';
            tokenIndicator.style.display = 'none';
            // Hide old buttons
            renderStudioButton.style.display = 'none';
            historyButton.style.display = 'none';
            settingsButton.style.display = 'none';
            closeButton.style.display = 'none';
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
                    top: 2px;
                    right: 2px;
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
                        ensurePreviewContainerScrollable();
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
                            `;
                            
                            // Function to build pinned menu items with auth state
                            async function buildPinnedMenuItems() {
                                const isAuthenticated = await checkAuthentication();
                                const menuItems = [
                                    { text: 'Render Studio', icon: 'fa-palette', action: () => { if (chrome.runtime?.id) chrome.runtime.sendMessage({ action: 'openStudio' }); } },
                                    { text: 'History', icon: 'fa-history', url: 'https://rendercad.ai/history' },
                                    { text: 'Settings', icon: 'fa-user-cog', url: 'https://rendercad.ai/settings' },
                                    { text: 'Unpin', icon: 'fa-thumbtack', action: () => { 
                                        // Close dropdown first
                                        dropdown.style.display = 'none';
                                        // Ensure scroll constraints before unpinning
                                        ensurePreviewContainerScrollable();
                                        // Trigger unpin by clicking the pin button
                                        if (isPinned) {
                                            pinButton.click();
                                        }
                                    }},
                                ];
                                
                                // Add sign in/sign out based on auth state
                                if (isAuthenticated) {
                                    menuItems.push({ text: 'Sign Out', icon: 'fa-sign-out-alt', action: () => {
                                        dropdown.style.display = 'none';
                                        ensurePreviewContainerScrollable();
                                        if (chrome.runtime?.id) {
                                            chrome.runtime.sendMessage({ action: 'logout' }, () => {
                                                // Rebuild dropdown menu
                                                const existingItems = dropdown.querySelectorAll('div');
                                                existingItems.forEach(item => item.remove());
                                                buildPinnedMenuItems().then(items => {
                                                    items.forEach(item => {
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
                                                            dropdown.style.display = 'none';
                                                            // Ensure preview container maintains scroll constraints after menu interaction
                                                            ensurePreviewContainerScrollable();
                                                            if (item.url) {
                                                                window.open(item.url, '_blank');
                                                            } else if (item.action) {
                                                                item.action();
                                                            }
                                                        });
                                                        dropdown.appendChild(menuItem);
                                                    });
                                                });
                                                updateTokenIndicator();
                                            });
                                        }
                                    }});
                                } else {
                                    menuItems.push({ text: 'Sign In', icon: 'fa-sign-in-alt', action: () => {
                                        dropdown.style.display = 'none';
                                        ensurePreviewContainerScrollable();
                                        if (chrome.runtime?.id) {
                                            chrome.runtime.sendMessage({ action: 'login' }, () => {
                                                setTimeout(() => {
                                                    // Rebuild dropdown menu
                                                    const existingItems = dropdown.querySelectorAll('div');
                                                    existingItems.forEach(item => item.remove());
                                                    buildPinnedMenuItems().then(items => {
                                                        items.forEach(item => {
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
                                                                dropdown.style.display = 'none';
                                                                ensurePreviewContainerScrollable();
                                                                if (item.url) {
                                                                    window.open(item.url, '_blank');
                                                                } else if (item.action) {
                                                                    item.action();
                                                                }
                                                            });
                                                            dropdown.appendChild(menuItem);
                                                        });
                                                    });
                                                    updateTokenIndicator();
                                                }, 2000);
                                            });
                                        }
                                    }});
                                }
                                
                                menuItems.push({ text: 'Close', icon: 'fa-times', action: () => {
                                    if (loadingModal) {
                                        if (glowAnimationFrame) {
                                            cancelAnimationFrame(glowAnimationFrame);
                                        }
                                        if (typeof tokenUpdateInterval !== 'undefined' && tokenUpdateInterval) {
                                            clearInterval(tokenUpdateInterval);
                                        }
                                        hideFloatingMenus();
                                        loadingModal.remove();
                                        loadingModalInstance = null;
                                        renderedImages = [];
                                        originalImages = [];
                                    }
                                }});
                                
                                return menuItems;
                            }
                            
                            // Build menu items
                            const menuItems = await buildPinnedMenuItems();
                            
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
                                    dropdown.style.display = 'none';
                                    ensurePreviewContainerScrollable();
                                    if (item.url) {
                                        window.open(item.url, '_blank');
                                    } else if (item.action) {
                                        item.action();
                                    }
                                });
                                dropdown.appendChild(menuItem);
                            });
                            
                            document.body.appendChild(dropdown);
                            
                            // Close dropdown when clicking outside
                            const closeDropdown = (e) => {
                                if (!dropdown.contains(e.target) && !cornerOptionsButton.contains(e.target)) {
                                    dropdown.style.display = 'none';
                                    document.removeEventListener('click', closeDropdown);
                                    ensurePreviewContainerScrollable();
                                }
                            };
                            setTimeout(() => {
                                document.addEventListener('click', closeDropdown);
                            }, 0);
                        }
                        // Position dropdown relative to button (fixed positioning)
                        const buttonRect = cornerOptionsButton.getBoundingClientRect();
                        positionFloatingDropdown(dropdown, buttonRect);
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
                    bottom: 2px;
                    left: 2px;
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
                    width: 100% !important;
                    position: relative !important;
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
                    width: 48px !important;
                    height: 28px !important;
                    padding: 0 !important;
                    font-size: 14px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    margin: 0 auto 6px auto !important;
                    border-radius: 6px !important;
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
            loadingModal.style.setProperty('width', `${PINNED_MODAL_WIDTH}px`, 'important');
            loadingModal.style.setProperty('min-width', `${PINNED_MODAL_WIDTH}px`, 'important');
            loadingModal.style.setProperty('max-width', `${PINNED_MODAL_WIDTH}px`, 'important');
            loadingModal.style.setProperty('height', `${PINNED_MODAL_WIDTH}px`, 'important');
            loadingModal.style.setProperty('min-height', `${PINNED_MODAL_WIDTH}px`, 'important');
            loadingModal.style.setProperty('max-height', `${PINNED_MODAL_WIDTH}px`, 'important');
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
            const activeRenders = parseInt(loadingModal.getAttribute('data-active-renders') || 0);
            if (activeRenders > 0) {
                // Show circular loader if rendering
                showLoadingBar();
            }

            // Update download button to show icon only
            updateDownloadAllButton();
            
            // Update queue counter position after pinning (modal size/position changed)
            requestAnimationFrame(() => {
                updateQueueCounter();
                // Also directly update position to ensure it's correct
                if (window.updateQueueCounterPosition) {
                    window.updateQueueCounterPosition();
                }
            });
        } else {
            // UNPINNING: Switch to wide 400px mode
            pinButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
            pinButton.style.right = '34px';

            // Apply the unpinned state (isExpanded state is preserved)
            applyModalState(loadingModal, false, isExpanded);
            
            // Force a reflow to ensure styles are applied before positioning
            void loadingModal.offsetHeight;

            const unpinnedRect = loadingModal.getBoundingClientRect();

            // Position modal (keep right edge in same place)
            const newLeft = clampValue(
                rightEdge - unpinnedRect.width,
                VIEWPORT_GUTTER,
                Math.max(VIEWPORT_GUTTER, window.innerWidth - unpinnedRect.width - VIEWPORT_GUTTER)
            );
            loadingModal.style.left = newLeft + 'px';
            loadingModal.style.right = 'auto';
            
            // Ensure modal has correct dimensions after unpinning
            applyUnpinnedModalWidth(loadingModal);
            loadingModal.style.setProperty('height', 'auto', 'important');
            loadingModal.style.setProperty('min-height', '60px', 'important');
            // Set max-height to viewport height to allow preview container to scroll
            loadingModal.style.setProperty('max-height', `calc(100vh - ${VIEWPORT_GUTTER * 2}px)`, 'important');

            // Show camera button, hide logo button
            cameraButton.style.display = 'flex';
            const logoButton = loadingModal.querySelector('.rendercad-logo-button');
            if (logoButton) logoButton.style.display = 'none';
            // Show RENDERCAD text and header content
            headerContent.style.display = 'flex';
            hamburgerButton.style.display = 'flex';
            tokenIndicator.style.display = '';
            // Hide old buttons
            renderStudioButton.style.display = 'none';
            historyButton.style.display = 'none';
            settingsButton.style.display = 'none';
            closeButton.style.display = 'none';
            pinButton.style.display = 'none';
            // Hide circular loader when unpinning
            const circularLoader = loadingModal.querySelector('.rendercad-circular-loader');
            if (circularLoader) {
                circularLoader.style.display = 'none';
                circularLoader.style.animation = 'none';
            }
            
            // Check if there are active renders and show loading bar if needed
            const activeRenders = parseInt(loadingModal.getAttribute('data-active-renders') || 0);
            if (activeRenders > 0) {
                // Show regular divider loading bar if rendering is still in progress
                showLoadingBar();
            }
            
            // Show toggle bar, hide corner buttons
            const toggleBar = loadingModal.querySelector('.rendercad-toggle-bar');
            if (toggleBar) {
                // Show toggle bar if there are images
                const previewContainer = loadingModal.querySelector('.rendercad-preview-container');
                const hasImages = previewContainer && previewContainer.querySelectorAll('img').length > 0;
                if (hasImages) {
                    toggleBar.style.display = 'flex';
                    toggleBar.style.visibility = 'visible';
                } else {
                    toggleBar.style.display = 'none';
                }
            }
            const cornerOptionsButton = loadingModal.querySelector('.rendercad-corner-options-button');
            if (cornerOptionsButton) cornerOptionsButton.style.display = 'none';
            const cornerToggleButton = loadingModal.querySelector('.rendercad-corner-toggle-button');
            if (cornerToggleButton) cornerToggleButton.style.display = 'none';
            const dropdown = document.querySelector('.rendercad-options-dropdown');
            if (dropdown) dropdown.style.display = 'none';

            // Update download button to show full text
            updateDownloadAllButton();
            
            // Update queue counter position after unpinning (modal size/position changed)
            requestAnimationFrame(() => {
                updateQueueCounter();
                // Also directly update position to ensure it's correct
                if (window.updateQueueCounterPosition) {
                    window.updateQueueCounterPosition();
                }
            });
        }
    }, 'Pin/Unpin');
    pinButton.style.right = '34px';
    pinButton.style.top = '6px';
    pinButton.style.display = 'none'; // Hidden by default (unpinned state)

    // Close button (using times icon to match style)
    const closeButton = createIconButton('fas fa-times', () => {
        if (loadingModal) {
            if (glowAnimationFrame) {
                cancelAnimationFrame(glowAnimationFrame);
            }
            if (typeof tokenUpdateInterval !== 'undefined' && tokenUpdateInterval) {
                clearInterval(tokenUpdateInterval);
            }
            hideFloatingMenus();
            loadingModal.remove();
            loadingModalInstance = null;
            renderedImages = []; // Clear stored images
            originalImages = []; // Clear stored original images
        }
    }, 'Close');
    closeButton.style.right = '8px';
    closeButton.style.top = '6px';
    closeButton.style.display = 'none'; // Hidden by default (unpinned state, using hamburger menu instead)

    header.appendChild(headerContent);
    header.appendChild(tokenIndicator);
    header.appendChild(hamburgerButton);
    // Keep old buttons in DOM but hidden for backward compatibility
    header.appendChild(renderStudioButton);
    header.appendChild(historyButton);
    header.appendChild(settingsButton);
    header.appendChild(pinButton);
    header.appendChild(closeButton);

    // Content wrapper with padding
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'rendercad-content-wrapper';
    contentWrapper.style.cssText = `
        padding: 0 15px 15px 15px;
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
    `;

    // Prismatic divider line (exact copy from index.html with horizontal layout)
    const divider = document.createElement('div');
    divider.className = 'rendercad-divider';
    divider.style.cssText = `
        position: relative;
        width: 100%;
        height: 2px;
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
        min-height: 0;
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
        top: 6px;
        left: 0;
        width: 24px;
        height: 24px;
        background: linear-gradient(-75deg, rgba(255,255,255,0.08), rgba(255,255,255,0.2), rgba(255,255,255,0.08));
        background-color: rgba(10, 14, 22, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.65);
        border-radius: 0 4px 4px 0;
        color: white;
        cursor: pointer;
        font-size: 12px;
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
        cameraButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.12), rgba(255,255,255,0.3), rgba(255,255,255,0.12))';
        cameraButton.style.backgroundColor = 'rgba(18, 24, 34, 0.94)';
        cameraButton.style.borderColor = 'rgba(255, 255, 255, 0.7)';
        cameraButton.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
    });

    cameraButton.addEventListener('mouseleave', () => {
        cameraButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.08), rgba(255,255,255,0.2), rgba(255,255,255,0.08))';
        cameraButton.style.backgroundColor = 'rgba(10, 14, 22, 0.9)';
        cameraButton.style.borderColor = 'rgba(255, 255, 255, 0.5)';
        cameraButton.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)';
    });

    cameraButton.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        cameraButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.15), rgba(255,255,255,0.4), rgba(255,255,255,0.15))';
        cameraButton.style.backgroundColor = 'rgba(22, 28, 40, 0.96)';
        cameraButton.style.boxShadow = 'inset 0 2px 2px rgba(0, 0, 0, 0.1), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4)';
        setHeaderButtonTransform(cameraButton, 0.95);
    });

    cameraButton.addEventListener('mouseup', () => {
        cameraButton.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.12), rgba(255,255,255,0.3), rgba(255,255,255,0.12))';
        cameraButton.style.backgroundColor = 'rgba(18, 24, 34, 0.94)';
        cameraButton.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
        setHeaderButtonTransform(cameraButton, 1);
    });

    cameraButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        // Check authentication before starting capture
        const isAuthenticated = await checkAuthentication();
        if (!isAuthenticated) {
            showSignInPrompt();
            return;
        }
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
        clampModalToViewport(loadingModal);

        // Update toggle icon
        toggleIcon.textContent = isExpanded ? '▲' : '▼';
        toggleIcon.style.transform = 'rotate(0deg)';
        
        // Update download all button visibility based on expand/collapse state
        const downloadAllBtn = loadingModal.querySelector('.rendercad-download-all-btn');
        if (downloadAllBtn) {
            if (isPinned && !isExpanded) {
                // Hide download button when pinned and collapsed (use !important to override CSS)
                downloadAllBtn.style.setProperty('display', 'none', 'important');
            } else {
                // Show download button when expanded or unpinned
                downloadAllBtn.style.setProperty('display', 'flex', 'important');
            }
        }
        
        // Ensure toggle bar remains visible in unpinned mode
        if (!isPinned) {
            toggleBar.style.display = 'flex';
            toggleBar.style.visibility = 'visible';
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
        z-index: 1000001;
    `;
    queueCounter.textContent = '0';
    
    // Function to update queue counter position relative to modal
    function updateQueueCounterPosition() {
        if (!loadingModal) return;
        // Queue counter is now in document.body, find it there
        const queueCounterEl = document.querySelector('.rendercad-queue-counter');
        if (!queueCounterEl) return;
        const modalRect = loadingModal.getBoundingClientRect();

        const queueWidth = queueCounterEl.offsetWidth || 24;
        const queueHeight = queueCounterEl.offsetHeight || 24;
        const queueLeft = clampValue(
            modalRect.left - 12,
            VIEWPORT_GUTTER,
            Math.max(VIEWPORT_GUTTER, window.innerWidth - queueWidth - VIEWPORT_GUTTER)
        );
        const queueTop = clampValue(
            modalRect.top - 5,
            VIEWPORT_GUTTER,
            Math.max(VIEWPORT_GUTTER, window.innerHeight - queueHeight - VIEWPORT_GUTTER)
        );

        queueCounterEl.style.left = queueLeft + 'px';
        queueCounterEl.style.top = queueTop + 'px';
        
        // Update dropdown positions to move with modal
        const pinnedDropdown = document.querySelector('.rendercad-options-dropdown');
        const unpinnedDropdown = document.querySelector('.rendercad-unpinned-options-dropdown');
        
        // Update pinned dropdown (corner options button)
        if (pinnedDropdown && pinnedDropdown.style.display !== 'none') {
            const cornerOptionsButton = loadingModal.querySelector('.rendercad-corner-options-button');
            if (cornerOptionsButton) {
                const buttonRect = cornerOptionsButton.getBoundingClientRect();
                positionFloatingDropdown(pinnedDropdown, buttonRect);
            }
        }
        
        // Update unpinned dropdown (hamburger button)
        if (unpinnedDropdown && unpinnedDropdown.style.display !== 'none') {
            const hamburgerButton = loadingModal.querySelector('.rendercad-hamburger-button');
            if (hamburgerButton) {
                const buttonRect = hamburgerButton.getBoundingClientRect();
                positionFloatingDropdown(unpinnedDropdown, buttonRect);
            }
        }
    }
    
    // Make updateQueueCounterPosition accessible globally for pin/unpin operations
    window.updateQueueCounterPosition = updateQueueCounterPosition;
    
    loadingModal.appendChild(header);
    loadingModal.appendChild(cameraButton);
    
    contentWrapper.appendChild(divider);
    contentWrapper.appendChild(previewContainer);
    loadingModal.appendChild(contentWrapper);
    
    loadingModal.appendChild(toggleBar);
    // Queue counter should be appended to body, not modal, to prevent clipping by modal overflow
    document.body.appendChild(queueCounter);

    document.body.appendChild(loadingModal);
    
    // Ensure modal has proper height constraints from the start (unpinned mode)
    // This is critical for the preview container to scroll properly
    loadingModal.style.setProperty('max-height', `calc(100vh - ${VIEWPORT_GUTTER * 2}px)`, 'important');
    loadingModal.style.setProperty('height', 'auto', 'important');
    loadingModal.style.setProperty('min-height', '60px', 'important');
    
    // Update position after modal is in DOM and after animation completes
    updateQueueCounterPosition();
    // Also update after modal animation completes (modal slides in from right)
    setTimeout(() => {
        updateQueueCounterPosition();
    }, 550); // Slightly longer than the 0.5s transition
    
    window.addEventListener('resize', () => {
        if (!loadingModal || !document.body.contains(loadingModal)) return;
        if (!loadingModal.hasAttribute('data-pinned')) {
            applyUnpinnedModalWidth(loadingModal);
        }
        clampModalToViewport(loadingModal);
        updateQueueCounterPosition();
    });

    // Add drag functionality - make modal draggable from header and background
    // Pass header as handle for drag start, but allow dragging from entire modal
    makeDraggable(loadingModal, header, updateQueueCounterPosition);

    // Ensure initial state is correct (unpinned - hamburger visible, other buttons hidden)
    hamburgerButton.style.display = 'flex';
    pinButton.style.display = 'none';
    closeButton.style.display = 'none';
    renderStudioButton.style.display = 'none';
    historyButton.style.display = 'none';
    settingsButton.style.display = 'none';

    return loadingModal;
}

function makeDraggable(modal, handle, updateQueueCounterPositionFn) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startModalLeft = 0;
    let startModalTop = 0;

    // Attach drag start to handle (header) and modal - allow dragging from anywhere
    handle.addEventListener('mousedown', dragStart);
    modal.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
    
    // Set cursor style on modal (will be overridden by interactive elements)
    modal.style.cursor = 'move';

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
            e.target.closest('.rendercad-download-all-btn') ||
            (e.target.tagName === 'IMG' && e.target.closest('.rendercad-preview-container'))) {
            return;
        }
        
        // Don't start drag if clicking inside preview container (including scrollbar)
        const previewContainer = modal.querySelector('.rendercad-preview-container');
        if (previewContainer && previewContainer.contains(e.target)) {
            // Check if click is on scrollbar area
            const containerRect = previewContainer.getBoundingClientRect();
            const scrollbarWidth = previewContainer.offsetWidth - previewContainer.clientWidth;
            if (scrollbarWidth > 0 && e.clientX > containerRect.right - scrollbarWidth - 5) {
                return; // Click is on scrollbar, don't drag
            }
            // Also don't drag if clicking directly on preview container (to allow scrolling)
            if (e.target === previewContainer || e.target.closest('.rendercad-preview-container > div')) {
                return; // Click is inside preview container, allow scrolling instead
            }
        }

        e.preventDefault();
        isDragging = true;

        // Check if modal is pinned FIRST - use hardcoded values to prevent size thrashing
        const isPinned = modal.getAttribute('data-pinned') === 'true';
        const hasVisibleImages = previewContainer && previewContainer.style.display !== 'none';

        // Use FIXED hardcoded sizes to prevent resize issues during pin/unpin
        let lockWidth, lockHeight, lockMaxHeight;
        if (isPinned && !hasVisibleImages) {
            // Pinned and collapsed - always 60x60 square
            lockWidth = `${PINNED_MODAL_WIDTH}px`;
            lockHeight = `${PINNED_MODAL_WIDTH}px`;
            lockMaxHeight = `${PINNED_MODAL_WIDTH}px`;
        } else if (isPinned && hasVisibleImages) {
            // Pinned but with images - fixed 60px width, allow height to grow
            lockWidth = `${PINNED_MODAL_WIDTH}px`;
            const rect = modal.getBoundingClientRect();
            lockHeight = `${rect.height}px`;
            lockMaxHeight = `${rect.height}px`;
        } else {
            // Unpinned - lock current responsive width during drag
            const rect = modal.getBoundingClientRect();
            lockWidth = `${rect.width}px`;
            lockHeight = `${rect.height}px`;
            lockMaxHeight = `${rect.height}px`;
        }

        // Get current modal position from the DOM (for positioning only)
        const positionRect = modal.getBoundingClientRect();

        // Store starting click position
        startX = e.clientX;
        startY = e.clientY;

        // Store the actual current position from getBoundingClientRect
        startModalLeft = positionRect.left;
        startModalTop = positionRect.top;

        // Convert right positioning to left positioning if necessary
        if (modal.style.right !== 'auto' && modal.style.right !== '') {
            modal.style.left = positionRect.left + 'px';
            modal.style.right = 'auto';
        }

        // Create a style element to force modal size constraints
        // NOTE: We do NOT lock preview-container overflow here - it needs to remain scrollable
        const lockStyle = document.createElement('style');
        lockStyle.id = 'rendercad-modal-lock';
        lockStyle.textContent = `
            .rendercad-loading-modal {
                width: ${lockWidth} !important;
                height: ${lockHeight} !important;
                min-width: ${lockWidth} !important;
                max-width: ${lockWidth} !important;
                min-height: ${isPinned ? `${PINNED_MODAL_WIDTH}px` : lockHeight} !important;
                max-height: ${lockMaxHeight} !important;
                flex-shrink: 0 !important;
                flex-grow: 0 !important;
                resize: none !important;
                overflow: hidden !important;
                box-sizing: border-box !important;
            }
        `;
        document.head.appendChild(lockStyle);
        
        // Ensure preview container maintains scrolling during drag (unpinned mode only)
        if (previewContainer && !isPinned) {
            // Force scrolling to remain enabled even during drag
            previewContainer.style.setProperty('overflow-y', 'auto', 'important');
            previewContainer.style.setProperty('overflow-x', 'hidden', 'important');
            previewContainer.style.setProperty('max-height', '60vh', 'important');
            previewContainer.style.setProperty('min-height', '0', 'important');
        }

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

    function drag(e) {
        if (!isDragging) return;

        e.preventDefault();

        // Calculate movement delta
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        // Calculate new position based on starting position + delta
        let newLeft = startModalLeft + deltaX;
        let newTop = startModalTop + deltaY;
        
        // Ensure preview container maintains scroll constraints DURING drag (unpinned mode only)
        const previewContainer = modal.querySelector('.rendercad-preview-container');
        if (previewContainer && !modal.hasAttribute('data-pinned')) {
            // Force scrolling to remain enabled with !important to override any styles
            previewContainer.style.setProperty('overflow-y', 'auto', 'important');
            previewContainer.style.setProperty('overflow-x', 'hidden', 'important');
            previewContainer.style.setProperty('max-height', '60vh', 'important');
            previewContainer.style.setProperty('min-height', '0', 'important');
            previewContainer.style.setProperty('display', 'flex', 'important');
        }

        // Get window dimensions (use current rect for height calculation)
        const modalRect = modal.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        // Boundaries - preserve a viewport gutter so controls do not clip.
        const minLeft = VIEWPORT_GUTTER;
        const maxLeft = Math.max(VIEWPORT_GUTTER, windowWidth - modalRect.width - VIEWPORT_GUTTER);
        const minTop = VIEWPORT_GUTTER;
        const maxTop = Math.max(VIEWPORT_GUTTER, windowHeight - modalRect.height - VIEWPORT_GUTTER);

        // Constrain to boundaries
        newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
        newTop = Math.max(minTop, Math.min(newTop, maxTop));

        // Snap to edges (closer threshold)
        const snapThreshold = 20;
        const snapMargin = VIEWPORT_GUTTER;

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

        if (updateQueueCounterPositionFn && typeof updateQueueCounterPositionFn === 'function') {
            updateQueueCounterPositionFn();
        }
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
        
        // CRITICAL: Ensure preview container maintains scroll constraints after drag ends
        const previewContainer = modal.querySelector('.rendercad-preview-container');
        if (previewContainer && !modal.hasAttribute('data-pinned')) {
            // Immediately restore scroll constraints with !important
            previewContainer.style.setProperty('overflow-y', 'auto', 'important');
            previewContainer.style.setProperty('overflow-x', 'hidden', 'important');
            previewContainer.style.setProperty('max-height', '60vh', 'important');
            previewContainer.style.setProperty('min-height', '0', 'important');
            previewContainer.style.setProperty('display', 'flex', 'important');
            
            // Force immediate synchronous reflow
            void previewContainer.offsetHeight;
            void previewContainer.scrollHeight;
            void previewContainer.clientHeight;
            
            // Use requestAnimationFrame for additional recalculation
            requestAnimationFrame(() => {
                // Force another reflow
                void previewContainer.offsetHeight;
                void previewContainer.scrollHeight;
                void previewContainer.clientHeight;
                
                // Call helper function to ensure everything is correct
                ensurePreviewContainerScrollable();
            });
        }
        
        // Restore proper width/height based on pinned state after drag
        const isPinned = modal.getAttribute('data-pinned') === 'true';
        const rectBefore = modal.getBoundingClientRect();
        if (isPinned) {
            // Ensure pinned width is maintained
            modal.style.setProperty('width', `${PINNED_MODAL_WIDTH}px`, 'important');
            modal.style.setProperty('min-width', `${PINNED_MODAL_WIDTH}px`, 'important');
            modal.style.setProperty('max-width', `${PINNED_MODAL_WIDTH}px`, 'important');
        } else {
            // Ensure normal width is maintained
            applyUnpinnedModalWidth(modal);
        }
        const rectAfter = modal.getBoundingClientRect();

        clampModalToViewport(modal);
        if (updateQueueCounterPositionFn && typeof updateQueueCounterPositionFn === 'function') {
            updateQueueCounterPositionFn();
        }
        
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
    
    // Hide circular loader if not pinned
    if (!isPinned) {
        const circularLoader = loadingModalInstance.querySelector('.rendercad-circular-loader');
        if (circularLoader) {
            circularLoader.style.display = 'none';
            circularLoader.style.animation = 'none';
            circularLoader.style.opacity = '0';
            circularLoader.style.visibility = 'hidden';
        }
    }
    
    if (isPinned) {
        // In pinned mode, show circular loading indicator around logo button
        let circularLoader = loadingModalInstance.querySelector('.rendercad-circular-loader');
        if (!circularLoader) {
            // Create circular loader - logo button should exist when pinned
            circularLoader = document.createElement('div');
            circularLoader.className = 'rendercad-circular-loader';
            // FIXED POSITION: Fixed to top and centered horizontally like logo button
            // Loader is 48px diameter, surrounds the 40px logo button at top: 8px
            // so loader at top: 4px (4px above to center around button)
            circularLoader.style.cssText = `
                position: absolute;
                top: 4px;
                left: 50%;
                transform: translateX(-50%);
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
            circularLoader.style.animation = 'rendercad-spin 1s linear infinite';
            
            loadingModalInstance.appendChild(circularLoader);
        } else {
            // Always update position and show (in case it was hidden)
            // Fixed to top and centered horizontally like logo button
            circularLoader.style.top = '4px';
            circularLoader.style.left = '50%';
            circularLoader.style.transform = 'translateX(-50%)';
            circularLoader.style.display = 'block';
            circularLoader.style.opacity = '1';
            circularLoader.style.visibility = 'visible';
            // Ensure animation is running
            circularLoader.style.animation = 'rendercad-spin 1s linear infinite';

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
        // Unpinned mode: show regular loading bar (divider)
        const divider = loadingModalInstance.querySelector('.rendercad-divider');
        if (divider) {
            divider.style.transition = 'all 0.5s ease';
            divider.style.transform = 'scaleX(1)';
            divider.style.opacity = '1';
            divider.style.height = '2px';
            divider.style.marginTop = '8px';
            divider.style.marginBottom = '0';
            divider.style.display = 'block';
            divider.style.visibility = 'visible';
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

    // Queue counter is now in document.body, not in modal
    const queueCounter = document.querySelector('.rendercad-queue-counter');
    if (!queueCounter) return;

    const activeRenders = parseInt(loadingModalInstance.getAttribute('data-active-renders') || 0);

    if (activeRenders > 1) {
        queueCounter.style.display = 'flex';
        queueCounter.textContent = activeRenders.toString();
        requestAnimationFrame(() => {
            if (window.updateQueueCounterPosition) {
                window.updateQueueCounterPosition();
            }
        });
    } else {
        queueCounter.style.display = 'none';
    }
}

// Helper function to ensure preview container maintains scroll constraints
function ensurePreviewContainerScrollable() {
    if (!loadingModalInstance) return;
    
    const isPinned = loadingModalInstance.hasAttribute('data-pinned');
    if (isPinned) return; // Don't enforce scrolling in pinned mode
    
    const previewContainer = loadingModalInstance.querySelector('.rendercad-preview-container');
    if (!previewContainer) return;
    
    // Ensure modal has proper height constraints
    loadingModalInstance.style.setProperty('max-height', `calc(100vh - ${VIEWPORT_GUTTER * 2}px)`, 'important');
    loadingModalInstance.style.setProperty('height', 'auto', 'important');
    
    // Ensure content wrapper doesn't prevent scrolling
    const contentWrapper = loadingModalInstance.querySelector('.rendercad-content-wrapper');
    if (contentWrapper) {
        contentWrapper.style.overflow = 'hidden';
        contentWrapper.style.minHeight = '0';
    }
    
    // Re-enforce constraints to ensure scrollbar remains
    previewContainer.style.display = 'flex';
    previewContainer.style.minHeight = '0';
    previewContainer.style.maxHeight = '60vh';
    previewContainer.style.overflowY = 'auto';
    previewContainer.style.overflowX = 'hidden';
    
    // Force immediate synchronous reflow to recalculate scrollbar
    void previewContainer.offsetHeight;
    void previewContainer.scrollHeight;
    void previewContainer.clientHeight;
    
    // Also force async reflow as backup
    requestAnimationFrame(() => {
        void previewContainer.offsetHeight;
        void previewContainer.scrollHeight;
        void previewContainer.clientHeight;
        clampModalToViewport(loadingModalInstance);
    });
}

async function downloadImageSource(imageUrl, filename) {
    const link = document.createElement('a');

    if (/^https?:/i.test(imageUrl)) {
        const response = await fetch(imageUrl, { mode: 'cors' });
        if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        link.download = filename;
        link.href = objectUrl;
        link.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        return;
    }

    link.download = filename;
    link.href = imageUrl;
    link.click();
}

function displayRenderedImage(originalImage, renderedImage, rect, jobId) {
    console.log('[RENDERCAD Content] displayRenderedImage called', {
        hasLoadingModal: !!loadingModalInstance,
        imageSize: renderedImage?.length,
        jobId
    });

    if (!loadingModalInstance) {
        console.error('[RENDERCAD Content] No loading modal instance!');
        return;
    }

    // Get the preview container
    const previewContainer = loadingModalInstance.querySelector('.rendercad-preview-container');
    if (!previewContainer) {
        console.error('[RENDERCAD Content] No preview container found!');
        return;
    }

    // Show preview container and toggle bar if it's the first render
    if (previewContainer.style.display === 'none') {
        // Show toggle bar and ensure it's visible
        const toggleBar = loadingModalInstance.querySelector('.rendercad-toggle-bar');
        const toggleIcon = loadingModalInstance.querySelector('.rendercad-toggle-icon');
        if (toggleBar) {
            toggleBar.style.display = 'flex';
            toggleBar.style.visibility = 'visible';
        }

        // Set isExpanded = true and expand the preview
        const isPinned = loadingModalInstance.hasAttribute('data-pinned');
        isExpanded = true;
        
        // Apply modal state to ensure correct sizing (use global function if available)
        if (window.applyModalState) {
            window.applyModalState(loadingModalInstance, isPinned, isExpanded);
        } else {
            // Fallback: manually set preview container state
            previewContainer.style.display = 'flex';
            previewContainer.style.minHeight = '0';
            previewContainer.style.maxHeight = '60vh';
            previewContainer.style.opacity = '1';
            previewContainer.style.overflowY = 'auto';
            previewContainer.style.overflowX = 'hidden';
        }
        
        // Ensure modal has proper height constraints in unpinned mode for scrolling
        if (!isPinned) {
            loadingModalInstance.style.setProperty('max-height', `calc(100vh - ${VIEWPORT_GUTTER * 2}px)`, 'important');
            loadingModalInstance.style.setProperty('height', 'auto', 'important');
            // Immediately ensure scrollbar appears
            ensurePreviewContainerScrollable();
        }
        
        // Update toggle icon to show expanded state (up arrow)
        if (toggleIcon) {
            toggleIcon.textContent = '▲';
        }

        // If pinned, allow modal to grow downward to show images (default to expanded)
        if (isPinned) {
            // Allow modal to expand downward with images
            loadingModalInstance.style.removeProperty('height');
            loadingModalInstance.style.removeProperty('min-height');
            loadingModalInstance.style.removeProperty('max-height');
            loadingModalInstance.style.setProperty('height', 'auto', 'important');
            loadingModalInstance.style.setProperty('max-height', 'none', 'important');
            loadingModalInstance.style.setProperty('min-height', 'auto', 'important');
        }
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
        flex-shrink: 0;
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
        object-fit: contain;
        max-width: 100%;
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
    const downloadBtn = createActionButton('fas fa-download', async () => {
        try {
            await downloadImageSource(renderedImage, `rendercad-render-${Date.now()}.png`);
        } catch (error) {
            showRenderError(error.message);
        }
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
    const redoBtn = createActionButton('fas fa-redo', async () => {
        // Check if extension context is still valid
        if (!chrome.runtime?.id) {
            console.error('Extension context invalidated - please refresh the page');
            return;
        }

        // Find the index of this rendered image
        const imageIndex = renderedImages.indexOf(renderedImage);
        if (imageIndex === -1) {
            console.error('Could not find rendered image in array');
            return;
        }

        // Get the original image for this render
        const originalImageForRerender = originalImages[imageIndex];
        if (!originalImageForRerender) {
            console.error('No original image found for re-render');
            return;
        }

        const renderMode = await getStoredRenderModePreference();

        // Send the original image to be re-rendered (not a new capture)
        chrome.runtime.sendMessage({
            action: 'rerenderImage',
            imageData: originalImageForRerender,
            rect: rect,
            jobId: showLoadingOverlay(),
            renderMode: renderMode
        });
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
        if (!e.target.closest('button')) {
            const currentIndex = renderedImages.indexOf(renderedImage);
            showFullscreenImage(currentIndex);
        }
    });

    // Handle image load errors
    previewImg.addEventListener('error', () => {
        previewImg.style.opacity = '0.3';
    });

    previewImg.addEventListener('load', () => {
        previewImg.style.opacity = '1';
        // Ensure scrollbar appears after image loads (may change container height)
        const isPinned = loadingModalInstance.hasAttribute('data-pinned');
        if (!isPinned) {
            ensurePreviewContainerScrollable();
        }
    });

    preview.appendChild(previewImg);
    preview.appendChild(gradientOverlay);
    preview.appendChild(actionBar);
    previewContainer.appendChild(preview);
    
    // Immediately ensure scrollbar appears if needed (unpinned mode)
    const isPinned = loadingModalInstance.hasAttribute('data-pinned');
    if (!isPinned) {
        // Call the scrollable function immediately to force scrollbar calculation
        ensurePreviewContainerScrollable();
    }
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
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
        `;

        downloadAllBtn.addEventListener('mouseenter', () => {
            downloadAllBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3), rgba(255,255,255,0.1))';
            downloadAllBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)';
        });

        downloadAllBtn.addEventListener('mouseleave', () => {
            downloadAllBtn.style.background = 'linear-gradient(-75deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))';
            downloadAllBtn.style.boxShadow = 'inset 0 1px 1px rgba(0, 0, 0, 0.05), inset 0 -1px 1px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)';
        });

        downloadAllBtn.addEventListener('click', async () => {
            // Download all images as a zip file (using inline zip creator - CSP-safe)
            try {
                // Simple zip file creator (no external dependencies)
                async function createZipFile(files) {
                    const zipParts = [];
                    let offset = 0;
                    const centralDirParts = [];
                    
                    // Helper to convert string to bytes
                    function stringToBytes(str) {
                        const bytes = new Uint8Array(str.length);
                        for (let i = 0; i < str.length; i++) {
                            bytes[i] = str.charCodeAt(i) & 0xFF;
                        }
                        return bytes;
                    }
                    
                    // Helper to write 16-bit little-endian
                    function writeUint16(value) {
                        return new Uint8Array([value & 0xFF, (value >> 8) & 0xFF]);
                    }
                    
                    // Helper to write 32-bit little-endian
                    function writeUint32(value) {
                        return new Uint8Array([
                            value & 0xFF,
                            (value >> 8) & 0xFF,
                            (value >> 16) & 0xFF,
                            (value >> 24) & 0xFF
                        ]);
                    }
                    
                    // Process each file
                    for (let i = 0; i < files.length; i++) {
                        const { name, data } = files[i];
                        const nameBytes = stringToBytes(name);
                        const dataBytes = new Uint8Array(await data.arrayBuffer());
                        
                        // Local file header
                        const localHeader = new Uint8Array(30 + nameBytes.length);
                        let pos = 0;
                        localHeader.set(writeUint32(0x04034b50), pos); pos += 4; // Signature
                        localHeader.set(writeUint16(20), pos); pos += 2; // Version
                        localHeader.set(writeUint16(0), pos); pos += 2; // Flags
                        localHeader.set(writeUint16(0), pos); pos += 2; // Compression (store)
                        localHeader.set(writeUint32(0), pos); pos += 4; // Mod time/date
                        localHeader.set(writeUint32(0), pos); pos += 4; // CRC32 (0 for store)
                        localHeader.set(writeUint32(dataBytes.length), pos); pos += 4; // Compressed size
                        localHeader.set(writeUint32(dataBytes.length), pos); pos += 4; // Uncompressed size
                        localHeader.set(writeUint16(nameBytes.length), pos); pos += 2; // Name length
                        localHeader.set(writeUint16(0), pos); pos += 2; // Extra length
                        localHeader.set(nameBytes, pos);
                        
                        zipParts.push(localHeader);
                        zipParts.push(dataBytes);
                        
                        // Central directory entry
                        const centralEntry = new Uint8Array(46 + nameBytes.length);
                        pos = 0;
                        centralEntry.set(writeUint32(0x02014b50), pos); pos += 4; // Signature
                        centralEntry.set(writeUint16(20), pos); pos += 2; // Version made by
                        centralEntry.set(writeUint16(20), pos); pos += 2; // Version needed
                        centralEntry.set(writeUint16(0), pos); pos += 2; // Flags
                        centralEntry.set(writeUint16(0), pos); pos += 2; // Compression
                        centralEntry.set(writeUint32(0), pos); pos += 4; // Mod time/date
                        centralEntry.set(writeUint32(0), pos); pos += 4; // CRC32
                        centralEntry.set(writeUint32(dataBytes.length), pos); pos += 4; // Compressed size
                        centralEntry.set(writeUint32(dataBytes.length), pos); pos += 4; // Uncompressed size
                        centralEntry.set(writeUint16(nameBytes.length), pos); pos += 2; // Name length
                        centralEntry.set(writeUint16(0), pos); pos += 2; // Extra length
                        centralEntry.set(writeUint16(0), pos); pos += 2; // Comment length
                        centralEntry.set(writeUint16(0), pos); pos += 2; // Disk number
                        centralEntry.set(writeUint16(0), pos); pos += 2; // Internal attributes
                        centralEntry.set(writeUint32(0), pos); pos += 4; // External attributes
                        centralEntry.set(writeUint32(offset), pos); pos += 4; // Local header offset
                        centralEntry.set(nameBytes, pos);
                        
                        centralDirParts.push(centralEntry);
                        offset += localHeader.length + dataBytes.length;
                    }
                    
                    // End of central directory
                    const centralDirSize = centralDirParts.reduce((sum, part) => sum + part.length, 0);
                    const endRecord = new Uint8Array(22);
                    pos = 0;
                    endRecord.set(writeUint32(0x06054b50), pos); pos += 4; // Signature
                    endRecord.set(writeUint16(0), pos); pos += 2; // Disk number
                    endRecord.set(writeUint16(0), pos); pos += 2; // Central dir disk
                    endRecord.set(writeUint16(files.length), pos); pos += 2; // Entries on disk
                    endRecord.set(writeUint16(files.length), pos); pos += 2; // Total entries
                    endRecord.set(writeUint32(centralDirSize), pos); pos += 4; // Central dir size
                    endRecord.set(writeUint32(offset), pos); pos += 4; // Central dir offset
                    endRecord.set(writeUint16(0), pos); pos += 2; // Comment length
                    
                    // Combine all parts
                    const totalSize = zipParts.reduce((sum, part) => sum + part.length, 0) + 
                                    centralDirSize + endRecord.length;
                    const zipBlob = new Blob([...zipParts, ...centralDirParts, endRecord], { type: 'application/zip' });
                    
                    return zipBlob;
                }
                
                // Fetch all images and prepare for zip
                const files = [];
                for (let i = 0; i < renderedImages.length; i++) {
                    try {
                        const response = await fetch(renderedImages[i]);
                        const blob = await response.blob();
                        files.push({
                            name: `rendercad-render-${i + 1}.png`,
                            data: blob
                        });
                    } catch (error) {
                        console.error(`Failed to fetch image ${i + 1}:`, error);
                    }
                }
                
                if (files.length === 0) {
                    throw new Error('No images could be added to zip');
                }
                
                // Create zip file
                const zipBlob = await createZipFile(files);
                
                // Download the zip file
                const link = document.createElement('a');
                link.download = `rendercad-renders-${Date.now()}.zip`;
                link.href = URL.createObjectURL(zipBlob);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Clean up the object URL after a delay
                setTimeout(() => URL.revokeObjectURL(link.href), 100);
            } catch (error) {
                console.error('Failed to create zip file:', error);
                // Fallback to individual downloads if zip fails
                for (let i = 0; i < renderedImages.length; i++) {
                    const link = document.createElement('a');
                    link.download = `rendercad-render-${Date.now()}-${i + 1}.png`;
                    link.href = renderedImages[i];
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        });

        // Insert at the beginning of preview container
        // Insert download button in content wrapper, before preview container (so it doesn't scroll)
        const contentWrapper = loadingModalInstance.querySelector('.rendercad-content-wrapper');
        if (contentWrapper) {
            // Insert before preview container so it stays fixed
            contentWrapper.insertBefore(downloadAllBtn, previewContainer);
        } else {
            // Fallback: insert at beginning of preview container
            previewContainer.insertBefore(downloadAllBtn, previewContainer.firstChild);
        }
    }

    // Update button text with count - show only icon in pinned mode
    const isPinned = loadingModalInstance.hasAttribute('data-pinned');
    if (isPinned) {
        downloadAllBtn.innerHTML = '<i class="fas fa-download"></i>';
        downloadAllBtn.title = `Download All (${imageCount})`;
        // Hide button if pinned and collapsed (use !important to override CSS)
        if (!isExpanded) {
            downloadAllBtn.style.setProperty('display', 'none', 'important');
        } else {
            downloadAllBtn.style.setProperty('display', 'flex', 'important');
        }
    } else {
        downloadAllBtn.innerHTML = `⬇ Download All (${imageCount})`;
        downloadAllBtn.title = '';
        downloadAllBtn.style.display = 'flex';
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

    // Hide queue counter when fullscreen overlay is open
    const queueCounter = document.querySelector('.rendercad-queue-counter');
    if (queueCounter) {
        queueCounter.style.display = 'none';
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
        transition: opacity 0.3s ease;
        opacity: 1;
    `;

    // Preload next and previous images for smooth navigation
    function preloadAdjacentImages() {
        const currentIndex = currentFullscreenIndex;
        const nextIndex = (currentIndex + 1) % renderedImages.length;
        const prevIndex = (currentIndex - 1 + renderedImages.length) % renderedImages.length;
        
        // Preload next image
        if (renderedImages[nextIndex]) {
            const nextImg = new Image();
            nextImg.src = renderedImages[nextIndex];
        }
        
        // Preload previous image
        if (renderedImages[prevIndex]) {
            const prevImg = new Image();
            prevImg.src = renderedImages[prevIndex];
        }
    }
    
    // Preload adjacent images when current image loads
    img.addEventListener('load', () => {
        preloadAdjacentImages();
    });
    
    // Preload immediately if image is already loaded
    if (img.complete) {
        preloadAdjacentImages();
    }

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
            navigateFullscreen(-1);
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
            navigateFullscreen(1);
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
            // Use current index to get the correct images
            const currentRenderedImage = renderedImages[currentFullscreenIndex];
            const currentOriginalImage = originalImages[currentFullscreenIndex];
            showingOriginal = !showingOriginal;
            if (showingOriginal && currentOriginalImage) {
                img.src = currentOriginalImage;
                toggleBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> Toggle Render';
            } else if (currentRenderedImage) {
                img.src = currentRenderedImage;
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

    downloadBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        // Use current index to get the correct image
        const currentRenderedImage = renderedImages[currentFullscreenIndex];
        if (currentRenderedImage) {
            try {
                await downloadImageSource(currentRenderedImage, `rendercad-render-${Date.now()}.png`);
            } catch (error) {
                showRenderError(error.message);
            }
        }
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
            
            // Show queue counter again when fullscreen overlay closes
            updateQueueCounter();
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
            // Fade out current image
            img.style.opacity = '0';
            
            // Wait for fade out, then change image and fade in
            setTimeout(() => {
                // Always show rendered image when navigating (reset toggle state)
                showingOriginal = false;
                img.src = newRenderedImage;
                
                // Update toggle button if it exists
                const newOriginalImage = originalImages[currentFullscreenIndex];
                if (toggleBtn && newOriginalImage) {
                    toggleBtn.style.display = '';
                    toggleBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> Toggle Original';
                } else if (toggleBtn) {
                    toggleBtn.style.display = 'none';
                }
                
                // Preload adjacent images for next navigation
                preloadAdjacentImages();
                
                // If image is already cached, fade in immediately
                if (img.complete && img.naturalWidth > 0) {
                    img.style.opacity = '1';
                } else {
                    // Fade in new image after it loads
                    img.addEventListener('load', function fadeIn() {
                        img.style.opacity = '1';
                        img.removeEventListener('load', fadeIn);
                    }, { once: true });
                }
            }, 150); // Half of transition duration for smooth cross-fade
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

    // Create error overlay
    const errorOverlay = document.createElement('div');
    errorOverlay.id = 'rendercad-error-overlay';
    errorOverlay.style.cssText = `
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
        window.open('https://rendercad.ai/settings', '_blank');
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
