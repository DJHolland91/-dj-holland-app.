DJ HOLLAND APP V20.0 – COMPACT UPDATE

Neu in V20:
- Spotify-Bereich als kompakte Songkarten mit Cover-Artwork
- Instagram als kompaktes 3-Spalten-Grid statt langer Karten
- News im Admin mit optionalem Bild-Upload (automatische Verkleinerung)
- Deutsch/Englisch-Umschalter (DE bleibt Standard)
- Bestehende Funktionen bleiben erhalten: Booking/Brevo, Musikwünsche, Admin, Instagram API, PWA

WICHTIG BEIM AUSTAUSCH:
1. Den INHALT dieses Ordners in dein GitHub-/App-Projekt übernehmen.
2. Environment-Variablen bei Render NICHT löschen. BREVO_API_KEY, MAIL_FROM_EMAIL, BOOKING_TO, ADMIN_* und IG_* bleiben wie bisher.
3. Commit/Push. Render deployed automatisch.

Hinweis News-Bilder:
Die News werden wie bisher lokal im Browser gespeichert. Bilder werden vor dem Speichern automatisch verkleinert.

Spotify-Cover:
Die App lädt Cover über einen öffentlichen Artwork-Lookup und verlinkt die Songs zu Spotify. Wenn für einen Titel kein Artwork gefunden wird, bleibt eine neutrale Cover-Fläche sichtbar.
