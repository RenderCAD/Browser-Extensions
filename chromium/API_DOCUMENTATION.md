# RenderCAD AI API Documentation

## Overview

Transform flat images into photorealistic renders via API. Submit an image, get a rendered result.

**Base URLs**:
- **Local Development**: `http://localhost:8080`
- **Production**: `https://rendercad.ai`

---

## Authentication

### Method 1: Manual Token (Web Dashboard)

Use Bearer token authentication:
```
Authorization: Bearer YOUR_API_TOKEN
```

Get your API token: Account Settings → API Tokens → Generate New Token

### Method 2: Device Code Flow (Apps & Extensions)

OAuth-style authentication for desktop apps, browser extensions, and CLI tools.

**Flow:**
1. App requests device code → receives 6-character code
2. App opens browser to verification URL → user logs in
3. App polls for authorization → receives API token
4. App uses token for API requests

**Step 1: Request Device Code**
```
POST /backend/auth.php?action=request_device_code
```

Optional Parameters (for descriptive token names):
- `app_name` - "Chrome Extension", "My Desktop App"
- `app_type` - `browser-extension`, `desktop-app`, `mobile-app`, `cli-tool`
- `app_version` - "1.0.0"

Response:
```json
{
  "success": true,
  "code": "ABC123",
  "expires_in": 600,
  "poll_interval": 3,
  "verification_url": "http://localhost:8080/auth_device.html?code=ABC123"
}
```

**Step 2: Open Browser**

Open `verification_url` in default browser. User logs in and authorizes automatically.

**Step 3: Poll for Token**
```
GET /backend/auth.php?action=poll_device_code&code=ABC123
```

Responses:
- **Pending**: `{"status": "pending", "message": "Waiting for user authorization"}`
- **Authorized**: `{"status": "authorized", "api_token": "rendercad_xyz123..."}`
- **Expired**: `{"status": "expired", "message": "Code has expired"}`

Poll every 3 seconds until status is `authorized` or `expired`.

**Token Naming:**

| Metadata Provided | Token Name |
|------------------|------------|
| app_name="Chrome Extension", app_version="1.0.0" | Chrome Extension v1.0.0 - 2025-10-27... |
| app_type="desktop-app", app_version="2.1.0" | Desktop-app v2.1.0 - 2025-10-27... |
| app_name="My App" only | My App - 2025-10-27... |
| No metadata | Device - 2025-10-27... |

---

## Endpoints

### 1. Render Image
`POST /backend/render.php?action=render`

**Two formats supported:**

**Option A: JSON Format**
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ..."
}
```

**Option B: Multipart Form Data**
```
Content-Type: multipart/form-data

image: [binary file data]
```

**Parameters:**
- `image`: Base64 encoded image with data URL prefix (JSON) OR binary file upload (multipart)

**Response**:
```json
{
  "success": true,
  "job_id": "render_68f59c4d873762.99760761"
}
```

### 2. Check Status
`GET /backend/render.php?action=status&job_id=YOUR_JOB_ID`

**Response**:
```json
{
  "success": true,
  "status": "completed",
  "output_url": "/uploads/users/user123/output/render_123.png"
}
```
Status: `pending`, `processing`, `completed`, `failed`

### 3. Check Account
`GET /backend/auth.php?action=check`

**Response**:
```json
{
  "success": true,
  "user": {
    "monthly_render_limit": 100,
    "monthly_renders_used": 23
  }
}
```

---

## Limits & Requirements

### Account Limits
- Monthly token limits based on your plan
- Each render consumes 1 token
- API blocked when token limit exceeded
- Usage resets monthly

### Image Requirements
- Formats: JPEG, PNG, GIF, WebP
- Max size: 10MB
- Base64 encoded with `data:image/...;base64,` prefix (JSON) OR binary upload (multipart)

### Rendering
- AI-powered photorealistic rendering
- Automatic quality optimization
- All renders consume 1 token

---

## Error Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Invalid request |
| 401 | Invalid API token |
| 404 | Job not found |
| 429 | Monthly limit exceeded |
| 500 | Server error |

---

## Examples

### cURL

**JSON Format:**
```bash
# Render image (JSON)
curl -X POST "http://localhost:8080/backend/render.php?action=render" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"image": "data:image/jpeg;base64,/9j/4AAQ..."}'
```

**Multipart Form Data:**
```bash
# Render image with file upload
curl -X POST "http://localhost:8080/backend/render.php?action=render" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -F "image=@image.jpg"

# Check status
curl "http://localhost:8080/backend/render.php?action=status&job_id=render_123" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

**Production Examples:**
```bash
# Production JSON
curl -X POST "https://rendercad.ai/backend/render.php?action=render" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"image": "data:image/jpeg;base64,/9j/4AAQ..."}'

# Production multipart
curl -X POST "https://rendercad.ai/backend/render.php?action=render" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -F "image=@image.jpg"
```

### Python

**JSON Format:**
```python
import requests
import base64

# Local development base URL
BASE_URL = 'http://localhost:8080'
# Production base URL: 'https://rendercad.ai'

# Encode image
with open('image.jpg', 'rb') as f:
    image_data = base64.b64encode(f.read()).decode()
    image_url = f"data:image/jpeg;base64,{image_data}"

# Render
response = requests.post(
    f'{BASE_URL}/backend/render.php?action=render',
    headers={'Authorization': 'Bearer YOUR_API_TOKEN'},
    json={'image': image_url}
)

job_id = response.json()['job_id']

# Check status
status = requests.get(
    f'{BASE_URL}/backend/render.php?action=status&job_id={job_id}',
    headers={'Authorization': 'Bearer YOUR_API_TOKEN'}
).json()
```

**Multipart Form Data:**
```python
import requests

BASE_URL = 'http://localhost:8080'

# Render with file upload
with open('image.jpg', 'rb') as f:
    response = requests.post(
        f'{BASE_URL}/backend/render.php?action=render',
        headers={'Authorization': 'Bearer YOUR_API_TOKEN'},
        files={'image': f}
    )

job_id = response.json()['job_id']

# Check status
status = requests.get(
    f'{BASE_URL}/backend/render.php?action=status&job_id={job_id}',
    headers={'Authorization': 'Bearer YOUR_API_TOKEN'}
).json()
```