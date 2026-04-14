# RENDERCAD Chrome Extension - Agent Guide

## Quick Facts

- Vanilla Manifest V3 extension. No build, no package manager, no automated test runner.
- Reload after every change in `chrome://extensions`.
- The extension icon does **not** open `popup.html`; `chrome.action.onClicked` in `background.js` injects `content.js` and opens the in-page modal.

## Files That Matter

- `background.js`: service worker for auth, screenshot cropping, upload, render submit, polling.
- `content.js`: selection overlay, render modal, preview/download UI.
- `manifest.json`: permissions and entrypoints.

## Hard Requirements

- Preserve the content-script guard at the top of `content.js`. The extension injects `content.js` more than once.
- `captureScreen` and `rerenderImage` are fire-and-forget messages. Results come back later through `displayRenderedImage` or `renderError`.
- Keep `DEV_MODE` `false` unless you are intentionally testing the dev backend. It changes auth/render hosts and icon behavior.

## Current API Contract

- Public POST endpoints are JSON-only.
- Image renders use the new pipeline in `background.js`:
  1. `POST /backend/render.php?action=presign_upload`
  2. `PUT` raw image bytes to `presigned_url`
  3. `POST /backend/render.php?action=render` with `r2_input_url`
  4. Poll `GET /backend/render.php?action=status&job_id=...`
- Do not reintroduce direct render submission with `image: <base64>` as the primary path.
- Completed renders should use `asset_url` when available; that is the direct public image URL.

## Render Defaults

- The extension currently hard-codes image renders to:
  - `model: "pro"`
  - `quality: "standard"`
  - `background_style: "auto"`
- `render_mode` defaults to `"preserve"`, but the capture overlay now exposes an `Exact` / `Enhance` toggle that maps to API values `preserve` / `creative`.
- No video support is wired into the extension right now.
- No condition picker is wired in; default behavior is to omit `condition`.

## Auth Notes

- Device-code bootstrap is the only sign-in flow used here.
- Request body uses `app_type: "browser-extension"`.
- Token validation is cached for 5 minutes in the service worker; auth bugs can look stale until cache expiry or `clearToken()`.

## Capture Notes

- `chrome.tabs.captureVisibleTab()` returns a full-tab screenshot; `background.js` crops it with `OffscreenCanvas`.
- Selection coordinates are viewport pixels, screenshot pixels are device-pixel-ratio scaled. The `scaleX/scaleY` math in `cropImage()` is critical; test on browser zoom != 100% if you touch it.
- The original captured image is still kept as a data URL in the UI for toggle/re-render, but the backend upload path must stay on the presigned-upload flow.

## Debugging

- Enable `DEBUG` in `background.js` for structured service-worker logs.
- Page-side logs use the `[RENDERCAD Content]` prefix.
- Inspect the service worker from `chrome://extensions` -> extension card -> `service worker`.

## Manual Verification

- Sign in from a clean reload.
- Capture and render on a normal web page, not `chrome://` or extension pages.
- Confirm the loading modal stays visible during render.
- Confirm the final image appears and download/re-render still work.
- Re-test capture on zoomed pages like `125%` or `150%` if crop logic changed.
