# DJ Holland App V19.1 – Live Instagram Build

V19 restored with the live Meta/Instagram feed wired into the full DJ Holland app.

## Render environment variables

- `IG_ACCESS_TOKEN` — required
- `IG_USER_ID` — optional; if omitted the server resolves `/me`
- `IG_API_VERSION` — optional, defaults to `v23.0`
- `IG_API_HOST` — defaults to `https://graph.instagram.com`

## Endpoints

- `/api/health`
- `/api/instagram/feed`
- `/api/instagram` (compatibility alias)

Run locally with `npm install && npm start`.
