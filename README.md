# DJ Holland App V12

Diese Version behält die visuelle DJ-Holland-PWA und ergänzt einen serverseitigen Instagram-Live-Feed.

## Bereits umgesetzt
- `/api/instagram/feed` als sichere Server-Schnittstelle
- Access Token bleibt ausschließlich in `.env`
- Social Wall lädt Posts/Reels automatisch
- Story-Bereich ist optional vorbereitet
- bestehende Bereiche der DJ-Holland-App bleiben erhalten

## Lokal starten
1. Node.js installieren.
2. `npm install`
3. `.env.example` nach `.env` kopieren.
4. `IG_ACCESS_TOKEN` eintragen. Instagram-ID wird automatisch über `/me` ermittelt; `IG_API_VERSION` ist optional.
5. `npm start`
6. `http://localhost:3000` öffnen.

## Sicherheit
Den Access Token niemals in `public/index.html`, GitHub, Screenshots oder Chat-Nachrichten veröffentlichen.
Für die Live-Version sollte HTTPS verwendet werden.

## Meta/Webhooks
Webhooks sind noch nicht aktiviert. Dafür braucht die Meta-App später die öffentliche HTTPS-Callback-URL
des gehosteten Backends und ein eigenes Verify Token. Diese Werte werden erst nach Wahl des Hostings gesetzt.
