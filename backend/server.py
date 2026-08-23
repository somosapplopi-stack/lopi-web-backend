"""LOPI backend — social network for parches (plans/activities).

Provides auth, users, categories, parches CRUD, join/like/save, feed, explore,
comments, group chat, friendships, notifications, share links, reports, and a
Super Admin panel. Uses local email/password auth (bcrypt + JWT) and Emergent
Object Storage for image uploads. All IDs are UUID strings (no ObjectId).
"""
from __future__ import annotations

import logging
import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

import jwt
import requests
from dotenv import load_dotenv
from fastapi import (APIRouter, Depends, FastAPI, File, HTTPException,
                     Response, UploadFile)
from fastapi.concurrency import run_in_threadpool
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pwdlib import PasswordHash
from pwdlib.hashers.bcrypt import BcryptHasher
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------------------------------------------------------------------------
# Config & clients
# ---------------------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
JWT_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "43200"))
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
APP_NAME = "lopi-social"
SUPER_ADMIN_EMAIL = "gerencia@urielhernandez.com"

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
PUBLIC_URL = os.environ.get("EXPO_PACKAGER_PROXY_URL") or os.environ.get("PUBLIC_URL") or ""

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

passwords = PasswordHash((BcryptHasher(rounds=10),))
bearer = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("lopi")

# ---------------------------------------------------------------------------
# Storage helpers
# ---------------------------------------------------------------------------
_storage_key: Optional[str] = None


def _init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY missing")
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _put_object(path: str, data: bytes, content_type: str) -> dict:
    key = _init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def _get_object(path: str) -> tuple[bytes, str]:
    key = _init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    username: str = Field(min_length=3, max_length=30, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    city: str = Field(default="", max_length=100)
    photo: Optional[str] = Field(default=None, max_length=2048)


class LoginIn(BaseModel):
    identifier: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class PublicUser(BaseModel):
    id: str
    name: str
    username: str
    email: EmailStr
    city: str
    photo: Optional[str] = None
    bio: Optional[str] = ""
    interests: List[str] = []
    friends_count: int = 0
    followers_count: int = 0
    following_count: int = 0
    role: str = "user"
    status: str = "active"


class AuthOut(BaseModel):
    access_token: str
    token_type: str
    user: PublicUser


class InterestsIn(BaseModel):
    interests: List[str] = Field(min_length=1, max_length=15)


class UpdateProfileIn(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    photo: Optional[str] = None
    bio: Optional[str] = None


class ParcheIn(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    description: str = Field(default="", max_length=2000)
    category: str
    city: str
    location: str = Field(default="", max_length=200)
    date: str  # ISO date "YYYY-MM-DD"
    time_start: str  # "HH:MM"
    time_end: Optional[str] = None
    capacity: int = Field(ge=1, le=1000)
    visibility: str = Field(default="public")
    photo: Optional[str] = None


class Category(BaseModel):
    slug: str
    name: str
    image: str


class CommentIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class ReportIn(BaseModel):
    target_type: str = Field(pattern=r"^(user|parche)$")
    target_id: str
    reason: str = Field(min_length=1, max_length=500)


class UserStatusIn(BaseModel):
    status: str = Field(pattern=r"^(active|suspended|blocked)$")


class ParcheStatusIn(BaseModel):
    hidden: bool


class ReportStatusIn(BaseModel):
    status: str = Field(pattern=r"^(pending|in_review|resolved|dismissed)$")


# ---------------------------------------------------------------------------
# Static reference data
# ---------------------------------------------------------------------------
CATEGORIES: List[Category] = [
    Category(slug="deportes", name="Deportes", image="https://images.unsplash.com/photo-1517649763962-0c623066013b?w=400"),
    Category(slug="entretenimiento", name="Entretenimiento", image="https://images.unsplash.com/photo-1489599735165-30f4c48d13a3?w=400"),
    Category(slug="aire-libre", name="Aire libre", image="https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=400"),
    Category(slug="cultura", name="Cultura", image="https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=400"),
    Category(slug="gastronomia", name="Gastronomía", image="https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400"),
    Category(slug="fiestas", name="Fiestas", image="https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=400"),
    Category(slug="viajes", name="Viajes", image="https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400"),
    Category(slug="mascotas", name="Mascotas", image="https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=400"),
    Category(slug="co-working", name="Co-Working", image="https://images.unsplash.com/photo-1497366216548-37526070297c?w=400"),
    Category(slug="espiritualidad", name="Espiritualidad", image="https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?w=400"),
    Category(slug="citas", name="Citas", image="https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=400"),
    Category(slug="educacion", name="Educación", image="https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=400"),
    Category(slug="compras", name="Compras", image="https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400"),
    Category(slug="videojuegos", name="Videojuegos", image="https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=400"),
    Category(slug="festividades", name="Festividades", image="https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=400"),
]
CATEGORY_SLUGS = {c.slug for c in CATEGORIES}

CITIES = ["Bucaramanga", "Bogotá", "Medellín", "Barranquilla", "Cartagena", "Cúcuta"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": user_id, "iat": now, "exp": now + timedelta(minutes=JWT_MINUTES)},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def _public_user(doc: dict) -> PublicUser:
    return PublicUser(
        id=doc["id"],
        name=doc["name"],
        username=doc["username"],
        email=doc["email"],
        city=doc.get("city", ""),
        photo=doc.get("photo"),
        bio=doc.get("bio", ""),
        interests=doc.get("interests", []),
        friends_count=doc.get("friends_count", 0),
        followers_count=doc.get("followers_count", 0),
        following_count=doc.get("following_count", 0),
        role=doc.get("role", "user"),
        status=doc.get("status", "active"),
    )


async def current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError()
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    if user.get("status") == "blocked":
        raise HTTPException(status_code=403, detail="Cuenta bloqueada. Contacta al administrador.")
    # bump last_seen
    await db.users.update_one({"id": user_id}, {"$set": {"last_seen": _now_iso()}})
    return user


async def optional_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    except Exception:
        return None


async def require_admin(user=Depends(current_user)):
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Solo Super Admin")
    return user


async def require_active(user=Depends(current_user)):
    if user.get("status") == "suspended":
        raise HTTPException(status_code=403, detail="Cuenta suspendida — solo lectura")
    return user


async def _friends_of(user_id: str) -> set[str]:
    """Return set of user_ids that are accepted friends of user_id."""
    docs = await db.friendships.find(
        {"status": "accepted", "$or": [{"from_user": user_id}, {"to_user": user_id}]},
        {"_id": 0, "from_user": 1, "to_user": 1},
    ).to_list(length=10000)
    return {d["to_user"] if d["from_user"] == user_id else d["from_user"] for d in docs}


async def _notify(user_id: str, kind: str, title: str, body: str, data: Optional[dict] = None):
    if not user_id:
        return
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "kind": kind,
        "title": title,
        "body": body,
        "data": data or {},
        "read": False,
        "created_at": _now_iso(),
    })


# ---------------------------------------------------------------------------
# App / router
# ---------------------------------------------------------------------------
app = FastAPI(title="LOPI API")
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"app": "LOPI", "ok": True}


@api.get("/categories", response_model=List[Category])
async def list_categories():
    return CATEGORIES


@api.get("/cities")
async def list_cities():
    return CITIES


# ---- Auth ---------------------------------------------------------------
@api.post("/auth/register", response_model=AuthOut, status_code=201)
async def register(body: RegisterIn):
    username = body.username.strip().lower()
    email = body.email.strip().lower()
    if await db.users.find_one({"$or": [{"username": username}, {"email": email}]}):
        raise HTTPException(status_code=409, detail="Username or email already registered")
    user_id = str(uuid.uuid4())
    role = "super_admin" if email == SUPER_ADMIN_EMAIL else "user"
    doc = {
        "id": user_id,
        "name": body.name.strip(),
        "username": username,
        "email": email,
        "password_hash": passwords.hash(body.password),
        "city": body.city.strip(),
        "photo": body.photo,
        "bio": "",
        "interests": [],
        "friends_count": 0,
        "followers_count": 0,
        "following_count": 0,
        "role": role,
        "status": "active",
        "last_seen": _now_iso(),
        "created_at": _now_iso(),
    }
    await db.users.insert_one(doc)
    return {"access_token": _make_token(user_id), "token_type": "bearer", "user": _public_user(doc)}


@api.post("/auth/login", response_model=AuthOut)
async def login(body: LoginIn):
    ident = body.identifier.strip().lower()
    user = await db.users.find_one({"$or": [{"username": ident}, {"email": ident}]}, {"_id": 0})
    dummy = "$2b$10$C6UzMDM.H6dfI/f/IKcEe.6H0l7a5P3N3Y2J7v6b6h6e6D6Y6Y6Y6"
    valid = passwords.verify(body.password, user["password_hash"] if user else dummy)
    if not user or not valid:
        raise HTTPException(status_code=401, detail="Incorrect identifier or password")
    if user.get("status") == "blocked":
        raise HTTPException(status_code=403, detail="Cuenta bloqueada por el administrador")
    # Auto-promote super admin (idempotent)
    if user["email"] == SUPER_ADMIN_EMAIL and user.get("role") != "super_admin":
        await db.users.update_one({"id": user["id"]}, {"$set": {"role": "super_admin"}})
        user["role"] = "super_admin"
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_seen": _now_iso()}})
    return {"access_token": _make_token(user["id"]), "token_type": "bearer", "user": _public_user(user)}


@api.get("/auth/me", response_model=PublicUser)
async def me(user=Depends(current_user)):
    return _public_user(user)


@api.post("/auth/interests", response_model=PublicUser)
async def set_interests(body: InterestsIn, user=Depends(current_user)):
    interests = [i for i in body.interests if i in CATEGORY_SLUGS]
    if not interests:
        raise HTTPException(status_code=400, detail="No valid interests provided")
    await db.users.update_one({"id": user["id"]}, {"$set": {"interests": interests}})
    user["interests"] = interests
    return _public_user(user)


@api.patch("/auth/profile", response_model=PublicUser)
async def update_profile(body: UpdateProfileIn, user=Depends(require_active)):
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
        user.update(updates)
    return _public_user(user)


# ---- Uploads ------------------------------------------------------------
@api.post("/upload")
async def upload_file(file: UploadFile = File(...), user=Depends(current_user)):
    ext = (file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg").lower()
    if ext not in {"jpg", "jpeg", "png", "webp", "gif"}:
        ext = "jpg"
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4().hex}.{ext}"
    data = await file.read()
    result = await run_in_threadpool(_put_object, path, data, file.content_type or "image/jpeg")
    return {"path": result["path"], "size": result.get("size"), "url": f"/api/files/{result['path']}"}


@api.get("/files/{path:path}")
async def download_file(path: str):
    try:
        data, ctype = await run_in_threadpool(_get_object, path)
    except Exception as e:
        logger.warning("get_object %s: %s", path, e)
        raise HTTPException(status_code=404, detail="File not found")
    return Response(content=data, media_type=ctype)


# ---- Parches ------------------------------------------------------------
async def _serialize_parche(p: dict, viewer_id: Optional[str]) -> dict:
    creator = await db.users.find_one({"id": p["creator_id"]}, {"_id": 0, "id": 1, "name": 1, "username": 1, "photo": 1, "city": 1})
    return {
        "id": p["id"],
        "title": p["title"],
        "description": p.get("description", ""),
        "category": p["category"],
        "city": p["city"],
        "location": p.get("location", ""),
        "date": p["date"],
        "time_start": p["time_start"],
        "time_end": p.get("time_end"),
        "capacity": p["capacity"],
        "visibility": p.get("visibility", "public"),
        "hidden": p.get("hidden", False),
        "photo": p.get("photo"),
        "creator": creator or {"id": p["creator_id"], "name": "?", "username": "?", "photo": None, "city": ""},
        "participants": p.get("participants", []),
        "participants_count": len(p.get("participants", [])),
        "likes_count": len(p.get("likes", [])),
        "comments_count": p.get("comments_count", 0),
        "liked": viewer_id in p.get("likes", []) if viewer_id else False,
        "joined": viewer_id in p.get("participants", []) if viewer_id else False,
        "saved": viewer_id in p.get("saves", []) if viewer_id else False,
        "share_url": f"{PUBLIC_URL}/parche/{p['id']}" if PUBLIC_URL else f"/parche/{p['id']}",
        "created_at": p.get("created_at"),
    }


async def _can_view_parche(p: dict, viewer: Optional[dict]) -> bool:
    if p.get("hidden"):
        return bool(viewer and viewer.get("role") == "super_admin")
    if p.get("visibility") != "friends":
        return True
    if not viewer:
        return False
    if viewer["id"] == p["creator_id"] or viewer["id"] in p.get("participants", []):
        return True
    friends = await _friends_of(viewer["id"])
    return p["creator_id"] in friends


@api.post("/parches", status_code=201)
async def create_parche(body: ParcheIn, user=Depends(require_active)):
    if body.category not in CATEGORY_SLUGS:
        raise HTTPException(status_code=400, detail="Invalid category")
    pid = str(uuid.uuid4())
    doc = {
        "id": pid,
        "title": body.title.strip(),
        "description": body.description.strip(),
        "category": body.category,
        "city": body.city.strip(),
        "location": body.location.strip(),
        "date": body.date,
        "time_start": body.time_start,
        "time_end": body.time_end,
        "capacity": body.capacity,
        "visibility": body.visibility,
        "photo": body.photo,
        "creator_id": user["id"],
        "participants": [user["id"]],
        "likes": [],
        "saves": [],
        "comments_count": 0,
        "hidden": False,
        "created_at": _now_iso(),
    }
    await db.parches.insert_one(doc)
    return await _serialize_parche(doc, user["id"])


@api.get("/parches/feed")
async def feed(
    user=Depends(current_user),
    city: Optional[str] = None,
    category: Optional[str] = None,
    when: Optional[str] = None,
    q: Optional[str] = None,
    only_mine: bool = False,
    joined: bool = False,
    saved: bool = False,
    limit: int = 50,
):
    query: dict = {"hidden": {"$ne": True}}
    if city:
        query["city"] = city
    if category:
        query["category"] = category
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"location": {"$regex": q, "$options": "i"}},
        ]
    if when == "today":
        query["date"] = datetime.now(timezone.utc).date().isoformat()
    elif when == "week":
        today = datetime.now(timezone.utc).date()
        week_end = today + timedelta(days=7)
        query["date"] = {"$gte": today.isoformat(), "$lte": week_end.isoformat()}
    if only_mine:
        query["creator_id"] = user["id"]
    if joined:
        query["participants"] = user["id"]
    if saved:
        query["saves"] = user["id"]

    cursor = db.parches.find(query, {"_id": 0}).limit(limit * 2)
    parches = await cursor.to_list(length=limit * 2)

    # Enforce friends-only visibility
    friends = await _friends_of(user["id"])
    visible = []
    for p in parches:
        if p.get("visibility") == "friends":
            if user["id"] == p["creator_id"] or user["id"] in p.get("participants", []) or p["creator_id"] in friends:
                visible.append(p)
        else:
            visible.append(p)
    parches = visible[:limit]

    def score(p: dict) -> tuple:
        s = 0
        if p["city"] == user.get("city"):
            s += 10
        if p["category"] in user.get("interests", []):
            s += 5
        try:
            days = (datetime.fromisoformat(p["date"]).date() - datetime.now(timezone.utc).date()).days
            if days >= 0:
                s += max(0, 5 - days)
        except Exception:
            pass
        return (-s, p.get("date", ""), p.get("time_start", ""))

    parches.sort(key=score)
    return [await _serialize_parche(p, user["id"]) for p in parches]


@api.get("/parches/{parche_id}")
async def get_parche(parche_id: str, viewer=Depends(optional_user)):
    p = await db.parches.find_one({"id": parche_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Parche not found")
    if not await _can_view_parche(p, viewer):
        raise HTTPException(status_code=403, detail="Este parche es solo para amigos del creador")
    return await _serialize_parche(p, viewer["id"] if viewer else None)


@api.post("/parches/{parche_id}/join")
async def join_parche(parche_id: str, user=Depends(require_active)):
    p = await db.parches.find_one({"id": parche_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Parche not found")
    if not await _can_view_parche(p, user):
        raise HTTPException(status_code=403, detail="No autorizado")
    if user["id"] in p.get("participants", []):
        return await _serialize_parche(p, user["id"])
    if len(p.get("participants", [])) >= p["capacity"]:
        raise HTTPException(status_code=400, detail="Parche lleno")
    await db.parches.update_one({"id": parche_id}, {"$addToSet": {"participants": user["id"]}})
    p["participants"] = list(set(p.get("participants", []) + [user["id"]]))
    if p["creator_id"] != user["id"]:
        await _notify(p["creator_id"], "join", "Nuevo participante", f"{user['name']} se unió a {p['title']}", {"parche_id": p["id"]})
    return await _serialize_parche(p, user["id"])


@api.post("/parches/{parche_id}/leave")
async def leave_parche(parche_id: str, user=Depends(current_user)):
    p = await db.parches.find_one({"id": parche_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Parche not found")
    if p["creator_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="El creador no puede salir")
    await db.parches.update_one({"id": parche_id}, {"$pull": {"participants": user["id"]}})
    p["participants"] = [u for u in p.get("participants", []) if u != user["id"]]
    return await _serialize_parche(p, user["id"])


@api.post("/parches/{parche_id}/like")
async def toggle_like(parche_id: str, user=Depends(current_user)):
    p = await db.parches.find_one({"id": parche_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Parche not found")
    if user["id"] in p.get("likes", []):
        await db.parches.update_one({"id": parche_id}, {"$pull": {"likes": user["id"]}})
        p["likes"] = [u for u in p.get("likes", []) if u != user["id"]]
    else:
        await db.parches.update_one({"id": parche_id}, {"$addToSet": {"likes": user["id"]}})
        p["likes"] = list(set(p.get("likes", []) + [user["id"]]))
    return await _serialize_parche(p, user["id"])


@api.post("/parches/{parche_id}/save")
async def toggle_save(parche_id: str, user=Depends(current_user)):
    p = await db.parches.find_one({"id": parche_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Parche not found")
    if user["id"] in p.get("saves", []):
        await db.parches.update_one({"id": parche_id}, {"$pull": {"saves": user["id"]}})
        p["saves"] = [u for u in p.get("saves", []) if u != user["id"]]
    else:
        await db.parches.update_one({"id": parche_id}, {"$addToSet": {"saves": user["id"]}})
        p["saves"] = list(set(p.get("saves", []) + [user["id"]]))
    return await _serialize_parche(p, user["id"])


# ---- Comments -----------------------------------------------------------
async def _serialize_comment(c: dict) -> dict:
    author = await db.users.find_one({"id": c["user_id"]}, {"_id": 0, "id": 1, "name": 1, "username": 1, "photo": 1})
    return {
        "id": c["id"],
        "parche_id": c["parche_id"],
        "text": c["text"],
        "author": author or {"id": c["user_id"], "name": "?", "username": "?", "photo": None},
        "created_at": c["created_at"],
    }


@api.get("/parches/{parche_id}/comments")
async def list_comments(parche_id: str, viewer=Depends(current_user)):
    p = await db.parches.find_one({"id": parche_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Parche not found")
    if not await _can_view_parche(p, viewer):
        raise HTTPException(status_code=403, detail="No autorizado")
    docs = await db.comments.find({"parche_id": parche_id}, {"_id": 0}).sort("created_at", 1).to_list(length=500)
    return [await _serialize_comment(c) for c in docs]


@api.post("/parches/{parche_id}/comments", status_code=201)
async def create_comment(parche_id: str, body: CommentIn, user=Depends(require_active)):
    p = await db.parches.find_one({"id": parche_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Parche not found")
    if not await _can_view_parche(p, user):
        raise HTTPException(status_code=403, detail="No autorizado")
    doc = {
        "id": str(uuid.uuid4()),
        "parche_id": parche_id,
        "user_id": user["id"],
        "text": body.text.strip(),
        "created_at": _now_iso(),
    }
    await db.comments.insert_one(doc)
    await db.parches.update_one({"id": parche_id}, {"$inc": {"comments_count": 1}})
    if p["creator_id"] != user["id"]:
        await _notify(p["creator_id"], "comment", "Nuevo comentario", f"{user['name']} comentó en {p['title']}", {"parche_id": p["id"]})
    return await _serialize_comment(doc)


@api.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, user=Depends(current_user)):
    c = await db.comments.find_one({"id": comment_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    if c["user_id"] != user["id"] and user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Solo el autor puede eliminar")
    await db.comments.delete_one({"id": comment_id})
    await db.parches.update_one({"id": c["parche_id"]}, {"$inc": {"comments_count": -1}})
    return {"ok": True}


# ---- Chat (participants only) ------------------------------------------
async def _serialize_message(m: dict) -> dict:
    author = await db.users.find_one({"id": m["user_id"]}, {"_id": 0, "id": 1, "name": 1, "username": 1, "photo": 1})
    return {
        "id": m["id"],
        "parche_id": m["parche_id"],
        "text": m["text"],
        "author": author or {"id": m["user_id"], "name": "?", "username": "?", "photo": None},
        "created_at": m["created_at"],
    }


async def _require_participant(parche_id: str, user: dict) -> dict:
    p = await db.parches.find_one({"id": parche_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Parche not found")
    if user["id"] != p["creator_id"] and user["id"] not in p.get("participants", []):
        raise HTTPException(status_code=403, detail="Debes unirte al parche para ver el chat")
    return p


@api.get("/parches/{parche_id}/messages")
async def list_messages(parche_id: str, user=Depends(current_user)):
    await _require_participant(parche_id, user)
    docs = await db.messages.find({"parche_id": parche_id}, {"_id": 0}).sort("created_at", 1).to_list(length=1000)
    return [await _serialize_message(m) for m in docs]


@api.post("/parches/{parche_id}/messages", status_code=201)
async def send_message(parche_id: str, body: MessageIn, user=Depends(require_active)):
    p = await _require_participant(parche_id, user)
    doc = {
        "id": str(uuid.uuid4()),
        "parche_id": parche_id,
        "user_id": user["id"],
        "text": body.text.strip(),
        "created_at": _now_iso(),
    }
    await db.messages.insert_one(doc)
    # notify other participants
    others = [uid for uid in p.get("participants", []) if uid != user["id"]]
    for uid in others:
        await _notify(uid, "chat", f"Nuevo mensaje · {p['title']}", f"{user['name']}: {body.text[:60]}", {"parche_id": p["id"]})
    return await _serialize_message(doc)


# ---- Friends ------------------------------------------------------------
async def _friendship_between(a: str, b: str) -> Optional[dict]:
    return await db.friendships.find_one(
        {"$or": [
            {"from_user": a, "to_user": b},
            {"from_user": b, "to_user": a},
        ]},
        {"_id": 0},
    )


async def _mini_user(uid: str) -> dict:
    u = await db.users.find_one({"id": uid}, {"_id": 0, "id": 1, "name": 1, "username": 1, "photo": 1, "city": 1})
    return u or {"id": uid, "name": "?", "username": "?", "photo": None, "city": ""}


async def _sync_friend_counts(uid: str) -> None:
    n = await db.friendships.count_documents({"status": "accepted", "$or": [{"from_user": uid}, {"to_user": uid}]})
    await db.users.update_one({"id": uid}, {"$set": {"friends_count": n}})


@api.get("/friends")
async def my_friends(user=Depends(current_user)):
    docs = await db.friendships.find(
        {"status": "accepted", "$or": [{"from_user": user["id"]}, {"to_user": user["id"]}]},
        {"_id": 0},
    ).to_list(length=1000)
    out = []
    for d in docs:
        other = d["to_user"] if d["from_user"] == user["id"] else d["from_user"]
        u = await _mini_user(other)
        out.append({"friendship_id": d["id"], "user": u, "since": d.get("accepted_at") or d.get("created_at")})
    return out


@api.get("/friends/requests/received")
async def received_requests(user=Depends(current_user)):
    docs = await db.friendships.find({"status": "pending", "to_user": user["id"]}, {"_id": 0}).to_list(length=1000)
    return [{"friendship_id": d["id"], "user": await _mini_user(d["from_user"]), "created_at": d["created_at"]} for d in docs]


@api.get("/friends/requests/sent")
async def sent_requests(user=Depends(current_user)):
    docs = await db.friendships.find({"status": "pending", "from_user": user["id"]}, {"_id": 0}).to_list(length=1000)
    return [{"friendship_id": d["id"], "user": await _mini_user(d["to_user"]), "created_at": d["created_at"]} for d in docs]


@api.post("/friends/request/{user_id}", status_code=201)
async def send_friend_request(user_id: str, user=Depends(require_active)):
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="No puedes agregarte a ti mismo")
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "name": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    existing = await _friendship_between(user["id"], user_id)
    if existing:
        if existing["status"] == "accepted":
            raise HTTPException(status_code=409, detail="Ya son amigos")
        if existing["status"] == "pending":
            raise HTTPException(status_code=409, detail="Solicitud ya enviada")
        if existing["status"] == "rejected":
            # allow re-request by upgrading
            await db.friendships.update_one({"id": existing["id"]}, {"$set": {"status": "pending", "from_user": user["id"], "to_user": user_id, "created_at": _now_iso()}})
            await _notify(user_id, "friend_request", "Nueva solicitud de amistad", f"{user['name']} quiere ser tu amigo", {"from_user": user["id"]})
            return {"friendship_id": existing["id"], "status": "pending"}
    doc = {
        "id": str(uuid.uuid4()),
        "from_user": user["id"],
        "to_user": user_id,
        "status": "pending",
        "created_at": _now_iso(),
    }
    await db.friendships.insert_one(doc)
    await _notify(user_id, "friend_request", "Nueva solicitud de amistad", f"{user['name']} quiere ser tu amigo", {"from_user": user["id"]})
    return {"friendship_id": doc["id"], "status": "pending"}


@api.post("/friends/accept/{friendship_id}")
async def accept_friend(friendship_id: str, user=Depends(require_active)):
    d = await db.friendships.find_one({"id": friendship_id}, {"_id": 0})
    if not d or d["to_user"] != user["id"] or d["status"] != "pending":
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    await db.friendships.update_one({"id": friendship_id}, {"$set": {"status": "accepted", "accepted_at": _now_iso()}})
    await _sync_friend_counts(d["from_user"])
    await _sync_friend_counts(d["to_user"])
    await _notify(d["from_user"], "friend_accept", "Solicitud aceptada", f"{user['name']} aceptó tu solicitud", {"user_id": user["id"]})
    return {"ok": True}


@api.post("/friends/reject/{friendship_id}")
async def reject_friend(friendship_id: str, user=Depends(current_user)):
    d = await db.friendships.find_one({"id": friendship_id}, {"_id": 0})
    if not d or d["to_user"] != user["id"] or d["status"] != "pending":
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    await db.friendships.update_one({"id": friendship_id}, {"$set": {"status": "rejected", "rejected_at": _now_iso()}})
    return {"ok": True}


@api.delete("/friends/{user_id}")
async def remove_friend(user_id: str, user=Depends(current_user)):
    existing = await _friendship_between(user["id"], user_id)
    if not existing or existing["status"] != "accepted":
        raise HTTPException(status_code=404, detail="No son amigos")
    await db.friendships.delete_one({"id": existing["id"]})
    await _sync_friend_counts(user["id"])
    await _sync_friend_counts(user_id)
    return {"ok": True}


@api.get("/users/search")
async def search_users(q: str, user=Depends(current_user)):
    if not q or len(q) < 2:
        return []
    regex = {"$regex": q, "$options": "i"}
    docs = await db.users.find(
        {"$or": [{"name": regex}, {"username": regex}, {"email": regex}], "id": {"$ne": user["id"]}},
        {"_id": 0, "id": 1, "name": 1, "username": 1, "photo": 1, "city": 1},
    ).limit(30).to_list(length=30)
    # annotate friendship status
    my_friends = await _friends_of(user["id"])
    pending_docs = await db.friendships.find(
        {"status": "pending", "$or": [{"from_user": user["id"]}, {"to_user": user["id"]}]},
        {"_id": 0},
    ).to_list(length=1000)
    pending_map: dict[str, str] = {}
    for d in pending_docs:
        other = d["to_user"] if d["from_user"] == user["id"] else d["from_user"]
        pending_map[other] = "sent" if d["from_user"] == user["id"] else "received"
    out = []
    for u in docs:
        if u["id"] in my_friends:
            rel = "friends"
        elif u["id"] in pending_map:
            rel = pending_map[u["id"]]
        else:
            rel = "none"
        out.append({**u, "relation": rel})
    return out


# ---- Users --------------------------------------------------------------
@api.get("/users/{user_id}")
async def get_user(user_id: str, viewer=Depends(optional_user)):
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    created = await db.parches.count_documents({"creator_id": user_id, "hidden": {"$ne": True}})
    joined = await db.parches.count_documents({"participants": user_id, "creator_id": {"$ne": user_id}, "hidden": {"$ne": True}})
    relation = "none"
    if viewer and viewer["id"] != user_id:
        existing = await _friendship_between(viewer["id"], user_id)
        if existing:
            if existing["status"] == "accepted":
                relation = "friends"
            elif existing["status"] == "pending":
                relation = "sent" if existing["from_user"] == viewer["id"] else "received"
    return {
        **_public_user(u).model_dump(),
        "created_count": created,
        "joined_count": joined,
        "relation": relation,
    }


# ---- Notifications ------------------------------------------------------
@api.get("/notifications")
async def list_notifications(user=Depends(current_user), limit: int = 50):
    docs = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(length=limit)
    unread = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"items": docs, "unread": unread}


@api.post("/notifications/read-all")
async def read_all_notifications(user=Depends(current_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}


# ---- Reports ------------------------------------------------------------
@api.post("/reports", status_code=201)
async def create_report(body: ReportIn, user=Depends(require_active)):
    doc = {
        "id": str(uuid.uuid4()),
        "reporter_id": user["id"],
        "target_type": body.target_type,
        "target_id": body.target_id,
        "reason": body.reason.strip(),
        "status": "pending",
        "created_at": _now_iso(),
    }
    await db.reports.insert_one(doc)
    return {"id": doc["id"], "status": "pending"}


# ---- Admin --------------------------------------------------------------
@api.get("/admin/stats")
async def admin_stats(_=Depends(require_admin)):
    now = datetime.now(timezone.utc)
    day_ago = (now - timedelta(days=1)).isoformat()
    week_ago = (now - timedelta(days=7)).isoformat()
    month_ago = (now - timedelta(days=30)).isoformat()

    total_users = await db.users.count_documents({})
    new_today = await db.users.count_documents({"created_at": {"$gte": day_ago}})
    new_week = await db.users.count_documents({"created_at": {"$gte": week_ago}})
    new_month = await db.users.count_documents({"created_at": {"$gte": month_ago}})
    active_users = await db.users.count_documents({"last_seen": {"$gte": week_ago}})

    total_parches = await db.parches.count_documents({})
    parches_with_participants = await db.parches.count_documents({"$expr": {"$gt": [{"$size": "$participants"}, 1]}})
    pct_with_participants = round((parches_with_participants / total_parches) * 100, 1) if total_parches else 0.0

    # sum of participants array lengths — use aggregation
    part_agg = await db.parches.aggregate([{"$project": {"n": {"$size": "$participants"}}}, {"$group": {"_id": None, "total": {"$sum": "$n"}}}]).to_list(length=1)
    participations = part_agg[0]["total"] if part_agg else 0

    users_by_city = await db.users.aggregate([{"$group": {"_id": "$city", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}]).to_list(length=100)
    parches_by_city = await db.parches.aggregate([{"$group": {"_id": "$city", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}]).to_list(length=100)
    top_categories = await db.parches.aggregate([{"$group": {"_id": "$category", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}, {"$limit": 10}]).to_list(length=10)

    top_docs = await db.parches.find({"hidden": {"$ne": True}}, {"_id": 0, "id": 1, "title": 1, "participants": 1, "city": 1, "photo": 1}).to_list(length=500)
    top_docs.sort(key=lambda x: -len(x.get("participants", [])))
    top_participation = [{"id": d["id"], "title": d["title"], "city": d.get("city"), "photo": d.get("photo"), "participants_count": len(d.get("participants", []))} for d in top_docs[:5]]

    return {
        "total_users": total_users,
        "new_users": {"today": new_today, "week": new_week, "month": new_month},
        "active_users_week": active_users,
        "total_parches": total_parches,
        "participations": participations,
        "pct_with_participants": pct_with_participants,
        "users_by_city": [{"city": d["_id"] or "—", "count": d["count"]} for d in users_by_city],
        "parches_by_city": [{"city": d["_id"] or "—", "count": d["count"]} for d in parches_by_city],
        "top_categories": [{"category": d["_id"], "count": d["count"]} for d in top_categories],
        "top_participation": top_participation,
    }


@api.get("/admin/users")
async def admin_users(_=Depends(require_admin), q: Optional[str] = None, status: Optional[str] = None, limit: int = 100):
    query: dict = {}
    if q:
        regex = {"$regex": q, "$options": "i"}
        query["$or"] = [{"name": regex}, {"username": regex}, {"email": regex}]
    if status:
        query["status"] = status
    docs = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).limit(limit).to_list(length=limit)
    return docs


@api.post("/admin/users/{user_id}/status")
async def admin_set_user_status(user_id: str, body: UserStatusIn, admin=Depends(require_admin)):
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "email": 1})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if u["email"] == SUPER_ADMIN_EMAIL:
        raise HTTPException(status_code=400, detail="No puedes cambiar el estado del Super Admin")
    await db.users.update_one({"id": user_id}, {"$set": {"status": body.status}})
    return {"ok": True, "status": body.status}


@api.get("/admin/parches")
async def admin_parches(_=Depends(require_admin), q: Optional[str] = None, city: Optional[str] = None, category: Optional[str] = None, hidden: Optional[bool] = None, limit: int = 100):
    query: dict = {}
    if q:
        regex = {"$regex": q, "$options": "i"}
        query["$or"] = [{"title": regex}, {"description": regex}, {"location": regex}]
    if city:
        query["city"] = city
    if category:
        query["category"] = category
    if hidden is not None:
        query["hidden"] = hidden
    docs = await db.parches.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(length=limit)
    return [await _serialize_parche(p, None) for p in docs]


@api.post("/admin/parches/{parche_id}/status")
async def admin_hide_parche(parche_id: str, body: ParcheStatusIn, _=Depends(require_admin)):
    p = await db.parches.find_one({"id": parche_id}, {"_id": 0, "id": 1})
    if not p:
        raise HTTPException(status_code=404, detail="Parche not found")
    await db.parches.update_one({"id": parche_id}, {"$set": {"hidden": body.hidden}})
    return {"ok": True, "hidden": body.hidden}


@api.delete("/admin/parches/{parche_id}")
async def admin_delete_parche(parche_id: str, _=Depends(require_admin)):
    p = await db.parches.find_one({"id": parche_id}, {"_id": 0, "id": 1})
    if not p:
        raise HTTPException(status_code=404, detail="Parche not found")
    await db.parches.delete_one({"id": parche_id})
    await db.comments.delete_many({"parche_id": parche_id})
    await db.messages.delete_many({"parche_id": parche_id})
    return {"ok": True}


@api.get("/admin/reports")
async def admin_reports(_=Depends(require_admin), status: Optional[str] = None, limit: int = 100):
    query: dict = {}
    if status:
        query["status"] = status
    docs = await db.reports.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(length=limit)
    out = []
    for r in docs:
        reporter = await _mini_user(r["reporter_id"])
        target = None
        if r["target_type"] == "user":
            target = await _mini_user(r["target_id"])
        else:
            t = await db.parches.find_one({"id": r["target_id"]}, {"_id": 0, "id": 1, "title": 1, "photo": 1, "city": 1})
            target = t or {"id": r["target_id"], "title": "(eliminado)"}
        out.append({**r, "reporter": reporter, "target": target})
    return out


@api.patch("/admin/reports/{report_id}")
async def admin_update_report(report_id: str, body: ReportStatusIn, _=Depends(require_admin)):
    r = await db.reports.find_one({"id": report_id}, {"_id": 0, "id": 1})
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    await db.reports.update_one({"id": report_id}, {"$set": {"status": body.status, "resolved_at": _now_iso() if body.status in {"resolved", "dismissed"} else None}})
    return {"ok": True, "status": body.status}


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------
SEED_USERS = [
    ("Carolina Valdiviesco", "carolinav", "Bucaramanga", "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400"),
    ("Juan Camilo Martínez", "juancamilo", "Bogotá", "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400"),
    ("Laura Ximena Martínez", "lauraxm", "Medellín", "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400"),
    ("Jose Ramírez Ríos", "joseramirez", "Cartagena", "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400"),
    ("Alejandra Patiño", "alepatino", "Bogotá", "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=400"),
    ("María Camila Plata", "macaplata", "Bucaramanga", "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400"),
    ("Andrés Felipe López", "andreslopez", "Barranquilla", "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400"),
    ("Valentina Torres", "valetorres", "Medellín", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400"),
    ("Santiago Rojas", "santirojas", "Cúcuta", "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400"),
    ("Isabella Gómez", "isagomez", "Cartagena", "https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=400"),
    ("Daniel Herrera", "danih", "Bogotá", "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=400"),
    ("Camila Suárez", "camilasu", "Bucaramanga", "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400"),
    ("Julián Pérez", "julianp", "Medellín", "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=400"),
    ("Natalia Ríos", "natirios", "Cúcuta", "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400"),
    ("Sebastián Vargas", "sebasv", "Barranquilla", "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=400"),
]

SEED_PARCHES = [
    ("Solo para amantes del running", "Estoy programando un evento para las personas que practican regularmente. Van a haber unos entrenamientos increíbles.", "deportes", "Bucaramanga", "Cascada los cotudos", 5, 25, "https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=800"),
    ("Cena italiana entre amigos", "Batuto Sofrito e Trito, cocina italiana casera. Vamos a compartir buena comida y risas.", "gastronomia", "Bogotá", "Batuto Sofrito e Trito", 4, 10, "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800"),
    ("Partidito recocha mixto", "Estoy armando un juego de fútbol con chicos que quieran divertirse un rato.", "deportes", "Medellín", "Estadio de atletismo", 3, 10, "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800"),
    ("Fin de año en Bucaramanga", "Quiero hacer una pequeña fiesta para finalizar todo el año, no importa la pinta, lo importante es la actitud.", "fiestas", "Bucaramanga", "Barrio Campestre", 6, 30, "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800"),
    ("Fiesta de fin de año", "Fiesta con música en vivo y mucha diversión.", "fiestas", "Cartagena", "Getsemaní", 7, 40, "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800"),
    ("Cine bajo las estrellas", "Proyección al aire libre de una película clásica. Trae tu manta.", "cultura", "Bogotá", "Parque Simón Bolívar", 5, 20, "https://images.unsplash.com/photo-1489599735165-30f4c48d13a3?w=800"),
    ("Pádel torneo amistoso", "Torneo relajado para todos los niveles.", "deportes", "Barranquilla", "Club Pádel Norte", 4, 8, "https://images.unsplash.com/photo-1552242718-c5360894aecd?w=800"),
    ("Cata de vinos y quesos", "Descubramos vinos colombianos con maridaje de quesos artesanales.", "gastronomia", "Medellín", "El Poblado", 3, 12, "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800"),
    ("Senderismo Cerro Cristo Rey", "Caminata guiada con vistas increíbles. Nivel intermedio.", "aire-libre", "Cúcuta", "Cerro Cristo Rey", 2, 15, "https://images.unsplash.com/photo-1551632811-561732d1e306?w=800"),
    ("Viaje a Guatapé fin de semana", "Fin de semana en la piedra del peñol y pueblo colorido.", "viajes", "Medellín", "Guatapé", 8, 15, "https://images.unsplash.com/photo-1600093463592-8e36ae95ef56?w=800"),
    ("Torneo de videojuegos FIFA", "Torneo relámpago de FIFA. Premio para el ganador.", "videojuegos", "Bucaramanga", "GameZone Cabecera", 4, 16, "https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=800"),
    ("Yoga al amanecer", "Sesión de yoga y meditación al amanecer con vista al mar.", "espiritualidad", "Cartagena", "Playa Bocagrande", 1, 20, "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800"),
    ("Coworking day", "Trabajemos juntos con buena vibra y café ilimitado.", "co-working", "Bogotá", "Chapinero", 3, 15, "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800"),
    ("Paseo con perritos", "Salida grupal con nuestras mascotas al parque.", "mascotas", "Bucaramanga", "Parque San Pío", 2, 20, "https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=800"),
    ("Salsa night", "Clase gratis + rumba de salsa toda la noche.", "fiestas", "Cali", "Zona Rosa", 5, 50, "https://images.unsplash.com/photo-1533158307587-828f0a76ef46?w=800"),
    ("Taller de cerámica", "Aprende a modelar arcilla en un taller relajado.", "cultura", "Barranquilla", "Taller Barro Vivo", 6, 10, "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800"),
    ("Ruta gastronómica callejera", "Recorrido por los mejores puestos de comida callejera.", "gastronomia", "Cúcuta", "Centro histórico", 3, 12, "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800"),
    ("Speed dating LOPI", "Conoce personas nuevas en un ambiente relajado.", "citas", "Medellín", "Café Pergamino", 5, 20, "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=800"),
    ("Compras en el mercado de pulgas", "Vamos juntos a buscar tesoros vintage.", "compras", "Bogotá", "Usaquén", 4, 8, "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800"),
    ("Curso rápido de inglés", "Práctica conversacional con hablantes nativos.", "educacion", "Bucaramanga", "Universidad UNAB", 2, 15, "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800"),
]


async def _seed() -> None:
    now = datetime.now(timezone.utc)
    slugs = [c.slug for c in CATEGORIES]

    if await db.users.count_documents({}) == 0:
        users = []
        for name, uname, city, photo in SEED_USERS:
            interests = random.sample(slugs, 5)
            users.append({
                "id": str(uuid.uuid4()),
                "name": name,
                "username": uname,
                "email": f"{uname}@lopi.demo",
                "password_hash": passwords.hash("Demo1234!"),
                "city": city,
                "photo": photo,
                "bio": f"Amante de {interests[0]} y {interests[1]}",
                "interests": interests,
                "friends_count": 0,
                "followers_count": random.randint(50, 400),
                "following_count": random.randint(30, 300),
                "role": "user",
                "status": "active",
                "last_seen": now.isoformat(),
                "created_at": now.isoformat(),
            })
        await db.users.insert_many(users)
        logger.info("Seeded %d users", len(users))

    if await db.parches.count_documents({}) == 0:
        users = await db.users.find({"role": {"$ne": "super_admin"}}, {"_id": 0, "id": 1}).to_list(length=100)
        user_ids = [u["id"] for u in users]
        if user_ids:
            parches = []
            for title, desc, cat, city, loc, days_ahead, cap, photo in SEED_PARCHES:
                creator = random.choice(user_ids)
                pdate = (now + timedelta(days=days_ahead)).date().isoformat()
                hour = random.choice(["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"])
                others = random.sample([u for u in user_ids if u != creator], k=min(random.randint(2, 6), cap - 1))
                parches.append({
                    "id": str(uuid.uuid4()),
                    "title": title,
                    "description": desc,
                    "category": cat,
                    "city": city,
                    "location": loc,
                    "date": pdate,
                    "time_start": hour,
                    "time_end": None,
                    "capacity": cap,
                    "visibility": "public",
                    "photo": photo,
                    "creator_id": creator,
                    "participants": [creator, *others],
                    "likes": random.sample(user_ids, k=random.randint(3, min(12, len(user_ids)))),
                    "saves": random.sample(user_ids, k=random.randint(0, min(6, len(user_ids)))),
                    "comments_count": 0,
                    "hidden": False,
                    "created_at": now.isoformat(),
                })
            await db.parches.insert_many(parches)
            logger.info("Seeded %d parches", len(parches))


async def _ensure_super_admin() -> None:
    """If the super admin email already exists, promote it. This is idempotent."""
    u = await db.users.find_one({"email": SUPER_ADMIN_EMAIL}, {"_id": 0, "id": 1, "role": 1})
    if u and u.get("role") != "super_admin":
        await db.users.update_one({"id": u["id"]}, {"$set": {"role": "super_admin"}})
        logger.info("Promoted existing user %s to super_admin", SUPER_ADMIN_EMAIL)


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def _startup():
    await db.users.create_index("username", unique=True)
    await db.users.create_index("email", unique=True)
    await db.parches.create_index("city")
    await db.parches.create_index("category")
    await db.friendships.create_index([("from_user", 1), ("to_user", 1)])
    await db.comments.create_index("parche_id")
    await db.messages.create_index("parche_id")
    await db.notifications.create_index([("user_id", 1), ("read", 1), ("created_at", -1)])
    try:
        _init_storage()
    except Exception as e:
        logger.warning("Storage init failed: %s (uploads will fail until it recovers)", e)
    try:
        await _seed()
        await _ensure_super_admin()
    except Exception as e:
        logger.exception("Startup seed/admin failed: %s", e)


@app.on_event("shutdown")
async def _shutdown():
    client.close()


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
