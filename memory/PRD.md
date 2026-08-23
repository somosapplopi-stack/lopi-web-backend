# LOPI — PRD

## What
LOPI is a mobile social network for creating and joining **parches** (informal group plans/activities) in Colombia. Users register, pick 5 interest categories, browse a personalized feed, join or create parches, comment, chat inside parche groups, make friends, share plans by link, and administrators moderate the community through a dedicated Admin Panel.

## Users
Young adults across Bucaramanga, Bogotá, Medellín, Barranquilla, Cartagena, Cúcuta looking for spontaneous plans and meeting people around shared interests.

## Core features
### Auth & onboarding
- Email/password register + login (bcrypt + JWT, 30-day tokens, SecureStore).
- Mandatory selection of exactly 5 interest categories.

### Feed & discovery
- **Home** personalized (city + interests + date proximity).
- **Explore** search + filter chips: Hoy / Esta semana / Cerca de mí / Mis intereses / Ciudad / Categoría.
- **Mis Parches** with three tabs: Uniéndome / Creados / Guardados.

### Parche detail
- Photo, creator, meta grid (date/time/place/cupos), description.
- Sticky **Unirme al parche** CTA (also handles Salir).
- Like, Save, **Share** via native OS share sheet (URL: `/parche/{id}`).
- **Comments**: create/list/delete-own with author avatar + timestamp; notifies creator.
- **Group chat** (`/parche/{id}/chat`): visible only to creator + participants; text bubbles with avatar/name/hour, history persisted, polls every 5s.

### Create parche
- Photo (Emergent Object Storage), title, description, category, city, location, date, time, capacity, visibility: `public` | `friends` (only creator + participants + friends of creator can view) | `approval`.

### Friends (`/friends`)
- 4 tabs: Amigos / Recibidas / Enviadas / Buscar.
- Send / accept / reject / remove requests. Search by name/username/email.
- Notifications on request and acceptance.
- Friends-only parches are enforced backend-side by `_can_view_parche`.

### Notifications (`/notifications`)
- Bell in home header with unread badge.
- Feed of `comment`, `chat`, `join`, `friend_request`, `friend_accept` events with timestamps.
- Tapping a notification opens the related parche or friends screen.
- Read-all on view.

### Deep linking
- `/parche/{id}` route is deep-link-able. If user isn't logged in, we save the target and route them back to it after login/register.

### Super Admin (`/admin`)
- Auto-promotion for email `gerencia@urielhernandez.com`.
- Four tabs:
  - **Estadísticas**: total users, new today/week/month, active-week, total parches, participations, % with participants, users/parches by city, top categories, top-participation parches.
  - **Usuarios**: search + suspend/reactivate/block (super admin cannot be affected).
  - **Parches**: search/filter + hide/show + delete (cascades to comments + messages).
  - **Reportes**: filter by pending/in_review/resolved/dismissed + status transitions.

## Data model (MongoDB)
- `users`: id, name, username, email, password_hash, city, photo, bio, interests[], friends_count, followers_count, following_count, role, status, last_seen, created_at.
- `parches`: id, title, description, category, city, location, date, time_start, time_end, capacity, visibility, hidden, photo, creator_id, participants[], likes[], saves[], comments_count, created_at.
- `comments`: id, parche_id, user_id, text, created_at.
- `messages`: id, parche_id, user_id, text, created_at.
- `friendships`: id, from_user, to_user, status (pending|accepted|rejected), created_at, accepted_at?.
- `notifications`: id, user_id, kind, title, body, data, read, created_at.
- `reports`: id, reporter_id, target_type (user|parche), target_id, reason, status (pending|in_review|resolved|dismissed), created_at, resolved_at?.

## Integrations
- Local auth (FastAPI + bcrypt via `pwdlib` + PyJWT).
- Emergent Object Storage (proxied through `/api/upload` and `/api/files/{path}`).

## Navigation
Bottom tabs: **Inicio | Explorar | + | Mis Parches | Perfil**.
Additional routes: `/friends`, `/notifications`, `/admin`, `/parche/{id}`, `/parche/{id}/chat`.

## Seed
15 demo users + 20 parches across 6 Colombian cities and diverse categories. Idempotent.

## Explicitly out of scope
Payments, ads, marketplace, reservations, video calls, AI, subscriptions, push notifications.
