# RENDERCAD Chrome Extension

Transform CAD screenshots into photorealistic renders using AI-powered image generation.

## Features

- **Screen Capture Tool**: Click and drag to select any portion of your screen containing CAD models
- **AI Rendering**: Powered by RENDERCAD's AI to convert CAD wireframes into photorealistic 3D renders
- **Side-by-Side Comparison**: Interactive slider to compare original CAD vs AI-rendered images
- **Easy Download**: Save both original and rendered images
- **Secure Authentication**: OAuth-based device code flow for secure login
- **Usage Tracking**: Monitor your rendering usage and plan limits

## Installation

1. **Download the Extension**
   - Download all files from the BrowserExtension folder

2. **Load in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the `BrowserExtension` folder

3. **Sign In**
   - Click the RENDERCAD extension icon
   - Click "Sign In" in the popup
   - A new tab will open with a verification code
   - Follow the instructions to authorize the extension
   - Once authorized, you'll see your account info in the popup

## Usage

1. **Start Capture**
   - Click the RENDERCAD extension icon in Chrome
   - If not logged in, click "Sign In" first
   - Click "Capture & Render" in the popup

2. **Select Area**
   - Click and drag to select the CAD area on your screen
   - The selection tool will overlay your screen

3. **View Results**
   - Wait for AI processing (may take 10-30 seconds)
   - Results will appear as an overlay on your page
   - Drag the slider to compare original vs rendered

4. **Download Images**
   - Use the download buttons to save either image
   - Click "New Capture" to start again

## Account Management

- **View Usage**: Click the extension icon to see your current rendering usage and limits
- **Logout**: Right-click the extension icon and select "Logout from RENDERCAD", or click "Logout" in the popup
- **Login Status**: A green checkmark badge on the icon indicates you're logged in

## Requirements

- Chrome browser (Manifest V3 support)
- RENDERCAD account (sign up at https://rendercad.ai)
- Internet connection for AI processing

## Troubleshooting

- **No capture overlay**: Refresh the page and try again
- **Session expired**: The extension will attempt to automatically re-authenticate. If that fails, you'll see a notification to log in again
- **Slow processing**: Large images take longer to process
- **Rate limits**: If you see a "Too Many Requests" error, wait a moment before submitting another render

## Privacy & Security

- **Secure Authentication**: OAuth-based device code flow, no passwords stored in the extension
- **Token Storage**: Your authentication token is stored securely in Chrome's local storage
- **Image Processing**: Images are sent to RENDERCAD's API for AI processing
- **HTTPS**: All communication with the API is encrypted via HTTPS

## Performance & Efficiency

The extension is designed to be lightweight and server-friendly:

- **Token Caching**: Authentication is validated once and cached for 5 minutes, minimizing API calls
- **Event-Driven**: No continuous background polling - only makes requests when you actively use features
- **Smart Polling**: During render processing, polls status every 2 seconds only until completion
- **Efficient Updates**: Usage stats refresh only when you open the popup, not continuously

## Version History

### v1.2.0 (2025-11-21)
- **R2 CDN Support**: Updated to work with new R2 CDN storage (`https://renders.rendercad.ai`)
- **Token Caching**: Implemented 5-minute authentication cache to reduce server load
- **Removed Polling**: Eliminated continuous 30-second token validation polling
- **Error Handling**: Improved graceful handling of extension reload scenarios
- **Debug Controls**: Added configurable debug logging for troubleshooting

### v1.1.0
- Migrated from IP address to rendercad.ai domain
- Added secure OAuth device code authentication
- Implemented automatic token validation and re-authentication
- Added account info popup with usage tracking
- Added logout functionality via context menu
- Added login status badge on extension icon
- Improved error handling and user notifications

### v1.0.0
- Initial release with basic capture and render functionality
