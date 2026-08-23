# LOPI — PRD

## What
LOPI is a mobile social network for creating and joining "parches" (informal group plans/activities) in Colombia. Users register, select 5 interest categories, browse a personalized feed of upcoming parches, and join them with a tap. They can create their own parches, filter/search, and manage the ones they've created or joined.

## Users
Young adults in Colombian cities (Bucaramanga, Bogotá, Medellín, Barranquilla, Cartagena, Cúcuta) looking for spontaneous plans and to meet people around shared interests.

## Core MVP features (all functional, not decorative)
- **Auth**: email/password register + login (bcrypt + JWT). Persistent session via SecureStore.
- **Onboarding**: mandatory selection of exactly 5 interest categories.
- **Home feed**: personalized (city + interests + date proximity) vertical scroll of parche cards. Like, save, join, share (share pending).
- **Parche detail**: full page with photo, creator, meta, sticky "Unirme al parche" CTA that adds the current user as participant.
- **Create parche**: photo (Emergent Object Storage), title, description, category, city, location, date, time, capacity, visibility (public/friends/approval).
- **Explore**: search by text + filter chips (Todos / Hoy / Esta semana / Cerca de mí / Mis intereses) + city and category chips.
- **My Parches**: three tabs — Unido, Creados, Guardados.
- **Profile**: avatar (uploadable), stats (Amigos/Seguidores/Siguiendo/Parches), interests row, tabs for Creados/Unidos, edit modal (name, city, bio).

## Data model (MongoDB)
- `users`: `id (uuid)`, `name`, `username`, `email`, `password_hash`, `city`, `photo`, `bio`, `interests[]`, `friends_count`, `followers_count`, `following_count`, `created_at`.
- `parches`: `id`, `title`, `description`, `category`, `city`, `location`, `date`, `time_start`, `time_end`, `capacity`, `visibility`, `photo`, `creator_id`, `participants[]`, `likes[]`, `saves[]`, `comments_count`, `created_at`.

## Integrations
- **Local auth**: FastAPI + bcrypt (via `pwdlib`) + PyJWT. HS256, 30-day tokens.
- **Emergent Object Storage**: image uploads via backend proxy (`/api/upload`, served back via `/api/files/{path}`).

## Seed
- 15 demo users, 20 parches across the 6 cities and many categories.

## Explicitly out of scope for MVP
- Payments, ads, marketplace, reservations, video calls, AI, subscriptions, push notifications, comments UI, friend requests network.

## Navigation
Bottom tabs: Inicio | Explorar | + (create) | Mis Parches | Perfil.

## Design
- LOPI identity: blue #3B4CF6 → violet #6B4EE6 gradient, rounded, playful, thick blue-bordered circular category chips, Instagram-style feed cards.
