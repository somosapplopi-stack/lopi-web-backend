"""LOPI backend — social network for parches (plans/activities).

Provides auth, users, categories, parches CRUD, join/like/save, feed, explore.
Uses local email/password auth (bcrypt + JWT) and Emergent Object Storage for
image uploads. All IDs are UUID strings (no ObjectId) to keep JSON serialization
simple.
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
from fastapi import (APIRouter, Depends, FastAPI, File, Form, HTTPException,
                     Query, Response, UploadFile, status)
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

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

passwords = PasswordHash((BcryptHasher(rounds=10),))
bearer = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("lopi")

# ---------------------------------------------------------------------------
# Storage helpers (call your backend proxy — never call the storage host from client)
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
    visibility: str = Field(default="public")  # public | friends | approval
    photo: Optional[str] = None


class Category(BaseModel):
    slug: str
    name: str
    image: str


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
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
    return user


async def optional_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    except Exception:
        return None


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

CITIES = ["Bucaramanga", "Bogotá", "Medellín", "Barranquilla", "Cartagena", "Cúcuta"]


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
        "created_at": datetime.now(timezone.utc).isoformat(),
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
    return {"access_token": _make_token(user["id"]), "token_type": "bearer", "user": _public_user(user)}


@api.get("/auth/me", response_model=PublicUser)
async def me(user=Depends(current_user)):
    return _public_user(user)


@api.post("/auth/interests", response_model=PublicUser)
async def set_interests(body: InterestsIn, user=Depends(current_user)):
    valid_slugs = {c.slug for c in CATEGORIES}
    interests = [i for i in body.interests if i in valid_slugs]
    if not interests:
        raise HTTPException(status_code=400, detail="No valid interests provided")
    await db.users.update_one({"id": user["id"]}, {"$set": {"interests": interests}})
    user["interests"] = interests
    return _public_user(user)


@api.patch("/auth/profile", response_model=PublicUser)
async def update_profile(body: UpdateProfileIn, user=Depends(current_user)):
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
        "photo": p.get("photo"),
        "creator": creator or {"id": p["creator_id"], "name": "?", "username": "?", "photo": None, "city": ""},
        "participants": p.get("participants", []),
        "participants_count": len(p.get("participants", [])),
        "likes_count": len(p.get("likes", [])),
        "comments_count": p.get("comments_count", 0),
        "liked": viewer_id in p.get("likes", []) if viewer_id else False,
        "joined": viewer_id in p.get("participants", []) if viewer_id else False,
        "saved": viewer_id in p.get("saves", []) if viewer_id else False,
        "created_at": p.get("created_at"),
    }


@api.post("/parches", status_code=201)
async def create_parche(body: ParcheIn, user=Depends(current_user)):
    valid_slugs = {c.slug for c in CATEGORIES}
    if body.category not in valid_slugs:
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
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.parches.insert_one(doc)
    return await _serialize_parche(doc, user["id"])


@api.get("/parches/feed")
async def feed(
    user=Depends(current_user),
    city: Optional[str] = None,
    category: Optional[str] = None,
    when: Optional[str] = None,  # "today" | "week"
    q: Optional[str] = None,
    only_mine: bool = False,
    joined: bool = False,
    saved: bool = False,
    limit: int = 50,
):
    query: dict = {}
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

    cursor = db.parches.find(query, {"_id": 0}).limit(limit)
    parches = await cursor.to_list(length=limit)

    # Personalize: score by city + interests + date proximity, then sort desc.
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
    return await _serialize_parche(p, viewer["id"] if viewer else None)


@api.post("/parches/{parche_id}/join")
async def join_parche(parche_id: str, user=Depends(current_user)):
    p = await db.parches.find_one({"id": parche_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Parche not found")
    if user["id"] in p.get("participants", []):
        return await _serialize_parche(p, user["id"])
    if len(p.get("participants", [])) >= p["capacity"]:
        raise HTTPException(status_code=400, detail="Parche lleno")
    await db.parches.update_one({"id": parche_id}, {"$addToSet": {"participants": user["id"]}})
    p["participants"] = list(set(p.get("participants", []) + [user["id"]]))
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


# ---- Users --------------------------------------------------------------
@api.get("/users/{user_id}")
async def get_user(user_id: str, viewer=Depends(optional_user)):
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    created = await db.parches.count_documents({"creator_id": user_id})
    joined = await db.parches.count_documents({"participants": user_id, "creator_id": {"$ne": user_id}})
    return {
        **_public_user(u).model_dump(),
        "created_count": created,
        "joined_count": joined,
    }


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

    # Seed users only if the seeded usernames are not already in the DB.
    seeded_usernames = [u[1] for u in SEED_USERS]
    existing = await db.users.count_documents({"username": {"$in": seeded_usernames}})
    if existing == 0:
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
                "friends_count": random.randint(50, 400),
                "followers_count": random.randint(50, 400),
                "following_count": random.randint(30, 300),
                "created_at": now.isoformat(),
            })
        await db.users.insert_many(users)

    # Load current seeded users (either newly-inserted or already present).
    users = await db.users.find({"username": {"$in": seeded_usernames}}, {"_id": 0}).to_list(length=100)
    if not users:
        return

    # Seed parches only if none exist yet.
    if await db.parches.count_documents({}) >= len(SEED_PARCHES):
        return

    parches = []
    for i, (title, desc, cat, city, loc, days_ahead, cap, photo) in enumerate(SEED_PARCHES):
        creator = random.choice(users)
        pdate = (now + timedelta(days=days_ahead)).date().isoformat()
        hour = random.choice(["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"])
        others = random.sample([u["id"] for u in users if u["id"] != creator["id"]], k=min(random.randint(2, 6), cap - 1))
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
            "creator_id": creator["id"],
            "participants": [creator["id"], *others],
            "likes": random.sample([u["id"] for u in users], k=random.randint(3, min(12, len(users)))),
            "saves": random.sample([u["id"] for u in users], k=random.randint(0, min(6, len(users)))),
            "comments_count": random.randint(0, 15),
            "created_at": now.isoformat(),
        })
    await db.parches.insert_many(parches)
    logger.info("Seeded %d users, %d parches", len(users), len(parches))


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def _startup():
    await db.users.create_index("username", unique=True)
    await db.users.create_index("email", unique=True)
    await db.parches.create_index("city")
    await db.parches.create_index("category")
    try:
        _init_storage()
    except Exception as e:
        logger.warning("Storage init failed: %s (uploads will fail until it recovers)", e)
    try:
        await _seed()
    except Exception as e:
        logger.exception("Seed failed: %s", e)


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
