# Chrome Web Store Entry Responses (CORRECTED)

## Single Purpose Description
✅ Already filled: "Render your CAD models as photorealistic image renders in seconds using RENDERCAD's API."

---

## Permission Justifications

### activeTab justification
```
The extension requires activeTab permission to capture screenshots of the current browser tab when users select CAD models displayed in web-based CAD applications. When users click "Capture & Render", the extension uses chrome.tabs.captureVisibleTab() to capture the visible content of the active tab. Users can then select a specific area of the captured screenshot to extract CAD wireframes for AI rendering. This permission is only activated when the user explicitly initiates a capture action and is essential for the extension's core functionality of capturing CAD content from browser tabs.
```

### storage justification
```
The storage permission is required to securely store the user's authentication token and account information locally on their device. This includes: (1) OAuth authentication tokens needed to authenticate API requests to RENDERCAD's servers, (2) user account information (email, subscription plan, usage statistics) to display in the extension popup, and (3) user preferences such as last capture position for improved UX. All data is stored locally using Chrome's storage API and is never transmitted to third parties. The authentication token is essential for maintaining user sessions and preventing repeated logins.
```

### scripting justification
```
The scripting permission is required to inject content scripts that enable the extension's overlay interface on web pages. This includes: (1) displaying the capture selection tool overlay when users initiate a capture, (2) showing the rendered image results overlay with comparison slider, (3) injecting UI elements for download buttons and navigation controls, and (4) handling user interactions with the extension's interface elements. The content scripts only run on pages where the user explicitly activates the extension features and do not modify page content beyond displaying the extension's own UI elements.
```

### contextMenus justification
```
The contextMenus permission is used to add a "Logout from RENDERCAD" option to the extension icon's right-click context menu. This provides users with a convenient way to log out of their RENDERCAD account directly from the extension icon without opening the popup. This is a standard UX pattern for extensions that require authentication and provides users with clear control over their session. The context menu item only appears when the user is logged in and does not access any page content.
```

### notifications justification
```
The notifications permission is used to notify users when their CAD render has completed processing. Since AI rendering can take 10-30 seconds, notifications provide a non-intrusive way to alert users that their rendered image is ready, even if they've navigated away from the page or switched to another application. Notifications are only sent for render completion events and include no sensitive information - just a simple "Render complete" message with an option to view the result. This improves user experience by eliminating the need to continuously check render status.
```

### Host permission justification
```
The host permission for "https://rendercad.ai/*" is required for the extension's core functionality. The extension must communicate with RENDERCAD's API servers to: (1) authenticate users via OAuth device code flow, (2) submit captured CAD screenshots for AI rendering, (3) poll render status during processing, (4) retrieve completed rendered images, (5) fetch user account information and usage statistics, and (6) validate authentication tokens. All communication is encrypted via HTTPS and follows OAuth security best practices. The extension only communicates with rendercad.ai and does not access any other websites or domains.
```

---

## Remote Code

**Are you using remote code?** Yes, I am using Remote code

### Remote code justification
```
The extension loads Font Awesome CSS from Cloudflare's CDN (cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css) to display icons in the extension's UI elements, such as the capture button, download buttons, and navigation controls. This is loaded via a <link> tag in the content script when creating modal overlays. Font Awesome is a widely-used, trusted icon library served over HTTPS from Cloudflare's CDN. The extension does not execute any remote JavaScript code - only CSS for icon styling. All JavaScript code is bundled in the extension package and no code is evaluated through eval() or similar methods.
```

---

## Data Usage

### What user data do you plan to collect from users now or in the future?

**Authentication information:** ✅ Yes
- OAuth authentication tokens are stored locally in Chrome's local storage
- Used to authenticate API requests to RENDERCAD servers
- Tokens are encrypted in transit via HTTPS
- Users can log out at any time to clear stored tokens

**Website content:** ✅ Yes
- Screenshots/images captured by users are sent to RENDERCAD's API for AI processing
- Only images explicitly captured by the user are transmitted
- Images are processed to generate photorealistic renders and are not stored permanently
- Users have full control over what content is captured and sent

**User activity:** ✅ Yes (Minimal)
- Last capture position and aspect ratio preferences are stored locally
- Used to remember user's preferred capture settings for improved UX
- No tracking of browsing behavior, clicks, or other activity
- Data is stored locally only and never transmitted

**All other categories:** ❌ No
- Personally identifiable information: No (email is only stored locally if user chooses to view account info)
- Health information: No
- Financial and payment information: No
- Personal communications: No
- Location: No
- Web history: No

### Data Usage Certifications

✅ **I do not sell or transfer user data to third parties, outside of the approved use cases**
- User data is only used to provide the rendering service
- Images are processed by RENDERCAD's API and not shared with third parties
- Authentication tokens are only used for API authentication

✅ **I do not use or transfer user data for purposes that are unrelated to my item's single purpose**
- All data collection is directly related to providing CAD rendering functionality
- Authentication tokens are only used for API access
- Captured images are only used for rendering processing

✅ **I do not use or transfer user data to determine creditworthiness or for lending purposes**
- No financial or credit-related data is collected or used

---

## Privacy Policy URL

**Required:** You need to provide a privacy policy URL that explains:
- What data is collected
- How it's used
- How it's stored
- User rights

**Suggested URL:** `https://rendercad.ai/privacy` or `https://rendercad.ai/privacy-policy`

Make sure this page exists and includes:
1. What data the extension collects (auth tokens, captured images, preferences)
2. How data is stored (local Chrome storage)
3. How data is transmitted (HTTPS to rendercad.ai API only)
4. That images are processed for rendering only
5. That users can log out to clear data
6. Contact information for privacy inquiries

