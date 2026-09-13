from dotenv import load_dotenv
load_dotenv()

import os
import re
import uuid
import json
import base64
import secrets
import ipaddress
import bcrypt
import jwt
import logging
import httpx
import stripe
import resend
import asyncio
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from pathlib import Path
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, APIRouter, Request, HTTPException, Depends
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import Response, StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://tmn-decorating.co.uk",
        "https://www.tmn-decorating.co.uk",
        "https://tmn2.pages.dev"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
@app.get("/")
def read_root():
    return {"status": "ok", "message": "Server is running"}


# ---------- helpers ----------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_token(user_id: str, email: str, token_type: str) -> str:
    exp = datetime.now(timezone.utc) + (
        timedelta(minutes=15) if token_type == "access" else timedelta(days=7)
    )
    payload = {"sub": user_id, "email": email, "type": token_type, "exp": exp}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, user_id: str, email: str):
    response.set_cookie("access_token", create_token(user_id, email, "access"),
                        httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie("refresh_token", create_token(user_id, email, "refresh"),
                        httponly=True, secure=True, samesite="none", max_age=604800, path="/")


def public_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "role": user.get("role", "customer"),
        "created_at": user.get("created_at"),
    }


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": __import__("bson").ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access only")
    return user


def msg_doc(customer_id: str, sender: str, text: str, image: str | None = None) -> dict:
    doc = {
        "customer_id": customer_id,
        "sender": sender,
        "text": text.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read_by_customer": sender == "customer",
        "read_by_admin": sender == "admin",
    }
    if image:
        doc["image"] = image
    return doc


def msg_public(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "customer_id": doc["customer_id"],
        "sender": doc["sender"],
        "text": doc["text"],
        "image": doc.get("image"),
        "created_at": doc["created_at"],
    }


# ---------- models ----------

class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class RegisterInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=8, max_length=100)


class LoginInput(BaseModel):
    email: str
    password: str


class MessageInput(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    image: str | None = Field(default=None, max_length=3000000)


class AdminReplyInput(BaseModel):
    customer_id: str
    text: str = Field(min_length=1, max_length=2000)


# ---------- auth endpoints ----------

@api_router.post("/auth/register")
async def register(input: RegisterInput, response: Response):
    email = input.email.strip().lower()
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Please enter a valid email address")
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    doc = {
        "name": input.name.strip(),
        "email": email,
        "password_hash": hash_password(input.password),
        "role": "customer",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    set_auth_cookies(response, str(doc["_id"]), email)
    await send_owner_email(
        "New customer registered — TMN website",
        f"<p><b>{doc['name']}</b> ({doc['email']}) just created an account on your website.</p>",
    )
    return public_user(doc)


@api_router.post("/auth/login")
async def login(input: LoginInput, request: Request, response: Response):
    email = input.email.strip().lower()
    identifier = f"{request.client.host}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("locked_until"):
        locked_until = attempt["locked_until"]
        if isinstance(locked_until, str):
            locked_until = datetime.fromisoformat(locked_until)
        if locked_until > datetime.now(timezone.utc):
            raise HTTPException(status_code=429, detail="Too many attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(input.password, user.get("password_hash", "")):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1},
             "$set": {"locked_until": datetime.now(timezone.utc) + timedelta(minutes=15)}
             if attempt and attempt.get("count", 0) + 1 >= 5 else {}},
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    await db.login_attempts.delete_many({"identifier": identifier})
    set_auth_cookies(response, str(user["_id"]), email)
    return public_user(user)


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api_router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": __import__("bson").ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        set_auth_cookies(response, str(user["_id"]), user["email"])
        return public_user(user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please log in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


# ---------- customer chat ----------

@api_router.get("/messages")
async def get_my_messages(user: dict = Depends(get_current_user)):
    docs = await db.messages.find({"customer_id": str(user["_id"])}).sort("created_at", 1).to_list(1000)
    await db.messages.update_many(
        {"customer_id": str(user["_id"]), "sender": "admin", "read_by_customer": False},
        {"$set": {"read_by_customer": True}},
    )
    return [msg_public(d) for d in docs]


@api_router.post("/messages")
async def send_message(input: MessageInput, user: dict = Depends(get_current_user)):
    image = None
    if input.image:
        if not input.image.startswith("data:image/"):
            raise HTTPException(status_code=400, detail="That image could not be read")
        if len(input.image) > 3000000:
            raise HTTPException(status_code=400, detail="That image is too large to send — save it and attach it on WhatsApp instead")
        image = input.image
    # archived client back for new work? restore them instantly — full history stays intact
    if user.get("archived"):
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"archived": False}})
    doc = msg_doc(str(user["_id"]), "customer", input.text, image)
    result = await db.messages.insert_one(doc)
    doc["_id"] = result.inserted_id
    await send_owner_email(
        f"New message from {user.get('name', 'a customer')} — TMN website",
        f"<p><b>{user.get('name')}</b> ({user.get('email')}) sent you a message:</p>"
        f"<p style='white-space:pre-wrap'>{input.text}</p>"
        + ("<p>(with a colour visualiser image attached — see the admin console)</p>" if image else ""),
    )
    return msg_public(doc)


# ---------- saved looks (colour visualiser projects) ----------

class LookInput(BaseModel):
    image: str = Field(min_length=32, max_length=3000000)
    prompt: str = Field(default="", max_length=300)
    sheen: str = Field(default="matte", max_length=10)


def look_public(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "image": doc["image"],
        "prompt": doc["prompt"],
        "sheen": doc.get("sheen", "matte"),
        "created_at": doc.get("created_at"),
    }


@api_router.get("/looks")
async def get_looks(user: dict = Depends(get_current_user)):
    docs = await db.saved_looks.find({"user_id": str(user["_id"])}).sort("created_at", -1).to_list(50)
    return [look_public(d) for d in docs]


@api_router.post("/looks")
async def save_look(input: LookInput, user: dict = Depends(get_current_user)):
    if not input.image.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="That image could not be read")
    if len(input.image) > 3000000:
        raise HTTPException(status_code=400, detail="That image is too large to save — use Save it (download) instead")
    count = await db.saved_looks.count_documents({"user_id": str(user["_id"])})
    if count >= 24:
        raise HTTPException(status_code=400, detail="Your gallery is full (24 looks) — remove an older one first")
    doc = {
        "user_id": str(user["_id"]),
        "image": input.image,
        "prompt": input.prompt.strip(),
        "sheen": input.sheen.strip() or "matte",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.saved_looks.insert_one(doc)
    doc["_id"] = result.inserted_id
    return look_public(doc)


@api_router.delete("/looks/{look_id}")
async def delete_look(look_id: str, user: dict = Depends(get_current_user)):
    from bson import ObjectId

    try:
        oid = ObjectId(look_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Look not found")
    result = await db.saved_looks.delete_one({"_id": oid, "user_id": str(user["_id"])})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Look not found")
    return {"ok": True}


# ---------- colour plate (saved custom colours) ----------

class ColourInput(BaseModel):
    name: str = Field(default="", max_length=40)
    hex: str = Field(min_length=3, max_length=7)


def colour_public(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "hex": doc["hex"],
        "created_at": doc.get("created_at"),
    }


def normalise_hex_str(s: str) -> str:
    h = s.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c + c for c in h)
    if len(h) != 6 or any(c not in "0123456789abcdefABCDEF" for c in h):
        raise HTTPException(status_code=400, detail="That doesn't look like a colour code")
    return "#" + h.upper()


@api_router.get("/colours")
async def get_colours(user: dict = Depends(get_current_user)):
    docs = await db.custom_colours.find({"user_id": str(user["_id"])}).sort("created_at", -1).to_list(60)
    return [colour_public(d) for d in docs]


@api_router.post("/colours")
async def save_colour(input: ColourInput, user: dict = Depends(get_current_user)):
    hexv = normalise_hex_str(input.hex)
    count = await db.custom_colours.count_documents({"user_id": str(user["_id"])})
    if count >= 40:
        raise HTTPException(status_code=400, detail="Your colour plate is full (40 colours) — remove one first")
    doc = {
        "user_id": str(user["_id"]),
        "name": (input.name.strip() or "Custom colour")[:40],
        "hex": hexv,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.custom_colours.insert_one(doc)
    doc["_id"] = result.inserted_id
    return colour_public(doc)


@api_router.delete("/colours/{colour_id}")
async def delete_colour(colour_id: str, user: dict = Depends(get_current_user)):
    from bson import ObjectId

    try:
        oid = ObjectId(colour_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Colour not found")
    result = await db.custom_colours.delete_one({"_id": oid, "user_id": str(user["_id"])})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Colour not found")
    return {"ok": True}


# ---------- colour favourites (clients' loved colours) ----------

class FavouriteInput(BaseModel):
    name: str = Field(default="", max_length=60)
    hex: str = Field(min_length=3, max_length=7)
    code: str = Field(default="", max_length=30)


def favourite_public(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "hex": doc["hex"],
        "code": doc.get("code", ""),
        "created_at": doc.get("created_at"),
    }


@api_router.get("/favourites")
async def get_favourites(user: dict = Depends(get_current_user)):
    docs = await db.favourite_colours.find({"user_id": str(user["_id"])}).sort("created_at", -1).to_list(60)
    return [favourite_public(d) for d in docs]


@api_router.post("/favourites")
async def add_favourite(input: FavouriteInput, user: dict = Depends(get_current_user)):
    hexv = normalise_hex_str(input.hex)
    existing = await db.favourite_colours.find_one({"user_id": str(user["_id"]), "hex": hexv})
    if existing:
        return favourite_public(existing)
    count = await db.favourite_colours.count_documents({"user_id": str(user["_id"])})
    if count >= 60:
        raise HTTPException(status_code=400, detail="Your favourites list is full (60) — remove one first")
    doc = {
        "user_id": str(user["_id"]),
        "user_email": user.get("email", ""),
        "name": (input.name.strip() or "Favourite colour")[:60],
        "hex": hexv,
        "code": (input.code or "").strip()[:30],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.favourite_colours.insert_one(doc)
    doc["_id"] = result.inserted_id
    return favourite_public(doc)


@api_router.delete("/favourites/{favourite_id}")
async def delete_favourite(favourite_id: str, user: dict = Depends(get_current_user)):
    from bson import ObjectId

    try:
        oid = ObjectId(favourite_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Favourite not found")
    result = await db.favourite_colours.delete_one({"_id": oid, "user_id": str(user["_id"])})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Favourite not found")
    return {"ok": True}


FAVOURITE_PRESETS = [
    ("Sage green", "#9CAF88"),
    ("Dark royal blue", "#1F3A93"),
    ("Deep navy", "#1B2A4A"),
    ("Charcoal", "#36454F"),
    ("Soft blush", "#E8C4C4"),
    ("Warm ivory", "#F5F0E1"),
    ("Slate grey", "#708090"),
    ("Heritage white", "#F0EBE0"),
    ("Anthracite", "#3D3D3D"),
    ("Forest green", "#2C4A3B"),
]


@api_router.get("/favourites/top")
async def top_favourites():
    """Public ranked top-10: most-favourited colours first, presets fill the
    rest. Deliberately NO counts and no client details — just the ranking."""
    docs = await db.favourite_colours.find({}).to_list(2000)
    agg = {}
    for d in docs:
        entry = agg.setdefault(d["hex"], {"hex": d["hex"], "names": {}, "count": 0, "last": ""})
        entry["count"] += 1
        entry["names"][d["name"]] = entry["names"].get(d["name"], 0) + 1
        entry["last"] = max(entry["last"], d.get("created_at", ""))
    ranked = sorted(agg.values(), key=lambda e: e.get("last", ""))
    ranked = sorted(ranked, key=lambda e: -e["count"])[:10]
    out = [{"name": max(e["names"], key=lambda n: e["names"][n]), "hex": e["hex"]} for e in ranked]
    for pname, phex in FAVOURITE_PRESETS:
        if len(out) >= 10:
            break
        if not any(o["hex"].upper() == phex.upper() for o in out):
            out.append({"name": pname, "hex": phex})
    return out[:10]


@api_router.get("/admin/favourites")
async def admin_favourites(admin: dict = Depends(require_admin)):
    docs = await db.favourite_colours.find({}).sort("created_at", -1).to_list(2000)
    agg = {}
    for d in docs:
        entry = agg.setdefault(
            d["hex"],
            {"hex": d["hex"], "names": {}, "clients": [], "count": 0},
        )
        entry["count"] += 1
        entry["names"][d["name"]] = entry["names"].get(d["name"], 0) + 1
        email = d.get("user_email", "")
        if email and email not in entry["clients"]:
            entry["clients"].append(email)
    out = []
    for entry in agg.values():
        best_name = max(entry["names"], key=lambda n: entry["names"][n]) if entry["names"] else "Favourite colour"
        out.append({
            "hex": entry["hex"],
            "name": best_name,
            "count": entry["count"],
            "clients": entry["clients"],
        })
    out.sort(key=lambda x: -x["count"])
    return out


# ---------- site view tracking (anonymous, one doc per day) ----------

class ViewInput(BaseModel):
    visitor_id: str = Field(min_length=6, max_length=64)
    path: str = Field(default="/", max_length=200)


@api_router.post("/track/view")
async def track_view(input: ViewInput):
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    await db.site_views.update_one(
        {"day": day},
        {"$inc": {"views": 1}, "$addToSet": {"visitors": input.visitor_id}},
        upsert=True,
    )
    return {"ok": True}


@api_router.post("/looks/{look_id}/send")
async def send_look(look_id: str, user: dict = Depends(get_current_user)):
    from bson import ObjectId

    try:
        oid = ObjectId(look_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Look not found")
    look = await db.saved_looks.find_one({"_id": oid, "user_id": str(user["_id"])})
    if not look:
        raise HTTPException(status_code=404, detail="Look not found")
    sheen = look.get("sheen", "matte")
    text = (
        f"Shared from the colour visualiser: {look.get('prompt') or 'my look'}"
        + (f" — {sheen} finish" if sheen != "matte" else "")
    )
    doc = msg_doc(str(user["_id"]), "customer", text, look["image"])
    result = await db.messages.insert_one(doc)
    doc["_id"] = result.inserted_id
    await send_owner_email(
        f"{user.get('name', 'A customer')} shared a colour look — TMN website",
        f"<p><b>{user.get('name')}</b> ({user.get('email')}) sent a look from the colour visualiser:</p>"
        f"<p style='white-space:pre-wrap'>{text}</p>"
        f"<p><img src='{look['image']}' style='max-width:480px;border-radius:12px'/></p>",
    )
    return msg_public(doc)


# ---------- admin: customers & all messages ----------

@api_router.get("/admin/customers")
async def admin_customers(admin: dict = Depends(require_admin)):
    customers = await db.users.find({"role": "customer"}).sort("created_at", -1).to_list(1000)
    out = []
    for c in customers:
        cid = str(c["_id"])
        last = await db.messages.find({"customer_id": cid}).sort("created_at", -1).to_list(1)
        unread = await db.messages.count_documents(
            {"customer_id": cid, "sender": "customer", "read_by_admin": False}
        )
        total = await db.messages.count_documents({"customer_id": cid})
        out.append({
            "id": cid,
            "name": c.get("name", ""),
            "email": c.get("email", ""),
            "created_at": c.get("created_at"),
            "last_message": msg_public(last[0]) if last else None,
            "unread": unread,
            "total_messages": total,
            "pinned": bool(c.get("pinned", False)),
            "archived": bool(c.get("archived", False)),
        })
    # priority clients first, then active clients, archived last — newest first within groups
    out.sort(key=lambda x: (not x["pinned"], x["archived"]))
    return out


@api_router.post("/admin/customers/{customer_id}/pin")
async def admin_pin_customer(customer_id: str, admin: dict = Depends(require_admin)):
    from bson import ObjectId

    try:
        oid = ObjectId(customer_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Customer not found")
    c = await db.users.find_one({"_id": oid, "role": "customer"})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    pinned = not c.get("pinned", False)
    await db.users.update_one({"_id": oid}, {"$set": {"pinned": pinned}})
    return {"pinned": pinned}


@api_router.post("/admin/customers/{customer_id}/archive")
async def admin_archive_customer(customer_id: str, admin: dict = Depends(require_admin)):
    """Archive a client once their job is done and paid — chat history, jobs,
    notes and invoices are all kept. Restored automatically if they message
    again, or manually with one tap."""
    from bson import ObjectId

    try:
        oid = ObjectId(customer_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Customer not found")
    c = await db.users.find_one({"_id": oid, "role": "customer"})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    archived = not c.get("archived", False)
    await db.users.update_one({"_id": oid}, {"$set": {"archived": archived}})
    return {"archived": archived}


@api_router.delete("/admin/customers/{customer_id}")
async def admin_delete_customer(customer_id: str, admin: dict = Depends(require_admin)):
    """Permanently remove a client and everything attached to them (chat,
    jobs, notes, invoices, looks, colours). Test accounts and unwanted
    sign-ups can be cleared out for real."""
    from bson import ObjectId

    try:
        oid = ObjectId(customer_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Customer not found")
    c = await db.users.find_one({"_id": oid, "role": "customer"})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    cid = str(oid)
    await db.messages.delete_many({"customer_id": cid})
    await db.invoices.delete_many({"customer_id": cid})
    await db.jobs.delete_many({"customer_id": cid})
    await db.notes.delete_many({"customer_id": cid})
    await db.saved_looks.delete_many({"user_id": cid})
    await db.custom_colours.delete_many({"user_id": cid})
    await db.favourite_colours.delete_many({"user_id": cid})
    await db.payment_transactions.delete_many({"$or": [{"customer_id": cid}, {"user_id": cid}]})
    await db.users.delete_one({"_id": oid})
    return {"ok": True}


@api_router.get("/admin/messages")
async def admin_messages(customer_id: str, admin: dict = Depends(require_admin)):
    docs = await db.messages.find({"customer_id": customer_id}).sort("created_at", 1).to_list(1000)
    await db.messages.update_many(
        {"customer_id": customer_id, "sender": "customer", "read_by_admin": False},
        {"$set": {"read_by_admin": True}},
    )
    return [msg_public(d) for d in docs]


@api_router.post("/admin/messages")
async def admin_reply(input: AdminReplyInput, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"_id": __import__("bson").ObjectId(input.customer_id)})
    if not target:
        raise HTTPException(status_code=404, detail="Customer not found")
    doc = msg_doc(input.customer_id, "admin", input.text)
    result = await db.messages.insert_one(doc)
    doc["_id"] = result.inserted_id
    return msg_public(doc)


@api_router.get("/admin/stats")
async def admin_stats(admin: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc)
    days_7 = [(now - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
    recent = await db.site_views.find({"day": {"$in": days_7}}).to_list(10)
    views_7d = sum(d.get("views", 0) for d in recent)
    views_today = next((d.get("views", 0) for d in recent if d["day"] == days_7[0]), 0)
    visitors_7d = len({v for d in recent for v in d.get("visitors", [])})
    total_row = await db.site_views.aggregate([{"$group": {"_id": None, "views": {"$sum": "$views"}}}]).to_list(1)
    week_ago_iso = (now - timedelta(days=7)).isoformat()
    days_14 = [(now - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(13, -1, -1)]
    docs_14 = {d["day"]: d for d in await db.site_views.find({"day": {"$in": days_14}}).to_list(20)}
    signups_by_day = {day: 0 for day in days_14}
    async for u in db.users.find({"role": "customer", "created_at": {"$gte": days_14[0]}}, {"created_at": 1}):
        day = (u.get("created_at") or "")[:10]
        if day in signups_by_day:
            signups_by_day[day] += 1
    daily = [
        {
            "day": day,
            "views": (docs_14.get(day) or {}).get("views", 0),
            "visitors": len((docs_14.get(day) or {}).get("visitors", [])),
            "signups": signups_by_day[day],
        }
        for day in days_14
    ]
    return {
        "daily": daily,
        "customers": await db.users.count_documents({"role": "customer"}),
        "customers_new_7d": await db.users.count_documents(
            {"role": "customer", "created_at": {"$gte": week_ago_iso}}
        ),
        "messages": await db.messages.count_documents({}),
        "unread": await db.messages.count_documents({"sender": "customer", "read_by_admin": False}),
        "views_total": total_row[0]["views"] if total_row else 0,
        "views_today": views_today,
        "views_7d": views_7d,
        "visitors_7d": visitors_7d,
    }


# ---------- admin: jobs, notes & invoices ----------

JOB_STATUSES = {"scheduled", "in progress", "completed"}
INVOICE_STATUSES = {"draft", "sent", "paid"}


def job_public(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "customer_id": doc["customer_id"],
        "title": doc["title"],
        "description": doc.get("description", ""),
        "scheduled_date": doc.get("scheduled_date", ""),
        "status": doc.get("status", "scheduled"),
        "created_at": doc.get("created_at"),
    }


def note_public(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "customer_id": doc["customer_id"],
        "text": doc["text"],
        "created_at": doc["created_at"],
    }


def invoice_public(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "customer_id": doc.get("customer_id"),
        "client_name": doc.get("client_name", ""),
        "client_email": doc.get("client_email", ""),
        "client_address": doc.get("client_address", ""),
        "number": doc["number"],
        "items": doc.get("items", []),
        "total": doc.get("total", 0),
        "due_date": doc.get("due_date", ""),
        "status": doc.get("status", "draft"),
        "created_at": doc.get("created_at"),
    }


class JobInput(BaseModel):
    customer_id: str
    title: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=2000)
    scheduled_date: str = Field(min_length=10, max_length=10)
    status: str = "scheduled"


class JobUpdateInput(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=2000)
    scheduled_date: Optional[str] = None
    status: Optional[str] = None


class NoteInput(BaseModel):
    customer_id: str
    text: str = Field(min_length=1, max_length=2000)


class InvoiceItemInput(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    amount: float = Field(ge=0)


class InvoiceInput(BaseModel):
    customer_id: str = ""  # empty = custom invoice for a client off the website
    client_name: str = Field(default="", max_length=80)
    client_email: str = Field(default="", max_length=120)
    client_address: str = Field(default="", max_length=240)
    items: List[InvoiceItemInput] = Field(min_length=1)
    due_date: str = Field(min_length=10, max_length=10)
    status: str = "draft"


class InvoiceUpdateInput(BaseModel):
    status: Optional[str] = None
    due_date: Optional[str] = None


@api_router.get("/admin/jobs")
async def admin_list_jobs(customer_id: Optional[str] = None, admin: dict = Depends(require_admin)):
    query = {"customer_id": customer_id} if customer_id else {}
    docs = await db.jobs.find(query).sort("scheduled_date", -1).to_list(1000)
    return [job_public(d) for d in docs]


@api_router.post("/admin/jobs")
async def admin_create_job(input: JobInput, admin: dict = Depends(require_admin)):
    if input.status not in JOB_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid job status")
    target = await db.users.find_one({"_id": __import__("bson").ObjectId(input.customer_id)})
    if not target:
        raise HTTPException(status_code=404, detail="Customer not found")
    doc = {
        "customer_id": input.customer_id,
        "title": input.title.strip(),
        "description": input.description.strip(),
        "scheduled_date": input.scheduled_date,
        "status": input.status,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.jobs.insert_one(doc)
    doc["_id"] = result.inserted_id
    return job_public(doc)


@api_router.patch("/admin/jobs/{job_id}")
async def admin_update_job(job_id: str, input: JobUpdateInput, admin: dict = Depends(require_admin)):
    updates = {k: v for k, v in input.model_dump().items() if v is not None}
    if "status" in updates and updates["status"] not in JOB_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid job status")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.jobs.find_one_and_update(
        {"_id": __import__("bson").ObjectId(job_id)}, {"$set": updates}, return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Job not found")
    return job_public(result)


@api_router.delete("/admin/jobs/{job_id}")
async def admin_delete_job(job_id: str, admin: dict = Depends(require_admin)):
    result = await db.jobs.delete_one({"_id": __import__("bson").ObjectId(job_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"ok": True}


@api_router.get("/admin/notes")
async def admin_list_notes(customer_id: str, admin: dict = Depends(require_admin)):
    docs = await db.notes.find({"customer_id": customer_id}).sort("created_at", -1).to_list(1000)
    return [note_public(d) for d in docs]


@api_router.post("/admin/notes")
async def admin_create_note(input: NoteInput, admin: dict = Depends(require_admin)):
    doc = {
        "customer_id": input.customer_id,
        "text": input.text.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.notes.insert_one(doc)
    doc["_id"] = result.inserted_id
    return note_public(doc)


@api_router.delete("/admin/notes/{note_id}")
async def admin_delete_note(note_id: str, admin: dict = Depends(require_admin)):
    result = await db.notes.delete_one({"_id": __import__("bson").ObjectId(note_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"ok": True}


@api_router.get("/admin/invoices")
async def admin_list_invoices(customer_id: Optional[str] = None, admin: dict = Depends(require_admin)):
    query = {"customer_id": customer_id} if customer_id else {}
    docs = await db.invoices.find(query).sort("created_at", -1).to_list(1000)
    return [invoice_public(d) for d in docs]


@api_router.post("/admin/invoices")
async def admin_create_invoice(input: InvoiceInput, admin: dict = Depends(require_admin)):
    if input.status not in INVOICE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid invoice status")
    target = None
    if input.customer_id:
        target = await db.users.find_one({"_id": __import__("bson").ObjectId(input.customer_id)})
        if not target:
            raise HTTPException(status_code=404, detail="Customer not found")
        client_name = (target.get("name") or "Client")[:80]
        client_email = (target.get("email") or "")[:120]
        client_address = ""
    else:
        if not input.client_name.strip():
            raise HTTPException(status_code=400, detail="Pick a client or enter a name for an off-site client")
        client_name = input.client_name.strip()[:80]
        client_email = input.client_email.strip()[:120]
        client_address = input.client_address.strip()[:240]
    items = [{"description": i.description.strip(), "amount": round(i.amount, 2)} for i in input.items]
    total = round(sum(i["amount"] for i in items), 2)
    count = await db.invoices.count_documents({})
    doc = {
        "customer_id": input.customer_id or None,
        "client_name": client_name,
        "client_email": client_email,
        "client_address": client_address,
        "number": f"TMN-{count + 1:04d}",
        "items": items,
        "total": total,
        "due_date": input.due_date,
        "status": input.status,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.invoices.insert_one(doc)
    doc["_id"] = result.inserted_id
    return invoice_public(doc)


@api_router.post("/admin/invoices/{invoice_id}/send")
async def admin_send_invoice(invoice_id: str, admin: dict = Depends(require_admin)):
    from bson import ObjectId

    try:
        oid = ObjectId(invoice_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invoice not found")
    inv = await db.invoices.find_one_and_update(
        {"_id": oid},
        {"$set": {"status": "sent", "sent_at": datetime.now(timezone.utc).isoformat()}},
        return_document=True,
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not inv.get("customer_id"):
        raise HTTPException(status_code=400, detail="This invoice is for an off-site client — download it and email it instead")
    total = inv.get("total", 0)
    text = (
        f"Invoice {inv.get('number', '')} for £{total:,.2f} has been sent to you — "
        "open My invoices in your account to view or settle it."
    )
    await db.messages.insert_one(msg_doc(str(inv["customer_id"]), "admin", text, None))
    return invoice_public(inv)


class InvoiceEmailInput(BaseModel):
    to: str = Field(min_length=5, max_length=160)
    pdf_base64: str = Field(default="", max_length=8_000_000)
    filename: str = Field(default="", max_length=80)


@api_router.post("/admin/invoices/{invoice_id}/email")
async def admin_email_invoice(invoice_id: str, body: InvoiceEmailInput, request: Request, admin: dict = Depends(require_admin)):
    """Email the invoice to any address — the PDF is attached when the admin's
    browser supplies it, and the email body is always this server-side
    template (recipients and PDF come from the admin's own invoice record)."""
    from bson import ObjectId

    try:
        oid = ObjectId(invoice_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invoice not found")
    inv = await db.invoices.find_one({"_id": oid})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    to = body.to.strip()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", to):
        raise HTTPException(status_code=400, detail="That email address doesn't look right")
    client_name = inv.get("client_name") or "Client"
    download_row = ""
    filename = re.sub(r"[^A-Za-z0-9._-]", "_", body.filename.strip() or f"{inv.get('number', 'invoice')}.pdf")
    if body.pdf_base64:
        # store the PDF + a one-off token so the email can carry a public download link
        token = secrets.token_urlsafe(24)
        await db.invoice_files.update_one(
            {"invoice_id": str(oid)},
            {"$set": {"token": token, "pdf_b64": body.pdf_base64, "filename": filename,
                      "created_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
        # link must use the site's PUBLIC origin — the admin's browsing host
        # (e.g. the platform app-view domain) isn't reachable by email recipients
        base = (FRONTEND_URL or f"{(request.headers.get('x-forwarded-proto') or 'https')}://{request.headers.get('host')}").rstrip("/")
        if base:
            download_row = (
                f'<tr><td style="padding:18px 0 0">'
                f'<a href="{base}/api/invoices/download/{token}" '
                f'style="display:inline-block;background:#0a0a0a;color:#C6A55C;font-size:13px;'
                f'font-weight:bold;letter-spacing:1.2px;text-decoration:none;padding:12px 24px;'
                f'border-radius:10px">DOWNLOAD INVOICE PDF</a></td></tr>'
            )
    rows = "".join(
        f'<tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#1e1e1e">{escape(str(i.get("description") or "—"))}</td>'
        f'<td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;color:#1e1e1e">£{(i.get("amount") or 0):,.2f}</td></tr>'
        for i in (inv.get("items") or [])
    )
    status_label = {"paid": "Paid", "sent": "Due", "draft": "Draft"}.get(str(inv.get("status", "")).lower(), "Due")
    html = (
        f'<table role="presentation" width="100%" style="background:#f5f2ea;padding:24px"><tr><td>'
        f'<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;font-family:Arial,sans-serif">'
        f'<tr><td style="padding-bottom:14px;border-bottom:3px solid #C6A55C">'
        f'<table role="presentation" width="100%"><tr>'
        f'<td><span style="font-size:19px;font-weight:bold;color:#0a0a0a">TMN Decorating &amp; Maintenance</span><br>'
        f'<span style="font-size:12px;color:#888">Painting · Decorating · Property Maintenance — Plymouth, UK</span></td>'
        + (f'<td align="right" style="width:74px"><img src="{EMAIL_LOGO_URL}" alt="TMN logo" width="64" height="64" style="display:block;border-radius:12px;background:#0a0a0a;padding:5px" /></td>' if EMAIL_LOGO_URL else "")
        + f'</tr></table></td></tr>'
        f'<tr><td style="padding:18px 0 6px"><span style="font-size:17px;font-weight:bold;color:#0a0a0a">Invoice {escape(str(inv.get("number") or ""))}</span>'
        f'<span style="float:right;font-size:12px;color:#927428;background:#fcf9f0;border:1px solid #C6A55C;border-radius:10px;padding:3px 10px">{status_label}</span></td></tr>' 
        f'<tr><td style="padding:6px 0;color:#555;font-size:14px">Billed to: <strong>{escape(client_name)}</strong>'
        + (f' &lt;{escape(inv.get("client_email") or "")}&gt;' if inv.get("client_email") else "")
        + f'</td></tr>'
        f'<tr><td style="padding:10px 0 0"><table role="presentation" width="100%" style="font-size:14px">{rows}'
        f'<tr><td style="padding:10px 0;font-weight:bold;color:#0a0a0a">Total due</td>'
        f'<td style="padding:10px 0;text-align:right;font-weight:bold;color:#0a0a0a">£{inv.get("total", 0):,.2f}</td></tr></table></td></tr>'
        f'<tr><td style="padding:12px 0 0;color:#555;font-size:13px">Due by {escape(str(inv.get("due_date") or "—"))}. '
        f'{"This invoice has been paid — thank you." if str(inv.get("status")) == "paid" else "The PDF invoice is attached and linked below for your records."}</td></tr>'
        + download_row +
        f'<tr><td style="padding:16px 0 0;font-size:11px;color:#999">Sent by {escape(EMAIL_FROM_NAME)}. We never ask for your password or card details by email.</td></tr>'
        f'</table></td></tr></table>'
    )
    attachments = None
    if body.pdf_base64:
        attachments = [{"filename": filename, "content": body.pdf_base64}]
    email_id = await send_email(to=to, subject=f"Invoice {inv.get('number', '')} from {EMAIL_FROM_NAME}", html=html, attachments=attachments)
    return {"ok": True, "email_id": email_id, "attached": bool(attachments)}


@api_router.get("/invoices/download/{token}")
async def invoice_download(token: str):
    """Public one-click PDF download — the tokenised link is included in invoice emails."""
    rec = await db.invoice_files.find_one({"token": token})
    if not rec or not rec.get("pdf_b64"):
        raise HTTPException(status_code=404, detail="This download link is no longer valid — ask us for a fresh copy")
    return Response(
        content=base64.b64decode(rec["pdf_b64"]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{rec.get("filename") or "invoice.pdf"}"'},
    )


@api_router.patch("/admin/invoices/{invoice_id}")
async def admin_update_invoice(invoice_id: str, input: InvoiceUpdateInput, admin: dict = Depends(require_admin)):
    updates = {k: v for k, v in input.model_dump().items() if v is not None}
    if "status" in updates and updates["status"] not in INVOICE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid invoice status")
    result = await db.invoices.find_one_and_update(
        {"_id": __import__("bson").ObjectId(invoice_id)}, {"$set": updates}, return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice_public(result)


# ---------- customer: my jobs & invoices ----------

@api_router.get("/my/jobs")
async def my_jobs(user: dict = Depends(get_current_user)):
    docs = await db.jobs.find({"customer_id": str(user["_id"])}).sort("scheduled_date", -1).to_list(1000)
    return [job_public(d) for d in docs]


@api_router.get("/my/invoices")
async def my_invoices(user: dict = Depends(get_current_user)):
    docs = await db.invoices.find({"customer_id": str(user["_id"])}).sort("created_at", -1).to_list(1000)
    return [invoice_public(d) for d in docs]


# ---------- admin: full client records & rename ----------

class CustomerUpdateInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)


@api_router.patch("/admin/customers/{customer_id}")
async def admin_update_customer(customer_id: str, input: CustomerUpdateInput, admin: dict = Depends(require_admin)):
    result = await db.users.find_one_and_update(
        {"_id": __import__("bson").ObjectId(customer_id)},
        {"$set": {"name": input.name.strip()}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Customer not found")
    return public_user(result)


@api_router.get("/admin/clients")
async def admin_clients(admin: dict = Depends(require_admin)):
    customers = await db.users.find({"role": "customer"}).sort("created_at", -1).to_list(1000)
    out = []
    for c in customers:
        cid = str(c["_id"])
        jobs = [job_public(d) for d in await db.jobs.find({"customer_id": cid}).sort("scheduled_date", -1).to_list(500)]
        notes = [note_public(d) for d in await db.notes.find({"customer_id": cid}).sort("created_at", -1).to_list(500)]
        invoices = [invoice_public(d) for d in await db.invoices.find({"customer_id": cid}).sort("created_at", -1).to_list(500)]
        messages = [msg_public(d) for d in await db.messages.find({"customer_id": cid}).sort("created_at", 1).to_list(2000)]
        out.append({
            **public_user(c),
            "jobs": jobs,
            "notes": notes,
            "invoices": invoices,
            "messages": messages,
            "total_invoiced": round(sum(i["total"] for i in invoices if i["status"] != "draft"), 2),
            "total_unpaid": round(sum(i["total"] for i in invoices if i["status"] != "paid"), 2),
        })
    return out


# ---------- stripe payments & email notifications ----------

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")

# ---------- Emergent managed email (transactions only) ----------
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
EMAIL_LOGO_URL = os.environ.get("LOGO_URL", "")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str, reply_to: str | None = None, attachments: list | None = None) -> str | None:
    _assert_safe_email(subject, html)
    # SELF-HOSTED PATH — when the deployment runs on its own Resend account
    # (own verified sending domain), no Emergent infrastructure is involved.
    resend_key = os.environ.get("RESEND_API_KEY")
    if resend_key and SENDER_EMAIL:
        params = {
            "from": f"{EMAIL_FROM_NAME} <{SENDER_EMAIL}>",
            "to": [to], "subject": subject, "html": html,
        }
        if reply_to or EMAIL_REPLY_TO:
            params["reply_to"] = reply_to or EMAIL_REPLY_TO
        if attachments:
            params["attachments"] = attachments
        try:
            resend.api_key = resend_key
            result = await asyncio.to_thread(resend.Emails.send, params)
            return (result or {}).get("id")
        except Exception as e:
            logger.error(f"Email send error (resend): {str(e)}")
            raise HTTPException(status_code=502, detail="Failed to send email")
    # EMERGENT MANAGED PATH — default inside the Emergent workspace
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if reply_to or EMAIL_REPLY_TO:
        payload["contact_email"] = reply_to or EMAIL_REPLY_TO
    if attachments:
        payload["attachments"] = attachments
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail="Failed to send email")
    except Exception as e:
        logger.error(f"Email send error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send email")


async def send_owner_email(subject: str, html: str):
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        logger.info("RESEND_API_KEY not set — email skipped: %s", subject)
        return
    try:
        resend.api_key = key
        params = {
            "from": SENDER_EMAIL,
            "to": [os.environ.get("ADMIN_EMAIL", "admin@tmndecorating.co.uk")],
            "subject": subject,
            "html": html,
        }
        await asyncio.to_thread(resend.Emails.send, params)
    except Exception as e:
        logger.error("Email send failed: %s", e)


async def _mark_invoice_paid(session_id: str, record: dict, stripe_session=None):
    updated = await db.payment_transactions.find_one_and_update(
        {"session_id": session_id, "payment_status": {"$ne": "paid"}},
        {"$set": {"status": "completed", "payment_status": "paid",
                  "stripe_payment_intent_id": getattr(stripe_session, "payment_intent", None),
                  "updated_at": datetime.now(timezone.utc)}},
    )
    if not updated:
        return
    invoice_id = record.get("invoice_id")
    if invoice_id:
        await db.invoices.update_one(
            {"_id": __import__("bson").ObjectId(invoice_id)},
            {"$set": {"status": "paid"}},
        )
        inv = await db.invoices.find_one({"_id": __import__("bson").ObjectId(invoice_id)})
        cust = await db.users.find_one({"_id": __import__("bson").ObjectId(record.get("customer_id"))})
        if inv and cust:
            await send_owner_email(
                f"Invoice {inv['number']} paid — {fmtMoneyLite(inv['total'])}",
                f"<p>Invoice <b>{inv['number']}</b> from {cust.get('name')} was paid: <b>{fmtMoneyLite(inv['total'])}</b>.</p>",
            )


def fmtMoneyLite(n):
    return f"£{n:,.2f}"


@api_router.post("/invoices/{invoice_id}/checkout")
async def invoice_checkout(invoice_id: str, request: Request, user: dict = Depends(get_current_user)):
    invoice = await db.invoices.find_one({"_id": __import__("bson").ObjectId(invoice_id)})
    if not invoice or invoice["customer_id"] != str(user["_id"]):
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.get("status") == "paid":
        raise HTTPException(status_code=400, detail="This invoice is already paid")
    if invoice.get("status") == "draft":
        raise HTTPException(status_code=400, detail="This invoice is not payable yet")

    body = await request.json()
    origin = body.get("origin_url") or os.environ.get("FRONTEND_URL", "").rstrip("/")

    product = None
    for p in stripe.Product.list(active=True).auto_paging_iter():
        if p.to_dict().get("metadata", {}).get("emergent_product_id") == "tmn_invoice_payment":
            product = p
            break
    if product is None:
        product = stripe.Product.create(
            name="TMN invoice payment",
            metadata={"managed_by": "emergent", "emergent_product_id": "tmn_invoice_payment"},
        )
    price = stripe.Price.create(
        product=product.id,
        unit_amount=round(invoice["total"] * 100),
        currency="gbp",
    )

    kwargs = dict(
        line_items=[{"price": price.id, "quantity": 1}],
        mode="payment",
        success_url=f"{origin}/account?payment=success&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/account?payment=cancelled",
        metadata={"invoice_id": invoice_id, "customer_id": str(user["_id"])},
    )
    try:
        session = stripe.checkout.Session.create(automatic_tax={"enabled": True}, **kwargs)
    except stripe.error.StripeError:
        session = stripe.checkout.Session.create(**kwargs)

    await db.payment_transactions.insert_one({
        "session_id": session.id,
        "invoice_id": invoice_id,
        "customer_id": str(user["_id"]),
        "amount": invoice["total"],
        "currency": "gbp",
        "status": "initiated",
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })
    return {"checkout_url": session.url, "session_id": session.id}


@api_router.get("/payments/status/{session_id}")
async def payment_status(session_id: str):
    record = await db.payment_transactions.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await _mark_invoice_paid(session_id, record, s)
                record = await db.payment_transactions.find_one({"session_id": session_id})
        except stripe.error.StripeError:
            pass
    return {
        "session_id": record["session_id"],
        "status": record["status"],
        "payment_status": record["payment_status"],
    }


@api_router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, os.environ.get("STRIPE_WEBHOOK_SECRET", ""))
    except (stripe.error.SignatureVerificationError, ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid signature")
    obj, t = event["data"]["object"], event["type"]
    if t == "checkout.session.completed":
        record = await db.payment_transactions.find_one({"session_id": obj["id"]})
        if record:
            await _mark_invoice_paid(obj["id"], record, None)
        else:
            await db.payment_transactions.update_one(
                {"session_id": obj["id"], "payment_status": {"$ne": "paid"}},
                {"$set": {"status": "completed", "payment_status": obj.get("payment_status", "paid"),
                          "updated_at": datetime.now(timezone.utc)}},
            )
    elif t == "checkout.session.async_payment_failed":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"status": "failed", "payment_status": "failed", "updated_at": datetime.now(timezone.utc)}},
        )
    elif t == "checkout.session.expired":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"status": "expired", "payment_status": "expired", "updated_at": datetime.now(timezone.utc)}},
        )
    return {"status": "ok"}


# ---------- AI assistant + colour studio (self-hosted, genuinely zero-cost) ----------
# Both AI features run open-source models INSIDE this server (see ai_local.py):
# there is no external AI service, no API key, no usage caps and nothing that can
# bill. If a generation fails, the endpoints return an honest error — results are
# never simulated and there is deliberately no fallback to any hosted AI.

import ai_local

AI_SYSTEM_PROMPT = (
    "You are the TMN Assistant for TMN Decorating & Maintenance — a friendly company based "
    "in Plymouth, UK, serving domestic and commercial customers. Painting and decorating is "
    "their core trade, but IMPORTANT: any domestic trade job can be completed by the TMN "
    "team themselves or by their qualified tradesman friends they share work with — "
    "including plumbing, electrics, tiling, carpentry, flooring, plastering, handyman work "
    "and general domestic maintenance. If a customer asks about a trade beyond decorating, "
    "confirm TMN can handle any domestic job through themselves or trusted qualified "
    "tradespeople, with TMN as the single point of contact. You give practical, honest "
    "guidance on minor painting, decorating and home-maintenance questions: paint types, "
    "sheens, preparation, drying times, colour pairing, common repairs and upkeep. Keep "
    "answers short and clear (2-5 sentences unless steps are requested). You do not give "
    "prices, quotes, warranties or certifications — for quotes, bookings, site visits or "
    "anything needing a person, politely point the customer to WhatsApp or call 07736 "
    "325643, or email info@tmndecorating.co.uk. If a question is unrelated to property "
    "work, gently steer back to what TMN can help with."
)


class AiChatInput(BaseModel):
    session_id: str = Field(min_length=6, max_length=64)
    message: str = Field(min_length=1, max_length=1000)


@api_router.post("/ai/chat")
async def ai_chat(input: AiChatInput):
    async def generate():
        full = ""
        try:
            async for delta in ai_local.stream_chat(input.message, AI_SYSTEM_PROMPT):
                if delta:
                    full += delta
                    yield f"data: {json.dumps({'delta': delta})}\n\n"
            if not full.strip():
                raise RuntimeError("local chat model returned an empty reply")
            yield f"data: {json.dumps({'done': True})}\n\n"
            now = datetime.now(timezone.utc).isoformat()
            await db.ai_chats.insert_one({"session_id": input.session_id, "role": "user", "text": input.message, "created_at": now})
            await db.ai_chats.insert_one({"session_id": input.session_id, "role": "assistant", "text": full, "created_at": now})
        except Exception as e:
            logger.error("AI chat error: %s", e)
            yield f"data: {json.dumps({'error': 'The assistant is unavailable right now — please WhatsApp us on 07736 325643 instead.'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------- AI colour visualiser ----------

class ColourEmailInput(BaseModel):
    to: str = Field(min_length=5, max_length=120)
    image: str = Field(min_length=32)
    prompt: str = ""


@api_router.post("/ai/colour/email")
async def ai_colour_email(body: ColourEmailInput):
    if not body.to or "@" not in body.to or "." not in body.to.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Please enter a valid email address")
    if not body.image.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="No image to send")
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        raise HTTPException(
            status_code=429,
            detail="Email delivery isn't switched on yet — use Save it to keep the image, or WhatsApp us and we'll send it over.",
        )
    try:
        resend.api_key = key
        params = {
            "from": SENDER_EMAIL,
            "to": [body.to.strip()],
            "subject": "Your TMN colour test",
            "html": (
                "<div style='font-family:Arial,sans-serif;max-width:560px'>"
                "<h2 style='color:#0a0a0a'>Your TMN colour test</h2>"
                f"<p style='color:#444'>Scheme applied: <b>{body.prompt or 'AI suggested luxury scheme'}</b></p>"
                "<p style='color:#444'>Like it? We'd love to do the real thing — "
                "<a href='https://wa.me/447736325643'>WhatsApp us on 07736 325643</a> "
                "or reply to this email.</p>"
                "<p style='color:#888;font-size:13px'>TMN Decorating & Maintenance — Plymouth, UK</p>"
                "</div>"
            ),
            "attachments": [{
                "filename": "tmn-colour-idea.png",
                "content": body.image.split(",", 1)[1],
            }],
        }
        await asyncio.to_thread(resend.Emails.send, params)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Colour email failed: %s", e)
        # 4xx so the preview edge passes the JSON detail through (5xx gets replaced by an HTML error page)
        raise HTTPException(status_code=429, detail="The email couldn't be sent right now — please try again shortly")
    return {"ok": True}


# ---------- legacy status routes ----------

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(**input.model_dump())
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    _ = await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks


@api_router.get("/")
async def root():
    return {"message": "Hello World"}


app.include_router(api_router)

frontend_url = os.environ.get("FRONTEND_URL", "https://tmn-decorating.co.uk").rstrip("/")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[
        frontend_url,
        "https://tmn-decorating.co.uk",
        "https://www.tmn-decorating.co.uk",
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

    



@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.messages.create_index("customer_id")
    await db.login_attempts.create_index("identifier")
    await db.ai_usage.create_index("created_at", expireAfterSeconds=172800)
    await db.ai_usage.create_index("visitor_id")
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@tmndecorating.co.uk")
    admin_password = os.environ.get("ADMIN_PASSWORD", "TMN-Admin-2026!")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "name": "TMN Admin",
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded admin user {admin_email}")
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )
        logger.info(f"Updated admin password for {admin_email}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

app.include_router(api_router)