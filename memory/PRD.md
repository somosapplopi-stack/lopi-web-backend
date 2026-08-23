# LOPI — PRD

## What
LOPI is a **mobile + web** social network for creating and joining "parches" (informal group plans/activities) in Colombia. Users register, pick 5 interest categories, browse a personalized feed, join or create parches, comment, chat inside parche groups, make friends, share plans by link, and administrators moderate the community through a dedicated Admin Panel.

## Platforms
- **iOS / Android** (via Expo Go and native builds)
- **Web (PWA)** installable from Safari/Chrome — same code, same MongoDB, same users. The mobile-shaped shell is centered on desktop and full-width on phones (max-width 480px).

## Users
Young adults across Bucaramanga, Bogotá, Medellín, Barranquilla, Cartagena, Cúcuta looking for spontaneous plans and meeting people around shared interests.

## Core features
### Auth & onboarding
- Email/password register + login (bcrypt + JWT, 30-day tokens, SecureStore on native / localStorage on web).
- Mandatory selection of exactly 5 interest categories.

### Feed & discovery
- **Home** personalized (city + interests + date proximity).
- **Explore** search + filter chips: Hoy / Esta semana / Cerca de mí / Mis intereses / Ciudad / Categoría.
- **Mis Parches** with three tabs: Uniéndome / Creados / Guardados.

### Parche detail
- Photo, creator, meta grid, description.
- Sticky **Unirme al parche** CTA.
- Like, Save, **Share** via native OS share sheet on mobile / Web Share API on browser.
- **Comments**: create/list/delete-own with author avatar + timestamp; notifies creator.
- **Group chat** (`/parche/{id}/chat`): visible only to creator + participants; bubbles with avatar/name/hour; history persisted; polls every 5s.

### Create parche
- Photo (Emergent Object Storage), title, description, category, city, location, date, time, capacity, visibility: `public` | `friends` | `approval`.

### Friends (`/friends`)
- 4 tabs: Amigos / Recibidas / Enviadas / Buscar.
- Send / accept / reject / remove requests. Search by name/username/email.
- Notifications on request and acceptance.
- Friends-only parches are enforced backend-side by `_can_view_parche`.

### Notifications (`/notifications`)
- Bell in home header with unread badge.
- Feed of `comment`, `chat`, `join`, `friend_request`, `friend_accept` events.
- Read-all on view.

### Deep linking
- `/parche/{id}` route is deep-linkable both on the web and via `lopi://` scheme on native.
- If the user isn't logged in, the intended route is saved and restored after login/register.

### Super Admin (`/admin`)
- Auto-promotion for email `gerencia@urielhernandez.com`.
- Four tabs: Estadísticas · Usuarios · Parches · Reportes.

## Web / PWA
- Bundled by Metro; `output: "single"` (SPA).
- **PWA manifest** at `/manifest.webmanifest`, theme color `#3B4CF6`, standalone display, portrait, name "LOPI", short name "LOPI".
- **Service Worker** at `/sw.js` for installability.
- Open Graph + Twitter Card meta tags for WhatsApp/Twitter link previews.
- Runtime shell injection in `src/lib/web-shell.ts` centers the app in a 480px mobile-shaped container on desktop while preserving full-width on phones.
- Same backend at `/api/*` and same MongoDB across mobile and web — accounts, parches, comments, chats and admin actions are shared.

## Data model (MongoDB)
Same as prior iteration. Collections: `users`, `parches`, `comments`, `messages`, `friendships`, `notifications`, `reports`. All IDs are UUID strings; `_id` excluded in responses.

## Integrations
- Local auth (FastAPI + bcrypt via `pwdlib` + PyJWT).
- Emergent Object Storage (proxied through `/api/upload` and `/api/files/{path}`).

## Navigation
Bottom tabs: **Inicio | Explorar | + | Mis Parches | Perfil**.
Additional routes: `/friends`, `/notifications`, `/admin`, `/parche/{id}`, `/parche/{id}/chat`.

## Seed
15 demo users + 20 parches across 6 Colombian cities. Idempotent.

## Explicitly out of scope
Payments, ads, marketplace, reservations, video calls, AI, subscriptions, push notifications.
