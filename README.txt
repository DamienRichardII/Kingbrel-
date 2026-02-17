# KINGBREL — Site de réservation (HTML/CSS/JS)

## Lancer en local
Ouvre simplement `index.html` dans ton navigateur.

> Recommandé (pour éviter des limites CORS sur certains navigateurs) :
- VS Code -> extension "Live Server"
- ou `python -m http.server 5173` puis http://localhost:5173

## Pages
- `index.html` : accueil
- `reserver.html` : prestations + réservation (modal + calendrier)
- `contact.html`
- `admin.html` : disponibilités + liste réservations + export CSV
- `mentions-legales.html`
- `cookies.html`

## Fonctionnement (V1)
- Stockage local via `localStorage` :
  - `kb_availability` : disponibilités par date
  - `kb_bookings` : réservations

## V2 (option)
- Auth admin + DB (Supabase) + emails/SMS (Sendgrid / Twilio)
