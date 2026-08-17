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


## Admin-Schutz
Setze in Render unter Environment die Variablen `ADMIN_EMAIL` und `ADMIN_PASSWORD`. Der Adminbereich ist danach nur nach serverseitiger Anmeldung zugänglich; das Passwort steht nicht im Browser-Code.


## Booking-Anfragen per E-Mail
Das Formular unter **Booking** sendet neue Anfragen serverseitig an `dj.team-holland@web.de`.

In Render unter **Environment** müssen dafür diese Werte gesetzt werden:

- `BOOKING_TO=dj.team-holland@web.de`
- `SMTP_HOST` = SMTP-Server deines Mail-Anbieters
- `SMTP_PORT` = normalerweise 465 oder 587
- `SMTP_SECURE` = `true` bei direktem TLS/Port 465, sonst `false`
- `SMTP_USER` = SMTP-Benutzername / Absenderkonto
- `SMTP_PASS` = SMTP-Passwort bzw. App-Passwort
- `SMTP_FROM` = optionaler Absender; wenn leer, wird `SMTP_USER` verwendet

Das Passwort gehört **nur** in Render Environment und niemals in GitHub oder `index.html`.
