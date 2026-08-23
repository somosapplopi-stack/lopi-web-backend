"""LOPI backend API tests.

Covers: health, reference data (categories/cities), auth (register/login/me),
interests, profile updates, parches CRUD, feed personalization/filters,
join/leave/like/save, users detail, seed data assertions.
"""
import time
import uuid

import requests


# ---------------------------------------------------------------------------
# Health & static references
# ---------------------------------------------------------------------------
class TestHealthAndReference:
    def test_health_root(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/")
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True
        assert data.get("app") == "LOPI"

    def test_categories(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/categories")
        assert r.status_code == 200
        cats = r.json()
        assert isinstance(cats, list)
        assert len(cats) == 15
        slugs = {c["slug"] for c in cats}
        for expected in ("deportes", "gastronomia", "fiestas", "videojuegos"):
            assert expected in slugs
        for c in cats:
            assert set(["slug", "name", "image"]).issubset(c.keys())

    def test_cities(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/cities")
        assert r.status_code == 200
        cities = r.json()
        assert cities == [
            "Bucaramanga", "Bogotá", "Medellín", "Barranquilla", "Cartagena", "Cúcuta",
        ]


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class TestAuth:
    def test_login_with_username(self, base_url, api_client):
        r = api_client.post(f"{base_url}/api/auth/login",
                            json={"identifier": "carolinav", "password": "Demo1234!"})
        assert r.status_code == 200
        d = r.json()
        assert "access_token" in d
        assert d["token_type"] == "bearer"
        assert d["user"]["username"] == "carolinav"
        assert d["user"]["city"] == "Bucaramanga"
        assert "id" in d["user"]

    def test_login_with_email(self, base_url, api_client):
        r = api_client.post(f"{base_url}/api/auth/login",
                            json={"identifier": "carolinav@lopi.demo", "password": "Demo1234!"})
        assert r.status_code == 200
        assert r.json()["user"]["username"] == "carolinav"

    def test_login_wrong_password(self, base_url, api_client):
        r = api_client.post(f"{base_url}/api/auth/login",
                            json={"identifier": "carolinav", "password": "wrong-pass"})
        assert r.status_code == 401

    def test_me_requires_auth(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_token(self, base_url, api_client, carolinav_token):
        r = api_client.get(f"{base_url}/api/auth/me",
                           headers={"Authorization": f"Bearer {carolinav_token}"})
        assert r.status_code == 200
        d = r.json()
        assert d["username"] == "carolinav"
        assert isinstance(d.get("interests"), list)

    def test_register_and_duplicate(self, base_url, api_client):
        suffix = uuid.uuid4().hex[:8]
        payload = {
            "name": "TEST User",
            "username": f"test_{suffix}",
            "email": f"TEST_{suffix}@example.com",
            "password": "Passw0rd!",
            "city": "Bogotá",
        }
        r = api_client.post(f"{base_url}/api/auth/register", json=payload)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["user"]["username"] == payload["username"].lower()
        assert d["user"]["email"] == payload["email"].lower()
        assert d["user"]["interests"] == []
        token = d["access_token"]

        # Duplicate username/email
        r2 = api_client.post(f"{base_url}/api/auth/register", json=payload)
        assert r2.status_code == 409

        # /auth/me matches
        me = api_client.get(f"{base_url}/api/auth/me",
                            headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["id"] == d["user"]["id"]

    def test_interests_flow(self, base_url, api_client):
        suffix = uuid.uuid4().hex[:8]
        r = api_client.post(f"{base_url}/api/auth/register", json={
            "name": "TEST Interest",
            "username": f"testint_{suffix}",
            "email": f"TEST_int_{suffix}@example.com",
            "password": "Passw0rd!",
            "city": "Medellín",
        })
        assert r.status_code == 201
        token = r.json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}

        # Invalid slugs → 400
        r_bad = api_client.post(f"{base_url}/api/auth/interests",
                                json={"interests": ["not-a-slug", "fake"]}, headers=h)
        assert r_bad.status_code == 400

        # Valid slugs
        picks = ["deportes", "gastronomia", "fiestas", "cultura", "aire-libre"]
        r_ok = api_client.post(f"{base_url}/api/auth/interests",
                               json={"interests": picks}, headers=h)
        assert r_ok.status_code == 200
        assert set(r_ok.json()["interests"]) == set(picks)

        # Persisted via /me
        me = api_client.get(f"{base_url}/api/auth/me", headers=h).json()
        assert set(me["interests"]) == set(picks)

    def test_profile_patch(self, base_url, api_client):
        suffix = uuid.uuid4().hex[:8]
        r = api_client.post(f"{base_url}/api/auth/register", json={
            "name": "TEST Profile",
            "username": f"testprof_{suffix}",
            "email": f"TEST_prof_{suffix}@example.com",
            "password": "Passw0rd!",
            "city": "Bogotá",
        })
        token = r.json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}

        r_up = api_client.patch(f"{base_url}/api/auth/profile", json={
            "name": "New Name", "city": "Cartagena", "bio": "hola",
        }, headers=h)
        assert r_up.status_code == 200
        d = r_up.json()
        assert d["name"] == "New Name"
        assert d["city"] == "Cartagena"
        assert d["bio"] == "hola"

        # Verify persistence via /me
        me = api_client.get(f"{base_url}/api/auth/me", headers=h).json()
        assert me["name"] == "New Name"
        assert me["city"] == "Cartagena"
        assert me["bio"] == "hola"


# ---------------------------------------------------------------------------
# Parches
# ---------------------------------------------------------------------------
class TestParches:
    def test_feed_requires_auth(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/parches/feed")
        assert r.status_code == 401

    def test_feed_returns_seed(self, base_url, api_client, carolinav_token):
        h = {"Authorization": f"Bearer {carolinav_token}"}
        r = api_client.get(f"{base_url}/api/parches/feed", headers=h)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 15  # seed is 20 (with limit 50)
        first = data[0]
        for k in ("id", "title", "category", "city", "date", "creator", "participants_count", "liked", "joined", "saved"):
            assert k in first
        assert "id" in first["creator"]

    def test_feed_filters(self, base_url, api_client, carolinav_token):
        h = {"Authorization": f"Bearer {carolinav_token}"}
        r = api_client.get(f"{base_url}/api/parches/feed",
                           params={"city": "Bucaramanga"}, headers=h)
        assert r.status_code == 200
        for p in r.json():
            assert p["city"] == "Bucaramanga"

        r2 = api_client.get(f"{base_url}/api/parches/feed",
                            params={"category": "deportes"}, headers=h)
        assert r2.status_code == 200
        for p in r2.json():
            assert p["category"] == "deportes"

        r3 = api_client.get(f"{base_url}/api/parches/feed",
                            params={"q": "cena"}, headers=h)
        assert r3.status_code == 200
        # Should include the seeded 'Cena italiana...' parche.
        assert any("Cena" in p["title"] for p in r3.json())

    def test_create_join_leave_like_save_flow(self, base_url, api_client, carolinav_token, second_token):
        h = {"Authorization": f"Bearer {carolinav_token}"}
        h2 = {"Authorization": f"Bearer {second_token}"}

        payload = {
            "title": f"TEST parche {uuid.uuid4().hex[:6]}",
            "description": "creado por test",
            "category": "deportes",
            "city": "Bucaramanga",
            "location": "Parque test",
            "date": "2030-06-01",
            "time_start": "18:00",
            "capacity": 5,
            "visibility": "public",
        }
        r = api_client.post(f"{base_url}/api/parches", json=payload, headers=h)
        assert r.status_code == 201, r.text
        pid = r.json()["id"]
        assert r.json()["participants_count"] == 1  # creator auto-joined
        assert r.json()["joined"] is True

        # GET detail
        got = api_client.get(f"{base_url}/api/parches/{pid}", headers=h).json()
        assert got["title"] == payload["title"]
        assert got["joined"] is True

        # Feed should now contain it
        feed = api_client.get(f"{base_url}/api/parches/feed",
                              params={"only_mine": "true"}, headers=h).json()
        assert any(p["id"] == pid for p in feed)

        # Second user joins
        rj = api_client.post(f"{base_url}/api/parches/{pid}/join", headers=h2)
        assert rj.status_code == 200
        assert rj.json()["participants_count"] == 2
        assert rj.json()["joined"] is True

        # Creator cannot leave
        rl = api_client.post(f"{base_url}/api/parches/{pid}/leave", headers=h)
        assert rl.status_code == 400

        # Second user leaves
        rl2 = api_client.post(f"{base_url}/api/parches/{pid}/leave", headers=h2)
        assert rl2.status_code == 200
        assert rl2.json()["participants_count"] == 1

        # Like toggle
        rlk = api_client.post(f"{base_url}/api/parches/{pid}/like", headers=h2)
        assert rlk.status_code == 200
        assert rlk.json()["liked"] is True
        rlk2 = api_client.post(f"{base_url}/api/parches/{pid}/like", headers=h2)
        assert rlk2.json()["liked"] is False

        # Save toggle
        rs = api_client.post(f"{base_url}/api/parches/{pid}/save", headers=h2)
        assert rs.status_code == 200
        assert rs.json()["saved"] is True

        # Saved filter includes it for user2
        saved_feed = api_client.get(f"{base_url}/api/parches/feed",
                                    params={"saved": "true"}, headers=h2).json()
        assert any(p["id"] == pid for p in saved_feed)

    def test_join_capacity_full(self, base_url, api_client, carolinav_token, second_token):
        h = {"Authorization": f"Bearer {carolinav_token}"}
        h2 = {"Authorization": f"Bearer {second_token}"}
        r = api_client.post(f"{base_url}/api/parches", json={
            "title": f"TEST full {uuid.uuid4().hex[:6]}",
            "description": "cap-1",
            "category": "deportes",
            "city": "Bogotá",
            "location": "x",
            "date": "2030-01-01",
            "time_start": "10:00",
            "capacity": 1,
        }, headers=h)
        assert r.status_code == 201
        pid = r.json()["id"]
        rj = api_client.post(f"{base_url}/api/parches/{pid}/join", headers=h2)
        assert rj.status_code == 400

    def test_invalid_category(self, base_url, api_client, carolinav_token):
        h = {"Authorization": f"Bearer {carolinav_token}"}
        r = api_client.post(f"{base_url}/api/parches", json={
            "title": "TEST invalid",
            "description": "",
            "category": "no-existe",
            "city": "Bogotá",
            "location": "x",
            "date": "2030-01-01",
            "time_start": "10:00",
            "capacity": 5,
        }, headers=h)
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# Users detail & seed volume
# ---------------------------------------------------------------------------
class TestUsersAndSeed:
    def test_user_detail(self, base_url, api_client, carolinav_token, carolinav_user):
        h = {"Authorization": f"Bearer {carolinav_token}"}
        r = api_client.get(f"{base_url}/api/users/{carolinav_user['id']}", headers=h)
        assert r.status_code == 200
        d = r.json()
        assert d["username"] == "carolinav"
        assert isinstance(d.get("created_count"), int)
        assert isinstance(d.get("joined_count"), int)

    def test_seed_users_and_parches(self, base_url, api_client, carolinav_token):
        h = {"Authorization": f"Bearer {carolinav_token}"}
        # Use feed to count parches with a large limit
        r = api_client.get(f"{base_url}/api/parches/feed",
                           params={"limit": 200}, headers=h)
        assert r.status_code == 200
        assert len(r.json()) >= 20

        # We can't list users, but we can log in as several seeded ones
        seeded = ["carolinav", "juancamilo", "lauraxm", "joseramirez", "alepatino",
                  "macaplata", "andreslopez", "valetorres", "santirojas", "isagomez",
                  "danih", "camilasu", "julianp", "natirios", "sebasv"]
        ok = 0
        for u in seeded:
            rr = requests.post(f"{base_url}/api/auth/login",
                               json={"identifier": u, "password": "Demo1234!"}, timeout=15)
            if rr.status_code == 200:
                ok += 1
        assert ok >= 15
