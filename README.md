# DJ Holland App – Clean Build

Sauberer Neuaufbau für Render.

## Render
- Runtime: Node
- Region: Frankfurt
- Build Command: `npm install`
- Start Command: `npm start`

## Struktur
- `public/index.html` – App
- `public/manifest.webmanifest` – PWA Manifest
- `server.js` – Express Server + Instagram API Proxy

## Instagram
In Render unter Environment Variables eintragen:
- `IG_ACCESS_TOKEN`
- optional `IG_USER_ID`
- optional `IG_API_VERSION`
- optional `IG_API_HOST`
