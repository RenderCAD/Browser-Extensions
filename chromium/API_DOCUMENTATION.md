# RENDERCAD API Notes

Base URL: `https://rendercad.ai/backend/`

This extension uses the public RenderCAD API documented at `https://rendercad.ai/developers`. Public `POST` endpoints are JSON-only and must include `Authorization: Bearer <token>` unless the request is the device-code bootstrap.

## Authentication

Desktop apps and browser extensions sign in with the device-code flow:

1. `POST /backend/auth.php?action=request_device_code`
2. Open the returned `verification_url`.
3. Poll `GET /backend/auth.php?action=poll_device_code&code=<code>` until `status` is `authorized`.
4. Store the returned `api_token` in `chrome.storage.local`.

The extension sends `app_type: "browser-extension"` and the current manifest version as `app_version`.

## Image Render Flow

The old `action=render` and `r2_input_url` flow is removed. Do not use multipart uploads or direct base64 render submission.

1. Create a job:

```http
POST /backend/render.php?action=create_job
Content-Type: application/json

{
  "model": "pro",
  "quality": "standard",
  "render_mode": "preserve",
  "background_style": "auto",
  "condition": "auto"
}
```

2. Presign each required upload slot:

```http
POST /backend/render.php?action=presign_upload
Content-Type: application/json

{
  "job_id": "render_abc123",
  "slot": "input_main",
  "content_type": "image/png"
}
```

3. Upload raw bytes with `PUT presigned_url` and the same `Content-Type`.
4. Finalize with `POST /backend/render.php?action=finalize_job` and `{ "job_id": "render_abc123" }`.
5. Poll `GET /backend/render.php?action=status&job_id=render_abc123` every 2 seconds.

On completion, prefer `asset_url` for direct image display and download. Use `output_url` as a fallback; if it points at `/backend/`, fetch it with the bearer token.

## Account and Errors

Use `GET /backend/auth.php?action=check` to validate tokens and refresh account usage. Current usage fields can include `monthly_renders_used`, `monthly_render_limit`, `grant_tokens_remaining`, and `pooled_tokens_remaining`.

Non-2xx responses return a top-level `error` string. Some status responses also include `error_message` or `status_detail`; show the most specific message available.
