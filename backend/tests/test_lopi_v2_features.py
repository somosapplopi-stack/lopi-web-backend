"""LOPI iteration 2 backend tests — comments, chat, friendships,
share URL, notifications, reports, and Super Admin panel.

Uses the shared fixtures in conftest.py (base_url, carolinav_token, second_token).
"""
from __future__ import annotations

import uuid

import requests

SUPER_ADMIN_EMAIL = "gerencia@urielhernandez.com"
SUPER_ADMIN_PASSWORD = "Admin1234!"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _login(base_url: str, identifier: str, password: str) -> tuple[int, dict]:
    r = requests.post(f"{base_url}/api/auth/login",
                      json={"identifier": identifier, "password": password}, timeout=30)
    ctype = r.headers.get("content-type", "")
    return r.status_code, (r.json() if ctype.startswith("application/json") else {})


def _ensure_super_admin(base_url: str) -> str:
    code, data = _login(base_url, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    if code == 200:
        assert data["user"]["role"] == "super_admin"
        return data["access_token"]
    r = requests.post(f"{base_url}/api/auth/register", json={
        "name": "Uriel Hernandez",
        "username": "gerencia",
        "email": SUPER_ADMIN_EMAIL,
        "password": SUPER_ADMIN_PASSWORD,
        "city": "Bucaramanga",
    }, timeout=30)
    assert r.status_code in (201, 409), r.text
    if r.status_code == 409:
        code, data = _login(base_url, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
        assert code == 200, data
        return data["access_token"]
    d = r.json()
    assert d["user"]["role"] == "super_admin"
    return d["access_token"]


def _register_temp(base_url: str, city: str = "Bogotá") -> tuple[str, dict]:
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "name": f"TEST U{suffix}",
        "username": f"testu_{suffix}",
        "email": f"TEST_{suffix}@example.com",
        "password": "Passw0rd!",
        "city": city,
    }
    r = requests.post(f"{base_url}/api/auth/register", json=payload, timeout=30)
    assert r.status_code == 201, r.text
    tok = r.json()["access_token"]
    requests.post(f"{base_url}/api/auth/interests",
                  json={"interests": ["deportes", "gastronomia", "fiestas", "cultura", "aire-libre"]},
                  headers=_auth(tok), timeout=30)
    return tok, r.json()["user"]


def _create_parche(base_url: str, token: str, visibility: str = "public") -> dict:
    r = requests.post(f"{base_url}/api/parches", json={
        "title": f"TEST parche {uuid.uuid4().hex[:6]}",
        "description": "creado por test",
        "category": "deportes",
        "city": "Bucaramanga",
        "location": "Parque test",
        "date": "2030-06-01",
        "time_start": "18:00",
        "capacity": 10,
        "visibility": visibility,
    }, headers=_auth(token), timeout=30)
    assert r.status_code == 201, r.text
    return r.json()


# ===========================================================================
# Comments — create/list/delete-own + notify creator
# ===========================================================================
class TestComments:
    def test_create_list_delete_and_notify_creator(self, base_url, carolinav_token, second_token):
        p = _create_parche(base_url, carolinav_token)
        pid = p["id"]

        text = f"TEST comment {uuid.uuid4().hex[:5]}"
        r = requests.post(f"{base_url}/api/parches/{pid}/comments",
                          json={"text": text}, headers=_auth(second_token), timeout=30)
        assert r.status_code == 201, r.text
        c = r.json()
        assert c["text"] == text
        assert c["author"]["name"]
        assert "photo" in c["author"]
        assert c["created_at"]
        comment_id = c["id"]

        r = requests.get(f"{base_url}/api/parches/{pid}/comments", headers=_auth(carolinav_token), timeout=30)
        assert r.status_code == 200
        assert any(x["id"] == comment_id for x in r.json())

        detail = requests.get(f"{base_url}/api/parches/{pid}", headers=_auth(carolinav_token), timeout=30).json()
        assert detail["comments_count"] >= 1

        notif = requests.get(f"{base_url}/api/notifications", headers=_auth(carolinav_token), timeout=30).json()
        assert any(n["kind"] == "comment" and n["data"].get("parche_id") == pid for n in notif["items"])

        # Only author can delete: creator (non-author) should get 403
        r = requests.delete(f"{base_url}/api/comments/{comment_id}", headers=_auth(carolinav_token), timeout=30)
        assert r.status_code == 403

        r = requests.delete(f"{base_url}/api/comments/{comment_id}", headers=_auth(second_token), timeout=30)
        assert r.status_code == 200

        detail = requests.get(f"{base_url}/api/parches/{pid}", headers=_auth(carolinav_token), timeout=30).json()
        assert detail["comments_count"] == 0

    def test_self_comment_does_not_notify(self, base_url, carolinav_token):
        p = _create_parche(base_url, carolinav_token)
        before = requests.get(f"{base_url}/api/notifications", headers=_auth(carolinav_token), timeout=30).json()
        before_n = sum(1 for n in before["items"] if n["kind"] == "comment")
        r = requests.post(f"{base_url}/api/parches/{p['id']}/comments",
                          json={"text": "TEST self"}, headers=_auth(carolinav_token), timeout=30)
        assert r.status_code == 201
        after = requests.get(f"{base_url}/api/notifications", headers=_auth(carolinav_token), timeout=30).json()
        after_n = sum(1 for n in after["items"] if n["kind"] == "comment")
        assert after_n == before_n


# ===========================================================================
# Chat — participants only
# ===========================================================================
class TestChat:
    def test_participant_send_read_and_notify(self, base_url, carolinav_token, second_token):
        p = _create_parche(base_url, carolinav_token)
        pid = p["id"]
        r = requests.post(f"{base_url}/api/parches/{pid}/join", headers=_auth(second_token), timeout=30)
        assert r.status_code == 200

        third_tok, _ = _register_temp(base_url)
        r = requests.get(f"{base_url}/api/parches/{pid}/messages", headers=_auth(third_tok), timeout=30)
        assert r.status_code == 403
        r = requests.post(f"{base_url}/api/parches/{pid}/messages",
                          json={"text": "TEST intruso"}, headers=_auth(third_tok), timeout=30)
        assert r.status_code == 403

        text = f"TEST chat {uuid.uuid4().hex[:5]}"
        r = requests.post(f"{base_url}/api/parches/{pid}/messages",
                          json={"text": text}, headers=_auth(second_token), timeout=30)
        assert r.status_code == 201, r.text
        m = r.json()
        assert m["text"] == text
        assert m["author"]["name"]
        assert m["created_at"]

        r = requests.get(f"{base_url}/api/parches/{pid}/messages", headers=_auth(carolinav_token), timeout=30)
        assert r.status_code == 200
        assert any(x["text"] == text for x in r.json())

        notif = requests.get(f"{base_url}/api/notifications", headers=_auth(carolinav_token), timeout=30).json()
        assert any(n["kind"] == "chat" and n["data"].get("parche_id") == pid for n in notif["items"])


# ===========================================================================
# Friendships
# ===========================================================================
class TestFriendships:
    def test_full_flow(self, base_url):
        a_tok, a = _register_temp(base_url, city="Bogotá")
        b_tok, b = _register_temp(base_url, city="Medellín")

        r = requests.post(f"{base_url}/api/friends/request/{a['id']}", headers=_auth(a_tok), timeout=30)
        assert r.status_code == 400

        r = requests.post(f"{base_url}/api/friends/request/{b['id']}", headers=_auth(a_tok), timeout=30)
        assert r.status_code == 201
        fid = r.json()["friendship_id"]

        r = requests.post(f"{base_url}/api/friends/request/{b['id']}", headers=_auth(a_tok), timeout=30)
        assert r.status_code == 409

        rec_b = requests.get(f"{base_url}/api/friends/requests/received", headers=_auth(b_tok), timeout=30).json()
        assert any(x["friendship_id"] == fid for x in rec_b)
        sent_a = requests.get(f"{base_url}/api/friends/requests/sent", headers=_auth(a_tok), timeout=30).json()
        assert any(x["friendship_id"] == fid for x in sent_a)

        notif_b = requests.get(f"{base_url}/api/notifications", headers=_auth(b_tok), timeout=30).json()
        assert any(n["kind"] == "friend_request" for n in notif_b["items"])

        r = requests.post(f"{base_url}/api/friends/accept/{fid}", headers=_auth(b_tok), timeout=30)
        assert r.status_code == 200

        me_a = requests.get(f"{base_url}/api/auth/me", headers=_auth(a_tok), timeout=30).json()
        me_b = requests.get(f"{base_url}/api/auth/me", headers=_auth(b_tok), timeout=30).json()
        assert me_a["friends_count"] == 1
        assert me_b["friends_count"] == 1

        notif_a = requests.get(f"{base_url}/api/notifications", headers=_auth(a_tok), timeout=30).json()
        assert any(n["kind"] == "friend_accept" for n in notif_a["items"])

        friends_a = requests.get(f"{base_url}/api/friends", headers=_auth(a_tok), timeout=30).json()
        assert any(x["user"]["id"] == b["id"] for x in friends_a)

        rr = requests.get(f"{base_url}/api/users/search",
                          params={"q": b["username"]}, headers=_auth(a_tok), timeout=30).json()
        row = next((x for x in rr if x["id"] == b["id"]), None)
        assert row and row["relation"] == "friends"

        r = requests.delete(f"{base_url}/api/friends/{b['id']}", headers=_auth(a_tok), timeout=30)
        assert r.status_code == 200
        me_a2 = requests.get(f"{base_url}/api/auth/me", headers=_auth(a_tok), timeout=30).json()
        me_b2 = requests.get(f"{base_url}/api/auth/me", headers=_auth(b_tok), timeout=30).json()
        assert me_a2["friends_count"] == 0
        assert me_b2["friends_count"] == 0

    def test_reject_flow(self, base_url):
        a_tok, a = _register_temp(base_url)
        b_tok, b = _register_temp(base_url)
        r = requests.post(f"{base_url}/api/friends/request/{b['id']}", headers=_auth(a_tok), timeout=30)
        fid = r.json()["friendship_id"]
        r = requests.post(f"{base_url}/api/friends/reject/{fid}", headers=_auth(b_tok), timeout=30)
        assert r.status_code == 200
        friends = requests.get(f"{base_url}/api/friends", headers=_auth(a_tok), timeout=30).json()
        assert not any(x["user"]["id"] == b["id"] for x in friends)

    def test_search_relation_states(self, base_url):
        a_tok, a = _register_temp(base_url)
        b_tok, b = _register_temp(base_url)
        rr = requests.get(f"{base_url}/api/users/search",
                          params={"q": b["username"]}, headers=_auth(a_tok), timeout=30).json()
        assert next(x for x in rr if x["id"] == b["id"])["relation"] == "none"
        requests.post(f"{base_url}/api/friends/request/{b['id']}", headers=_auth(a_tok), timeout=30)
        rr_a = requests.get(f"{base_url}/api/users/search",
                            params={"q": b["username"]}, headers=_auth(a_tok), timeout=30).json()
        rr_b = requests.get(f"{base_url}/api/users/search",
                            params={"q": a["username"]}, headers=_auth(b_tok), timeout=30).json()
        assert next(x for x in rr_a if x["id"] == b["id"])["relation"] == "sent"
        assert next(x for x in rr_b if x["id"] == a["id"])["relation"] == "received"


# ===========================================================================
# Friends-only visibility
# ===========================================================================
class TestFriendsOnlyVisibility:
    def test_visibility_rules(self, base_url):
        a_tok, a = _register_temp(base_url)
        b_tok, b = _register_temp(base_url)
        c_tok, c = _register_temp(base_url)

        p = requests.post(f"{base_url}/api/parches", json={
            "title": f"TEST friends-only {uuid.uuid4().hex[:5]}",
            "description": "",
            "category": "deportes",
            "city": "Bogotá",
            "location": "x",
            "date": "2030-05-01",
            "time_start": "10:00",
            "capacity": 10,
            "visibility": "friends",
        }, headers=_auth(a_tok), timeout=30).json()
        pid = p["id"]

        feed_b = requests.get(f"{base_url}/api/parches/feed",
                              params={"limit": 200}, headers=_auth(b_tok), timeout=30).json()
        assert not any(x["id"] == pid for x in feed_b)

        r = requests.get(f"{base_url}/api/parches/{pid}", headers=_auth(b_tok), timeout=30)
        assert r.status_code == 403

        fid = requests.post(f"{base_url}/api/friends/request/{c['id']}",
                            headers=_auth(a_tok), timeout=30).json()["friendship_id"]
        requests.post(f"{base_url}/api/friends/accept/{fid}", headers=_auth(c_tok), timeout=30)

        feed_c = requests.get(f"{base_url}/api/parches/feed",
                              params={"limit": 200}, headers=_auth(c_tok), timeout=30).json()
        assert any(x["id"] == pid for x in feed_c)
        r = requests.get(f"{base_url}/api/parches/{pid}", headers=_auth(c_tok), timeout=30)
        assert r.status_code == 200


# ===========================================================================
# Share URL
# ===========================================================================
class TestShareURL:
    def test_share_url_format(self, base_url, carolinav_token):
        p = _create_parche(base_url, carolinav_token)
        r = requests.get(f"{base_url}/api/parches/{p['id']}", headers=_auth(carolinav_token), timeout=30).json()
        assert "share_url" in r and r["share_url"]
        assert f"/parche/{p['id']}" in r["share_url"]


# ===========================================================================
# Notifications
# ===========================================================================
class TestNotifications:
    def test_sort_and_read_all(self, base_url, carolinav_token, second_token):
        p = _create_parche(base_url, carolinav_token)
        requests.post(f"{base_url}/api/parches/{p['id']}/comments",
                      json={"text": "TEST notif sort"}, headers=_auth(second_token), timeout=30)
        r = requests.get(f"{base_url}/api/notifications", headers=_auth(carolinav_token), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "unread" in d
        if len(d["items"]) >= 2:
            assert d["items"][0]["created_at"] >= d["items"][-1]["created_at"]

        r = requests.post(f"{base_url}/api/notifications/read-all",
                          headers=_auth(carolinav_token), timeout=30)
        assert r.status_code == 200
        after = requests.get(f"{base_url}/api/notifications", headers=_auth(carolinav_token), timeout=30).json()
        assert after["unread"] == 0


# ===========================================================================
# Super Admin
# ===========================================================================
class TestSuperAdmin:
    def test_super_admin_login_and_role(self, base_url):
        token = _ensure_super_admin(base_url)
        me = requests.get(f"{base_url}/api/auth/me", headers=_auth(token), timeout=30).json()
        assert me["role"] == "super_admin"
        assert me["email"] == SUPER_ADMIN_EMAIL

    def test_idempotent_promotion(self, base_url):
        t1 = _ensure_super_admin(base_url)
        t2 = _ensure_super_admin(base_url)
        for t in (t1, t2):
            me = requests.get(f"{base_url}/api/auth/me", headers=_auth(t), timeout=30).json()
            assert me["role"] == "super_admin"

    def test_admin_endpoints_reject_non_admin(self, base_url, carolinav_token):
        endpoints = [
            ("GET", "/api/admin/stats", None),
            ("GET", "/api/admin/users", None),
            ("GET", "/api/admin/parches", None),
            ("GET", "/api/admin/reports", None),
            ("POST", "/api/admin/users/deadbeef/status", {"status": "suspended"}),
            ("POST", "/api/admin/parches/deadbeef/status", {"hidden": True}),
            ("DELETE", "/api/admin/parches/deadbeef", None),
            ("PATCH", "/api/admin/reports/deadbeef", {"status": "resolved"}),
        ]
        for method, path, body in endpoints:
            r = requests.request(method, f"{base_url}{path}",
                                 json=body, headers=_auth(carolinav_token), timeout=30)
            assert r.status_code == 403, f"{method} {path} → {r.status_code}"

    def test_stats_shape_and_values(self, base_url):
        token = _ensure_super_admin(base_url)
        r = requests.get(f"{base_url}/api/admin/stats", headers=_auth(token), timeout=30)
        assert r.status_code == 200
        s = r.json()
        for k in ("total_users", "new_users", "active_users_week", "total_parches",
                  "participations", "pct_with_participants", "users_by_city",
                  "parches_by_city", "top_categories", "top_participation"):
            assert k in s
        for kk in ("today", "week", "month"):
            assert isinstance(s["new_users"][kk], int)
        assert s["total_users"] >= 15
        assert s["total_parches"] >= 20
        assert isinstance(s["users_by_city"], list) and len(s["users_by_city"]) >= 1
        assert all("city" in c and "count" in c for c in s["users_by_city"])
        assert all("category" in c and "count" in c for c in s["top_categories"])
        assert isinstance(s["pct_with_participants"], (int, float))
        assert s["participations"] >= s["total_parches"]  # each parche has creator as participant

    def test_users_search_and_status(self, base_url):
        token = _ensure_super_admin(base_url)
        _, target = _register_temp(base_url)

        r = requests.get(f"{base_url}/api/admin/users",
                         params={"q": target["username"]}, headers=_auth(token), timeout=30)
        assert r.status_code == 200
        assert any(u["id"] == target["id"] for u in r.json())

        r = requests.post(f"{base_url}/api/admin/users/{target['id']}/status",
                          json={"status": "suspended"}, headers=_auth(token), timeout=30)
        assert r.status_code == 200

        code, data = _login(base_url, target["username"], "Passw0rd!")
        assert code == 200, data
        s_tok = data["access_token"]
        assert requests.get(f"{base_url}/api/auth/me", headers=_auth(s_tok), timeout=30).status_code == 200
        r = requests.patch(f"{base_url}/api/auth/profile",
                           json={"bio": "TEST hi"}, headers=_auth(s_tok), timeout=30)
        assert r.status_code == 403

        r = requests.post(f"{base_url}/api/admin/users/{target['id']}/status",
                          json={"status": "blocked"}, headers=_auth(token), timeout=30)
        assert r.status_code == 200
        code, _ = _login(base_url, target["username"], "Passw0rd!")
        assert code == 403

        admin_me = requests.get(f"{base_url}/api/auth/me", headers=_auth(token), timeout=30).json()
        r = requests.post(f"{base_url}/api/admin/users/{admin_me['id']}/status",
                          json={"status": "blocked"}, headers=_auth(token), timeout=30)
        assert r.status_code == 400

        # cleanup
        requests.post(f"{base_url}/api/admin/users/{target['id']}/status",
                      json={"status": "active"}, headers=_auth(token), timeout=30)

    def test_parches_admin_hide_delete_and_cascade(self, base_url, carolinav_token, second_token):
        admin_tok = _ensure_super_admin(base_url)

        p = _create_parche(base_url, carolinav_token)
        pid = p["id"]
        requests.post(f"{base_url}/api/parches/{pid}/join", headers=_auth(second_token), timeout=30)
        c = requests.post(f"{base_url}/api/parches/{pid}/comments",
                          json={"text": "TEST cascade"}, headers=_auth(second_token), timeout=30).json()
        requests.post(f"{base_url}/api/parches/{pid}/messages",
                      json={"text": "TEST msg"}, headers=_auth(second_token), timeout=30)

        r = requests.get(f"{base_url}/api/admin/parches",
                         params={"q": p["title"][:10]}, headers=_auth(admin_tok), timeout=30)
        assert r.status_code == 200 and any(x["id"] == pid for x in r.json())

        r = requests.get(f"{base_url}/api/admin/parches",
                         params={"city": "Bucaramanga"}, headers=_auth(admin_tok), timeout=30)
        assert r.status_code == 200 and all(x["city"] == "Bucaramanga" for x in r.json())

        r = requests.post(f"{base_url}/api/admin/parches/{pid}/status",
                          json={"hidden": True}, headers=_auth(admin_tok), timeout=30)
        assert r.status_code == 200 and r.json()["hidden"] is True

        feed = requests.get(f"{base_url}/api/parches/feed",
                            params={"limit": 200}, headers=_auth(carolinav_token), timeout=30).json()
        assert not any(x["id"] == pid for x in feed)
        r = requests.get(f"{base_url}/api/parches/{pid}", headers=_auth(carolinav_token), timeout=30)
        assert r.status_code == 403

        requests.post(f"{base_url}/api/admin/parches/{pid}/status",
                      json={"hidden": False}, headers=_auth(admin_tok), timeout=30)

        r = requests.delete(f"{base_url}/api/admin/parches/{pid}", headers=_auth(admin_tok), timeout=30)
        assert r.status_code == 200
        assert requests.get(f"{base_url}/api/parches/{pid}",
                            headers=_auth(carolinav_token), timeout=30).status_code == 404
        assert requests.delete(f"{base_url}/api/comments/{c['id']}",
                               headers=_auth(second_token), timeout=30).status_code == 404

    def test_reports_flow(self, base_url, carolinav_token, second_token):
        admin_tok = _ensure_super_admin(base_url)

        p = _create_parche(base_url, carolinav_token)
        r = requests.post(f"{base_url}/api/reports", json={
            "target_type": "parche",
            "target_id": p["id"],
            "reason": "TEST spam",
        }, headers=_auth(second_token), timeout=30)
        assert r.status_code == 201
        rid = r.json()["id"]
        assert r.json()["status"] == "pending"

        r = requests.get(f"{base_url}/api/admin/reports", headers=_auth(admin_tok), timeout=30)
        assert r.status_code == 200
        row = next((x for x in r.json() if x["id"] == rid), None)
        assert row is not None
        assert row["reporter"] and row["target"]
        assert row["target"].get("title") == p["title"]

        r = requests.get(f"{base_url}/api/admin/reports",
                         params={"status": "pending"}, headers=_auth(admin_tok), timeout=30)
        assert r.status_code == 200 and all(x["status"] == "pending" for x in r.json())

        for status in ("in_review", "resolved", "dismissed"):
            r = requests.patch(f"{base_url}/api/admin/reports/{rid}",
                               json={"status": status}, headers=_auth(admin_tok), timeout=30)
            assert r.status_code == 200 and r.json()["status"] == status

        requests.delete(f"{base_url}/api/admin/parches/{p['id']}", headers=_auth(admin_tok), timeout=30)
