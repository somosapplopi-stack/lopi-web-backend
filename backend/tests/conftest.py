"""Shared fixtures for LOPI backend tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://lopi-web.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")


@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def carolinav_token() -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": "carolinav", "password": "Demo1234!"},
        timeout=30,
    )
    assert r.status_code == 200, f"seed login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def carolinav_user(carolinav_token) -> dict:
    r = requests.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {carolinav_token}"},
        timeout=30,
    )
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def second_token() -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": "juancamilo", "password": "Demo1234!"},
        timeout=30,
    )
    assert r.status_code == 200
    return r.json()["access_token"]
