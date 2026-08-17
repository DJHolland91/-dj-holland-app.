DJ Holland V19.5 Fix

Enthalten:
- server.js: Admin-Login, Instagram, Musikwunsch-API, Booking, Brevo-HTTPS-Mail + SMTP-Fallback
- public/index.html: Musikwünsche gehen jetzt an den Server und werden im geschützten Admin geladen

Wichtig für Booking auf Render Free:
Render Free blockiert SMTP-Ports 25/465/587. Für E-Mail bitte Brevo HTTPS verwenden:
BREVO_API_KEY=<dein Brevo API-Key>
MAIL_FROM_EMAIL=<bei Brevo verifizierte Absenderadresse>
MAIL_FROM_NAME=DJ Holland App
BOOKING_TO=dj.team-holland@web.de

Die bisherigen ADMIN_EMAIL, ADMIN_PASSWORD und IG_ACCESS_TOKEN bleiben bestehen.

Hinweis Musikwünsche:
Sie werden serverseitig gespeichert. Auf Render Free ist das Dateisystem nicht dauerhaft; bei Neustart/Redeploy können Daten verloren gehen. Für dauerhaftes Speichern später Postgres/Redis anbinden.

V19.6: Neues DJ-Holland-App-Icon + PWA-Installationsdialog. Android/Chrome nutzt den nativen Installationsdialog, sobald der Browser ihn anbietet. iPhone/iPad zeigt die notwendige Safari-Anleitung (Apple erlaubt keinen automatischen Homescreen-Install per Webseite).
